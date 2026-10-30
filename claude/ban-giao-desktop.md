# Bàn giao HEdu sang phiên Claude Code mới (30/10/2026, sau beta.44)

> Chuyển sang tài khoản Claude khác: đọc `claude/ban-giao-tai-khoan-moi.md` trước (bàn giao đầy đủ 30/10/2026).

## Git và phát hành (30/10/2026)
- `main` = `ec1c051` (PR #166). Bản phát hành gần nhất: `v0.1.0-beta.44` (kênh beta, 30/10/2026). Trong ngày đã ra beta.41 (#162) → beta.42 (#164) → beta.43 (#165) → beta.44 (#166); nội dung từng bản ở `GHI-CHU-PHAT-HANH.md` và mục "Trạng thái" của `AGENTS.md`.
- Ngân hàng đề thi E0–E6 (#112–#125) đã nằm trong các bản phát hành từ beta.34 trở đi.
- PR đang mở: #123 (chỉ sửa `AGENTS.md`: quy tắc phối hợp 3 phiên Claude Code, mở từ 26/10) — chờ chủ dự án quyết gộp hay đóng.
- Issue đang mở: #1 (còn 3 mục: lưu đầu file theo từng câu — đổi schema, cần duyệt riêng; huỷ hẳn tiến trình con TeX trên Windows; nghiệm thu máy thật).

## Chưa nghiệm thu trên máy Windows thật
- Ngân hàng đề thi theo `claude/nghiem-thu-de-thi.md`; lưu trữ SQLite (mục G, H, I của `claude/nghiem-thu-beta30.md`).
- beta.42–44 với tệp .tex và ngân hàng thật của chủ dự án (chuẩn hoá khi nạp, mục "Chưa có ID", nhãn `label=` trong xem trước và khi biên dịch).

## Đang chờ quyết định / chưa được làm
- Đề án cây KNTT + Gán ID V4: đã duyệt bộ chữ A/G/S/T và trả lời Q3–Q9, nhưng CHƯA được viết mã (phải qua Cổng A → B → C).
- Màn Tạo đề cũ vẫn tắt (`FEATURES.exam=false`); không bật lại khi chưa được duyệt.
- Trước nhập hàng loạt: trạng thái duyệt khi nhập nguồn tin cậy, chuyển bảng mã tệp không phải UTF-8, nhập lớn chạy nền (giới hạn 5.000 câu/lô, 2.000 tệp, 20 MB/tệp, gán ID tự động 200 câu/lượt).
- Backlog: đổi tên/xoá/di chuyển tệp trong cây tệp đề thi; BibTeX/Biber; giao dịch chung Thùng rác + Ngân hàng (S6); hồ sơ người dùng / nhiều nguồn (S5–S7).

## Mẹo kỹ thuật
- Máy này không có `gh`: đọc GitHub qua REST (`curl https://api.github.com/repos/nvghy19112002-cmd/HEdu/...`); mở PR bằng REST với token từ `git credential fill`.
- Bash heredoc làm hỏng dấu `\` của LaTeX/Rust: dùng công cụ Write hoặc Edit cho tệp có `\`.
- Typecheck cần `@types/node` (dùng `--typeRoots`). `node_modules` do `npm ci`; `Cargo.lock`/`package-lock.json` được theo dõi (dùng `--locked`).
- Kiểm tay với TeX Live: `HEDU_TEX_BIN=<thư mục bin> cargo test --lib --locked tex_live_that -- --ignored --nocapture`.

## Quy tắc không đổi
- Không đổi schema (3), ID6, UID, LaTeX/TikZ gốc; không tự xoá/duyệt câu; repo công khai nên không commit dữ liệu thật, khoá API, thông tin cá nhân.
- Không bao giờ chạy app thử bằng identifier thật: `npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'`.
- Chỉ phát hành khi chủ dự án nói rõ; chỉ gộp PR khi chủ dự án đồng ý đúng PR đó.
- Chủ dự án là giáo viên Toán không viết code: trả lời tiếng Việt dễ hiểu; nghiệp vụ chưa rõ thì hỏi.
