# SalesApp workflow notes

## Environments

- Local workspace: `G:\Antigravity\SalesApp`
- Local browser URL: `http://127.0.0.1:3000/#orders`
- App deploy: `https://quang12392.github.io/SalesApp/`

Use port `3000` for local frontend checks. Do not introduce another local port for normal SalesApp review unless `3000` is unavailable; if another port must be used temporarily, say so clearly and stop the temporary server when done.

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

For completed frontend work, update both places before reporting done:

- Local: ensure `http://127.0.0.1:3000/#orders` is serving the latest files.
- App: commit the scoped frontend changes and push to `origin/main`.
- Verify the deployed GitHub Pages files include the new version/query strings before telling the user the app is updated.
- In the final status, state whether local is updated, whether app deploy is pushed, and the current frontend version.

## Commit scope

Keep unrelated changes out of the frontend deploy commit.

For POS/frontend fixes, usually commit only:

- `index.html`
- `js/app.js`
- `js/pos.js`
- `sw.js`
- relevant CSS/docs if changed

Do not include `apps-script/Code.gs` unless the Apps Script change is part of the task.
