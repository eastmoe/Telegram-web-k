const assert = require('node:assert/strict');
const test = require('node:test');

const {parseBoolean, validateConfig} = require('./config');
const {
  getTelegramHttpTarget,
  getTelegramWebSocketTarget,
  parseRelayRequest
} = require('./telegramRelay');

test('HTTP targets are derived only from the DC and connection type', () => {
  assert.deepEqual(
    getTelegramHttpTarget({dcId: 2, connectionType: 'client', test: false}),
    {host: 'venus.web.telegram.org', pathname: '/apiw1'}
  );
  assert.deepEqual(
    getTelegramHttpTarget({dcId: 4, connectionType: 'download', test: true}),
    {host: 'vesta-1.web.telegram.org', pathname: '/apiw_test1'}
  );
});

test('WebSocket targets preserve test and premium transport variants', () => {
  assert.equal(
    getTelegramWebSocketTarget({dcId: 5, connectionType: 'upload', test: true, premium: true}),
    'wss://kws5-1.web.telegram.org/apiws_test_premium'
  );
});

test('relay paths reject arbitrary hosts and invalid DCs', () => {
  assert.deepEqual(
    parseRelayRequest('/api/telegram/ws/3/client?test=1', /^\/api\/telegram\/ws\/([1-5])\/(client|download|upload)\/?$/),
    {dcId: 3, connectionType: 'client', test: true, premium: false}
  );
  assert.equal(
    parseRelayRequest('/api/telegram/ws/9/client', /^\/api\/telegram\/ws\/([1-5])\/(client|download|upload)\/?$/),
    undefined
  );
  assert.equal(
    parseRelayRequest('/api/telegram/ws/2/https://example.com', /^\/api\/telegram\/ws\/([1-5])\/(client|download|upload)\/?$/),
    undefined
  );
});

test('configuration accepts only HTTP proxy URLs', () => {
  const valid = {
    server: {port: 8080},
    telegram: {
      proxyEnabled: true,
      httpProxy: 'http://127.0.0.1:7890',
      requestTimeoutMs: 30000,
      maxRequestBytes: 1024,
      maxBufferedWebSocketBytes: 1024
    }
  };
  assert.equal(validateConfig(valid), valid);
  assert.throws(() => validateConfig({
    ...valid,
    telegram: {...valid.telegram, httpProxy: 'socks5://127.0.0.1:1080'}
  }), /must use http:\/\/ or https:\/\//);
  assert.throws(() => validateConfig({
    ...valid,
    telegram: {...valid.telegram, httpProxy: ''}
  }), /required when the proxy is enabled/);
});

test('proxy environment switch accepts common boolean values', () => {
  assert.equal(parseBoolean('true', 'TEST_PROXY'), true);
  assert.equal(parseBoolean('1', 'TEST_PROXY'), true);
  assert.equal(parseBoolean('off', 'TEST_PROXY'), false);
  assert.throws(() => parseBoolean('sometimes', 'TEST_PROXY'), /must be true or false/);
});
