# Bàn giao HEdu (10/11/2026, phiên Claude Code desktop)

Quy tắc chung ở `AGENTS.md`. Ghi đè tệp này mỗi lần dừng việc.

## Đã gộp vào main (10/11)
#274–#278 (Word ở Tạo đề, Sky Panel mới, PDF hết mờ, Word theo mẫu, chỉ giữ Sky Panel), #279–#282 (tăng tốc biên dịch, HyMath dịch bằng pdfLaTeX).

## PR đang mở: nhánh `claude/hoan-tat-beta65`
- Tạo đề in theo Sky Panel: `src/lib/examsky.ts` (+ test), `Exam.tsx` (`texSet`), Rust `examprofile.rs` (`\def\CheDo`, bản Đề in), `examcompile.rs` (cho phép Đề in khi có `\CheDo`).
- Bản Lời giải tô đỏ phương án đúng (`hymath.template.ts`, `\AnswerBadgeTrue`).
- Xuất bộ trình chiếu ra PDF (`slidepdf.ts`, `Slides.tsx`, Rust `tex_pdf_to_dir`); `word_decor_pdf` nhận `engine`.
- Kéo-thả .docx vào Nhập liệu (`Extra.tsx`); thanh tab đề (CSS cuối `styles.css`); bảng câu hỏi giữ căn/phân số (`snippet.ts`, câu #3743); ghi chú nút PDF ở Tạo đề.
- Word: Tạo đề và Thư viện dùng Word theo mẫu cho đề có `\TieuDeDeSo`; `filter.lua` bỏ tiêu đề phần trùng.

## Đã kiểm
npm test, typecheck, build; cargo test --lib; dịch thật bằng TeX Live: đề Sky (Đề, Đề in, Lời giải) qua `compile()` của app (test tay `de_theo_mau_ba_ban`), PDF trình chiếu.
Chưa kiểm: app Windows thật; thanh tab mới chưa xem tận mắt (chỉ CSS).

## Bước tiếp
CI xanh → hỏi chủ dự án gộp → (khi được bảo) phát hành beta.65 bằng release.yml.
