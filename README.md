## Telegram Web K
Based on Webogram, patched and improved. Available for everyone here: https://web.telegram.org/k/


### Developing
Install dependencies with:
```lang=bash
pnpm install
```
This will install all the needed dependencies.


#### Running web-server
Just run `pnpm start` to start the web server and the livereload task.
Open http://localhost:8080/ in your browser.


#### Running in production

Install the current pnpm release with `npm install -g pnpm`, then install the
dependencies with `pnpm install`. The repository disables pnpm's automatic
package-manager download so Windows does not need to create a version-switching
symbolic link.

Copy `config.example.json` to `config.json`, configure the server port and the
optional upstream HTTP proxy, then run:

```lang=bash
pnpm serve
```

The production server is required: the browser no longer connects to Telegram
MTProto endpoints directly. Login, messages, language packs, uploads and
downloads all use same-origin `/api/telegram/http/*` or
`/api/telegram/ws/*` routes. The server validates the DC and connection type,
then relays the opaque encrypted MTProto payload to Telegram. It cannot be used
as an arbitrary forward proxy.

Example `config.json`:

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

`telegram.proxyEnabled` controls whether the server uses the configured
upstream proxy. `telegram.httpProxy` accepts `http://` and `https://` URLs,
including credentials in standard URL form. When the switch is disabled,
Telegram traffic still goes through this server, but the server connects to
Telegram directly. Environment variables can override these values; Docker
deployments use the variables documented below.

For local testing, open `http://localhost:8080/`. The default server does not
redirect HTTP to HTTPS. HTTPS is used only when `server.https.enabled` is set to
`true` and certificate files are configured.

The bundled default interface language is Simplified Chinese. Its local WebK
snapshot comes from Telegram's translation platform and can be refreshed with
`pnpm fetch-lang-zh-hans`; newer language-pack updates are fetched through the
same MTProto relay.

### Running in docker

Only `tweb.production` is enabled. The old dependency and development services
remain commented out in `docker-compose.yaml` for reference.

The production service is configured directly in `docker-compose.yaml`; it no
longer requires a `config.json` bind mount. The available settings are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `TWEB_PORT` | `8080` | Published host port and container listen port. Use `443` for standard direct HTTPS. |
| `SERVER_HTTPS_ENABLED` | `false` | Serve HTTPS directly from the Node server. Leave disabled behind a TLS-terminating reverse proxy. |
| `TLS_CERTS_HOST_DIR` | `./certs` | Host directory mounted read-only at `/app/certs`. |
| `SERVER_HTTPS_KEY_FILE` | `/app/certs/server-key.pem` | Private-key path inside the container. |
| `SERVER_HTTPS_CERT_FILE` | `/app/certs/server-cert.pem` | Certificate/full-chain path inside the container. |
| `TELEGRAM_PROXY_ENABLED` | `false` | Enable or disable the upstream HTTP proxy. |
| `TELEGRAM_HTTP_PROXY` | `http://host.docker.internal:7890` | Proxy URL, with optional URL credentials. |
| `TELEGRAM_REQUEST_TIMEOUT_MS` | `30000` | Telegram upstream connect/request timeout. |
| `TELEGRAM_MAX_REQUEST_BYTES` | `67108864` | Maximum relayed HTTP request size. |
| `TELEGRAM_MAX_BUFFERED_WEBSOCKET_BYTES` | `8388608` | Maximum WebSocket data buffered while connecting upstream. |

You can edit the defaults in `docker-compose.yaml`, or provide deployment
values through a Compose `.env` file:

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

Place `privkey.pem` and `fullchain.pem` in the host directory selected by
`TLS_CERTS_HOST_DIR`. The mount is read-only inside the container. For plain
HTTP local testing, keep `SERVER_HTTPS_ENABLED=false` and `TWEB_PORT=8080`.

No public hostname setting is required. WebK constructs page, API and WebSocket
URLs from the hostname the browser actually used (`location.host`) and
same-origin paths. When direct HTTPS is enabled, the mounted certificate still
needs to cover that public hostname. A reverse proxy must preserve the normal
Host header, but the Node server does not use it to generate external URLs.

When the proxy runs on the Docker host, use `host.docker.internal` rather than
`127.0.0.1`, because the latter refers to the container itself.

* Run `docker compose up tweb.production -d` to build and start the WebK server and Telegram relay.
* With defaults, open http://localhost:8080/. With direct TLS on port 443, open the configured `https://` hostname.

You can use `docker build -f ./.docker/Dockerfile_production -t {dockerhub-username}/{imageName}:{latest} .` to build your production ready image.

### Dependencies
* [BigInteger.js](https://github.com/peterolson/BigInteger.js) ([Unlicense](https://github.com/peterolson/BigInteger.js/blob/master/LICENSE))
* [fflate](https://github.com/101arrowz/fflate) ([MIT License](https://github.com/101arrowz/fflate/blob/master/LICENSE))
* [cryptography](https://github.com/spalt08/cryptography) ([Apache License 2.0](https://github.com/spalt08/cryptography/blob/master/LICENSE))
* [emoji-data](https://github.com/iamcal/emoji-data) ([MIT License](https://github.com/iamcal/emoji-data/blob/master/LICENSE))
* [emoji-test-regex-pattern](https://github.com/mathiasbynens/emoji-test-regex-pattern) ([MIT License](https://github.com/mathiasbynens/emoji-test-regex-pattern/blob/main/LICENSE))
* [rlottie](https://github.com/rlottie/rlottie.github.io) ([MIT License](https://github.com/Samsung/rlottie/blob/master/licenses/COPYING.MIT))
* [fast-png](https://github.com/image-js/fast-png) ([MIT License](https://github.com/image-js/fast-png/blob/master/LICENSE))
* [opus-recorder](https://github.com/chris-rudmin/opus-recorder) ([BSD License](https://github.com/chris-rudmin/opus-recorder/blob/master/LICENSE.md))
* [Prism](https://github.com/PrismJS/prism) ([MIT License](https://github.com/PrismJS/prism/blob/master/LICENSE))
* [Solid](https://github.com/solidjs/solid) ([MIT License](https://github.com/solidjs/solid/blob/main/LICENSE))
* [TinyLD](https://github.com/komodojp/tinyld) ([MIT License](https://github.com/komodojp/tinyld/blob/develop/license))
* [libwebp.js](https://libwebpjs.appspot.com/)
* fastBlur
* [Mediabunny](https://github.com/Vanilagy/mediabunny) ([Mozilla Public License 2.0](https://github.com/Vanilagy/mediabunny/blob/main/LICENSE))
* [Temml](https://github.com/ronkok/Temml) ([MIT License](https://github.com/ronkok/Temml/blob/main/LICENSE))

### Debugging
You are welcome in helping to minimize the impact of bugs. There are classes, binded to global context. Look through the code for certain one and just get it by its name in developer tools.
Source maps are included in production build for your convenience.

#### Additional query parameters
* **test=1**: to use test DCs
* **debug=1**: to enable additional logging
* **noSharedWorker=1**: to disable Shared Worker, can be useful for debugging
* **http=1**: to force the use of HTTPS transport when connecting to Telegram servers

Should be applied like that: http://localhost:8080/?test=1

#### Taking local storage snapshots
You can also take and load snapshots of the local storage and indexed DB using the `./snapshot-server` [mini-app](/snapshot-server/README.md). Check the `README.md` under this folder for more details.

#### Preview all icons
You can see all the available svg icons by calling the `showIconLibrary()` global function in the browser's console.

### Troubleshooting & Suggesting

If you find an issue with this app or wish something to be added, let Telegram know using the [Suggestions Platform](https://bugs.telegram.org/c/4002).

### Licensing

The source code is licensed under GPL v3. License is available [here](/LICENSE).
