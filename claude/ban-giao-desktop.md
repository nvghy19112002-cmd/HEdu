# Bàn giao HEdu sang phiên Claude Code mới (25/10/2026)

## Git (lúc bàn giao)
- `main` HEAD = `4f5d3cf` (N2, PR #105 đã gộp). Bản phát hành mới nhất: `v0.1.0-beta.31` (commit `5303e3f`). Chưa phát hành gì sau đó.
- PR #104 (N1: đọc tệp/thư mục nguồn, Rust `importfs.rs` + `importfiles.ts`) và #105 (N2: nhập nhiều tệp, bảng Theo tệp, lọc theo tệp, thông tin lô + nhãn nguồn, giới hạn 5.000 câu/lô): ĐÃ gộp, CI xanh.
- PR #103 (chỉ tài liệu `claude/thiet-ke-nhap-nhieu-tep.md`, phương án D1–D7 chủ dự án đã duyệt): VẪN MỞ, chưa gộp, hỏi chủ dự án trước khi gộp. Nhánh `claude/thiet-ke-nhap-nhieu-tep`.
- Nhánh `claude/nhap-n3-bao-cao` (tạo từ `main`) CHƯA có thay đổi nào: N3 chưa bắt đầu.
- Không có thay đổi dở dang nào chưa lưu.

## Đã làm trong đợt này
- Gộp PR #101 (rà soát SQLite) → phát hành beta.31 → ghi chú phát hành (#102).
- N1 (#104) và N2 (#105) như trên. Không đổi schema 3, ID6, UID, LaTeX, dò trùng.
- Test đã chạy cho N2: `npm test` đạt hết, `npm run build` đạt, typecheck 0 lỗi, CI `giao-dien` + `windows` xanh; giao diện thử bằng trình duyệt với Tauri giả lập (quét 3 tệp, bảng Theo tệp, nhãn, lọc theo tệp, chặn >5.000 câu, nhập 5 câu giữ nguyên LaTeX).

## Chưa làm (theo thứ tự)
1. N3 — Báo cáo nhập (phương án §2.5 trong `claude/thiet-ke-nhap-nhieu-tep.md`): màn "Kết quả nhập" (tổng số tìm thấy/đã nhập/trùng bỏ qua/người dùng bỏ qua/để sau; thống kê ID; cảnh báo; bảng theo tệp; giờ điểm khôi phục), nút Lưu báo cáo .csv/.md (CSV không chứa nội dung câu hỏi, UTF-8 có BOM), lưu 20 báo cáo gần nhất ở tệp phụ SQLite khoá `import-reports` (không đổi schema; chế độ JSON chỉ xuất tệp), mục "Nhật ký nhập" trong Cài đặt → Dữ liệu & sao lưu. Chủ dự án đã duyệt, đã nói "chưa phát hành".
2. N4 — Ngân hàng: hiện nhãn trên thẻ, bộ lọc "Nhãn", bật lại "Gắn nhãn hàng loạt".
3. "Dò trùng nhẹ" để bỏ giới hạn 5.000 câu/lô (chỉ mục dò trùng ~36–44 KB/câu, dựng 29 s cho 60k câu).
4. Hoãn: S6 (giao dịch chung Thùng rác + Ngân hàng), hồ sơ/nhiều nguồn (S5); đo Gemini chờ chủ dự án gửi nhãn đã kiểm; nhóm "Chưa phân loại" cho câu thiếu/sai ID (chủ dự án chưa quyết).

## Lỗi còn lại / chưa kiểm
- Chưa nghiệm thu trên Windows thật: lưu SQLite, nhập nhiều tệp/thư mục (checklist mục G trong `claude/nghiem-thu-beta30.md`).
- Chưa thử Tauri thật cho `importfs` ngoài test Rust và thử qua giao diện giả lập.

## Bước tiếp theo
Phiên mới: đọc `AGENTS.md`, file này, `claude/thiet-ke-nhap-nhieu-tep.md` (§2.5), bộ nhớ `viec-tiep-theo-beta30.md`; hỏi chủ dự án có gộp PR #103 không; rồi làm N3 trên nhánh `claude/nhap-n3-bao-cao`.

## Quy tắc không đổi
- Không đổi schema (3), ID6, LaTeX gốc; không tự xoá/duyệt câu; repo công khai nên không commit dữ liệu thật, khoá API, thông tin cá nhân.
- Không bao giờ chạy app thử bằng identifier thật: dùng `npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'`.
- Chỉ phát hành khi chủ dự án nói rõ (`release.yml`, nhập `tag`). Chỉ gộp PR khi chủ dự án đồng ý đúng PR đó.
- Chủ dự án là giáo viên Toán không viết code: trả lời tiếng Việt dễ hiểu; nghiệp vụ chưa rõ thì hỏi.

## Quy trình đã dùng
- Nhánh `claude/...` → PR nhỏ → CI (`giao-dien` + `windows`) → hỏi chủ dự án → squash-merge. PR qua REST GitHub (không có `gh`), token từ `git credential fill`.
- Test: `npm test` (thêm tên test vào `scripts/test.mjs`), `npm run build`, `cargo test --lib` trong `src-tauri/`. Typecheck cần `@types/node` (typeRoots tạm).
- Bash heredoc làm hỏng dấu `\` của LaTeX: dùng công cụ Write cho tệp có LaTeX.
