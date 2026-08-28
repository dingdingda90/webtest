---
name: "webtest-deploy"
description: "Deploy and debug the WebTest project (FastAPI + React + SQLite) on an Alibaba Cloud Ubuntu server. Invoke when deploying, updating, or troubleshooting the WebTest backend/frontend on the remote server (121.43.107.130:443)."
---

# WebTest 项目部署与调试

完整的 WebTest（星屿智联科技）项目在阿里云 Ubuntu 服务器上的部署、更新和问题排查流程。

## 项目架构

| 层级 | 技术栈 | 说明 |
|------|--------|------|
| 前端 | Vite + React 19 + TypeScript + Tailwind CSS v4 | 单页应用，HashRouter |
| 后端 | FastAPI (Python 3) + SQLite | REST API 服务，端口 8000 |
| 反向代理 | Nginx | 静态文件托管 + `/api/` 代理 |
| 数据库 | SQLite (aiosqlite) | 用户、配置、天气日志持久化 |

## 服务器信息

| 项目 | 值 |
|------|-----|
| IP | 121.43.107.130 |
| SSH 端口 | 443 |
| 用户 | root |
| 项目路径 | `/var/www/myweb/` |
| 后端路径 | `/var/www/myweb/backend/` |
| 前端构建产物 | `/var/www/myweb/frontend/dist/` |

---

## 一、SSH 连接服务器

```powershell
ssh -p 443 root@121.43.107.130
```

> 密码为 `2B+sb=db`，输入时不显示字符，按回车确认。

---

## 二、代码拉取与更新

### 2.1 从 GitHub 拉取代码

```bash
cd /var/www/myweb
git pull origin main
```

### 2.2 GitHub 被墙的解决方案

服务器上 GitHub 访问不稳定时，有以下三种方案：

**方案 A：切换 Git 协议版本（首选）**

```bash
git config --global http.version HTTP/1.1
```

**方案 B：使用 GitHub 镜像加速**

```bash
git config --global url."https://ghproxy.com/https://github.com/".insteadOf "https://github.com/"
```

**方案 C：修改 hosts 文件**

```bash
# 查询 GitHub 当前 IP
nslookup github.com
# 编辑 hosts 文件
vim /etc/hosts
# 添加一行（替换为实际 IP）
140.82.121.4  github.com
```

---

## 三、后端部署

### 3.1 安装 Python 依赖

```bash
cd /var/www/myweb/backend
pip3 install -r requirements.txt
```

**依赖清单**（`requirements.txt`）：
- `fastapi>=0.100`
- `uvicorn[standard]`
- `httpx`
- `pydantic`
- `aiosqlite`
- `watchfiles==1.2.0`
- `websockets==17.0.1`

### 3.2 初始化数据库

```bash
mkdir -p /var/www/myweb/backend/data
```

数据库文件路径：`/var/www/myweb/backend/data/webtest.db`，由 `database.py` 中的 `init_db()` 自动创建表和种子数据。

### 3.3 启动后端服务

```bash
cd /var/www/myweb/backend
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload > /var/log/myweb-backend.log 2>&1 &
```

### 3.4 停止/重启后端

```bash
# 查找进程
ps aux | grep uvicorn

# 停止进程
kill <PID>

# 重新启动
cd /var/www/myweb/backend
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload > /var/log/myweb-backend.log 2>&1 &
```

### 3.5 验证后端是否启动

```bash
curl http://127.0.0.1:8000/
# 应返回：{"message":"星屿智联科技 API v2.0.0"}
```

---

## 四、Nginx 配置

### 4.1 配置文件位置

通常为 `/etc/nginx/sites-available/default` 或 `/etc/nginx/conf.d/myweb.conf`。

### 4.2 关键配置

```nginx
server {
    listen 80;
    server_name 121.43.107.130;

    # 前端静态文件
    root /var/www/myweb/frontend/dist;
    index index.html;

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
```

### 4.3 重载 Nginx

```bash
nginx -t              # 测试配置
systemctl reload nginx
```

---

## 五、从本地上传文件到服务器

使用 `scp` 命令（注意端口为 443）：

```powershell
# 上传单个文件
scp -P 443 "C:\Users\zhxi\OneDrive - Diehl Group\Desktop\WebTest\backend\database.py" root@121.43.107.130:/var/www/myweb/backend/

# 上传整个目录
scp -P 443 -r "C:\Users\zhxi\OneDrive - Diehl Group\Desktop\WebTest\backend\*" root@121.43.107.130:/var/www/myweb/backend/
```

> 上传后记得重启后端服务使更改生效。

---

## 六、常见问题排查

### 6.1 "后端未启用"

**原因**：FastAPI 未启动或 Nginx 未配置 `/api/` 代理。

**排查步骤**：
1. 检查 uvicorn 进程：`ps aux | grep uvicorn`
2. 检查端口监听：`netstat -tlnp | grep 8000`
3. 检查 Nginx 配置：`nginx -t && cat /etc/nginx/sites-available/default | grep -A5 "location /api"`
4. 直接测试后端：`curl http://127.0.0.1:8000/api/health`

### 6.2 `ModuleNotFoundError: No module named 'aiosqlite'`

```bash
pip3 install aiosqlite
```

### 6.3 `unable to open database file`

```bash
mkdir -p /var/www/myweb/backend/data
chmod 755 /var/www/myweb/backend/data
```

### 6.4 `{"detail":"Not Found"}` 访问接口时

**原因**：`main.py` 中未定义该接口，或服务器上的文件未更新。

**解决**：
1. 检查本地 `main.py` 是否包含该接口定义
2. 使用 `scp` 上传最新文件到服务器
3. 重启后端服务

### 6.5 Git 拉取失败（`RPC failed; curl 16 Error in the HTTP2 framing layer`）

执行 `git config --global http.version HTTP/1.1` 后重试。

### 6.6 网页加载正常但 API 请求失败

1. 打开浏览器开发者工具（F12）→ Network 标签
2. 检查 `/api/` 请求的响应状态码
3. 检查 Nginx 日志：`tail -f /var/log/nginx/error.log`
4. 检查后端日志：`tail -f /var/log/myweb-backend.log`

---

## 七、完整部署检查清单

- [ ] SSH 已连接服务器（端口 443）
- [ ] 代码已拉取/更新到 `/var/www/myweb/`
- [ ] Python 依赖已安装（`pip3 install -r requirements.txt`）
- [ ] 数据库目录已创建（`mkdir -p backend/data`）
- [ ] 后端服务已启动（`uvicorn` 监听 8000 端口）
- [ ] Nginx 已配置 `/api/` 反向代理
- [ ] Nginx 已重载（`systemctl reload nginx`）
- [ ] `curl http://127.0.0.1:8000/` 返回正常
- [ ] 浏览器访问 `http://121.43.107.130/` 正常加载

---

## 八、API 接口参考

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |
| GET | `/api/admin/config` | 获取 ESP32 配置 |
| POST | `/api/admin/config` | 更新 ESP32 配置 |
| GET | `/api/admin/weather-logs` | 查看天气查询日志 |
| POST | `/api/weather/city` | 通过城市名查询天气 |
| GET | `/api/esp32/poll` | ESP32 设备轮询 |