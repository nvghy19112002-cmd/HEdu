# Bàn giao HEdu sang phiên Claude Code mới (25/10/2026, cập nhật sau beta.32)

## Git (25/10/2026)
- Đã phát hành `v0.1.0-beta.32` (kênh beta, commit `68c0b70`): N1–N4 (PR #104, #105, #107, #108). Nhập nhiều tệp, nhãn nguồn, báo cáo nhập + Nhật ký nhập, bộ lọc Nhãn, Gắn nhãn hàng loạt. Không đổi schema 3, ID6, UID, LaTeX, dò trùng.
- Thiết kế đã duyệt: `claude/thiet-ke-nhap-nhieu-tep.md` (PR #103, có thể còn mở: hỏi chủ dự án trước khi gộp).
- Test đã chạy cho từng PR: `npm test`, `npm run build`, typecheck, CI `giao-dien` + `windows` xanh; giao diện thử trong trình duyệt. Chưa thử Tauri/Windows thật.

## Chưa làm (theo thứ tự)
1. Chủ dự án nghiệm thu mục G, H, I (`claude/nghiem-thu-beta30.md`) trên `vn.hedu.app.thu`, rồi mới tới ngân hàng thật.
2. "Dò trùng nhẹ" để bỏ giới hạn 5.000 câu/lô (chỉ mục dò trùng ~36–44 KB/câu, dựng 29 s cho 60k câu).
3. Hoãn: S6 (giao dịch chung Thùng rác + Ngân hàng), hồ sơ/nhiều nguồn (S5); đo Gemini chờ nhãn đã kiểm của chủ dự án; nhóm "Chưa phân loại" cho câu thiếu/sai ID (chủ dự án chưa quyết).

## Lỗi còn lại
- Bộ lọc Nhãn chọn một nhãn mỗi lần. Nhật ký nhập không có ở chế độ JSON cũ.
- Ghi chú phát hành đã đăng trong latest.json của beta.32 lúc đầu hiện nhầm nội dung beta.31 (tệp GHI-CHU chưa cập nhật khi chạy workflow); đã sửa trong repo, bản đã phát hành giữ nguyên.

## Bước tiếp theo
Phiên mới: đọc `AGENTS.md`, file này, bộ nhớ `viec-tiep-theo-beta30.md`; chờ kết quả nghiệm thu của chủ dự án; làm dò trùng nhẹ khi được yêu cầu.

## Quy tắc không đổi
- Không đổi schema (3), ID6, LaTeX gốc; không tự xoá/duyệt câu; repo công khai nên không commit dữ liệu thật, khoá API, thông tin cá nhân.
- Không bao giờ chạy app thử bằng identifier thật: dùng `npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'`.
- Chỉ phát hành khi chủ dự án nói rõ (`release.yml`, nhập `tag`). Chỉ gộp PR khi chủ dự án đồng ý đúng PR đó.
- Chủ dự án là giáo viên Toán không viết code: trả lời tiếng Việt dễ hiểu; nghiệp vụ chưa rõ thì hỏi.

## Quy trình đã dùng
- Nhánh `claude/...` → PR nhỏ → CI (`giao-dien` + `windows`) → hỏi chủ dự án → squash-merge. PR qua REST GitHub (không có `gh`), token từ `git credential fill`.
- Test: `npm test` (thêm tên test vào `scripts/test.mjs`), `npm run build`, `cargo test --lib` trong `src-tauri/`. Typecheck cần `@types/node` (typeRoots tạm).
- Bash heredoc làm hỏng dấu `\` của LaTeX: dùng công cụ Write cho tệp có LaTeX.
