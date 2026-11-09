# Nghiên cứu tốc độ biên dịch và hiển thị (09/11/2026)

Đo trên máy chủ dự án (16 nhân, TeX Live 2026 ở `D:\texlive`), **chỉ dùng dữ liệu giả lập** (`scripts/ui-fixtures.mjs`): đề 22 câu (12 TN, trong đó 6 câu có hình TikZ; 4 Đ/S; 6 trả lời ngắn), 4 mã 101–104, dựng bằng đúng hàm của Tạo đề (`examFiles`, `wrapFiles`). Kịch bản đo + tệp mẫu: `D:\HEdu-rac\scratch\toc-do\`.

## 1. Số đo hiện tại

| Việc | Hiện nay | Ghi chú |
|---|---|---|
| Kiểm `pdflatex/xelatex --version` (app chạy **trước mỗi lần biên dịch**) | **0,4 s** mỗi lần | chỉ để lấy tên phiên bản TeX |
| Dịch 1 mã, đề kiểu cũ (pdfLaTeX, 4 trang) | 2,3 s / lượt | riêng phần đầu (nạp gói) đã **1,8 s** |
| Dịch 1 mã, mẫu HyMath (XeLaTeX, 3 trang) | 3,6 s / lượt (lần đầu sau khởi động 7,3 s) | phần đầu ~2,3 s; bước xdvipdfmx 0,65 s |
| Xuất 4 mã + lời giải = 8 PDF, kiểu cũ (3 làn như app) | 13,2 s dịch + ~4 s kiểm phiên bản/lượt kiểm lại ≈ **18 s** | mỗi PDF 2 lượt (chưa có .aux đúng mã) |
| Cùng việc trên, XeLaTeX | 15,6 s (3 làn) | |
| Dịch 50 hình TikZ mới (3 làn như app) | **17,6 s** | mỗi hình: latex 0,5 s + dvisvgm 0,55 s |
| Mở PDF 16 trang (pdf.js) | trang đầu hiện sau 0,15 s; ~13 ms/trang | đã dùng worker + chỉ vẽ trang đang thấy |
| Dựng xem trước 1.000 câu (KaTeX + textflow) | ~150 ms tổng | bảng Ngân hàng chỉ hiện 20/50 dòng một trang |

**Điểm nghẽn**: (1) phần đầu đề (nạp gói) chiếm ~80% thời gian dịch kiểu cũ; (2) mỗi lần biên dịch tốn thêm 0,4 s chỉ để hỏi phiên bản TeX; (3) chỉ chạy 3 việc cùng lúc dù máy có 16 nhân; (4) mỗi lần chạy latex/dvisvgm mất ~0,35–0,5 s khởi động (đọc danh mục TeX Live) — không tránh được nếu không gộp nhiều việc vào một lần chạy.

Hiển thị (PDF, bảng, KaTeX) **không phải điểm nghẽn** — không đề xuất sửa.

## 2. Phương án

| # | Phương án | Lợi đo được | Rủi ro | Độ khó |
|---|---|---|---|---|
| **A** | Nhớ phiên bản TeX trong phiên (không chạy `--version` mỗi lần) — Soạn đề, Xử lí TeX, xuất đề | −0,4 s mỗi lần bấm Biên dịch; xuất 8 PDF −3 s | Rất thấp (khoá theo bộ dịch + thư mục bin; cập nhật TeX Live khi app đang mở thì khởi động lại app mới nhận) | S |
| **B** | Số việc chạy cùng lúc theo số nhân CPU: xuất đề `nhân−1` (tối đa 6, nay ≤3), hình TikZ `nhân−2` (tối đa 6, nay 3) | Xuất 8 PDF kiểu cũ 13,2 → ~7 s; XeLaTeX 15,6 → ~10 s; 50 hình 17,6 → 10,9 s. Máy 4 nhân: 2 → 3 làn | Thấp: máy yếu có thể nóng/quạt to lúc xuất; giữ trần 6 | S |
| **C** | Định dạng dựng sẵn (.fmt) cho phần đầu đề **pdfLaTeX** (đề kiểu cũ, `main-<mã>.tex`, Soạn đề) — cùng cách TikZ đang dùng từ beta.57 | Mỗi lượt 2,3 → **1,15 s** (2×). Xuất 8 PDF: 13,2 → 6,3 s (3 làn), 2,8 s (8 làn). **Đã so ảnh 4 trang PDF: giống từng điểm ảnh** | Trung bình: phần đầu tự làm việc theo tên tệp (currfile…) có thể khác. Giảm rủi ro: khoá theo nội dung MỌI tệp phần đầu nạp (`-recorder`), dịch lỗi ⇒ tự dịch lại kiểu cũ, chỉ áp cho pdfLaTeX, test so ảnh PDF | M |
| **D** | Giữ `.aux` riêng cho từng mã/bản để lần xuất lại chỉ cần 1 lượt | Xuất lại sau khi sửa câu: số lượt dịch giảm ~một nửa | Thấp (vẫn kiểm "Rerun" như nay) | S–M |
| E | .fmt cho XeLaTeX (HyMath) | — | **Không làm được**: XeLaTeX không cho lưu phông vào định dạng (đã thử, báo lỗi) | — |
| F | Gộp nhiều hình TikZ vào một lần dịch | ước 3–5× khi dịch hàng loạt | Cao: hình trước có thể ảnh hưởng hình sau (`\def`, `\tikzset`) ⇒ trái quy tắc bảo toàn nội dung | L — không đề xuất |
| G | pdf.js OffscreenCanvas / ảo hoá bảng / nhớ KaTeX | < 0,1 s | — | không đáng làm |

**Tổng nếu làm A+B+C+D** (máy 16 nhân): xuất đề 4 mã có lời giải kiểu cũ ~18 s → **~3–4 s**; bấm Biên dịch ở Soạn đề kiểu cũ ~2,7 → ~1,2 s; mẫu HyMath ~4,0 → ~3,6 s (chỉ A); 50 hình TikZ 17,6 → ~11 s. Máy 4 nhân lợi ít hơn ở B.

## 2b. Thử: mẫu HyMath (Sky Panel) dịch bằng pdfLaTeX

Chỉ thay phần đầu `hymath-core.tex` (bản thử ở `D:\HEdu-rac\scratch\toc-do\de\hymath-pdf\`): `fontspec`/`unicode-math` → `vietnam` (T5) + `tgtermes` + `tgheros` + `newtxmath[smallerops]` (cùng họ chữ Termes/Heros mà Sky Panel chọn); `\setmainfont`/`\setsansfont`/`\setmathfont` của tệp mẫu thành lệnh rỗng. Tệp mẫu, lõi còn lại và câu hỏi giữ nguyên.

| | XeLaTeX (hiện nay) | pdfLaTeX | pdfLaTeX + .fmt |
|---|---|---|---|
| 1 mã, 1 lượt | 3,6 s | 1,85 s | **1,17 s** |
| 8 PDF, 3 làn | 14,9 s | 9,6 s | 5,8 s (8 làn: 2,7 s) |

Kết quả 4 mã: cùng số trang (3/4/3/4), không lỗi, không thiếu chữ. Ngắt trang trùng nhau. Khác nhìn thấy được: hình dấu căn, dấu tích phân, `\lim`; các dòng lệch < 1 mm. Bản .fmt giống bản không .fmt từng điểm ảnh. So sánh: `D:\HEdu-rac\scratch\toc-do\so-sanh\`.

Việc còn lại nếu làm thật (L, đổi mẫu in): mỗi mẫu HyMath chọn phông riêng ⇒ phải có bảng phông pdfLaTeX cho TỪNG mẫu; mẫu dùng ký tự Unicode lạ (biểu tượng, emoji) cần kiểm; giữ XeLaTeX làm đường dự phòng; chủ dự án duyệt hình thức từng mẫu.

## 3. Đề xuất thứ tự PR
1. A + B (nhỏ, an toàn) — một PR.
2. C (.fmt đề pdfLaTeX) — một PR, kèm test so ảnh PDF có/không .fmt.
3. D (.aux theo mã) — một PR.

Mỗi PR đo lại trước/sau bằng `D:\HEdu-rac\scratch\toc-do\bench.mjs` và `tikzbench.mjs`.
