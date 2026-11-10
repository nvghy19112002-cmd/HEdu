# Bàn giao HEdu (10/11/2026, phiên Claude Code desktop)

Quy tắc chung ở `AGENTS.md`. Ghi đè tệp này mỗi lần dừng việc.

## Trạng thái
- main đã có #274–#283 (Word theo mẫu, Sky Panel, tăng tốc + pdfLaTeX, Tạo đề in theo Sky Panel, trình chiếu ra PDF…). beta.65 CHƯA phát hành.
- Giao diện giai đoạn 3 (bản thiết kế v1.2, `D:\HEdu-rac\scratch\finder\HEdu-thiet-ke-giao-dien-v1.2.pdf`): bước 0–6 ở beta.61–64; bước 7 + màn 14/18/19 ở PR nhánh `claude/giao-dien-buoc7`.

## PR nhánh `claude/giao-dien-buoc7`
- Màn 19 Hộp Xuất đề: `ExamExportDialog.tsx` (6 ô, tuỳ chọn theo ô, nút làm đúng việc), CSS `xp-*` cuối `styles.css`.
- Màn 18 Sửa câu: `QuestionEditor.tsx` (`nav`, hàng nút đáy `qe-acts`), `QuestionDrawer.tsx` (Alt+←/→), `QuestionModal.tsx`, `Bank.tsx`.
- Màn 14 So sánh câu nghi trùng: `PairCompare.tsx` (tô xanh/cam, dòng tóm tắt), CSS `dd-add/dd-del`.
- Dọn 63 quy tắc CSS chết (FilterMenu, kiểu Danh sách/Chi tiết cũ, nút nhóm cũ).

## Đã kiểm
typecheck, npm test, build; xem bằng trình duyệt (dữ liệu mẫu / trang thử giả lập): hộp Xuất đề, Sửa câu (câu sau giữ chế độ sửa), khung so sánh; đo 11 màn ở 1366×768, 1093×614, 911×512: không tràn ngang, không vượt mép, không nút cắt chữ.
Chưa kiểm: app Windows thật; hộp Xuất đề với đề thật (cần bản cài).

## Bước tiếp
CI xanh → hỏi chủ dự án gộp → (khi được bảo) phát hành beta.65.
