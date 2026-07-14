const {
  randomBytes,
  scryptSync,
  timingSafeEqual
} = require('node:crypto');

const COOKIE_NAME = 'tweb_auth';
const LOCAL_STORAGE_KEY = 'tweb.auth.session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_OPTIONS = {N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024};

function parsePasswordHash(encoded) {
  if(typeof(encoded) !== 'string') return;
  const [algorithm, saltText, digestText, extra] = encoded.split(':');
  if(algorithm !== 'scrypt' || extra !== undefined) return;
  if(!/^[A-Za-z0-9_-]+$/.test(saltText) || !/^[A-Za-z0-9_-]+$/.test(digestText)) return;

  const salt = Buffer.from(saltText, 'base64url');
  const digest = Buffer.from(digestText, 'base64url');
  if(salt.length !== 16 || digest.length !== 32) return;
  if(salt.toString('base64url') !== saltText || digest.toString('base64url') !== digestText) return;
  return {salt, digest};
}

function hashPassword(password, salt = randomBytes(16)) {
  if(typeof(password) !== 'string' || password.length === 0) {
    throw new Error('Password must not be empty');
  }
  if(password.length > 4096) {
    throw new Error('Password is too long');
  }

  const digest = scryptSync(password, salt, 32, SCRYPT_OPTIONS);
  return `scrypt:${salt.toString('base64url')}:${digest.toString('base64url')}`;
}

function verifyPassword(password, encoded) {
  const parsed = parsePasswordHash(encoded);
  if(!parsed || typeof(password) !== 'string' || password.length === 0 || password.length > 4096) {
    return false;
  }

  const digest = scryptSync(password, parsed.salt, parsed.digest.length, SCRYPT_OPTIONS);
  return timingSafeEqual(digest, parsed.digest);
}

function parseCookies(header) {
  const cookies = new Map();
  for(const part of String(header || '').split(';')) {
    const separator = part.indexOf('=');
    if(separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      // Ignore malformed cookies and continue checking other credentials.
    }
  }
  return cookies;
}

function getAuthorization(request) {
  const value = request.headers.authorization;
  if(typeof(value) !== 'string') return {};

  const bearer = value.match(/^Bearer\s+([A-Za-z0-9_-]+)$/i);
  if(bearer) return {type: 'bearer', token: bearer[1]};

  const basic = value.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if(!basic) return {};
  try {
    const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if(separator < 0) return {};
    return {
      type: 'basic',
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return {};
  }
}

function isHttpsRequest(request, forceSecure) {
  if(forceSecure || request.socket?.encrypted) return true;
  const forwardedProtocol = request.headers['x-forwarded-proto'];
  return typeof(forwardedProtocol) === 'string' && forwardedProtocol.split(',', 1)[0].trim() === 'https';
}

function createHttpAuth(config, options = {}) {
  const sessions = new Map();
  const enabled = config.enabled;
  const forceSecureCookies = options.secureCookies === true;

  function pruneSessions() {
    const now = Date.now();
    for(const [token, session] of sessions) {
      if(session.expiresAt <= now) sessions.delete(token);
    }
  }

  function getSession(token) {
    if(!token) return;
    const session = sessions.get(token);
    if(!session) return;
    if(session.expiresAt <= Date.now()) {
      sessions.delete(token);
      return;
    }
    return session;
  }

  function getSessionToken(request) {
    const authorization = getAuthorization(request);
    if(authorization.type === 'bearer') return authorization.token;
    return parseCookies(request.headers.cookie).get(COOKIE_NAME);
  }

  function verifyCredentials(username, password) {
    return username === config.username && verifyPassword(password, config.passwordHash);
  }

  function authenticateRequest(request) {
    if(!enabled) return {authenticated: true, type: 'disabled'};

    const authorization = getAuthorization(request);
    if(authorization.type === 'basic' && verifyCredentials(authorization.username, authorization.password)) {
      return {authenticated: true, type: 'basic'};
    }

    const token = authorization.type === 'bearer' ? authorization.token : getSessionToken(request);
    const session = getSession(token);
    if(session) return {authenticated: true, type: 'session', token, session};
    return {authenticated: false};
  }

  function createSession() {
    pruneSessions();
    const token = randomBytes(32).toString('base64url');
    const session = {expiresAt: Date.now() + SESSION_TTL_MS};
    sessions.set(token, session);
    return {token, ...session};
  }

  function setSessionCookie(request, response, token, maxAge = SESSION_TTL_MS / 1000) {
    const attributes = [
      `${COOKIE_NAME}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${Math.floor(maxAge)}`
    ];
    if(isHttpsRequest(request, forceSecureCookies)) attributes.push('Secure');
    response.setHeader('Set-Cookie', attributes.join('; '));
  }

  function clearSessionCookie(request, response) {
    setSessionCookie(request, response, '', 0);
  }

  function sendUnauthorized(response) {
    response.set('WWW-Authenticate', 'Basic realm="Telegram Web K", charset="UTF-8"');
    response.status(401).json({error: 'Authentication required'});
  }

  function sendLoginPage(response) {
    response.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Frame-Options': 'DENY'
    });
    response.send(LOGIN_PAGE);
  }

  function attachRoutes(app) {
    const json = require('express').json({limit: '8kb'});

    app.get('/auth', (request, response) => {
      if(!enabled || authenticateRequest(request).authenticated) {
        response.redirect(302, '/');
        return;
      }
      sendLoginPage(response);
    });

    app.get('/auth/logout', (request, response) => {
      response.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
      });
      response.send(LOGOUT_PAGE);
    });

    app.get('/api/auth/status', (request, response) => {
      const authentication = authenticateRequest(request);
      if(!authentication.authenticated) {
        sendUnauthorized(response);
        return;
      }
      response.json({enabled, authenticated: true, username: enabled ? config.username : undefined});
    });

    app.post('/api/auth/login', json, (request, response) => {
      if(!enabled) {
        response.json({enabled: false, authenticated: true});
        return;
      }

      const {username, password} = request.body || {};
      if(!verifyCredentials(username, password)) {
        sendUnauthorized(response);
        return;
      }

      const session = createSession();
      setSessionCookie(request, response, session.token);
      response.json({
        enabled: true,
        authenticated: true,
        token: session.token,
        expiresAt: session.expiresAt
      });
    });

    app.post('/api/auth/restore', (request, response) => {
      const authentication = authenticateRequest(request);
      if(!authentication.authenticated || authentication.type !== 'session') {
        sendUnauthorized(response);
        return;
      }
      setSessionCookie(request, response, authentication.token);
      response.json({authenticated: true, expiresAt: authentication.session.expiresAt});
    });

    app.post('/api/auth/logout', (request, response) => {
      const token = getSessionToken(request);
      if(token) sessions.delete(token);
      clearSessionCookie(request, response);
      response.status(204).end();
    });
  }

  function middleware(request, response, next) {
    if(authenticateRequest(request).authenticated) {
      next();
      return;
    }

    if(request.method === 'GET' && !request.path.startsWith('/api/') && request.accepts('html')) {
      response.redirect(302, '/auth');
      return;
    }
    sendUnauthorized(response);
  }

  function authorizeUpgrade(request) {
    return authenticateRequest(request).authenticated;
  }

  return {
    attachRoutes,
    authenticateRequest,
    authorizeUpgrade,
    enabled,
    middleware
  };
}

const LOGIN_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Telegram Web K 登录</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #17212b; color: #f5f5f5; }
    main { width: min(22rem, calc(100% - 2rem)); padding: 2rem; box-sizing: border-box; border-radius: 1rem; background: #242f3d; box-shadow: 0 1rem 3rem #0005; }
    h1 { margin: 0 0 .5rem; font-size: 1.5rem; }
    p { margin: 0 0 1.5rem; color: #aebac5; }
    label { display: block; margin-top: 1rem; font-size: .9rem; }
    input, button { width: 100%; box-sizing: border-box; margin-top: .4rem; padding: .8rem; border-radius: .6rem; font: inherit; }
    input { border: 1px solid #53606d; background: #17212b; color: inherit; }
    button { margin-top: 1.4rem; border: 0; background: #3390ec; color: white; cursor: pointer; }
    button:disabled { opacity: .6; cursor: wait; }
    #error { min-height: 1.2rem; margin: 1rem 0 0; color: #ff8a80; }
  </style>
</head>
<body>
  <main>
    <h1>Telegram Web K</h1>
    <p>请输入服务器访问凭据</p>
    <form id="login">
      <label>用户名<input id="username" name="username" autocomplete="username" required autofocus></label>
      <label>密码<input id="password" name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">登录</button>
      <div id="error" role="alert"></div>
    </form>
  </main>
  <script>
    const storageKey = '${LOCAL_STORAGE_KEY}';
    const form = document.querySelector('#login');
    const error = document.querySelector('#error');
    const button = form.querySelector('button');
    const username = document.querySelector('#username');
    const password = document.querySelector('#password');

    async function restore() {
      const token = localStorage.getItem(storageKey);
      if(!token) return;
      const response = await fetch('/api/auth/restore', {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + token}
      });
      if(response.ok) {
        location.replace('/');
        return;
      }
      localStorage.removeItem(storageKey);
    }

    form.addEventListener('submit', async(event) => {
      event.preventDefault();
      error.textContent = '';
      button.disabled = true;
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            username: username.value,
            password: password.value
          })
        });
        if(!response.ok) throw new Error('用户名或密码错误');
        const result = await response.json();
        localStorage.setItem(storageKey, result.token);
        location.replace('/');
      } catch(loginError) {
        error.textContent = loginError.message || '登录失败';
        button.disabled = false;
      }
    });

    restore().catch(() => localStorage.removeItem(storageKey));
  </script>
</body>
</html>`;

const LOGOUT_PAGE = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>退出登录</title></head>
<body>
  <script>
    const token = localStorage.getItem('${LOCAL_STORAGE_KEY}');
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: token ? {Authorization: 'Bearer ' + token} : {}
    }).finally(() => {
      localStorage.removeItem('${LOCAL_STORAGE_KEY}');
      location.replace('/auth');
    });
  </script>
</body>
</html>`;

module.exports = {
  COOKIE_NAME,
  LOCAL_STORAGE_KEY,
  createHttpAuth,
  hashPassword,
  parsePasswordHash,
  verifyPassword
};
