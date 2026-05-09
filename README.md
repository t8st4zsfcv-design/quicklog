# FastTrack — Cloudflare deploy

## What's in this folder
- `index.html`, `dennik.jsx`, `dennik.css`, `dennik-turbo.css`, `sw.js`, `manifest.webmanifest`, `icons/`
- `_headers` — Cloudflare config so the Service Worker can update cleanly
- No `server.mjs`, no `events-db.json` — we run pure static, data lives in a fresh FastTrack `localStorage` key on the iPhone

## Phase 1 deploy
1. Sign up at https://dash.cloudflare.com (free).
2. Workers & Pages → Create → Pages → Upload assets.
3. Project name: `quicklog`.
4. Drag this entire folder into the upload box.
5. Deploy. You get a URL like `https://quicklog.pages.dev`.
6. On iPhone: open that URL in Safari → Share → Add to Home Screen.
7. **Delete the old Home Screen icon** (the one pointing to `192.168.68.65:4174`).
8. Open the new icon once while online — wait for status to read `iPhone only`.
9. Airplane Mode → open from Home Screen → app should still load. Add a Coffee event. Close. Reopen offline. Event still there.
10. CSV export works offline too (button → file downloads).

## Status messages — quick translation
- `iPhone only` — expected in Phase 1. All your data stays in this phone's `localStorage`.
- `Online` / `Offline` — network status, independent of sync state.
- `DB ready` — only shows up after Phase 2 when server functions exist.

## Phase 2 deploy
Camera AI code is present in `functions/api/estimate-carbs.js`.

Before testing on iPhone, set `OPENAI_API_KEY` as an encrypted environment variable in the Cloudflare dashboard. Optional: set `OPENAI_MODEL`, otherwise the function uses `gpt-4o-mini`.

Do not use Pages Direct Upload for this phase; Cloudflare Pages Functions need Git integration or Wrangler deploy.

This folder supports both deploy shapes:
- Cloudflare Pages Functions via `functions/api/*`
- Cloudflare Workers Static Assets via `src/index.js` and `wrangler.toml`

`/api/events` intentionally keeps the iPhone as the primary data store. It exists so the current frontend can leave `iPhone only` mode and enable Camera AI without adding server-side health data storage.

## Local development on the Mac (still works)
The original `server.mjs` is kept outside this deploy folder. You can still run it locally for testing:
```
PORT=4174 node server.mjs
```
The current iPhone app does not use a server event DB. `/api/events` deliberately returns an empty localStorage contract so records stay phone-local.
