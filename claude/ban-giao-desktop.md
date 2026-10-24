# Bàn giao HEdu sang Claude Desktop Code (24/10/2026)

## Trạng thái
- Đã phát hành (beta): tới `v0.1.0-beta.28` (AI Gemini cho Gán ID; sửa AI quá giờ chờ). Repo công khai `nvghy19112002-cmd/HEdu`. Đọc `AGENTS.md` và `GHI-CHU-PHAT-HANH.md` đầu tiên.
- Đã phát hành `v0.1.0-beta.29` (kênh beta, 24/10/2026) gồm: PR #83 (an toàn Thùng rác), #84 (màn Thùng rác), #85 (khung xem + xuất .tex), #86 (xung đột + dọn sạch), #87 (Cài đặt 8 mục), #88 (Gemini 5 cấu hình khoá), PR-7 (hoàn thiện, tài liệu).
- Việc còn mở: (1) chọn vị trí mới cho câu "Vị trí không còn" trong Thùng rác — đổi vị trí/ID nên cần chủ dự án duyệt cách làm; (2) đổi model mặc định sang 3.6 Flash (chủ dự án quyết cùng bản này); (3) quy tắc "Công thức lý thuyết" chủ dự án sẽ trả lời sau; (4) chưa thử trên Tauri thật bản `vn.hedu.app.thu` và Gemini thật nhiều cấu hình; chủ dự án nghiệm thu Windows thật (xoá 5 câu thử → Thùng rác → Xem chuẩn → khôi phục → xoá hẳn; đổi từng mục Cài đặt; thử Gemini bằng câu giả).

## Quy tắc không đổi
- Không đổi schema (3), ID6, LaTeX gốc; không tự xoá/duyệt câu; repo công khai nên không commit dữ liệu thật, khoá API, thông tin cá nhân.
- Không bao giờ chạy app thử bằng identifier thật: dùng `npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'`.
- Chỉ phát hành khi chủ dự án nói rõ: workflow `release.yml` (dispatch `inputs[tag]`). Chỉ gộp PR khi chủ dự án đồng ý đúng PR đó.
- Chủ dự án là giáo viên Toán không viết code: trả lời tiếng Việt dễ hiểu; việc nghiệp vụ chưa rõ thì hỏi trước.

## Quy trình làm việc đã dùng
- Nhánh `claude/...` → PR nhỏ → CI (`giao-dien` + `windows`, có `cargo test --lib`) → hỏi chủ dự án → squash-merge. PR mở/gộp qua REST GitHub (không có `gh`), token lấy từ `git credential fill`.
- Test: `npm test` (scripts/test.mjs, thêm tên test vào mảng), build `npm run build`; `cargo test --lib` trong `src-tauri/` (có test thật kho mật khẩu: `-- --ignored kho_khoa_that`).
- Web preview (`npm run dev`, cổng 1420) dùng localStorage nên không mô phỏng lỗi ghi — dùng test chèn lỗi (`trashsafe.test`, `ai/profiles.test`).
- Capabilities JSON (`src-tauri/capabilities/default.json`): mô tả không được chứa dấu ngoặc kép chưa escape (từng làm hỏng CI).
