# 星屿智联科技 · 公司主页 + ESP32 云端接口

全栈应用：**Vite + React + TypeScript + Tailwind CSS 前端** + **FastAPI（Python）后端**。

## 架构

| 服务 | 目录 | 端口 | 说明 |
|------|------|------|------|
| web（前端，唯一对外预览入口） | `frontend/` | 5173 | 公司主页、登录、设备管理后台；`/api` 经 Vite proxy 转发到后端 |
| api（后端，不对外暴露） | `backend/` | 8000 | FastAPI：登录鉴权、ESP32 定制配置、实时天气聚合 |

## 本地启动

```bash
npm install        # postinstall 会自动创建 backend/.venv 并安装前后端依赖
npm run dev        # 同时启动后端 8000 与前端 5173（前台常驻）
npm run check      # 前端 TypeScript 类型检查 + oxlint
```

## 功能

- **公司主页**：首页（含实时调用 `/api/esp32/dashboard` 的接口示例）、产品方案、关于我们、联系我们（HashRouter 多页面）。
- **管理后台**（`#/login`，演示账号 `admin` / `admin123`）：
  - ESP32 配置：定制跑马灯文案、天气城市/经纬度、轮询间隔、亮度、显示开关与任意自定义 `custom_fields` 键值对；
  - 设备预览：模拟 ESP32 屏幕渲染 + 原始 JSON；
  - API 文档：设备/管理接口说明与示例响应。
- **ESP32 设备接口**（无需鉴权，HTTP GET + JSON）：
  - `GET /api/esp32/dashboard`：天气 + 服务器时间 + 跑马灯 + 全部定制字段；
  - `GET /api/esp32/weather`：实时天气（优先 Open-Meteo 免费接口，失败自动回退演示数据，以 `source` 字段区分）；
  - `GET /api/esp32/config`：设备配置。

## ⚠️ 数据性质说明

当前未启用 Supabase/数据库连接：

- 登录账号为**内置演示账号**（admin / admin123）；
- 登录 token 与 ESP32 定制配置保存在**后端进程内存**中，属于**临时本地状态**，服务重启后重置；
- 以上均**非真实持久化**。如需真实保存账号与配置，请先在平台选择并启用数据库连接（如 Supabase）。
