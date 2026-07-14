const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  server: {
    host: '0.0.0.0',
    port: 8080,
    publicDirectory: 'public',
    https: {
      enabled: false,
      keyFile: 'certs/server-key.pem',
      certFile: 'certs/server-cert.pem'
    }
  },
  telegram: {
    proxyEnabled: false,
    httpProxy: '',
    requestTimeoutMs: 30000,
    maxRequestBytes: 64 * 1024 * 1024,
    maxBufferedWebSocketBytes: 8 * 1024 * 1024
  }
};

function parseBoolean(value, name) {
  const normalized = String(value).trim().toLowerCase();
  if(['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if(['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${name} must be true or false`);
}

function applyPositiveIntegerEnvironment(config, environmentName, configKey) {
  if(process.env[environmentName] === undefined) return;
  config.telegram[configKey] = Number(process.env[environmentName]);
}

function mergeConfig(base, override) {
  const output = {...base};
  for(const [key, value] of Object.entries(override || {})) {
    if(value && typeof(value) === 'object' && !Array.isArray(value)) {
      output[key] = mergeConfig(base[key] || {}, value);
    } else {
      output[key] = value;
    }
  }

  return output;
}

function validateConfig(config) {
  if(!Number.isInteger(config.server.port) || config.server.port < 1 || config.server.port > 65535) {
    throw new Error('config.server.port must be an integer between 1 and 65535');
  }

  if(typeof(config.telegram.proxyEnabled) !== 'boolean') {
    throw new Error('config.telegram.proxyEnabled must be a boolean');
  }

  if(config.telegram.proxyEnabled && !config.telegram.httpProxy) {
    throw new Error('config.telegram.httpProxy is required when the proxy is enabled');
  }

  if(config.telegram.proxyEnabled) {
    const proxy = new URL(config.telegram.httpProxy);
    if(proxy.protocol !== 'http:' && proxy.protocol !== 'https:') {
      throw new Error('config.telegram.httpProxy must use http:// or https://');
    }
  } else {
    config.telegram.httpProxy = '';
  }

  for(const key of ['requestTimeoutMs', 'maxRequestBytes', 'maxBufferedWebSocketBytes']) {
    if(!Number.isInteger(config.telegram[key]) || config.telegram[key] <= 0) {
      throw new Error(`config.telegram.${key} must be a positive integer`);
    }
  }

  return config;
}

function loadConfig(configPath = process.env.TWEB_CONFIG || path.join(process.cwd(), 'config.json')) {
  let fileConfig = {};
  if(fs.existsSync(configPath)) {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  const fileHasProxyEnabled = typeof(fileConfig.telegram?.proxyEnabled) === 'boolean';
  const config = mergeConfig(DEFAULT_CONFIG, fileConfig);
  if(process.env.TELEGRAM_HTTP_PROXY !== undefined) {
    config.telegram.httpProxy = process.env.TELEGRAM_HTTP_PROXY;
  }
  if(process.env.TELEGRAM_PROXY_ENABLED !== undefined) {
    config.telegram.proxyEnabled = parseBoolean(process.env.TELEGRAM_PROXY_ENABLED, 'TELEGRAM_PROXY_ENABLED');
  } else if(!fileHasProxyEnabled && config.telegram.httpProxy) {
    // Preserve existing config.json behavior from before proxyEnabled existed.
    config.telegram.proxyEnabled = true;
  }
  applyPositiveIntegerEnvironment(config, 'TELEGRAM_REQUEST_TIMEOUT_MS', 'requestTimeoutMs');
  applyPositiveIntegerEnvironment(config, 'TELEGRAM_MAX_REQUEST_BYTES', 'maxRequestBytes');
  applyPositiveIntegerEnvironment(config, 'TELEGRAM_MAX_BUFFERED_WEBSOCKET_BYTES', 'maxBufferedWebSocketBytes');
  if(process.env.PORT) {
    config.server.port = Number(process.env.PORT);
  }
  if(process.env.HOST) {
    config.server.host = process.env.HOST;
  }

  return validateConfig(config);
}

module.exports = {DEFAULT_CONFIG, loadConfig, mergeConfig, parseBoolean, validateConfig};
