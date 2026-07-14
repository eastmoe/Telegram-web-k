const express = require('express');
const https = require('https');
const {HttpsProxyAgent} = require('https-proxy-agent');
const {WebSocket, WebSocketServer} = require('ws');

const DC_HOSTS = ['pluto', 'venus', 'aurora', 'vesta', 'flora'];
const CONNECTION_TYPES = new Set(['client', 'download', 'upload']);
const HTTP_ROUTE = /^\/api\/telegram\/http\/([1-5])\/(client|download|upload)\/?$/;
const WEBSOCKET_ROUTE = /^\/api\/telegram\/ws\/([1-5])\/(client|download|upload)\/?$/;

function parseBoolean(value) {
  return value === '1' || value === 'true';
}

function parseRelayRequest(requestUrl, route) {
  const url = new URL(requestUrl, 'http://relay.local');
  const match = url.pathname.match(route);
  if(!match) {
    return;
  }

  const dcId = Number(match[1]);
  const connectionType = match[2];
  if(dcId < 1 || dcId > 5 || !CONNECTION_TYPES.has(connectionType)) {
    return;
  }

  return {
    dcId,
    connectionType,
    test: parseBoolean(url.searchParams.get('test')),
    premium: parseBoolean(url.searchParams.get('premium'))
  };
}

function getConnectionSuffix(connectionType) {
  return connectionType === 'client' ? '' : '-1';
}

function getTelegramHttpTarget({dcId, connectionType, test}) {
  const suffix = getConnectionSuffix(connectionType);
  const host = `${DC_HOSTS[dcId - 1]}${suffix}.web.telegram.org`;
  const pathname = test ? '/apiw_test1' : '/apiw1';
  return {host, pathname};
}

function getTelegramWebSocketTarget({dcId, connectionType, test, premium}) {
  const suffix = getConnectionSuffix(connectionType);
  const host = `kws${dcId}${suffix}.web.telegram.org`;
  const pathSuffix = connectionType !== 'client' && premium ? '_premium' : '';
  const pathname = `/apiws${test ? '_test' : ''}${pathSuffix}`;
  return `wss://${host}${pathname}`;
}

function createAgent(httpProxy) {
  return httpProxy ? new HttpsProxyAgent(httpProxy) : undefined;
}

function createTelegramRelay(config) {
  const agent = createAgent(config.proxyEnabled === false ? '' : config.httpProxy);
  const rawBody = express.raw({
    type: () => true,
    limit: config.maxRequestBytes
  });

  function attachHttp(app) {
    app.post('/api/telegram/http/:dcId/:connectionType', rawBody, (req, res) => {
      const relayRequest = parseRelayRequest(req.originalUrl, HTTP_ROUTE);
      if(!relayRequest) {
        res.status(404).json({error: 'Unknown Telegram relay target'});
        return;
      }

      const target = getTelegramHttpTarget(relayRequest);
      const upstream = https.request({
        hostname: target.host,
        port: 443,
        path: target.pathname,
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': req.body.length
        },
        timeout: config.requestTimeoutMs
      }, (upstreamResponse) => {
        res.status(upstreamResponse.statusCode || 502);
        res.type('application/octet-stream');
        upstreamResponse.pipe(res);
      });

      upstream.on('timeout', () => upstream.destroy(new Error('Telegram upstream request timed out')));
      upstream.on('error', (error) => {
        if(!res.headersSent) {
          res.status(502).json({error: 'Telegram upstream request failed'});
        } else {
          res.destroy(error);
        }
      });
      upstream.end(req.body);
    });
  }

  function attachWebSocket(server) {
    const websocketServer = new WebSocketServer({noServer: true, perMessageDeflate: false});

    server.on('upgrade', (req, socket, head) => {
      const relayRequest = parseRelayRequest(req.url, WEBSOCKET_ROUTE);
      if(!relayRequest) {
        socket.destroy();
        return;
      }

      websocketServer.handleUpgrade(req, socket, head, (client) => {
        const target = getTelegramWebSocketTarget(relayRequest);
        const upstream = new WebSocket(target, 'binary', {
          agent,
          handshakeTimeout: config.requestTimeoutMs,
          perMessageDeflate: false
        });
        const pending = [];
        let pendingBytes = 0;

        client.on('message', (data, isBinary) => {
          if(!isBinary) {
            client.close(1003, 'Binary frames required');
            return;
          }

          if(upstream.readyState === WebSocket.OPEN) {
            upstream.send(data, {binary: true});
            return;
          }

          pendingBytes += data.length;
          if(pendingBytes > config.maxBufferedWebSocketBytes) {
            client.close(1009, 'Relay buffer limit exceeded');
            upstream.terminate();
            return;
          }

          pending.push(data);
        });

        upstream.on('open', () => {
          for(const data of pending) {
            upstream.send(data, {binary: true});
          }
          pending.length = 0;
          pendingBytes = 0;
        });
        upstream.on('message', (data, isBinary) => {
          if(client.readyState === WebSocket.OPEN) {
            client.send(data, {binary: isBinary});
          }
        });
        upstream.on('error', () => {
          if(client.readyState === WebSocket.OPEN) {
            client.close(1011, 'Telegram upstream connection failed');
          }
        });
        upstream.on('close', (code, reason) => {
          if(client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
            client.close(code || 1011, reason.toString().slice(0, 123));
          }
        });

        client.on('close', () => {
          if(upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
            upstream.terminate();
          }
        });
        client.on('error', () => upstream.terminate());
      });
    });

    return websocketServer;
  }

  return {attachHttp, attachWebSocket};
}

module.exports = {
  createTelegramRelay,
  getTelegramHttpTarget,
  getTelegramWebSocketTarget,
  parseRelayRequest
};
