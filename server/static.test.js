const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {createApp, resolvePublicDirectories} = require('../server');
const {DEFAULT_CONFIG, mergeConfig, validateConfig} = require('./config');

function createTestConfig() {
  return validateConfig(mergeConfig(DEFAULT_CONFIG, {
    server: {
      host: '127.0.0.1',
      port: 8080,
      publicDirectory: 'public'
    }
  }));
}

test('production serves built files first and falls back to public assets', async() => {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tweb-static-'));
  const distDirectory = path.join(rootDirectory, 'dist');
  const publicDirectory = path.join(rootDirectory, 'public');
  const fontDirectory = path.join(publicDirectory, 'assets', 'fonts');
  fs.mkdirSync(distDirectory, {recursive: true});
  fs.mkdirSync(fontDirectory, {recursive: true});
  fs.writeFileSync(path.join(distDirectory, 'index.html'), '<h1>built index</h1>');
  fs.writeFileSync(path.join(distDirectory, 'app.js'), 'built application');
  fs.writeFileSync(path.join(publicDirectory, 'app.js'), 'stale public application');
  fs.writeFileSync(path.join(publicDirectory, 'site.webmanifest'), '{"name":"Telegram Web"}');
  fs.writeFileSync(path.join(fontDirectory, 'tgico.woff'), Buffer.from('wOFF'));

  const config = createTestConfig();
  assert.deepEqual(resolvePublicDirectories(config, rootDirectory), [distDirectory, publicDirectory]);

  const {app, publicDirectories} = createApp(config, {rootDirectory});
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    assert.deepEqual(publicDirectories, [distDirectory, publicDirectory]);

    const built = await fetch(`${baseUrl}/app.js`);
    assert.equal(built.status, 200);
    assert.equal(await built.text(), 'built application');

    const manifest = await fetch(`${baseUrl}/site.webmanifest`);
    assert.equal(manifest.status, 200);
    assert.match(manifest.headers.get('content-type'), /^application\/manifest\+json/);
    assert.deepEqual(await manifest.json(), {name: 'Telegram Web'});

    const font = await fetch(`${baseUrl}/assets/fonts/tgico.woff`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/woff');
    assert.deepEqual(Buffer.from(await font.arrayBuffer()), Buffer.from('wOFF'));

    const fallback = await fetch(`${baseUrl}/missing/route`);
    assert.equal(fallback.status, 200);
    assert.equal(await fallback.text(), '<h1>built index</h1>');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(rootDirectory, {recursive: true, force: true});
  }
});

test('production Docker image includes public fallback assets', () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, '..', '.docker', 'Dockerfile_production'), 'utf8');
  assert.match(dockerfile, /COPY --from=builder \/app\/dist \.\/dist/);
  assert.match(dockerfile, /COPY --from=builder \/app\/public \.\/public/);
});
