# Telegram Web K Docker 镜像

此仓库提供带服务器端 Telegram 中继、HTTP 代理、简体中文和访问认证的 Telegram Web K 镜像。

镜像地址：`ghcr.io/eastmoe/telegram-web-k`

## Docker Compose 部署

仓库中的 `docker-compose.yaml` 已配置该镜像。运行以下命令即可启动：

```bash
docker compose up -d
```

默认访问地址为 http://localhost:8080/。

也可以创建一份精简的 `docker-compose.yaml`：

```yaml
services:
  telegram-web-k:
    image: ghcr.io/eastmoe/telegram-web-k
    container_name: telegram-web-k
    restart: unless-stopped
    ports:
      - "${TWEB_PORT:-8080}:8080"
    environment:
      HOST: 0.0.0.0
      PORT: 8080
      HTTP_AUTH_ENABLED: "${HTTP_AUTH_ENABLED:-false}"
      HTTP_AUTH_USERNAME: "${HTTP_AUTH_USERNAME:-admin}"
      HTTP_AUTH_PASSWORD_HASH: "${HTTP_AUTH_PASSWORD_HASH:-}"
      TELEGRAM_PROXY_ENABLED: "${TELEGRAM_PROXY_ENABLED:-false}"
      TELEGRAM_HTTP_PROXY: "${TELEGRAM_HTTP_PROXY:-http://host.docker.internal:7890}"
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

## Docker Run 部署

以下命令会启动一个监听 `8080` 端口的实例：

```bash
docker run -d --name telegram-web-k --restart unless-stopped -p 8080:8080 ghcr.io/eastmoe/telegram-web-k
```

## 启用访问认证

认证开关会同时保护 Web 界面、健康检查、Telegram HTTP API 和 WebSocket 中继。浏览器登录成功后，会在 localStorage 中保存会话令牌，并通过安全 Cookie 访问页面和 API。标准 HTTP Basic Auth 也可用于脚本和监控程序。

先生成密码哈希：

```bash
docker run --rm ghcr.io/eastmoe/telegram-web-k node server/hashPassword.js change-this-password
```

将输出写入 Compose `.env` 文件：

```dotenv
HTTP_AUTH_ENABLED=true
HTTP_AUTH_USERNAME=admin
HTTP_AUTH_PASSWORD_HASH=scrypt:生成的盐值:生成的密码摘要
```

再次运行 `docker compose up -d` 即可应用配置。访问 Web 界面时会显示登录页，访问 `/auth/logout` 可以清除本地登录状态。

使用 `docker run` 时，可以通过环境变量文件加载相同配置：

```bash
docker run -d --name telegram-web-k --restart unless-stopped -p 8080:8080 --env-file .env ghcr.io/eastmoe/telegram-web-k:v0.0.1
```

API 客户端可以直接使用 Basic Auth：

```bash
curl -u admin:change-this-password http://localhost:8080/api/health
```

公网部署请配合 HTTPS 使用访问认证。

## Telegram 上游代理

设置以下变量后，容器与 Telegram 之间的 HTTP 和 WebSocket 流量会统一经过指定代理：

```dotenv
TELEGRAM_PROXY_ENABLED=true
TELEGRAM_HTTP_PROXY=http://host.docker.internal:7890
```

Linux Docker 运行 `docker run` 时可添加 `--add-host host.docker.internal:host-gateway`。代理地址也支持 `https://` 和标准 URL 身份凭据。

## HTTPS 与证书

反向代理负责 TLS 时，可保持容器使用 HTTP。Node 服务器直接提供 HTTPS 时，挂载证书目录并设置以下变量：

```dotenv
PORT=443
SERVER_HTTPS_ENABLED=true
SERVER_HTTPS_KEY_FILE=/app/certs/server-key.pem
SERVER_HTTPS_CERT_FILE=/app/certs/server-cert.pem
```

对应的目录挂载参数为：

```bash
-v ./certs:/app/certs:ro
```

## 常用环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `8080` | 容器监听端口 |
| `HTTP_AUTH_ENABLED` | `false` | 启用访问认证 |
| `HTTP_AUTH_USERNAME` | `admin` | 登录用户名 |
| `HTTP_AUTH_PASSWORD_HASH` | 空 | scrypt 密码哈希 |
| `TELEGRAM_PROXY_ENABLED` | `false` | 启用 Telegram 上游代理 |
| `TELEGRAM_HTTP_PROXY` | 空 | HTTP 或 HTTPS 代理地址 |
| `SERVER_HTTPS_ENABLED` | `false` | 启用 Node HTTPS 服务 |

源码开发、构建和调试说明位于 [DEV.MD](./DEV.MD)。
