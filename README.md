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
    "port": 80,
    "publicDirectory": "public",
    "https": {
      "enabled": false,
      "keyFile": "certs/server-key.pem",
      "certFile": "certs/server-cert.pem"
    }
  },
  "telegram": {
    "httpProxy": "http://127.0.0.1:7890",
    "requestTimeoutMs": 30000,
    "maxRequestBytes": 67108864,
    "maxBufferedWebSocketBytes": 8388608
  }
}
```

`telegram.httpProxy` accepts `http://` and `https://` proxy URLs, including
credentials in standard URL form. If it is empty, Telegram traffic still goes
through this server, but the server connects to Telegram directly. The
`TELEGRAM_HTTP_PROXY`, `TWEB_CONFIG`, `HOST` and `PORT` environment variables
can override the corresponding deployment values.

The bundled default interface language is Simplified Chinese. Its local WebK
snapshot comes from Telegram's translation platform and can be refreshed with
`pnpm fetch-lang-zh-hans`; newer language-pack updates are fetched through the
same MTProto relay.

### Running in docker

#### Developing: 
* Install dependencies `docker-compose up tweb.dependencies`.
* Run develop container `docker-compose up tweb.develop `.
* Open http://localhost:8080/ in your browser. 

#### Production:
* Copy `config.example.json` to `config.json` and edit the proxy URL.
* Run `docker-compose up tweb.production -d` to build and start the WebK server and Telegram relay.
* Open http://localhost:80/ in your browser.

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
