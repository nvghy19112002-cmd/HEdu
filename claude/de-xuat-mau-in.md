# Đề xuất: mẫu in đề thi trong HEdu dựa trên bộ HyMath (02/11/2026)

Mục đích: tệp đề **chỉ có dữ liệu** (như `toan10_gk1_taythanh_2627.tex`) bấm Biên dịch là ra PDF đẹp theo mẫu; đổi mẫu không phải sửa tệp đề.
Trạng thái: **chờ chủ dự án duyệt** (việc cỡ L: đổi trình biên dịch cho đề dùng mẫu, đưa bộ mẫu vào app).

## 1. Hiện trạng
- HEdu đã tự ghép phần đầu cho tệp chỉ có dữ liệu (PR "tự ghép phần đầu", chưa gộp) nhưng dùng bộ khai báo cũ (`hedu.sty` + `hedu-khaibao.tex`, pdfLaTeX). Bộ này **không có** `\TieuDeDeSo`, `\TieuDeDeThi` nên tệp đề của thầy/cô vẫn lỗi.
- Bộ HyMath (`F:\HyMath-Gon`) của thầy/cô đã tách đúng 3 lớp:
  - `Caidat/` — lõi: macro gốc (`\TieuDeDeSo`, `\TieuDeDeThi`, `\heva`, `\hoac`, `\dongcham`…), `theme-core.tex` (XeLaTeX, fontspec, ex_test, chế độ màu/in/lời giải), `theme-adapter.tex` (nối `\TieuDeDeSo` → khung tiêu đề của mẫu).
  - `Themes/` — 8 mẫu, mỗi mẫu một tệp, cùng một "giao diện lập trình": màu `ThemeBase`/`ThemeSecondary`, `\HyThemeTitle` (khung giới thiệu), `\StudentInfo`, `\HyThemePart` (tiêu đề phần), `\HyThemePageStyle` (đầu + chân trang), `\AnswerBadge`, `\ExamEnd`.
  - `data/` — tệp đề chỉ có dữ liệu: `\TieuDeDeSo{…}` + `\textbf{PHẦN I…}` (mẫu tự tô) + các khối `ex`.
- Phông chữ các mẫu dùng (TeX Gyre Termes/Heros, Latin Modern) **đã có sẵn trong TeX Live** ⇒ app không cần mang theo phông.

## 2. Đề xuất: lấy HyMath làm lõi mẫu in của HEdu
| Lớp | Ở đâu trong HEdu | Ai sửa |
|---|---|---|
| Lõi (Caidat) | gói đi kèm app (`src-tauri/tex/hymath/`, như `ex_test.sty` hiện nay), nạp qua TEXINPUTS | Claude, theo phiên bản |
| Mẫu (Themes) | 8 mẫu có sẵn + thư mục "mẫu của tôi" trong dữ liệu app | thầy/cô thêm được |
| Dữ liệu đề | tệp đề trong Thư viện, KHÔNG đổi | thầy/cô |
| Phần ghép (main) | HEdu tự sinh khi biên dịch, chỉ trong thư mục tạm | HEdu |

Tệp ghép (tương đương `main.tex` của HyMath) do HEdu sinh mỗi lần dịch:
```
\documentclass[12pt,a4paper]{article}
\def\ThemeFile{<mẫu đã chọn>}  \def\CheDo{mau|in|loigiai}
\newcommand{\SchoolYear}{<năm học của đề>}  \newcommand{\TeacherName}{<tên giáo viên>}
\input{caidat}  \begin{document}  \input{<tệp dữ liệu>}  \end{document}
```

## 3. Cách dùng (thiết kế cho tiện nhất)
1. **Cài đặt › Đề thi**
   - **Mẫu in**: lưới ảnh thu nhỏ trang đầu của từng mẫu (HEdu dịch sẵn một trang mẫu); bấm để chọn **mẫu mặc định**.
   - **Thêm mẫu…**: chọn tệp `theme-*.tex`; HEdu kiểm đủ các lệnh bắt buộc và dịch thử một trang trước khi nhận.
   - **Thông tin mặc định**: tên giáo viên (in ở đầu/chân trang), năm học mặc định; Sở/Trường/Tổ như hiện có.
2. **Màn biên tập đề**
   - Thanh công cụ có ô **Mẫu ▾** (mặc định = mẫu chung) để đổi nhanh cho riêng đề này.
   - Ô **Bản ▾** có: **Đề (màu)** · **Đề in (trắng đen)** · **Lời giải**, tương ứng `mau` / `in` / `loigiai` của HyMath. Mỗi bản một tab PDF.
   - Trình dịch tự chuyển sang **XeLaTeX** khi dùng mẫu HyMath; pdfLaTeX vẫn giữ cho đề cũ có sẵn `\documentclass`.
3. **Tệp đề (dữ liệu)** giữ đúng chuẩn HyMath:
   - đầu đề `\TieuDeDeSo{Trường}{Tên kỳ thi}{Môn - Lớp}{Thời gian}{Mã đề}` hoặc `\TieuDeDeThi{…6 tham số…}`;
   - tiêu đề phần `\textbf{PHẦN I. …}` (mẫu tự tô) hoặc `\ExamPart{…}{…}`;
   - câu hỏi `\begin{ex}…\end{ex}`.
4. **Bốn thành phần thầy/cô gửi ảnh** ánh xạ vào mẫu như sau:

| Thành phần | Lệnh trong mẫu | Lấy chữ từ |
|---|---|---|
| Đầu trang ("GVBS: …" trái, tên đề phải) | `\HyThemePageStyle` (`\fancyhead`) | Tên giáo viên (Cài đặt), Tên kỳ thi (`\TieuDeDeSo` #2) |
| Chân trang (đường kẻ + "Trang x/y") | `\HyThemePageStyle` (`\fancyfoot`) | số trang tự động |
| Khung giới thiệu (tên kỳ thi, môn, năm học, thời gian, mã đề, họ tên/SBD, nguồn đề) | `\HyThemeTitle` + `\StudentInfo` | `\TieuDeDeSo` + Năm học; **Nguồn đề**: lệnh mới tuỳ chọn `\NguonDe{…}` trong tệp dữ liệu |
| Tiêu đề từng phần (khung nền nhạt, chữ xanh đậm) | `\HyThemePart` | dòng `PHẦN I. …` |

   Bộ ảnh vừa gửi sẽ thành **mẫu thứ 9** ("Xanh nhạt").

## 4. Liên quan bước chuẩn hoá (chủ dự án nêu 02/11)
Màn Xử lí TeX sẽ có bước **chuẩn hoá đề**: xác định số phần, số câu mỗi phần, tự sửa tiêu đề phần cho khớp số câu ("trả lời từ câu 1 đến câu N"), bốc câu vào đúng phần, đặt đầu đề `\TieuDeDeSo` ⇒ "Nạp vào Thư viện đề" luôn biên dịch được. Tạo đề từ Ngân hàng cũng xuất theo cùng chuẩn này. (Làm sau giai đoạn 1.)

## 5. Dữ liệu và tương thích
- Không đổi schema ngân hàng, ID, nội dung câu.
- Tệp đề không bị sửa; phần ghép chỉ ở thư mục build.
- Đề cũ có sẵn `\documentclass` dịch như cũ.
- Chọn mẫu **theo từng đề** cần lưu thêm một trường tuỳ chọn trong thông tin đề (`manifest.json`, trường mới, bản cũ của app bỏ qua) ⇒ cần duyệt.

## 6. Rủi ro
- XeLaTeX chậm hơn pdfLaTeX (lần đầu nạp phông ~vài giây). Máy thiếu gói (`fontspec`, `unicode-math`, `tcolorbox`): HEdu báo thiếu gói như hiện nay.
- Kho mã HEdu là **công khai**: lõi + 8 mẫu của thầy/cô sẽ nằm công khai trong kho → cần thầy/cô đồng ý.
- Mẫu thầy/cô tự thêm có thể sai: HEdu dịch thử một trang trước khi nhận, lỗi thì không nhận.

## 7. Chia giai đoạn
1. **GĐ1** — lõi HyMath + 8 mẫu vào app; tự ghép khi dịch tệp dữ liệu (sửa PR đang mở sang lõi HyMath); Bản màu / in / lời giải; XeLaTeX tự chọn; chọn mẫu mặc định ở Cài đặt (danh sách tên, chưa có ảnh).
2. **GĐ2** — ảnh thu nhỏ mẫu; thêm mẫu của thầy/cô; chọn mẫu theo từng đề; mẫu thứ 9 theo ảnh.
3. **GĐ3** — bước chuẩn hoá ở Xử lí TeX; Tạo đề xuất theo chuẩn HyMath.

## 8. Tiêu chí nghiệm thu GĐ1
- [ ] Mở `toan10_gk1_taythanh_2627` trong Thư viện đề, bấm Biên dịch ⇒ ra PDF theo mẫu mặc định, không sửa tệp đề.
- [ ] Đổi mẫu ở Cài đặt ⇒ dịch lại ra mẫu mới.
- [ ] Bản Đề (màu), Đề in, Lời giải đều ra PDF; bản Đề không lộ lời giải.
- [ ] Đề cũ có `\documentclass` vẫn dịch như trước.
- [ ] Máy thiếu XeLaTeX/gói: báo rõ, không treo.

## 9. Cần chủ dự án chốt
1. Dùng HyMath làm lõi mẫu in và đưa lõi + 8 mẫu vào kho công khai? (đề xuất: có)
2. Đề dùng mẫu HyMath biên dịch bằng XeLaTeX? (đề xuất: có, tự chọn)
3. Lưu "mẫu riêng của đề" trong thông tin đề (thêm một trường)? (đề xuất: có, ở GĐ2)
4. Ba bản Đề màu / Đề in / Lời giải đã đủ chưa? (đề xuất: đủ cho GĐ1)
