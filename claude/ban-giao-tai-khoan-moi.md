# Bàn giao HEdu cho tài khoản Claude khác (06/11/2026)

Đọc tệp này đầu tiên, rồi `AGENTS.md` (quy tắc dự án, mục 7 Trạng thái), `GHI-CHU-PHAT-HANH.md` (đầu tệp), `claude/ban-giao-desktop.md`.
Chủ dự án là giáo viên Toán, không viết code: trả lời tiếng Việt đời thường, NGẮN; tự làm trọn nhánh → commit → PR → CI → gộp (khi họ đã duyệt), không bảo họ tự bấm. Họ rất coi trọng tiết kiệm token.

## 1. Việc đầu tiên khi mở phiên
1. `cd D:\HEdu-tv` (bản làm việc của phiên này; mỗi việc một nhánh `claude/<tên>` từ `origin/main`). `C:\Users\admin\AppData\Local\HEdu` chỉ là nơi cài app thật, KHÔNG phải repo.
2. `git fetch origin --prune`; xem `main`, PR đang mở (`gh pr list`), bản phát hành mới nhất (`gh release list`). **Máy này có `gh`** (đăng nhập sẵn).
3. Báo chủ dự án 5–8 dòng: trạng thái, việc dở, đề xuất. Chưa làm gì lớn khi họ chưa gật.
4. Cùng máy ⇒ bộ nhớ Claude (`C:\Users\admin\.claude\projects\C--Users-admin-AppData-Local-HEdu\memory\`) vẫn đọc được; hội thoại cũ KHÔNG chuyển sang.

## 2. Trạng thái lúc bàn giao
- `main` = `bb4b6b9` (PR #256). **Bản đã phát hành mới nhất: `v0.1.0-beta.59`** (05/11).
- **beta.60 CHƯA phát hành.** Ghi chú beta.60 đã gộp (#252) nhưng chỉ liệt kê #246–#251; từ đó main có thêm #253 (bỏ dòng "Biên dịch thành công" ở Xử lí TeX), #254 (ảnh câu hỏi), #255 (biên dịch song song), #256 (Excel đáp án 5 nền tảng) và sắp có #257. Để phát hành: (a) bổ sung các PR đó vào mục beta.60 của `GHI-CHU-PHAT-HANH.md` + dòng ở `AGENTS.md` mục 7 (qua PR tài liệu), (b) sửa `TAG`/`MAIN_SHA` trong `D:\HEdu-rac\scratch\release60.mjs` (đang trỏ `3a4f693`, đã cũ), (c) chờ CI main xanh, (d) `node release60.mjs dispatch` rồi `node release60.mjs runs`. **Bộ phân loại quyền của Claude đã CHẶN lệnh dispatch này** ("Production Deploy"): cần chủ dự án nói rõ "cho phép phát hành" ngay trong phiên (hoặc họ tự chạy lệnh). Chủ dự án dặn: "làm tốt giai đoạn 1 rồi hẳn phát hành" (giai đoạn 1 đã xong, xem mục 3).
- **PR đang mở của phiên này: #257** (Phiếu trả lời trắc nghiệm trống, PDF A4). Chủ dự án ĐÃ duyệt mẫu và bảo mở PR; lúc bàn giao CI `windows` đang chạy. Chưa gộp (họ nhắn "dừng lại 1 xíu" ngay sau đó): hỏi họ rồi gộp khi CI xanh.
- PR cũ còn mở, chờ chủ dự án quyết, KHÔNG tự gộp/đóng: #240 (chia sẻ ngân hàng; họ nói "chưa cần"), #208, #198, #180, #176, #175, #123.
- Dữ liệu thật của chủ dự án: **chưa bị đụng**. Nút "Duyệt và xác minh các câu đã có ID" (Sức khoẻ ngân hàng, #246) mới có từ beta.60; họ chưa bấm.

## 3. Lộ trình chủ dự án đã chốt (05–06/11)
Định hướng: **app mạnh về LaTeX là chính; Word chỉ phụ, làm sau.**
- **Giai đoạn 1 (LaTeX) — XONG.** #247 trộn có điều kiện (ghim vị trí, giữ phương án, cân bằng A–D, đối chiếu mọi mã với câu gốc `verifyAgainstOriginal`), #248 kiểm tra .tex trước khi chốt (`examcheck.checkTexContent`), #249 câu chùm, #250 chân trang "Trang x/??" (dịch lại khi còn undefined references), #251 định nghĩa riêng theo câu (`qpreamble.ts`, `Question.preamble`), #254 ảnh câu hỏi (kho `question-images`, `src-tauri/src/qimg.rs`, `qimages.ts`; xem chuẩn dùng driver dvisvgm + `extractbb`, không cần Ghostscript), #255 biên dịch song song khi xuất gói (làn `lane`, tối đa 3). "PDF bị mờ": chủ dự án gửi ảnh, thực tế không mờ.
- **Giai đoạn 2 (mẫu MathHub, "sao chép rồi làm lại thành của mình") — đang làm.** MathHub thực ra cài ở **`C:\Users\admin\AppData\Local\Programs\EduHub`** (Electron; dữ liệu `AppData\Roaming\mathhub`). Cách làm đã chọn: CHỈ quan sát đầu ra (không mở/giải nén mã chương trình, không chép tài nguyên của họ): các tệp Excel nó đã xuất nằm ở `C:\Users\admin\Desktop\làm việc\de-kiem-tra-chat-luong-lan-2\*-dapan-*.xlsx` và `Downloads\file-mau-dap-an-tnmaker-*.xlsx`. **KHÔNG đọc `Roaming\mathhub\settings.json`** (chứa khoá API Gemini và mã giáo viên ở dạng chữ thường; khuyên chủ dự án đổi khoá). Đã làm: Excel đáp án TNMaker/SmartTest/AZOTA/OLM/YoungMix (#256, `platxlsx.rs`), phiếu tô trống (#257, `answersheet.ts` + `sheetpdf.rs`). **Còn lại**: mã QR đáp án; đề mẫu (MathHub kèm `resources/de-mau`: nhập đề, OCR, tiếng Anh, trộn có/không lời giải); "yêu cầu cần đạt" (`resources/yccd/toan.json`); đặc tả kỹ thuật; trình chiếu (thư mục `decks`); thi online (`online-results`); chấm thi (`grading.db`). Xem tên thư mục để đoán tính năng rồi quan sát đầu ra thật.
- **Giai đoạn 3 — CHƯA bắt đầu:** "đập đi xây lại toàn bộ giao diện Finder, tiến hành thật đẹp, cân chỉnh lại mọi thứ". Kiểu Finder hiện nằm ở `screens/ExamLibrary.tsx` (1.163 dòng, 3 chế độ xem), `KhoHinh.tsx`, `Bank.tsx`, `Trash.tsx`, `Curriculum.tsx`; mỗi màn tự viết riêng. Quy trình đã hứa: khảo sát → **dựng mẫu thiết kế cho chủ dự án duyệt TRƯỚC khi viết code** → bộ thành phần dùng chung → chuyển từng màn (Thư viện đề → Kho hình → Ngân hàng) mỗi màn một PR → dọn bản cũ. Dữ liệu không đổi.
- Giai đoạn 4 (đóng gói Pandoc kèm bản cài, cài đặt/cập nhật, giấy phép) và 5 (Word phụ: nhập hình, đọc .doc, thêm kiểu bảng đáp án) để sau.
- Word đã có từ trước: xuất (#241, #244: 6 chế độ, giao diện navy+đỏ), nhập (#242, đọc MathType). Cần Pandoc ở `D:\HEdu-tools\pandoc`. `.doc` cũ CHƯA kiểm trong app (có tiến trình Word ẩn bị kẹt do phiên trước; xem Task Manager).

## 4. Quy tắc chủ dự án đã nói rõ
- **Mọi sản phẩm xuất ra (Excel/PDF/.docx/.tex): dựng mẫu thật, gửi chủ dự án duyệt, rồi mới mở PR/gộp.**
- Mỗi tính năng một PR; thử thật trên app Tauri (CDP) trước khi báo xong; gộp sau CI xanh. Chỉ phát hành khi họ nói rõ.
- Không đụng dữ liệu thật `%APPDATA%\vn.hedu.app`; không tắt `C:\Users\admin\AppData\Local\HEdu\hedu.exe` (app thật đang mở).
- Báo ngắn; không lặp ảnh/test thừa.

## 5. Môi trường máy (Windows)
- **Ổ C gần đầy: không ghi gì ra ổ C.** Luôn `export TMP=D:/hedu-tmp TEMP=D:/hedu-tmp CARGO_TARGET_DIR=D:/hedu-build-target`. Tệp tạm/script/ảnh để `D:\HEdu-rac` (`scratch\`).
- Lệnh: `npx tsc --noEmit -p .`, `node scripts/test.mjs` (mọi test TS, tên test đăng ký ở `scripts/test.mjs`), `cargo test --locked --lib` (khoảng 260 test, ~1 phút) trong `src-tauri`.
- **App Tauri thử** (identifier riêng, không chạm dữ liệu thật; ngân hàng thử có ~8.900 câu): PowerShell, `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9223'` rồi `npx tauri dev --config D:/HEdu-rac/thu.conf.json` (tệp cấu hình `{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}`; truyền JSON trực tiếp bị PowerShell làm hỏng). Điều khiển bằng CDP: `D:\HEdu-rac\scratch\cdp2.mjs` + các `smoke-*.mjs` mẫu (gọi `window.__TAURI__.core.invoke`, đổi hộp thoại bằng `window.__TAURI__.dialog.open = async()=>…`). Không dùng `import('/src/...')` trong trang (không chạy). Có thể phải khởi động lại app thử sau khi đổi nhánh.
- TeX Live 2026 ở `D:\texlive`; Pandoc ở `D:\HEdu-tools\pandoc`; Excel và Word cài sẵn (mở thử tệp bằng COM; Word COM từng treo).
- **Bẫy lớn: dấu `\` bị nuốt/đổi nghĩa** khi chạy `python3`/`node -e`/heredoc trong Bash (`\\` → `\`, `\n` thành xuống dòng). Mọi nội dung có `\` (LaTeX, regex, chuỗi Rust/TS): dùng công cụ **Write/Edit**, hoặc tệp `.mjs` dùng `String.fromCharCode(92)`. Tệp .mjs phải dùng đường dẫn `D:/...` (không `/d/...`). Công cụ Edit/Write đòi đã Read tệp trước.
- Một số tệp có ký tự điều khiển `\x02` trong chuỗi (ví dụ khoá bộ nhớ trong `xemchuan.ts`): đừng gõ lại, chỉ sửa phần cần.

## 6. Quy trình hay dùng
- PR: `gh pr create`; commit tiếng Việt, cuối commit `Co-Authored-By: Claude <noreply@anthropic.com>`; cuối mô tả PR `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Chờ CI: `gh pr checks <số> --watch`; gộp: `gh pr merge <số> --squash --delete-branch`.
- PR tài liệu-chỉ (ghi chú phát hành) có thể không có check nào; `main` vẫn chạy CI sau khi gộp — chờ xanh trước khi phát hành.
- Phát hành: xem mục 2; script mẫu `D:\HEdu-rac\scratch\release59.mjs`/`release60.mjs` (kiểm main đúng SHA đã xanh, tag chưa có, không lượt phát hành nào đang chạy). Kiểm kênh: `curl -sL https://github.com/nvghy19112002-cmd/HEdu/releases/download/channel-beta/latest.json`.
- Gán ID nhờ Claude ("làm lô mới nhất"): xem bộ nhớ `gan-id-nho-claude` và `claude/quy-tac-gan-id-chuan.md`.

## 7. Kiến trúc nhanh (chỗ hay đụng)
- Giao diện `src/` (React/TS), lõi `src-tauri/src/` (Rust/Tauri). SQLite + tệp phụ (`id-review`); không đổi schema 3, ID6, UID, LaTeX gốc. Trường mới trên câu chỉ CỘNG THÊM (`preamble`, `images`).
- Tạo đề: `screens/Exam.tsx`, `lib/examgen.ts` (`makeVariants`, `verifyAgainstOriginal`, `variantTex`), `lib/examdraft.ts`. Thư viện đề: `screens/ExamLibrary.tsx`, `lib/examcheck.ts`; hộp xuất `components/ExamExportDialog.tsx` (PDF/ZIP, Word 6 chế độ, Excel nền tảng, phiếu tô).
- Biên dịch: `examcompile.rs` (`compile`, làn `lane`, `needs_rerun`), `examexport.rs` (`export_codes`, `prewarm`), `tikz.rs` (xem chuẩn, ảnh), `texscratch.rs` (Xử lí TeX).
- Word: `examword.rs` + `src-tauri/src/word/` (Pandoc), `wordimport.rs`, `mtef.rs`. Excel: `examxlsx.rs`, `platxlsx.rs`. Phiếu tô: `lib/answersheet.ts`, `sheetpdf.rs`.
- Nhập: `screens/Extra.tsx`, `lib/importbatch.ts`, `lib/qpreamble.ts`, `lib/qimages.ts`. Sức khoẻ ngân hàng: `screens/Health.tsx`, `lib/approveids.ts`.
- Quy tắc ID: `claude/quy-tac-gan-id-chuan.md` ("máy" không tự thành "giáo viên xác minh"; duyệt nội dung tách khỏi xác minh Dạng; không ghi ID giả).

## 8. Quy tắc không đổi
- Repo công khai: không commit dữ liệu thật, khoá API, thông tin cá nhân.
- Không tự xoá/duyệt câu của chủ dự án; không tái cấu trúc ngoài phạm vi; thay đổi cỡ L (schema, kiến trúc) phải được duyệt trước.
- Tính năng lạ: xem dự án mã nguồn mở tương tự trước khi viết.
- Báo cáo: (1) Đã làm (2) Kiểm thử (3) Git (4) Còn tồn (5) Cần quyết định.
