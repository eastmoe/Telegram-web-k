const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');

const {createHttpAuth, hashPassword, parsePasswordHash, verifyPassword} = require('./auth');
const {DEFAULT_CONFIG, mergeConfig, validateConfig} = require('./config');
const {createApp} = require('../server');

const TEST_PASSWORD = 'correct horse battery staple';
const TEST_PASSWORD_HASH = hashPassword(TEST_PASSWORD, Buffer.alloc(16, 7));

function createTestConfig() {
  return validateConfig(mergeConfig(DEFAULT_CONFIG, {
    server: {
      host: '127.0.0.1',
      port: 8080,
      publicDirectory: 'missing-test-public-directory'
    },
    auth: {
      enabled: true,
      username: 'admin',
      passwordHash: TEST_PASSWORD_HASH
    }
  }));
}

async function startTestServer() {
  const config = createTestConfig();
  const {app, auth, relay} = createApp(config);
  const server = http.createServer(app);
  relay.attachWebSocket(server, auth.authorizeUpgrade);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    port: address.port,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

test('scrypt password hashes are parsed and verified', () => {
  assert.ok(parsePasswordHash(TEST_PASSWORD_HASH));
  assert.equal(verifyPassword(TEST_PASSWORD, TEST_PASSWORD_HASH), true);
  assert.equal(verifyPassword('wrong password', TEST_PASSWORD_HASH), false);
  assert.equal(parsePasswordHash('sha256:invalid'), undefined);
});

test('enabled authentication requires a username and scrypt hash', () => {
  const config = mergeConfig(DEFAULT_CONFIG, {
    auth: {enabled: true, username: 'admin', passwordHash: ''}
  });
  assert.throws(() => validateConfig(config), /valid scrypt password hash/);

  config.auth.passwordHash = TEST_PASSWORD_HASH;
  config.auth.username = 'admin:name';
  assert.throws(() => validateConfig(config), /without colons/);
});

test('disabled authentication allows HTTP and WebSocket requests', () => {
  const auth = createHttpAuth({enabled: false, username: '', passwordHash: ''});
  const request = {headers: {}};
  assert.equal(auth.authenticateRequest(request).authenticated, true);
  assert.equal(auth.authorizeUpgrade(request), true);
});

test('authentication protects pages and APIs and restores a local session', async() => {
  const server = await startTestServer();
  try {
    const page = await fetch(`${server.baseUrl}/`, {redirect: 'manual'});
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('location'), '/auth');

    const loginPage = await fetch(`${server.baseUrl}/auth`);
    assert.equal(loginPage.status, 200);
    assert.match(await loginPage.text(), /tweb\.auth\.session/);

    const unauthorized = await fetch(`${server.baseUrl}/api/health`);
    assert.equal(unauthorized.status, 401);

    const failedLogin = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: 'admin', password: 'wrong'})
    });
    assert.equal(failedLogin.status, 401);

    const login = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: 'admin', password: TEST_PASSWORD})
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /tweb_auth=.*HttpOnly.*SameSite=Strict/);
    const session = await login.json();
    assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);

    const authorized = await fetch(`${server.baseUrl}/api/health`, {
      headers: {Authorization: `Bearer ${session.token}`}
    });
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).httpAuth, true);

    const basic = Buffer.from(`admin:${TEST_PASSWORD}`).toString('base64');
    const basicAuthorized = await fetch(`${server.baseUrl}/api/health`, {
      headers: {Authorization: `Basic ${basic}`}
    });
    assert.equal(basicAuthorized.status, 200);

    const restore = await fetch(`${server.baseUrl}/api/auth/restore`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${session.token}`}
    });
    assert.equal(restore.status, 200);
    assert.match(restore.headers.get('set-cookie'), /tweb_auth=/);

    const relay = await fetch(`${server.baseUrl}/api/telegram/http/2/client`, {
      method: 'POST',
      body: new Uint8Array([1, 2, 3])
    });
    assert.equal(relay.status, 401);

    const logout = await fetch(`${server.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${session.token}`}
    });
    assert.equal(logout.status, 204);

    const afterLogout = await fetch(`${server.baseUrl}/api/health`, {
      headers: {Authorization: `Bearer ${session.token}`}
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    await server.close();
  }
});

test('authentication rejects WebSocket upgrades before the Telegram relay', async() => {
  const server = await startTestServer();
  try {
    const response = await new Promise((resolve, reject) => {
      const socket = net.connect(server.port, '127.0.0.1');
      let output = '';
      socket.setEncoding('utf8');
      socket.on('connect', () => {
        socket.write([
          'GET /api/telegram/ws/2/client HTTP/1.1',
          `Host: 127.0.0.1:${server.port}`,
          'Connection: Upgrade',
          'Upgrade: websocket',
          'Sec-WebSocket-Version: 13',
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
          '',
          ''
        ].join('\r\n'));
      });
      socket.on('data', (chunk) => output += chunk);
      socket.on('end', () => resolve(output));
      socket.on('error', reject);
    });
    assert.match(response, /^HTTP\/1\.1 401 Unauthorized/);
  } finally {
    await server.close();
  }
});
