const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  server: {
    host: '0.0.0.0',
    port: 80,
    publicDirectory: 'public',
    https: {
      enabled: false,
      keyFile: 'certs/server-key.pem',
      certFile: 'certs/server-cert.pem'
    }
  },
  telegram: {
    httpProxy: '',
    requestTimeoutMs: 30000,
    maxRequestBytes: 64 * 1024 * 1024,
    maxBufferedWebSocketBytes: 8 * 1024 * 1024
  }
};

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

  if(config.telegram.httpProxy) {
    const proxy = new URL(config.telegram.httpProxy);
    if(proxy.protocol !== 'http:' && proxy.protocol !== 'https:') {
      throw new Error('config.telegram.httpProxy must use http:// or https://');
    }
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

  const config = mergeConfig(DEFAULT_CONFIG, fileConfig);
  if(process.env.TELEGRAM_HTTP_PROXY) {
    config.telegram.httpProxy = process.env.TELEGRAM_HTTP_PROXY;
  }
  if(process.env.PORT) {
    config.server.port = Number(process.env.PORT);
  }
  if(process.env.HOST) {
    config.server.host = process.env.HOST;
  }

  return validateConfig(config);
}

module.exports = {DEFAULT_CONFIG, loadConfig, mergeConfig, validateConfig};
