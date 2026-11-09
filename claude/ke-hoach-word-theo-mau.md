# Kế hoạch: Xuất Word ở Tạo đề + đề và Word theo mẫu in (09/11/2026)

Chủ dự án đã duyệt 09/11 (cả 3 phương án đề xuất):
1. **Mẫu in ghi vào từng đề**: đề mới lấy mẫu đang chọn ở Cài đặt › Đề thi và giữ mẫu đó; đổi Cài đặt về sau không làm đề cũ đổi theo; muốn đổi thì đổi riêng trong Thông tin đề.
2. **Xuất Word thẳng ở Tạo đề**, không bắt lưu vào Thư viện trước.
3. **Word giống kiểu dáng, sửa được**: cùng màu, phông, khung tiêu đề, dải PHẦN, nhãn A–D, đầu/chân trang, mã đề; công thức là Equation sửa được; hình TikZ là ảnh; chuyển sắc/bo góc thay bằng màu phẳng. Không làm kiểu "mỗi trang PDF một ảnh".

## Hiện trạng (đã đọc mã)
- Xuất Word: `src-tauri/src/examword.rs` (Pandoc + `word/pre.tex` + `word/filter.lua` + MỘT `word/reference.docx` cố định), TS `src/lib/examword.ts`, hộp `ExamExportDialog.tsx`. Chỉ chạy với đề đã lưu (`read_manifest(lib, id)`).
- Tạo đề luôn dựng đề kiểu "Mặc định HEdu (kiểu cũ)" (`Exam.tsx`: `const theme = HEDU_THEME_ID`); mẫu HyMath (9 mẫu, mặc định Sky Panel) chỉ áp cho tệp đề chỉ có dữ liệu (`examwrap.ts`).

## Chia PR
- **PR1 — Xuất Word ở Tạo đề**: lệnh Rust `exam_word_export_draft` (không cần đề đã lưu; ảnh câu hỏi lấy từ kho ảnh), TS `exportWordText`, nút Xuất Word + hộp chọn mã/chế độ ở bước 3 Tạo đề. Word vẫn kiểu hiện tại.
- **PR2 — Tạo đề theo mẫu in**: đề dựng theo mẫu ở Cài đặt (HyMath → XeLaTeX), ghi `mauIn` vào `hedu-de.json`; đề cũ giữ nguyên. Cần kiểm biên dịch đủ 9 mẫu + 3 chế độ (màu/in/lời giải) và trộn mã.
- **PR3 — Word theo mẫu**: mỗi mẫu một "hồ sơ Word" (màu chính/phụ, phông, kiểu khung tiêu đề, kiểu dải PHẦN, kiểu nhãn A–D); Rust vá `styles.xml`/đầu-chân trang của `reference.docx` theo hồ sơ, `filter.lua` dựng khung tiêu đề bằng bảng tô màu. Làm Sky Panel trước, rồi 8 mẫu còn lại. Chụp so sánh PDF ↔ Word từng mẫu.

## Rủi ro
- Không đổi schema ngân hàng; `hedu-de.json` chỉ thêm trường. Đề cũ không có `mauIn` ⇒ coi là "Mặc định HEdu (kiểu cũ)".
- Word cần Pandoc trên máy (như hiện tại); thiếu Pandoc thì báo cách cài, không hỏng gì.
