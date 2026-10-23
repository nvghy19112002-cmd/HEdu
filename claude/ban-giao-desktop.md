# Bàn giao HEdu sang Claude Desktop Code (23/10/2026)

## Trạng thái
- Đã phát hành (beta): beta.22, beta.23, beta.24 (xuất .tex 2 kiểu, Lưu thành…, thanh chọn gọn, Hoàn tác thùng rác), beta.25 (Kiểm tra trùng: tự chuyển cặp, Hoàn tác, trạng thái lưu, Công cụ, xem trước khi nhập). beta.25 đang build khi viết tài liệu này — kiểm tra GitHub Releases.
- `main` = bản mới nhất. Repo công khai `nvghy19112002-cmd/HEdu`. Đọc `AGENTS.md` và `GHI-CHU-PHAT-HANH.md` đầu tiên.

## Quy tắc không đổi
- Không đổi schema (3), ID6, LaTeX gốc; không tự xoá/duyệt câu; repo công khai nên không commit dữ liệu thật, thông tin cá nhân.
- Chỉ phát hành khi chủ dự án nói rõ: workflow `release.yml` (dispatch `inputs[tag]`).
- Chủ dự án là giáo viên Toán không viết code: trả lời tiếng Việt dễ hiểu; việc nghiệp vụ chưa rõ thì hỏi trước.

## Quy trình làm việc đã dùng
- Nhánh `claude/...` → PR nhỏ → CI (`giao-dien` + `windows`, có `cargo test --lib`) → squash-merge. Rust chỉ kiểm được bằng CI Windows (máy cloud không có crates.io).
- Test: `npm test` (scripts/test.mjs), build `npm run build`; E2E bằng Playwright viết tạm trong thư mục tạm, không commit.
- Capabilities JSON (`src-tauri/capabilities/default.json`): mô tả không được chứa dấu ngoặc kép chưa escape (từng làm hỏng CI).

## Việc còn lại
- Nghiệm thu trên Windows thật: Lưu thành…, xuất thư mục biên dịch được (`main.tex` + `khaibaochung.tex` + `cauhoi.tex` + .sty + `CAN-CO-GI.md`), thùng rác + Hoàn tác, màn Kiểm tra trùng (zoom 125–150%, 1920×1080, ngân hàng ≥3.000 câu).
- Màn "Xử lí TeX / xem trước khi xuất" (chủ dự án sẽ gửi danh sách chức năng cần).
- `khaibaochung.tex` mẫu: tên/số điện thoại giáo viên để trống, thầy/cô tự điền; có thể thêm ô nhập thông tin này vào hộp xuất.
- Chưa làm: chuyển vị trí hàng loạt; test hiệu năng màn Kiểm tra trùng ở 30.000–60.000 câu.
