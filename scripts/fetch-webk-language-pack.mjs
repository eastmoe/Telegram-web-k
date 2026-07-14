import {mkdirSync, writeFileSync} from 'node:fs';
import {request} from 'node:https';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {HttpsProxyAgent} from 'https-proxy-agent';

const LANGUAGE_PAGE = 'https://translations.telegram.org/zh-hans/webk';
const PLURAL_KEYS = ['zero_value', 'one_value', 'two_value', 'few_value', 'many_value', 'other_value'];
const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(rootDirectory, 'src/locales/zh-hans.json');
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

function requestText(url, options = {}, body) {
  return new Promise((resolvePromise, reject) => {
    const req = request(url, {...options, agent}, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if(response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Request failed with ${response.statusCode}: ${text.slice(0, 200)}`));
          return;
        }
        resolvePromise({headers: response.headers, text});
      });
    });
    req.on('error', reject);
    if(body) req.end(body);
    else req.end();
  });
}

function convertValue(value) {
  if(typeof(value) === 'string') return value;

  const plural = {};
  for(const [index, translated] of Object.entries(value || {})) {
    const key = PLURAL_KEYS[Number(index)];
    if(key) plural[key] = translated;
  }
  return plural;
}

const page = await requestText(LANGUAGE_PAGE);
const apiMatch = page.text.match(/"apiUrl":"([^"]+)"/);
if(!apiMatch) throw new Error('Telegram translations API URL was not found');

const apiPath = apiMatch[1].replaceAll('\\/', '/');
const body = new URLSearchParams({
  method: 'getLangPackFull',
  lang: 'zh-hans',
  lang_pack: 'webk'
}).toString();
const response = await requestText(new URL(apiPath, LANGUAGE_PAGE), {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body),
    Cookie: (page.headers['set-cookie'] || []).map((cookie) => cookie.split(';', 1)[0]).join('; ')
  }
}, body);
const payload = JSON.parse(response.text);
const entries = payload.data?.webk;
if(!Array.isArray(entries)) throw new Error('Telegram translations response did not contain a WebK language pack');

const languagePack = {};
for(const entry of entries) {
  if(entry.value === undefined || entry.value === null || entry.value === '') continue;
  languagePack[entry.key] = convertValue(entry.value);
}

mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, JSON.stringify(languagePack, null, 2) + '\n', 'utf8');
console.log(`Wrote ${Object.keys(languagePack).length} Simplified Chinese WebK strings to ${outputPath}`);
