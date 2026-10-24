# [L] Thiết kế lưu trữ SQLite, hồ sơ người dùng, nhiều nguồn dữ liệu — BẢN TRÌNH DUYỆT

Trạng thái: **chỉ là thiết kế, chưa viết code, chưa đụng dữ liệu nào.** Chờ chủ dự án duyệt. Ngày 24/10/2026.
Không đổi: schema logic 3, công thức ID6, UID, LaTeX/TikZ, cây chương trình. Không có đồng bộ online/tài khoản đám mây.

## 0. Hiện trạng đã kiểm trên mã nguồn
- Ngân hàng nằm trong **một tệp** `data/hedu.json` (cộng `.bak`); giao diện giữ **toàn bộ** câu trong bộ nhớ và **ghi lại cả tệp** mỗi lần có thay đổi (đợi 0,3 giây), qua `save_data` (Rust, ghi tệp tạm rồi đổi tên, chép `.bak`).
- Quyết định trùng, Thùng rác, nhãn chuẩn nằm ở **tệp phụ** `data/dup-decisions.json` — hai tệp ghi riêng nên khôi phục/xoá phải sắp thứ tự cẩn thận (xấu nhất là câu thừa ở cả hai nơi).
- Bản sao lưu trước cập nhật: `backups/before-update/` (đúng MỘT bản). Sao lưu thủ công: tệp JSON (kèm tệp phụ).
- Không có khái niệm hồ sơ hay nhiều nguồn: cả app dùng đúng một thư mục dữ liệu.
- **Đo thử (dữ liệu giả, 1,1 KB/câu):** mỗi lần lưu phải biến cả ngân hàng thành chữ, gửi qua IPC, ghi và chép `.bak`:
  | Số câu | Kích thước | Dựng chữ |
  |---|---|---|
  | 1.000 | 1,3 MB | 10 ms |
  | 10.000 | 12,8 MB | 57 ms |
  | 30.000 | 38,6 MB | 268 ms |
  | 60.000 | 77 MB | 431 ms (cộng chép 77 MB ×2 mỗi lần lưu) |

  ⇒ JSON ổn tới khoảng 10.000 câu, **nhập ngân hàng thật vài chục nghìn câu thì mỗi lần lưu làm giao diện khựng và hao ổ đĩa**. Đây là lý do chính để chuyển sang ghi từng phần bằng SQLite.

## 1. Kiến trúc dữ liệu và vị trí lưu trên Windows

**Quyết định cần duyệt D1 — Công cụ:** dùng SQLite trong **Rust** (thư viện `rusqlite`, bản "bundled": SQLite được biên dịch kèm app, không cần cài thêm gì). Giao diện KHÔNG được gửi lệnh SQL tuỳ ý, chỉ gọi một số lệnh có tên rõ ràng (mở, nạp, ghi thay đổi, sao lưu…). Không dùng plugin SQL của Tauri (cho giao diện chạy SQL tuỳ ý).

**Quyết định D2 — Phạm vi lần này:** SQLite là **nơi lưu**; ngân hàng vẫn được nạp vào bộ nhớ khi mở (nạp theo trang 2.000 câu, có thanh tiến độ) để mọi màn hình (lọc, kiểm tra trùng, Gán ID…) chạy y như bây giờ. Chưa viết lại tìm kiếm/dò trùng bằng SQL (việc rất lớn, không cần cho vài chục nghìn câu). Khác biệt lớn nhất: **mỗi lần lưu chỉ ghi các câu thay đổi** thay vì cả tệp.

**Tệp cơ sở dữ liệu** (mỗi *nguồn* một tệp `hedu.db`):
- `meta(key, value)`: `format_version` (định dạng lưu, bắt đầu 1), `schema` (3 — schema logic, giữ nguyên), `nextSeq`, `taxonomy` (JSON, null = cây mặc định), `source_id`, `created_at`, `migrated_from` (dấu vân tay của `hedu.json` gốc).
- `questions`: mỗi câu một dòng, **lưu nguyên văn JSON của câu** trong cột `json` (nên LaTeX, trường lạ của bản sau không bao giờ bị mất) + vài cột trích ra để lập chỉ mục (`uid` khoá chính, `seq` duy nhất, `grade`, `chapter_id`, `lesson_id`, `form_id`, `level`, `type`, `review`, `updated_at`).
- `sidecar(key, json)`: tệp phụ hiện nay (quyết định trùng, Thùng rác, nhãn chuẩn) lưu thành các dòng JSON y như cũ (không đổi logic). **Quyết định D3:** tệp phụ chuyển vào CHÍNH tệp `hedu.db` của nguồn, để mỗi nguồn có Thùng rác/quyết định trùng riêng và **không bao giờ trộn giữa các nguồn**.
- `journal(at, kind, detail)`: nhật ký ngắn (chuyển dữ liệu, sao lưu, khôi phục) để truy vết.
- Cài đặt SQLite: `application_id` riêng của HEdu (từ chối mở tệp .db lạ), `user_version = format_version`, chế độ WAL + `synchronous=FULL` (bền khi mất điện), khoá độc quyền (không mở cùng tệp ở hai nơi), `quick_check` mỗi lần mở.

**Vị trí trên Windows** (giữ trong `%APPDATA%\vn.hedu.app\` như hiện nay, để bản cập nhật/sao lưu cũ không bị lệch):
```
%APPDATA%\vn.hedu.app\
  data\hedu.json, dup-decisions.json (+ .bak)     ← DỮ LIỆU CŨ, GIỮ NGUYÊN, KHÔNG BAO GIỜ XOÁ
  workspace.json (+ .bak)                          ← danh sách hồ sơ + nguồn + hồ sơ/nguồn đang dùng (không có khoá, không có câu hỏi)
  profiles\<mã hồ sơ>\sources\<mã nguồn>\hedu.db   ← nguồn nội bộ
  backups\before-update\                           ← quy tắc cũ: đúng MỘT bản (nay là bản chụp .db)
  backups\restore-points\<hồ sơ>\<nguồn>\          ← điểm khôi phục tự động (xem mục 4)
  backups\migration-<ngày giờ>\                    ← bản chụp nguyên trạng hedu.json lúc chuyển đổi
```
Nguồn **nằm ngoài** (người dùng tạo/mở một tệp `.db` ở thư mục khác) chỉ được ghi trên ổ nội bộ; **từ chối/cảnh báo** thư mục mạng và thư mục đồng bộ đám mây (OneDrive, Google Drive, Dropbox…) vì đồng bộ giữa chừng làm hỏng SQLite.

## 2. Hồ sơ người dùng và nhiều nguồn

- **Hồ sơ (profile):** cục bộ, chỉ có *tên* (không mật khẩu, không tài khoản; không phải bảo mật, chỉ là tách chỗ làm việc). Mỗi hồ sơ có thư mục riêng và danh sách nguồn riêng. Mặc định có một hồ sơ "Mặc định" chứa dữ liệu chuyển từ `hedu.json`.
- **Nguồn (source):** một tệp `hedu.db` = một ngân hàng đầy đủ (câu hỏi + cây + Thùng rác + quyết định trùng + nhãn chuẩn). Thao tác: **tạo mới** (trống), **mở nguồn có sẵn** (chọn `.db`; kiểm tra nhận diện HEdu + toàn vẹn + phiên bản; tạo điểm khôi phục trước khi mở), **chuyển nguồn**, **hiển thị nguồn đang dùng** (tên hồ sơ + tên nguồn + số câu luôn ở thanh bên/tiêu đề), **gỡ khỏi danh sách** (không bao giờ xoá tệp; xoá thật tệp do người dùng tự làm trong Windows).
- **Cách ly (không trộn dữ liệu):** khi chuyển hồ sơ/nguồn, HEdu **ghi nốt, đóng nguồn cũ, rồi nạp lại toàn bộ giao diện** (tải lại cửa sổ) để mọi bộ nhớ tạm (ngân hàng, Thùng rác, quyết định trùng, bộ lọc, kết quả AI…) bắt đầu từ trống. Cách này an toàn hơn nhiều so với tự dọn từng biến.
- **Quyết định D5 — cái gì theo hồ sơ, cái gì theo máy:** *theo hồ sơ/nguồn*: câu hỏi, cây chương trình, Thùng rác, quyết định trùng, nhãn chuẩn. *Dùng chung cả máy* (như hiện nay, không đổi): khoá API Gemini, cài đặt TeX Live, zoom, tuỳ chọn hiển thị. Đề nghị giữ dùng chung vì khoá nằm trong Credential Manager của tài khoản Windows (hồ sơ HEdu không phải ranh giới bảo mật). Nếu muốn khoá riêng từng hồ sơ thì nói để tôi thiết kế thêm.
- Không đồng bộ online, không tài khoản đám mây, không chia sẻ nguồn giữa máy.

## 3. Quy trình chuyển từ `hedu.json` sang SQLite (không xoá tệp gốc)

Chạy **một lần**, chỉ khi người dùng bấm xác nhận trong màn "Nâng cấp lưu trữ" (nêu số câu, vị trí tệp, vị trí bản chụp). Không tự chạy ngầm.
1. **Kiểm tra trước:** đọc `hedu.json` (có phục hồi từ `.bak` như hiện nay), kiểm schema ≤ 3, `uid` và `seq` không trùng, đếm số câu; tính dấu vân tay (SHA-256) của tệp gốc.
2. **Chụp nguyên trạng:** chép `hedu.json` và `dup-decisions.json` (cùng `.bak`) sang `backups\migration-<ngày giờ>\` — chỉ đọc, không sửa.
3. **Dựng tệp tạm** `hedu.db.tmp` ở thư mục đích; nhập tất cả trong **một giao dịch**; chạy `integrity_check`.
4. **Đối chiếu sau khi ghi (bắt buộc đạt mới đi tiếp):** đọc lại từ tệp tạm: số câu bằng nhau; tập `uid` bằng nhau; **từng câu so sánh JSON từng ký tự** (LaTeX, nhãn, mức độ, kiểm duyệt, ngày giờ…); `nextSeq`, cây chương trình, số bản ghi tệp phụ (quyết định, Thùng rác, nhãn) bằng nhau.
5. **Đổi tên** `hedu.db.tmp` → `hedu.db`, ghi `workspace.json` (hồ sơ "Mặc định", nguồn "Ngân hàng của tôi", `migrated_from` = dấu vân tay). Chỉ sau bước này app mới dùng SQLite.
6. **Lỗi ở bất kỳ bước nào ⇒ xoá tệp tạm, giữ nguyên mọi thứ, app vẫn chạy chế độ JSON cũ**, báo rõ lý do. Tệp `hedu.json` không bao giờ bị sửa hay xoá.
7. **Không có "chạy hai nơi":** sau khi chuyển, `hedu.json` cũ chỉ là bản lưu đã đóng băng (không còn cập nhật). Muốn quay lại bản app cũ → dùng **Xuất ra JSON** (mục 4), không dùng tệp cũ.

Chế độ JSON cũ được giữ trong mã thêm một bản phát hành làm đường lùi (không phát triển thêm), rồi bỏ.

## 4. Sao lưu, khôi phục, quay lại

- **Bản chụp .db nhất quán:** dùng `VACUUM INTO` (SQLite chụp một bản trọn vẹn, gọn, kể cả khi app đang mở) + tệp `manifest.json` (số câu, SHA-256, phiên bản app, thời điểm). Sau khi chụp luôn `integrity_check` bản vừa tạo.
- **Trước khi cập nhật app:** vẫn đúng MỘT bản (`backups\before-update\`), nay là bản chụp .db của nguồn đang dùng + `workspace.json`; thứ tự "tải → kiểm chữ ký → sao lưu → cài" **không đổi**. Nút "Khôi phục sau cập nhật" đổi chỗ hai tệp như hiện nay.
- **Quyết định D7 — Điểm khôi phục tự động (cần duyệt vì khác quy tắc "một bản"):** trước các thao tác dễ mất dữ liệu (nhập hàng loạt, xoá/chuyển vào Thùng rác hàng loạt, Dọn sạch Thùng rác, khôi phục từ file, mở nguồn có sẵn) HEdu tự chụp một **điểm khôi phục** (tối đa **5** bản mới nhất mỗi nguồn, tự xoá bản cũ nhất; hiện danh sách + dung lượng). Nhập ngân hàng thật nên có lưới an toàn này. Quy tắc "một bản" của AGENTS.md vẫn áp dụng riêng cho bản trước cập nhật; nếu bạn duyệt, tôi cập nhật AGENTS.md.
- **Sao lưu thủ công:** giữ nguyên định dạng tệp JSON hiện nay (kèm tệp phụ; "Khôi phục từ file" cũ vẫn chạy) và thêm "Lưu bản chụp .db" cho ngân hàng lớn (nhanh, nhỏ, nhất quán).
- **Khôi phục:** từ điểm khôi phục/bản .db: kiểm `integrity_check` + số câu → hiện xem trước (nguồn đang có N câu → bản này có M câu) → xác nhận → tự chụp **điểm khôi phục "trước khi khôi phục"** → đổi tệp. Bấm nhầm vẫn quay lại được.
- **Xuất ra JSON (đường quay lại):** ghi `hedu.json` định dạng schema 3 hiện nay (+ tệp phụ) vào thư mục người dùng chọn — dùng khi muốn trở về bản app cũ hoặc đưa dữ liệu cho người khác. Kiểm tra bằng đúng bộ đối chiếu ở bước 4 mục 3.
- **Kiểm tra toàn vẹn** (Cài đặt → Dữ liệu): nút chạy `integrity_check` + đối chiếu số liệu, báo kết quả bằng tiếng Việt.

## 5. Nguy cơ mất dữ liệu và cách phòng

| Nguy cơ | Phòng tránh |
|---|---|
| Mất điện/đóng app giữa lúc ghi | SQLite giao dịch + WAL + `synchronous=FULL`; ghi theo lô trong một giao dịch; `quick_check` khi mở; mất điện chỉ mất lô đang ghi, không hỏng tệp |
| Chuyển JSON→SQLite làm sai/mất câu | Chụp nguyên trạng trước; dựng tệp tạm; đối chiếu từng ký tự; chỉ đổi tên khi đạt; không xoá tệp gốc |
| Ghi lỗi (đầy ổ đĩa, tệp bị khoá) | Thông báo rõ, KHÔNG báo "đã lưu"; giữ nguyên thay đổi chờ trong bộ nhớ để thử lại; Thùng rác/khôi phục giữ quy tắc hiện nay |
| Hai bản app/hai nơi cùng mở một nguồn | Plugin một-phiên-bản sẵn có + khoá độc quyền của SQLite + từ chối mở nếu đang bị khoá |
| Tệp nằm thư mục đồng bộ đám mây/ổ mạng | Từ chối hoặc cảnh báo mạnh, không cho tạo/mở ở đó |
| Mở nhầm tệp .db lạ hoặc của bản mới hơn | Kiểm `application_id`, `format_version` mới hơn ⇒ chỉ đọc/từ chối (giống cách xử lý schema mới hơn hiện nay) |
| Trộn dữ liệu giữa hồ sơ/nguồn | Tệp phụ nằm CÙNG tệp `.db`; chuyển nguồn = tải lại cả giao diện; tên nguồn/hồ sơ luôn hiện trên màn hình; bộ lọc/ưa thích không mang sang |
| Sao lưu hỏng mà không biết | Mỗi bản chụp tự `integrity_check` + manifest SHA-256; khôi phục luôn kiểm trước |
| Bản app cũ mở dữ liệu mới | Không mở được (không có `hedu.json` mới) — dùng "Xuất ra JSON" để quay lại; điều này được ghi rõ trong hộp xác nhận chuyển đổi |
| SQLite lỗi biên dịch/CI Windows | Thêm thư viện C ⇒ CI Windows phải xanh; thử trước trên nhánh riêng; không phát hành khi chưa xanh |
| Giao diện ghi đè dữ liệu mình không hiểu | Giữ cơ chế `writable=false` khi không đọc được; không bao giờ ghi đè nguồn không mở được |
| Khoá API lẫn vào dữ liệu | Khoá vẫn ở Credential Manager; `workspace.json`/`hedu.db` không chứa khoá (có kiểm tra như `ai_profiles.json`) |

## 6. Các PR triển khai theo thứ tự (mỗi PR nhỏ, CI xanh, bạn duyệt rồi mới gộp)

| PR | Nội dung | Ghi chú |
|---|---|---|
| **S1** | Lớp lưu trữ Rust: mở/tạo `hedu.db`, ghi theo giao dịch, đọc theo trang, kiểm toàn vẹn, khoá độc quyền + test (kể cả "kill giữa chừng"). Chưa nối vào giao diện | Không đụng dữ liệu người dùng |
| **S2** | Chuyển JSON→SQLite (7 bước mục 3) + Xuất ra JSON + bộ đối chiếu; test với dữ liệu giả 1.000/10.000/60.000 câu và câu "khó" (`\immini`, tikz, tkz-tab…) | Không xoá tệp gốc |
| **S3** | Nối `store.ts` và tệp phụ vào SQLite: ghi gia tăng, nạp theo trang, màn "Nâng cấp lưu trữ"; chế độ JSON cũ giữ làm đường lùi | Mọi màn hình chạy như cũ |
| **S4** | Sao lưu/khôi phục/điểm khôi phục/trước cập nhật cho `.db`; "Kiểm tra toàn vẹn"; cập nhật AGENTS.md (nếu duyệt D7) | Đụng luồng updater: kiểm kỹ |
| **S5** | Hồ sơ + `workspace.json` + nhiều nguồn: tạo/mở/chuyển/hiển thị/gỡ, tải lại giao diện khi chuyển, cảnh báo thư mục đám mây/mạng | |
| **S6** | Giao dịch hoá Thùng rác/khôi phục (một giao dịch thay cho hai tệp ⇒ hết trạng thái "thừa một bản"); kiểm sức tải; nhật ký | Tăng độ an toàn, không bắt buộc cho beta.30 |
| **S7** | Tài liệu, checklist nghiệm thu máy thật, thử khởi động với dữ liệu cũ/mới | |

**Đề xuất chia bản phát hành:** **beta.30 = S1–S4** (SQLite + chuyển dữ liệu an toàn + sao lưu/khôi phục): đủ để bạn nhập ngân hàng thật vài chục nghìn câu ổn định. **beta.31 = S5–S7** (hồ sơ, nhiều nguồn). Lý do: S1–S4 giải quyết đúng nguy cơ lớn nhất (khựng khi lưu, mất dữ liệu) với ít thay đổi giao diện; hồ sơ/nguồn là tính năng mới, nhiều phần giao diện, nên tách để kiểm kỹ. Nếu bạn muốn hồ sơ/nhiều nguồn có ngay trong beta.30, nói để tôi xếp lại (rủi ro cao hơn, cần nhiều ngày hơn).

## 7. Checklist nghiệm thu trước khi nhập ngân hàng thật
- [ ] CI `giao-dien` + `windows` xanh trên mọi PR S1–S4; `cargo test --lib` đạt.
- [ ] Chuyển thử dữ liệu mẫu 10.000 và 60.000 câu: đối chiếu từng ký tự đạt; thời gian mở app và mỗi lần lưu chấp nhận được (mục tiêu: lưu một câu < 100 ms; mở 60.000 câu < 10 giây, hiện thanh tiến độ).
- [ ] Ép lỗi: mất điện giả lập (kill tiến trình khi đang ghi lô lớn), đầy ổ đĩa, tệp bị khoá, tệp `.db` hỏng/bị cắt, tệp `.db` của bản mới hơn — app báo đúng, không mất câu, mở lại thấy dữ liệu trước lô.
- [ ] Chuyển trên bản chạy thử `vn.hedu.app.thu` (KHÔNG chạm `%APPDATA%\vn.hedu.app`); bản chụp nguyên trạng tạo đủ; `hedu.json` còn nguyên (so SHA-256).
- [ ] Xuất ra JSON → mở được bằng bản beta.29 trên máy khác/thư mục thử; số câu khớp.
- [ ] Sao lưu → xoá thử vài câu → khôi phục điểm khôi phục → khớp; khôi phục bấm nhầm quay lại được.
- [ ] Thùng rác, kiểm tra trùng, Gán ID, nhập .tex, khôi phục vị trí mới hoạt động y như trước trên dữ liệu SQLite.
- [ ] Cập nhật app thử (beta → beta) có bản sao lưu trước cập nhật dạng .db và "Khôi phục sau cập nhật" chạy.
- [ ] Bạn tự nhập thử 50–100 câu thật vào nguồn thử, đóng/mở app nhiều lần, rồi mới nhập ngân hàng thật; **trước khi nhập thật, tự tạo bản chụp .db và JSON**.
- [ ] Không có khoá API/nội dung câu trong `workspace.json`, nhật ký hay báo cáo.

## 8. Điều CHƯA làm (cố ý, ngoài phạm vi)
Tìm kiếm/dò trùng chạy thẳng trong SQL; SQLCipher/mã hoá tệp; đồng bộ online; chia sẻ nguồn nhiều máy; hồ sơ có mật khẩu; xoá tệp `hedu.json` cũ; tự gộp hai nguồn.

## 9. Điểm cần chủ dự án duyệt
D1 (SQLite trong Rust, giao diện không chạy SQL) · D2 (SQLite là nơi lưu, vẫn nạp vào bộ nhớ) · D3 (tệp phụ vào cùng `hedu.db`) · D4 (vị trí trong `%APPDATA%`, cấm thư mục đám mây/mạng) · D5 (khoá AI/TeX dùng chung cả máy) · D6 (chuyển có xác nhận, tệp gốc không xoá, quay lại bằng "Xuất ra JSON") · D7 (điểm khôi phục tự động, tối đa 5/nguồn) · D8 (chia bản: beta.30 = S1–S4, beta.31 = S5–S7).
