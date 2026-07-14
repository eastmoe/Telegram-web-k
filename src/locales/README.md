# Bundled locales

`zh-hans.json` is a local snapshot of Telegram's Simplified Chinese WebK
language pack. It is generated from
<https://translations.telegram.org/zh-hans/webk> with:

```bash
pnpm fetch-lang-zh-hans
```

The client uses this snapshot immediately and then obtains language-pack
updates through the same server-side MTProto relay as all other Telegram API
traffic. Untranslated or newly added keys fall back to the bundled English
source strings.
