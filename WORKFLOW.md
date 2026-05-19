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

## Apps Script deploy

`apps-script/Code.gs` is the working copy for Apps Script code only. The normal flow is that the user manually opens Apps Script, pastes the updated code, and deploys it there.

Do not commit or push `apps-script/Code.gs` with frontend/app deploy changes unless the user explicitly asks for an Apps Script change to be included.

If Codex changes `apps-script/Code.gs`, the final response must explicitly remind the user that this file was changed and needs to be copied into Apps Script and deployed manually.

## TikTok Mapping SKU price rules

The Google Sheet tab `Mapping SKU` drives TikTok order sync:

- Column A `SKU TikTok`: seller SKU from TikTok.
- Column B `SKU App`: SalesApp SKU to write into `Chi tiết đơn`.
- Column C `Tên trên sàn`: display/reference name only.
- Column D `SL gốc`: number of app units represented by one TikTok SKU.
- Column E `SKU Quà`: optional gift SKU; gifts are also resolved through `Mapping SKU` and are written with price `0`.
- Column F `Kiểu giá`: optional pricing mode.

Use `SPLIT_TIKTOK` in column F when one TikTok SKU represents multiple units of the same app SKU and the app line price must be split per base unit. Examples: `2Hop-FIONNA` -> app SKU `1Hop-FIONNA` with `SL gốc = 2`, or `RealyTis-3que` -> app SKU `RealyTis-1que` with `SL gốc = 3`.

Pricing behavior in `apps-script/Code.gs`:

- Blank `Kiểu giá`, simple 1:1 mapping (`SL gốc = 1` and only one app SKU): use the actual TikTok item price.
- Blank `Kiểu giá`, bundle/combo mapping (`SL gốc > 1` or multiple app SKUs): use the unit price from the TikTok spreadsheet tab `Quy Ước` by `SKU App`, falling back to the TikTok item price if no rule exists.
- `SPLIT_TIKTOK`: use the TikTok seller SKU price from `Quy Ước` when available, otherwise the actual TikTok item price, then divide by `SL gốc`.

When adding new pack SKUs, prefer `SPLIT_TIKTOK` instead of hard-coding special cases in code. If this pricing logic changes in `apps-script/Code.gs`, copy the updated file into Apps Script and deploy it manually before testing sync from the app.

## POS TikTok duplicate SKU rows

TikTok can send different seller SKUs that map to the same SalesApp SKU, often with different prices. Keep these two identifiers separate:

- `lineId`: frontend-only cart row identifier. Use it for POS row actions such as edit price, edit quantity, and delete row.
- `sku`: SalesApp inventory SKU. Keep this as the mapped app SKU so all rows deduct from the same stock.

Do not use `sku` or product `id` as the unique cart-row key when a TikTok cart/order can contain the same app SKU more than once. This prevents editing or deleting the wrong row while preserving shared stock deduction.
