const compression = require('compression');
const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const {loadConfig} = require('./server/config');
const {createTelegramRelay} = require('./server/telegramRelay');

function resolvePublicDirectory(config) {
  const configured = path.resolve(__dirname, config.server.publicDirectory);
  const dist = path.resolve(__dirname, 'dist');

  if(config.server.publicDirectory === 'public' && fs.existsSync(path.join(dist, 'index.html'))) {
    return dist;
  }

  return configured;
}

function createApp(config) {
  const app = express();
  const publicDirectory = resolvePublicDirectory(config);

  app.disable('x-powered-by');
  app.set('etag', false);
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      telegramRelay: true,
      upstreamHttpProxy: config.telegram.proxyEnabled
    });
  });

  const relay = createTelegramRelay(config.telegram);
  relay.attachHttp(app);

  app.use(compression());
  app.use(express.static(publicDirectory));
  app.get(/.*/, (req, res, next) => {
    const indexPath = path.join(publicDirectory, 'index.html');
    if(!fs.existsSync(indexPath)) {
      next();
      return;
    }

    res.sendFile(indexPath);
  });

  return {app, relay, publicDirectory};
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
  const {app, relay, publicDirectory} = createApp(config);
  const server = createServer(config, app);
  relay.attachWebSocket(server);

  server.listen(config.server.port, config.server.host, () => {
    const protocol = config.server.https.enabled ? 'https' : 'http';
    console.log(`Telegram Web K listening on ${protocol}://${config.server.host}:${config.server.port}`);
    console.log('Static files:', publicDirectory);
    console.log('Telegram upstream HTTP proxy:', config.telegram.proxyEnabled ? 'enabled' : 'disabled (direct server egress)');
  });

  return server;
}

if(require.main === module) {
  start();
}

module.exports = {createApp, createServer, resolvePublicDirectory, start};
