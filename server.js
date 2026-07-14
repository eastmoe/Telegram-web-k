const compression = require('compression');
const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const {createHttpAuth} = require('./server/auth');
const {loadConfig} = require('./server/config');
const {createTelegramRelay} = require('./server/telegramRelay');

function resolvePublicDirectories(config, rootDirectory = __dirname) {
  const configured = path.resolve(rootDirectory, config.server.publicDirectory);
  const dist = path.resolve(rootDirectory, 'dist');

  if(config.server.publicDirectory === 'public' && fs.existsSync(path.join(dist, 'index.html'))) {
    return [dist, configured];
  }

  return [configured];
}

function resolvePublicDirectory(config, rootDirectory = __dirname) {
  return resolvePublicDirectories(config, rootDirectory)[0];
}

function createApp(config, {rootDirectory = __dirname} = {}) {
  const app = express();
  const publicDirectories = resolvePublicDirectories(config, rootDirectory);
  const publicDirectory = publicDirectories[0];
  const auth = createHttpAuth(config.auth, {secureCookies: config.server.https.enabled});

  app.disable('x-powered-by');
  app.set('etag', false);
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  auth.attachRoutes(app);
  app.use(auth.middleware);

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      httpAuth: config.auth.enabled,
      telegramRelay: true,
      upstreamHttpProxy: config.telegram.proxyEnabled,
      https: config.server.https.enabled
    });
  });

  const relay = createTelegramRelay(config.telegram);
  relay.attachHttp(app);

  app.use(compression());
  for(const directory of publicDirectories) {
    app.use(express.static(directory));
  }
  app.get(/.*/, (req, res, next) => {
    const indexPath = path.join(publicDirectory, 'index.html');
    if(!fs.existsSync(indexPath)) {
      next();
      return;
    }

    res.sendFile(indexPath);
  });

  return {app, auth, relay, publicDirectory, publicDirectories};
}

function createServer(config, app) {
  if(!config.server.https.enabled) {
    return http.createServer(app);
  }

  return https.createServer({
    key: fs.readFileSync(path.resolve(__dirname, config.server.https.keyFile)),
    cert: fs.readFileSync(path.resolve(__dirname, config.server.https.certFile))
  }, app);
}

function start() {
  const config = loadConfig();
  const {app, auth, relay, publicDirectories} = createApp(config);
  const server = createServer(config, app);
  relay.attachWebSocket(server, auth.authorizeUpgrade);

  server.listen(config.server.port, config.server.host, () => {
    const protocol = config.server.https.enabled ? 'https' : 'http';
    console.log(`Telegram Web K listening on ${protocol}://${config.server.host}:${config.server.port}`);
    console.log('Static files:', publicDirectories.join(', '));
    console.log('HTTP authentication:', config.auth.enabled ? 'enabled' : 'disabled');
    console.log('Telegram upstream HTTP proxy:', config.telegram.proxyEnabled ? 'enabled' : 'disabled (direct server egress)');
  });

  return server;
}

if(require.main === module) {
  start();
}

module.exports = {createApp, createServer, resolvePublicDirectories, resolvePublicDirectory, start};
