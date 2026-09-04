"""SQLite 数据库模块 —— 持久化用户、配置、天气查询记录。

表结构：
- users:        用户账号（密码哈希存储）
- esp32_config: ESP32 配置（键值对）
- weather_log:  天气查询记录（统计用）
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
from datetime import datetime, timezone, timedelta

import aiosqlite

CST = timezone(timedelta(hours=8))
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "webtest.db")


def hash_password(password: str, salt: str | None = None) -> str:
    """PBKDF2-SHA256 密码哈希，格式：salt$hash_hex"""
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """验证密码是否匹配"""
    salt, _ = stored.split("$", 1)
    return hash_password(password, salt) == stored


async def get_db() -> aiosqlite.Connection:
    """获取数据库连接"""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db() -> None:
    """初始化数据库：建表 + 种子数据"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    db = await get_db()
    try:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT    UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role       TEXT    DEFAULT 'admin',
                created_at TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS esp32_config (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS weather_log (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                city         TEXT    NOT NULL,
                temperature  REAL,
                humidity     INTEGER,
                weather_code INTEGER,
                weather_text TEXT,
                wind_speed   REAL,
                source       TEXT,
                queried_at   TEXT    NOT NULL
            );
        """)

        # 种子用户
        cur = await db.execute("SELECT COUNT(*) FROM users")
        if (await cur.fetchone())[0] == 0:
            await db.execute(
                "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                ("admin", hash_password("admin123"), "admin", datetime.now(CST).isoformat()),
            )

        # 种子配置
        cur = await db.execute("SELECT COUNT(*) FROM esp32_config")
        if (await cur.fetchone())[0] == 0:
            defaults = {
                "company_name": "星屿智联科技",
                "marquee_text": "欢迎使用星屿智联 · ESP32 云端智能终端",
                "city": "上海",
                "latitude": 31.23,
                "longitude": 121.47,
                "refresh_interval_sec": 60,
                "led_brightness": 80,
                "display": {"show_weather": True, "show_time": True, "show_message": True},
                "custom_fields": {"welcome": "Hello ESP32", "firmware_channel": "stable", "office_mode": "normal"},
            }
            for k, v in defaults.items():
                await db.execute(
                    "INSERT INTO esp32_config (key, value) VALUES (?, ?)",
                    (k, json.dumps(v, ensure_ascii=False)),
                )

        await db.commit()
    finally:
        await db.close()


# ========== 用户操作 ==========

async def db_get_user(username: str) -> dict | None:
    db = await get_db()
    try:
        cur = await db.execute("SELECT * FROM users WHERE username = ?", (username,))
        row = await cur.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def db_create_user(username: str, password: str, role: str = "admin") -> dict:
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
            (username, hash_password(password), role, datetime.now(CST).isoformat()),
        )
        await db.commit()
        cur = await db.execute("SELECT * FROM users WHERE username = ?", (username,))
        return dict(await cur.fetchone())
    finally:
        await db.close()


# ========== ESP32 配置操作 ==========

async def db_get_config() -> dict:
    db = await get_db()
    try:
        cur = await db.execute("SELECT key, value FROM esp32_config")
        rows = await cur.fetchall()
        config = {}
        for row in rows:
            try:
                config[row["key"]] = json.loads(row["value"])
            except json.JSONDecodeError:
                config[row["key"]] = row["value"]
        return config
    finally:
        await db.close()


async def db_update_config(config: dict) -> None:
    db = await get_db()
    try:
        for key, value in config.items():
            json_val = json.dumps(value, ensure_ascii=False)
            await db.execute(
                "INSERT INTO esp32_config (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, json_val),
            )
        await db.commit()
    finally:
        await db.close()


# ========== 天气日志 ==========

async def db_log_weather(city: str, weather: dict) -> None:
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO weather_log (city, temperature, humidity, weather_code, weather_text, wind_speed, source, queried_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                city,
                weather.get("temperature"),
                weather.get("humidity"),
                weather.get("weather_code"),
                weather.get("weather_text"),
                weather.get("wind_speed"),
                weather.get("source"),
                datetime.now(CST).isoformat(),
            ),
        )
        await db.commit()
    finally:
        await db.close()


async def db_get_weather_logs(
    limit: int = 20,
    offset: int = 0,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    db = await get_db()
    try:
        conditions = []
        params: list = []

        if start_date:
            conditions.append("queried_at >= ?")
            params.append(start_date)
        if end_date:
            conditions.append("queried_at <= ?")
            params.append(end_date)

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        params.extend([limit, offset])
        cur = await db.execute(
            f"SELECT * FROM weather_log {where_clause} ORDER BY queried_at DESC LIMIT ? OFFSET ?",
            tuple(params),
        )
        return [dict(row) for row in await cur.fetchall()]
    finally:
        await db.close()


async def db_get_weather_logs_count(
    start_date: str | None = None,
    end_date: str | None = None,
) -> int:
    db = await get_db()
    try:
        conditions = []
        params: list = []

        if start_date:
            conditions.append("queried_at >= ?")
            params.append(start_date)
        if end_date:
            conditions.append("queried_at <= ?")
            params.append(end_date)

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        cur = await db.execute(
            f"SELECT COUNT(*) FROM weather_log {where_clause}", tuple(params)
        )
        row = await cur.fetchone()
        return row[0] if row else 0
    finally:
        await db.close()


async def db_delete_weather_log(log_id: int) -> bool:
    db = await get_db()
    try:
        cur = await db.execute("DELETE FROM weather_log WHERE id = ?", (log_id,))
        await db.commit()
        return cur.rowcount > 0
    finally:
        await db.close()