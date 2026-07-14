## Telegram Web K

Telegram Web K 基于 Webogram 开发，包含持续的修复与改进。在线版本位于 https://web.telegram.org/k/。

### 开发

运行以下命令安装依赖：

```lang=bash
pnpm install
```

该命令会安装项目需要的全部依赖。

#### 启动开发服务器

运行 `pnpm start` 启动 Web 服务器和实时重载任务，然后在浏览器中访问 http://localhost:8080/。

#### 生产环境运行

使用 `npm install -g pnpm` 安装当前 pnpm 版本，再运行 `pnpm install` 安装依赖。项目已关闭 pnpm 自动下载包管理器的功能，Windows 环境会直接使用已安装的固定版本，省去版本切换符号链接。

将 `config.example.json` 复制为 `config.json`，填写服务器端口和可选的上游 HTTP 代理，然后运行：

```lang=bash
pnpm serve
```

生产环境必须使用内置服务器。登录、消息、语言包、上传与下载流量统一经过同源的 `/api/telegram/http/*` 或 `/api/telegram/ws/*` 路由。服务器会校验 DC 和连接类型，再把加密的 MTProto 数据传送至 Telegram。服务范围限定为 Telegram MTProto 中继。

`config.json` 示例：

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8080,
    "publicDirectory": "public",
    "https": {
      "enabled": false,
      "keyFile": "certs/server-key.pem",
      "certFile": "certs/server-cert.pem"
    }
  },
  "telegram": {
    "proxyEnabled": true,
    "httpProxy": "http://127.0.0.1:7890",
    "requestTimeoutMs": 30000,
    "maxRequestBytes": 67108864,
    "maxBufferedWebSocketBytes": 8388608
  }
}
```

`telegram.proxyEnabled` 控制服务器使用上游代理的方式。`telegram.httpProxy` 接受 `http://` 和 `https://` 地址，也支持标准 URL 格式的身份凭据。值为 `false` 时，客户端流量继续经过本服务器，本服务器会直接连接 Telegram。环境变量可以覆盖这些配置，Docker 部署使用下文列出的变量。

本地测试可访问 `http://localhost:8080/`。默认配置提供 HTTP 服务。将 `server.https.enabled` 设为 `true` 并配置证书文件后，服务器会提供 HTTPS 服务。

默认界面语言为简体中文。本地 WebK 语言包来自 Telegram 翻译平台，可运行 `pnpm fetch-lang-zh-hans` 刷新；后续语言包更新会经过同一条 MTProto 中继链路。

### Docker 运行

`docker-compose.yaml` 当前启用 `tweb.production` 服务，注释区域保留早期的依赖服务和开发服务配置，供维护时参考。

生产服务直接读取 `docker-compose.yaml` 中的环境变量：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `TWEB_PORT` | `8080` | 设置主机映射端口和容器监听端口；直接提供标准 HTTPS 时可设为 `443`。 |
| `SERVER_HTTPS_ENABLED` | `false` | 控制 Node 服务器使用 HTTP 或 HTTPS；TLS 由反向代理终止时使用 `false`。 |
| `TLS_CERTS_HOST_DIR` | `./certs` | 设置主机证书目录，该目录会以只读方式挂载到 `/app/certs`。 |
| `SERVER_HTTPS_KEY_FILE` | `/app/certs/server-key.pem` | 设置容器内的私钥路径。 |
| `SERVER_HTTPS_CERT_FILE` | `/app/certs/server-cert.pem` | 设置容器内的证书或完整证书链路径。 |
| `TELEGRAM_PROXY_ENABLED` | `false` | 控制服务器使用上游 HTTP 代理的方式。 |
| `TELEGRAM_HTTP_PROXY` | `http://host.docker.internal:7890` | 设置代理地址，可包含 URL 身份凭据。 |
| `TELEGRAM_REQUEST_TIMEOUT_MS` | `30000` | 设置 Telegram 上游连接和请求的超时时间。 |
| `TELEGRAM_MAX_REQUEST_BYTES` | `67108864` | 设置 HTTP 中继请求的最大体积。 |
| `TELEGRAM_MAX_BUFFERED_WEBSOCKET_BYTES` | `8388608` | 设置连接上游期间可缓存的 WebSocket 数据上限。 |

可以直接编辑 `docker-compose.yaml` 中的默认值，也可以在 Compose `.env` 文件中填写部署参数：

```dotenv
TWEB_PORT=443
SERVER_HTTPS_ENABLED=true
TLS_CERTS_HOST_DIR=./certs
SERVER_HTTPS_KEY_FILE=/app/certs/privkey.pem
SERVER_HTTPS_CERT_FILE=/app/certs/fullchain.pem
TELEGRAM_PROXY_ENABLED=true
TELEGRAM_HTTP_PROXY=http://host.docker.internal:7890
TELEGRAM_REQUEST_TIMEOUT_MS=30000
```

将 `privkey.pem` 和 `fullchain.pem` 放入 `TLS_CERTS_HOST_DIR` 指向的主机目录。容器会以只读方式挂载该目录。本地 HTTP 测试可使用 `SERVER_HTTPS_ENABLED=false` 和 `TWEB_PORT=8080`。

WebK 通过 `location.host` 读取浏览器实际访问的主机名，并使用同源路径构造页面、API 与 WebSocket 地址，因此 Compose 配置省略了独立的公共主机名变量。直接启用 HTTPS 时，挂载的证书域名应覆盖公开主机名。使用反向代理时，应保留正常的 Host 请求头。

代理运行在 Docker 主机上时，请使用 `host.docker.internal`。容器内的 `127.0.0.1` 指向容器自身。

运行 `docker compose up tweb.production -d` 构建并启动 WebK 服务器与 Telegram 中继。默认配置访问 http://localhost:8080/；端口 `443` 的直接 TLS 配置使用对应的 `https://` 主机名。

以下命令可以构建生产镜像：

```lang=bash
docker build -f ./.docker/Dockerfile_production -t {dockerhub-username}/{imageName}:{latest} .
```

### 依赖项目

* [BigInteger.js](https://github.com/peterolson/BigInteger.js)（[Unlicense](https://github.com/peterolson/BigInteger.js/blob/master/LICENSE)）
* [fflate](https://github.com/101arrowz/fflate)（[MIT License](https://github.com/101arrowz/fflate/blob/master/LICENSE)）
* [cryptography](https://github.com/spalt08/cryptography)（[Apache License 2.0](https://github.com/spalt08/cryptography/blob/master/LICENSE)）
* [emoji-data](https://github.com/iamcal/emoji-data)（[MIT License](https://github.com/iamcal/emoji-data/blob/master/LICENSE)）
* [emoji-test-regex-pattern](https://github.com/mathiasbynens/emoji-test-regex-pattern)（[MIT License](https://github.com/mathiasbynens/emoji-test-regex-pattern/blob/main/LICENSE)）
* [rlottie](https://github.com/rlottie/rlottie.github.io)（[MIT License](https://github.com/Samsung/rlottie/blob/master/licenses/COPYING.MIT)）
* [fast-png](https://github.com/image-js/fast-png)（[MIT License](https://github.com/image-js/fast-png/blob/master/LICENSE)）
* [opus-recorder](https://github.com/chris-rudmin/opus-recorder)（[BSD License](https://github.com/chris-rudmin/opus-recorder/blob/master/LICENSE.md)）
* [Prism](https://github.com/PrismJS/prism)（[MIT License](https://github.com/PrismJS/prism/blob/master/LICENSE)）
* [Solid](https://github.com/solidjs/solid)（[MIT License](https://github.com/solidjs/solid/blob/main/LICENSE)）
* [TinyLD](https://github.com/komodojp/tinyld)（[MIT License](https://github.com/komodojp/tinyld/blob/develop/license)）
* [libwebp.js](https://libwebpjs.appspot.com/)
* fastBlur
* [Mediabunny](https://github.com/Vanilagy/mediabunny)（[Mozilla Public License 2.0](https://github.com/Vanilagy/mediabunny/blob/main/LICENSE)）
* [Temml](https://github.com/ronkok/Temml)（[MIT License](https://github.com/ronkok/Temml/blob/main/LICENSE)）

### 调试

欢迎协助降低缺陷影响。部分 class 已绑定到全局上下文，可以先在源码中找到目标 class，再在开发者工具中通过名称获取。生产构建包含 source map，便于定位源码。

#### 附加查询参数

* `test=1`：使用测试 DC。
* `debug=1`：启用附加日志。
* `noSharedWorker=1`：停用 Shared Worker，便于调试相关行为。
* `http=1`：连接 Telegram 服务器时强制使用 HTTPS 传输。

查询参数使用方式： http://localhost:8080/?test=1

#### 创建本地存储快照

可以使用 `./snapshot-server` [小型应用](/snapshot-server/README.md)创建和载入 local storage 与 IndexedDB 快照。具体用法见该目录下的 `README.md`。

#### 预览全部图标

在浏览器控制台中调用全局函数 `showIconLibrary()`，即可查看全部 SVG 图标。

### 问题反馈与功能建议

发现问题或希望添加功能时，可以前往 Telegram [建议平台](https://bugs.telegram.org/c/4002)提交反馈。

### 许可证

源代码采用 GPL v3 许可证，完整内容见 [LICENSE](/LICENSE)。
