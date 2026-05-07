# Quick Log — Cloudflare Pages deploy (Phase 1)

## What's in this folder
- `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `icons/`
- `_headers` — Cloudflare config so the Service Worker can update cleanly
- No `server.mjs`, no `events-db.json` — we run pure static, data lives in `localStorage` on the iPhone

## Phase 1 deploy
1. Sign up at https://dash.cloudflare.com (free).
2. Workers & Pages → Create → Pages → Upload assets.
3. Project name: `quicklog` (or anything — becomes part of your URL).
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

## Phase 2 (next)
Add `functions/api/estimate-carbs.js` so Camera AI works. Set `OPENAI_API_KEY` as an environment variable in the Cloudflare dashboard. App will automatically detect the function exists and use it.

## Local development on the Mac (still works)
The original `server.mjs` is kept outside this deploy folder. You can still run it locally for testing:
```
PORT=4174 node server.mjs
```
That keeps `events-db.json` sync working on Mac. None of this is required for the iPhone.
