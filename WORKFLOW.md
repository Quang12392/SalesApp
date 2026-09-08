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

As of 08/09/2026, the canonical backend working copy is `G:\Antigravity\SalesApp-Backend\apps-script\Code.gs` in the separate Private repository `https://github.com/Quang12392/SalesApp-Backend`. The normal flow is that the user manually opens Apps Script, pastes the updated code, and deploys it there.

The old file `G:\Antigravity\SalesApp\apps-script\Code.gs` is retained on this machine as an unchanged legacy copy but has been removed from the Public repository's tracked files using `git rm --cached`. The committed `apps-script/` ignore rule prevents normal re-addition; do not force-add it. Historical Public commits still contain the old code and have not been rewritten. Do not edit both copies in parallel. Unless a task explicitly concerns the historical Public copy, references to changing `apps-script/Code.gs` elsewhere in these notes mean the canonical Private working copy above. The two local copies do not auto-sync.

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
- `SPLIT_TIKTOK`: use the `Giá Bán` value already stored on the TikTok order row first, falling back to the TikTok seller SKU price from `Quy Ước` only if the row price is empty, then divide by `SL gốc`.

When adding new pack SKUs, prefer `SPLIT_TIKTOK` instead of hard-coding special cases in code. If this pricing logic changes in `apps-script/Code.gs`, copy the updated file into Apps Script and deploy it manually before testing sync from the app.

`Giá Bán` in the TikTok revenue sheet is a transaction snapshot written by the Telegram bot. Fee Extractor may be run later after prices in `Quy Ước` have changed, so SalesApp sync must not recompute old order prices from the current `Quy Ước` table when a row price already exists. If a seller SKU's price can change over time and the exact order-row price matters, use `SPLIT_TIKTOK` for that SKU, even when `SL gốc = 1`.

## POS TikTok duplicate SKU rows

TikTok can send different seller SKUs that map to the same SalesApp SKU, often with different prices. Keep these two identifiers separate:

- `lineId`: frontend-only cart row identifier. Use it for POS row actions such as edit price, edit quantity, and delete row.
- `sku`: SalesApp inventory SKU. Keep this as the mapped app SKU so all rows deduct from the same stock.

Do not use `sku` or product `id` as the unique cart-row key when a TikTok cart/order can contain the same app SKU more than once. This prevents editing or deleting the wrong row while preserving shared stock deduction.

## Bảo mật và sao lưu backend — điểm tiếp tục ngày 08/09/2026

### Trạng thái đã xác nhận, không nhầm với kế hoạch

- Frontend gần nhất: `v379`, commit `27f9181` (đồng bộ ảnh và xác minh QR), đã phát hành lên Firebase Hosting và GitHub Pages ở lần làm trước.
- Người dùng xác nhận đã deploy Apps Script thủ công và điện thoại đã hiển thị avatar/QR. Đây là xác nhận của người dùng, không phải kết quả so sánh trực tiếp mã đang deploy với file local.
- Theo yêu cầu rõ ràng của người dùng, bản `apps-script/Code.gs` hiện tại đã được commit/push riêng lên `Quang12392/SalesApp`, nhánh `main`, commit `d85a715`. Đã kiểm tra remote main khớp commit đó. Không sửa thêm code trong lần sao lưu này.
- Repo SalesApp vẫn Public. Ngày 08/09/2026 đã gỡ `apps-script/Code.gs` khỏi Git theo dõi bằng `git rm --cached` sau khi kiểm tra bản Private; file trên máy được giữ nguyên và quy tắc ignore `apps-script/` đã có trong Git. Mã cũ vẫn nằm trong các commit lịch sử công khai; chưa viết lại lịch sử.
- Việc push `Code.gs` lần này là sao lưu theo yêu cầu, KHÔNG có nghĩa đã hoàn thành bảo mật API hoặc chuyển backend sang Private.
- Sau khi người dùng xác nhận, đã tạo `https://github.com/Quang12392/SalesApp-Backend` ở chế độ **Private** ngày 08/09/2026; đã kiểm tra lại `isPrivate=true` bằng GitHub API sau khi push.
- Repo Private local: `G:\Antigravity\SalesApp-Backend`, nhánh `main`, remote `origin` trỏ riêng tới repo Private. Commit khởi tạo đã push: `1a2812a0c4c54e30764e963599ca56613ffd1f1f`. Gồm `apps-script/Code.gs`, `README.md` hướng dẫn khôi phục/làm việc, `.gitignore` tránh lưu secret và `.gitattributes` chuẩn hóa xuống dòng.
- Bản backend Private được lấy từ `d85a715` của SalesApp, không sửa logic. Đã kiểm tra cú pháp và tải lại toàn bộ nội dung file từ GitHub API: khớp file nguồn sau chuẩn hóa CRLF/LF; blob Git và commit remote cũng khớp. Khoảng trắng cuối dòng vốn có trong code nguồn được giữ nguyên ở lần sao lưu, nên kiểm tra whitespace toàn bộ commit khởi tạo báo các dòng cũ; kiểm tra tài liệu mới không có lỗi whitespace. Worktree Private sạch khi bàn giao.
- Chưa nhập lịch sử cũ vào repo Private. Đã ngừng theo dõi file ở bản hiện tại của repo Public, không xóa lịch sử hoặc file local. Từ lần sửa backend tiếp theo, dùng bản chính trong repo Private, không sửa hai bản song song. Khi clone repo frontend mới sẽ không có `apps-script/Code.gs`; phải clone thêm repo Private để sửa backend.
- Chưa triển khai Cloudflare Worker, chưa thay đổi xác thực API, chưa đổi URL hoặc deployment trên Firebase/Google Apps Script. Repo Private không tự chặn truy cập API và không làm biến mất code đã công khai.
- Tại lần rà soát này, `firebase.json`, `.firebaserc.example`, `scripts/build-firebase.ps1`, `scripts/deploy-firebase.ps1` vẫn chưa được Git theo dõi. `WORKFLOW.md` và `.gitignore` cũng có thay đổi local chưa commit từ trước. Cần rà soát/sao lưu đúng phạm vi, không giả định máy mới clone repo là có đủ quy trình Firebase.

### Phương án đang bàn

- Giữ Firebase PWA làm bản chính, GitHub Pages PWA làm bản dự phòng; cùng một mã nguồn frontend và cùng một backend/Google Sheets.
- Cloudflare Pages là lựa chọn thay thế cho frontend dự phòng, KHÔNG bắt buộc khi dùng Cloudflare Worker. Chưa có quyết định chuyển Hosting.
- Luồng đích: Firebase PWA / GitHub Pages PWA / TikTok Fee Extension gọi Cloudflare Worker; Worker gọi Apps Script; Apps Script đọc/ghi Google Sheets.
- Đích đến: repo Public chỉ giữ frontend và cấu hình build không chứa bí mật. Repo Private `Quang12392/SalesApp-Backend` đã được tạo để lưu backend, có thể chứa mã Worker khi triển khai sau này. Đường dẫn backend chính là `G:\Antigravity\SalesApp-Backend\apps-script\Code.gs`; bản hiện tại của repo Public đã ngừng theo dõi backend, còn lịch sử công khai chưa xử lý.
- Tách repo là tách nơi quản lý code, không tách dữ liệu kinh doanh. Firebase Hosting không cần chứa `Code.gs`.
- Push GitHub là sao lưu mã nguồn; deploy Firebase, deploy Worker và deploy Apps Script là các thao tác riêng. Apps Script vẫn theo quy trình người dùng deploy thủ công nếu chưa có yêu cầu đổi quy trình.

### Thứ tự triển khai — đối chiếu trạng thái đã xác nhận ở trên

1. **Sao lưu và chốt nơi quản lý code.** Xác nhận tài khoản GitHub/Cloudflare sử dụng, repo Private và cơ chế đăng nhập dự kiến. Không yêu cầu người dùng dán mật khẩu, API token hay mã khôi phục vào tài liệu/chat; dùng luồng đăng nhập/nhập secret phù hợp khi cần. Bật bảo vệ tài khoản và lưu phương án khôi phục ngoài máy làm việc.
2. **Tách backend sau khi bản sao Private đã được kiểm chứng.** Sao lưu file local và lịch sử cần thiết, push vào repo Private rồi kiểm tra có thể khôi phục. Chọn một nơi làm việc chính cho backend, ghi lại đường dẫn cụ thể vào đây; không duy trì hai file `Code.gs` phải sửa tay song song. Sau đó mới ngừng theo dõi backend trong repo Public, giữ lại bản local. Rà soát và sao lưu các script/cấu hình Firebase còn thiếu, không đưa secret vào Git kể cả repo Private.
3. **Lập danh sách toàn bộ bên gọi API và tạo môi trường thử.** Bao gồm Firebase, GitHub Pages, 2–3 điện thoại đang cài PWA, các lần gọi ảnh/QR, đăng nhập, hàng đợi offline và `G:\Antigravity\TikTok Tools\fee-extension`. Extension hiện có quyền host Apps Script và gửi `syncSpecificTikTok`; phải cập nhật cả URL, đăng nhập và quyền host khi chuyển sang Worker. Phân biệt API SalesApp với API riêng của TikTok bot; không đổi nhầm endpoint ngoài phạm vi. Đọc đầy đủ `HUONG_DAN_TAO_MOI_TRUONG_TEST.md` trước khi thiết lập môi trường thử, dùng Sheet/bản backend thử riêng cho kiểm thử ghi dữ liệu.
4. **Bổ sung xác thực và Worker.** Chốt cơ chế tài khoản/phiên đăng nhập trước khi viết code (chưa chốt dùng nhà cung cấp danh tính nào). Xác thực token/phiên, tài khoản còn hoạt động và quyền đối với từng action ở phía server; không tin `role`, `permissions`, username do client tự gửi. Bảo vệ cả API đọc lẫn ghi, gồm ảnh/QR, cấu hình và quản lý người dùng. Không truyền mật khẩu bằng query string. Có giới hạn yêu cầu/đăng nhập và nhật ký đã loại dữ liệu nhạy cảm; không cache công khai dữ liệu kinh doanh.
5. **Apps Script phải từ chối gọi trực tiếp trái phép.** Dùng cơ chế xác thực Worker → Apps Script, ví dụ chữ ký ràng buộc nội dung/action, thời gian và chống phát lại. Bí mật chỉ ở Worker Secrets / Apps Script Properties, không nhúng trong frontend, extension hoặc tài liệu. Apps Script Web App không cung cấp tùy ý mọi request header cho handler: thiết kế và kiểm thử cách truyền phong bì ký trong body phù hợp, không giả định đọc được `Authorization` header như server thông thường. Che URL, CORS hay giới hạn Origin không thay thế xác thực. Giữ `LockService`, kiểm tra kho cuối cùng, tính giá vốn và chống tạo đơn trùng; không tự thêm lại bước quét SKU riêng trước Thanh toán.
6. **Kiểm thử và chuyển đồng bộ có kiểm soát.** Trước khi chuyển production, thử phiên đúng/sai/hết hạn, thiếu quyền, gọi thẳng Apps Script, ảnh/QR thay đổi, bấm lặp, nhiều thiết bị tranh kho và mất mạng. Chốt thời điểm chuyển với người dùng, xử lý/ghi nhận đơn tạm và hàng chờ trên từng origin. Deploy backend/Worker tương thích, phát hành cùng bản frontend trên hai Hosting, cập nhật Extension và kiểm tra từng thiết bị. Vô hiệu hóa hoặc bảo vệ tất cả deployment Apps Script cũ còn mở; không để fallback âm thầm về API không xác thực. Không báo hoàn tất bảo mật khi đường vòng cũ vẫn còn. Rollback không được mở lại API bỏ xác thực.
7. **Xử lý dấu vết công khai.** Ưu tiên khóa API và thu hồi/thay bí mật đã lộ; không coi dọn lịch sử là biện pháp chặn truy cập dữ liệu. Nếu người dùng muốn loại backend khỏi lịch sử Public, lập bản sao khôi phục rồi xin xác nhận riêng cho viết lại lịch sử/force-push; kiểm tra các nhánh/tag liên quan. Không tự xóa repo, file local, đổi Public/Private hoặc force-push khi mới được hỏi phương án. Không hứa thu hồi bản đã được người khác clone/fork/cache.

### Đồng nhất các lần sửa và cách bàn giao

- Sửa frontend: kiểm thử, tăng version, push đúng phạm vi rồi deploy Firebase/GitHub Pages từ cùng mã frontend theo quy trình ở trên.
- Sửa backend sau khi tách: kiểm thử trên môi trường thử, push repo Private chính thức, ghi commit và yêu cầu deploy Apps Script thủ công. Cả hai PWA nhận cùng thay đổi backend khi deployment chung đã cập nhật, không cần deploy Firebase nếu frontend không đổi.
- Sửa Worker sau khi có: kiểm thử quyền truy cập và hợp đồng API, deploy vào đúng môi trường, ghi phiên bản/deployment và phạm vi ảnh hưởng. Bí mật không ghi trong log hoặc file hướng dẫn.
- Thay đổi hợp đồng API phải phối hợp frontend, Worker, Apps Script và Extension; ghi các phiên bản tương thích và tình trạng cập nhật từng bên.
- Sau MỖI thay đổi, cập nhật chính `G:\Antigravity\SalesApp\WORKFLOW.md` (đường dẫn đúng, không phải `WORKFLOW\.md`): việc đã làm/chưa làm, repo/đường dẫn chính thức, commit, version, trạng thái deploy, kiểm thử, bước người dùng phải thực hiện và việc tiếp theo. Không đánh dấu việc dự kiến là đã hoàn tất.
- Thay đổi tài liệu đơn thuần không cần tăng version PWA hay deploy Firebase. Nêu rõ tài liệu mới chỉ lưu local hay đã push; không gom các thay đổi chưa commit khác vào một commit ngoài phạm vi.

### Việc tiếp theo sau lần cập nhật tài liệu này

- **Đã xong:** tạo/kiểm chứng repo Private và ngừng theo dõi backend ở repo Public, giữ lại file local. Mục `Apps Script deploy` và mục bảo mật này thuộc phạm vi commit tách backend; các thay đổi có từ trước ở phần khác của `WORKFLOW.md`, `.gitignore` và cấu hình Firebase không bị gom vào commit. Tra commit thao tác bằng `git log -1 -- apps-script/Code.gs` trong repo Public.
- Đã rà soát `scripts/`, `tests/`, `js/`, `index.html`, `sw.js`, `firebase.json`: không tìm thấy đường dẫn thực thi phụ thuộc vào file backend cũ trong các file hiện có. Frontend chạy qua API chứ không tải `Code.gs`; không cần deploy lại Apps Script hoặc Firebase chỉ vì thao tác tách repo, frontend vẫn `v379`.
- Danh sách bên gọi API và các điều kiện phải chốt trước khi viết Worker được ghi tại `G:\Antigravity\SalesApp-Backend\docs\API_SECURITY_PLAN.md`. Đây là tài liệu chuẩn bị, KHÔNG phải Worker đã chạy.
- Người dùng đã xác nhận tạo tài khoản Cloudflare và hoàn tất bước bật 2FA. Không thu thập QR/mã 2FA/mã khôi phục; việc lưu mã khôi phục do người dùng tự thực hiện, chưa kiểm chứng độc lập.
- Đã cài Wrangler `4.129.1` cục bộ trong repo Private, lưu `package.json`/`package-lock.json` để có thể cài lại bằng `npm.cmd ci`. Hướng dẫn: `G:\Antigravity\SalesApp-Backend\docs\CLOUDFLARE_SETUP.md`. Chạy `npm.cmd run check:apps-script` chỉ kiểm tra cú pháp, không thay đổi hay deploy `Code.gs`.
- Lần kiểm tra đầu, `wrangler whoami --json` trả `loggedIn:false`; đăng nhập dashboard không đồng nghĩa công cụ đã được cấp quyền. Lệnh `npm.cmd run cf:login` để người dùng duyệt quyền đọc user/account và quản lý Worker scripts qua OAuth, lưu phiên bằng kho khóa Windows. Không tự duyệt cấp quyền, không ghi link OAuth tạm hoặc secret vào tài liệu. Login callback dùng cổng 8976 tạm thời, frontend vẫn giữ cổng 3000.
- **Bước tiếp theo:** hoàn tất OAuth Wrangler bằng tài khoản Windows của người dùng, chạy lại `cf:whoami` để xác nhận account; sau đó chốt cơ chế đăng nhập SalesApp (giữ tên tài khoản hiện tại với phiên an toàn hoặc dùng nhà cung cấp danh tính). Không thay cơ chế đăng nhập khi chưa chốt ảnh hưởng tới các điện thoại và Extension.
- Sau đó chuẩn bị môi trường thử để xây Worker và bảo vệ Apps Script. Chưa đổi endpoint production, chưa tạo khóa bí mật, chưa triển khai Worker. Xử lý lịch sử công khai/force-push là bước riêng cần xác nhận; không coi gỡ file khỏi nhánh mới nhất là đã xóa mã khỏi Internet.
