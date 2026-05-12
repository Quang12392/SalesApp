# SalesApp workflow notes

## Environments

- Local: `G:\Antigravity\SalesApp` or `file:///G:/Antigravity/SalesApp/index.html`
- App deploy: `https://quang12392.github.io/SalesApp/`

## Frontend release rule

When changing frontend files that the browser caches, update all version references together:

- `js/app.js`: `KHS_APP_VERSION`
- `index.html`: `css/index.css?v=...`, `js/app.js?v=...`, `js/pos.js?v=...`
- `sw.js`: `CACHE_NAME`, `STATIC_ASSETS` query strings

The notification panel and update banner show the current frontend version from `KHS_APP_VERSION`.

## Local vs app deploy

- Local changes work immediately after reload because the browser reads local files.
- The app deploy only changes after commit + push to `origin/main`, then GitHub Pages updates.
- If local works but the app does not, first check whether the changed files were pushed and whether `index.html` / `sw.js` versions were bumped.

## Commit scope

Keep unrelated changes out of the frontend deploy commit.

For POS/frontend fixes, usually commit only:

- `index.html`
- `js/app.js`
- `js/pos.js`
- `sw.js`
- relevant CSS/docs if changed

Do not include `apps-script/Code.gs` unless the Apps Script change is part of the task.
