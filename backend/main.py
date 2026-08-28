"""星屿智联科技 —— 公司主页后端（FastAPI）。

提供三类能力：
1. 公司主页/管理后台所需的登录鉴权接口（/api/auth/*）
2. 管理后台用于定制 ESP32 反馈内容的配置接口（/api/admin/*）
3. 供 ESP32 设备直接轮询的 JSON 接口（/api/esp32/*），含实时天气

⚠️ 数据性质说明：当前环境未启用 Supabase/数据库连接。
登录使用内置演示账号，token 与 ESP32 定制配置保存在进程内存中，
属于「临时本地状态」，服务重启后会重置，并非真实持久化。
"""

from __future__ import annotations

import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="星屿智联科技 API", version="1.0.0")

CST = timezone(timedelta(hours=8))

# ---------------------------------------------------------------------------
# 临时内存状态（演示用，非持久化）
# ---------------------------------------------------------------------------

# 内置演示账号：仅用于演示登录流程，重启即重置
DEMO_USERNAME = "admin"
DEMO_PASSWORD = "admin123"

# token -> {"username": str, "created_at": float}
TOKENS: Dict[str, dict] = {}

# ESP32 定制配置（内存临时状态，重启后恢复默认值）
esp32_config: dict = {
    "company_name": "星屿智联科技",
    "marquee_text": "欢迎使用星屿智联 · ESP32 云端智能终端",
    "city": "上海",
    "latitude": 31.23,
    "longitude": 121.47,
    "refresh_interval_sec": 60,
    "led_brightness": 80,
    "display": {"show_weather": True, "show_time": True, "show_message": True},
    "custom_fields": {
        "welcome": "Hello ESP32",
        "firmware_channel": "stable",
        "office_mode": "normal",
    },
}

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
def login(payload: LoginPayload) -> dict:
    if payload.username != DEMO_USERNAME or payload.password != DEMO_PASSWORD:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = secrets.token_hex(16)
    TOKENS[token] = {"username": payload.username, "created_at": time.time()}
    return {"token": token, "user": {"username": payload.username, "role": "admin"}}


@app.get("/api/auth/me")
def me(token: str = Depends(require_auth)) -> dict:
    session = TOKENS[token]
    return {"username": session["username"], "role": "admin"}


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


@app.get("/api/admin/esp32-config")
def get_esp32_config(_: str = Depends(require_auth)) -> dict:
    return esp32_config


@app.put("/api/admin/esp32-config")
def update_esp32_config(payload: Esp32ConfigPayload, _: str = Depends(require_auth)) -> dict:
    global esp32_config
    esp32_config = payload.model_dump()
    return {"status": "ok", "config": esp32_config}


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

    lat = esp32_config["latitude"]
    lon = esp32_config["longitude"]
    city = esp32_config["city"]
    try:
        data = await _fetch_weather_by_coords(lat, lon, city)
        _weather_cache["data"] = data
        _weather_cache["fetched_at"] = now
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
        return {
            "city": coords["city"],
            "country": coords["country"],
            "latitude": coords["latitude"],
            "longitude": coords["longitude"],
            "weather": demo,
            "note": "实时天气获取失败，返回演示数据",
        }

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
def esp32_device_config() -> dict:
    cfg = esp32_config
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
    cfg = esp32_config
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