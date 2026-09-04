"""星屿智联科技 —— 公司主页后端（FastAPI + SQLite）。

提供四类能力：
1. 登录鉴权接口（/api/auth/*）—— 基于 SQLite 用户表
2. ESP32 配置管理（/api/admin/*）—— 持久化到 SQLite
3. ESP32 设备轮询接口（/api/esp32/*）—— 含实时天气
4. 通用天气查询接口（/api/weather/city）—— 独立于 ESP32
"""

from __future__ import annotations

import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from database import (
    init_db,
    db_get_user,
    verify_password,
    db_get_config,
    db_update_config,
    db_log_weather,
    db_get_weather_logs,
    db_get_weather_logs_count,
    db_delete_weather_log,
)

CST = timezone(timedelta(hours=8))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="星屿智联科技 API", version="2.0.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# 内存状态（仅 token 会话保留在内存中）
# ---------------------------------------------------------------------------

# token -> {"username": str, "role": str, "created_at": float}
TOKENS: Dict[str, dict] = {}

# 配置缓存（减少 DB 读取，写入时同步更新）
_config_cache: dict | None = None
_config_cache_ts: float = 0.0

# 天气缓存：{"fetched_at": float, "data": dict}
WEATHER_CACHE_TTL_SEC = 600
_weather_cache: dict = {}

# WMO 天气代码 -> 中文描述
WEATHER_CODE_TEXT = {
    0: "晴", 1: "大部晴朗", 2: "多云", 3: "阴",
    45: "雾", 48: "冻雾",
    51: "小毛毛雨", 53: "毛毛雨", 55: "大毛毛雨",
    61: "小雨", 63: "中雨", 65: "大雨", 66: "冻雨", 67: "强冻雨",
    71: "小雪", 73: "中雪", 75: "大雪", 77: "霰",
    80: "小阵雨", 81: "阵雨", 82: "强阵雨",
    85: "阵雪", 86: "强阵雪",
    95: "雷阵雨", 96: "雷阵雨伴冰雹", 99: "强雷阵雨伴冰雹",
}

DEMO_WEATHER = {
    "temperature": 26.5,
    "apparent_temperature": 28.0,
    "humidity": 62,
    "weather_code": 1,
    "weather_text": "演示数据：大部晴朗",
    "wind_speed": 3.2,
    "city": "上海",
    "source": "demo",
    "updated_at": None,
}


# ---------------------------------------------------------------------------
# 鉴权
# ---------------------------------------------------------------------------

class LoginPayload(BaseModel):
    username: str
    password: str


def require_auth(authorization: Optional[str] = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="未登录或凭证缺失")
    token = authorization.split(" ", 1)[1].strip()
    session = TOKENS.get(token)
    if not session:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    return token


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "starisle-api"}


@app.post("/api/auth/login")
async def login(payload: LoginPayload) -> dict:
    user = await db_get_user(payload.username)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = secrets.token_hex(16)
    TOKENS[token] = {"username": user["username"], "role": user["role"], "created_at": time.time()}
    return {"token": token, "user": {"username": user["username"], "role": user["role"]}}


@app.get("/api/auth/me")
def me(token: str = Depends(require_auth)) -> dict:
    session = TOKENS[token]
    return {"username": session["username"], "role": session["role"]}


@app.post("/api/auth/logout")
def logout(token: str = Depends(require_auth)) -> dict:
    TOKENS.pop(token, None)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# 管理后台：定制 ESP32 反馈内容（需登录）
# ---------------------------------------------------------------------------

class DisplayConfig(BaseModel):
    show_weather: bool = True
    show_time: bool = True
    show_message: bool = True


class Esp32ConfigPayload(BaseModel):
    company_name: str = Field(min_length=1, max_length=60)
    marquee_text: str = Field(min_length=1, max_length=200)
    city: str = Field(min_length=1, max_length=60)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    refresh_interval_sec: int = Field(ge=10, le=3600)
    led_brightness: int = Field(ge=0, le=100)
    display: DisplayConfig
    custom_fields: Dict[str, str] = Field(default_factory=dict)


async def _get_config() -> dict:
    """获取配置（带缓存，5秒过期）"""
    global _config_cache, _config_cache_ts
    now = time.time()
    if _config_cache is not None and now - _config_cache_ts < 5:
        return _config_cache
    _config_cache = await db_get_config()
    _config_cache_ts = now
    return _config_cache


@app.get("/api/admin/esp32-config")
async def get_esp32_config(_: str = Depends(require_auth)) -> dict:
    return await db_get_config()


@app.put("/api/admin/esp32-config")
async def update_esp32_config(payload: Esp32ConfigPayload, _: str = Depends(require_auth)) -> dict:
    global _config_cache
    config = payload.model_dump()
    await db_update_config(config)
    _config_cache = config
    _config_cache_ts = time.time()
    return {"status": "ok", "config": config}


# ---------------------------------------------------------------------------
# 天气查询（通用，独立于 ESP32）
# ---------------------------------------------------------------------------

# 城市地理坐标缓存
CITY_COORDS_CACHE: dict = {}
CITY_COORDS_CACHE_TTL = 3600  # 1 小时


async def geocode_city(city: str) -> Optional[dict]:
    """通过 Open-Meteo Geocoding API 将城市名转换为经纬度。"""
    now = time.time()
    cached = CITY_COORDS_CACHE.get(city)
    if cached and now - cached.get("fetched_at", 0) < CITY_COORDS_CACHE_TTL:
        return cached["data"]

    url = (
        "https://geocoding-api.open-meteo.com/v1/search"
        f"?name={city}&count=1&language=zh&format=json"
    )
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            body = resp.json()
        results = body.get("results")
        if not results:
            return None
        r = results[0]
        data = {
            "city": r.get("name", city),
            "country": r.get("country", ""),
            "latitude": r["latitude"],
            "longitude": r["longitude"],
        }
        CITY_COORDS_CACHE[city] = {"data": data, "fetched_at": now}
        return data
    except Exception:
        return None


async def _fetch_weather_by_coords(latitude: float, longitude: float, city_name: str) -> dict:
    """根据经纬度调用 Open-Meteo 获取实时天气。"""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={latitude}&longitude={longitude}"
        "&current=temperature_2m,apparent_temperature,relative_humidity_2m,"
        "weather_code,wind_speed_10m&timezone=Asia%2FShanghai"
    )
    async with httpx.AsyncClient(timeout=6.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        current = resp.json()["current"]
    code = int(current.get("weather_code", -1))
    return {
        "temperature": current.get("temperature_2m"),
        "apparent_temperature": current.get("apparent_temperature"),
        "humidity": current.get("relative_humidity_2m"),
        "weather_code": code,
        "weather_text": WEATHER_CODE_TEXT.get(code, "未知"),
        "wind_speed": current.get("wind_speed_10m"),
        "city": city_name,
        "source": "open-meteo",
        "updated_at": datetime.now(CST).isoformat(timespec="seconds"),
    }


async def fetch_weather() -> dict:
    """优先实时调用 Open-Meteo 免费天气接口；失败时返回演示数据。"""
    now = time.time()
    cached = _weather_cache.get("data")
    if cached and now - _weather_cache.get("fetched_at", 0) < WEATHER_CACHE_TTL_SEC:
        return cached

    cfg = await _get_config()
    lat = cfg["latitude"]
    lon = cfg["longitude"]
    city = cfg["city"]
    try:
        data = await _fetch_weather_by_coords(lat, lon, city)
        _weather_cache["data"] = data
        _weather_cache["fetched_at"] = now
        await db_log_weather(city, data)
        return data
    except Exception:
        demo = dict(DEMO_WEATHER)
        demo["city"] = city
        demo["updated_at"] = datetime.now(CST).isoformat(timespec="seconds")
        return demo


# ---------------------------------------------------------------------------
# 通用天气查询接口（独立于 ESP32，其他程序可直接调用）
# ---------------------------------------------------------------------------

class CityWeatherPayload(BaseModel):
    city: str = Field(min_length=1, max_length=60, description="城市名称，例如：北京、上海、Tokyo")


@app.post("/api/weather/city")
@app.get("/api/weather/city")
async def weather_by_city(city: str = None, payload: CityWeatherPayload = None) -> dict:
    """
    通过 POST 或 GET 查询城市天气。

    GET 示例（浏览器直接访问）：
        /api/weather/city?city=北京

    POST 示例（JSON）：
        POST /api/weather/city
        {"city": "北京"}
    """
    if payload is not None:
        city = payload.city.strip()
    elif city is not None:
        city = city.strip()
    else:
        raise HTTPException(status_code=400, detail="请提供 city 参数，例如 /api/weather/city?city=北京")
    coords = await geocode_city(city)
    if not coords:
        raise HTTPException(status_code=404, detail=f"未找到城市「{city}」，请检查城市名称拼写")

    try:
        weather = await _fetch_weather_by_coords(coords["latitude"], coords["longitude"], coords["city"])
    except Exception:
        demo = dict(DEMO_WEATHER)
        demo["city"] = coords["city"]
        demo["updated_at"] = datetime.now(CST).isoformat(timespec="seconds")
        await db_log_weather(coords["city"], demo)
        return {
            "city": coords["city"],
            "country": coords["country"],
            "latitude": coords["latitude"],
            "longitude": coords["longitude"],
            "weather": demo,
            "note": "实时天气获取失败，返回演示数据",
        }

    await db_log_weather(coords["city"], weather)
    return {
        "city": coords["city"],
        "country": coords["country"],
        "latitude": coords["latitude"],
        "longitude": coords["longitude"],
        "weather": weather,
    }


# ---------------------------------------------------------------------------
# ESP32 设备接口（无需登录，设备直接轮询）
# ---------------------------------------------------------------------------


@app.get("/api/esp32/weather")
async def esp32_weather() -> dict:
    return {"device_target": "esp32", "weather": await fetch_weather()}


@app.get("/api/esp32/config")
async def esp32_device_config() -> dict:
    cfg = await _get_config()
    return {
        "device_target": "esp32",
        "refresh_interval_sec": cfg["refresh_interval_sec"],
        "led_brightness": cfg["led_brightness"],
        "display": cfg["display"],
        "custom_fields": cfg["custom_fields"],
    }


@app.get("/api/esp32/dashboard")
async def esp32_dashboard() -> dict:
    """ESP32 主轮询接口：一次请求拿到天气、时间、跑马灯与全部定制字段。"""
    cfg = await _get_config()
    now = datetime.now(CST)
    return {
        "device_target": "esp32",
        "company_name": cfg["company_name"],
        "server_time": now.isoformat(timespec="seconds"),
        "timestamp": int(now.timestamp()),
        "timezone": "Asia/Shanghai",
        "message": cfg["marquee_text"],
        "weather": await fetch_weather(),
        "display": cfg["display"],
        "led_brightness": cfg["led_brightness"],
        "refresh_interval_sec": cfg["refresh_interval_sec"],
        "custom_fields": cfg["custom_fields"],
    }


# ---------------------------------------------------------------------------
# 天气查询日志（管理后台可查看历史记录）
# ---------------------------------------------------------------------------

@app.get("/api/admin/weather-logs")
async def get_weather_logs(
    page: int = 1,
    page_size: int = 20,
    start_date: str | None = None,
    end_date: str | None = None,
    _: str = Depends(require_auth),
) -> dict:
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 100:
        page_size = 20
    offset = (page - 1) * page_size

    logs = await db_get_weather_logs(
        limit=page_size,
        offset=offset,
        start_date=start_date,
        end_date=end_date,
    )
    total = await db_get_weather_logs_count(
        start_date=start_date,
        end_date=end_date,
    )

    return {
        "items": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
    }


@app.delete("/api/admin/weather-logs/{log_id}")
async def delete_weather_log(log_id: int, _: str = Depends(require_auth)) -> dict:
    deleted = await db_delete_weather_log(log_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="日志记录不存在")
    return {"status": "ok", "deleted": log_id}