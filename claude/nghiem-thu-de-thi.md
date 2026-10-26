# Nghiệm thu Ngân hàng đề thi LaTeX (E1–E6) — danh sách cho chủ dự án

Trạng thái: **chờ nghiệm thu trên máy Windows thật**. Chưa phát hành. Thiết kế: `claude/thiet-ke-de-thi.md`.
Chạy thử bằng bản riêng (không đụng ngân hàng thật):

```bash
npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'
```

Dữ liệu thử nằm ở `%APPDATA%\vn.hedu.app.thu` (ban đầu trống). Dùng đề GIẢ, không dùng đề thật khi thử.

## Các PR (đã gộp vào `main` theo đúng thứ tự, 26/10/2026; CHƯA phát hành)
| PR | Nội dung |
|---|---|
| #112 | Thiết kế E0 (đã gộp) |
| #113 | E1 Thư viện đề: nhập .tex/thư mục (đã gộp) |
| #116 | E2a Biên dịch toàn dự án, Job Object (đã gộp) |
| #118 | E2b Xem PDF (pdf.js offline) (đã gộp) |
| #121 | E3 Biên tập: cây tệp, nhiều tab, lưu an toàn (đã gộp) |
| #122 | E4 Thư mục ảo, Thùng rác đề, sao lưu/khôi phục, chốt đề, gói (đã gộp) |
| #124 | E5 Đề/Lời giải, nguồn UID, lưu từ Ngân hàng (đã gộp) |
| #125 | E6 Kiểm thử hiệu năng + tài liệu nghiệm thu (PR này) |

Các PR đã xếp chồng và đã gộp lần lượt; `main` đã có toàn bộ E0–E5, PR này thêm tài liệu và kiểm thử E6.

## Việc kiểm trên máy Windows thật (tick từng dòng)
### Nhập và thư viện
- [ ] Nhập một `de.tex` đơn: mở thư mục thư viện (nút **Hiện trong Explorer**) thấy tệp giống hệt; tệp gốc ngoài HEdu không đổi.
- [ ] Nhập thư mục có `main.tex`, `cauhoi.tex`, `khaibaochung.tex`, ảnh PNG/JPG/PDF, `.sty`, `\input` nhiều cấp: đủ tệp, đúng cây thư mục.
- [ ] Thư mục có nhiều tệp có `\documentclass`: hỏi chọn tệp chính. Tệp `.tex` không có `\documentclass`: vẫn nhập, mở, sửa được.
- [ ] Đường dẫn/tên tệp tiếng Việt có dấu và dấu cách nhập được. Thư mục có liên kết/junction: báo "không chép", không đi theo.
- [ ] Tắt hẳn HEdu mở lại: danh sách, cây tệp, thông tin còn nguyên.
- [ ] Bộ lọc: thư mục ảo (Lớp 12 › Học kỳ 1), Lớp, Năm học, Loại đề, Trạng thái, Nhãn; tìm theo tên/lớp/nhãn.
- [ ] **Sao chép** (phiên bản mới), **Xuất gói…** rồi **Nhập gói** (đề về lại đủ thông tin; gói bị sửa tay một tệp thì bị từ chối).
- [ ] **Thùng rác đề**: chuyển vào, khôi phục, xoá vĩnh viễn (hai bước).
- [ ] **Sao lưu thư viện**: sao lưu, Kiểm tra, Khôi phục thành đề mới (đề hiện có không bị ghi đè).

### Biên tập
- [ ] Mở tệp chính; gõ → "Chưa lưu"; Ctrl+S → "Đã lưu"; Ctrl+Z; Ctrl+F tìm; Ctrl+H thay; Alt+↑/↓ di chuyển dòng.
- [ ] Mở rồi lưu KHÔNG sửa: tệp trên đĩa không đổi (so sánh bằng công cụ khác, nếu muốn).
- [ ] Sửa tệp bằng ứng dụng khác (Notepad) khi đang mở trong HEdu: quay lại HEdu thấy cảnh báo (tab đang sửa) hoặc tự nạp lại (tab chưa sửa); **không bị ghi đè**.
- [ ] Tệp CRLF / có BOM: sửa một dòng, lưu: BOM và CRLF vẫn còn. Tệp không phải UTF-8 hoặc trộn CRLF/LF: chỉ xem, có báo rõ lý do.
- [ ] Đóng khi còn tệp chưa lưu: hỏi; mở lại đề: hỏi khôi phục bản nháp.
- [ ] Mở nhiều tab (20 tệp), thu cửa sổ hẹp (<1000 px): chuyển thành tab Tệp | TeX | PDF | Log.
- [ ] Đề **đã chốt**: không sửa trực tiếp; **Sao chép** để sửa tiếp.

### Biên dịch và PDF
- [ ] **Biên dịch PDF** với pdfLaTeX / XeLaTeX / LuaLaTeX; nhật ký lỗi theo tệp/dòng, bấm lỗi nhảy đúng dòng trong tab.
- [ ] Cố ý gây lỗi: PDF cũ vẫn xem được, có nhãn BẢN CŨ; không có PDF "thành công giả".
- [ ] Nút **Dừng** giữa lúc dịch: mở Trình quản lý tác vụ, không còn `pdflatex.exe`/`xelatex.exe`/`lualatex.exe`/`ping.exe` chạy ngầm.
- [ ] Xem PDF: cuộn nhiều trang, phóng to/thu nhỏ, vừa chiều rộng/trang, đi tới trang, tìm chữ, **Lưu bản sao…**, **Mở bằng ứng dụng khác**.
- [ ] Đề có `\immini`, `\def` trong tikz, `\newcommand` có tham số, `tkz-tab`, `tikz-3dplot`, hình PNG/PDF, đề 100+ trang: biên dịch được; ghi thời gian.
- [ ] Máy tạm gỡ/đổi đường dẫn TeX Live: HEdu báo "chưa có TeX Live", không treo.

### Đề và Lời giải
- [ ] Đề có đúng một `\usepackage[...]{ex_test}`: chọn **Đề (không lời giải)** và **Lời giải**, biên dịch cả hai: PDF Đề không có lời giải, PDF Lời giải có. Tên gợi ý khi lưu: `de_...pdf`, `dap-an_...pdf`.
- [ ] Đề không nhận diện chắc (không có `ex_test`, hoặc có hai chỗ nạp): hai bản Đề/Lời giải bị tắt kèm lý do; chỉ còn "Nguyên văn (chưa xác định)" có nhãn cảnh báo.
- [ ] Tệp nguồn của đề không bị đổi sau khi biên dịch hai bản (xem dòng "HEdu đổi N dòng CHỈ trong thư mục build").
- [ ] Trong Ngân hàng: chọn vài câu → Xuất .tex → **Lưu vào Thư viện đề** → mở ở mục Đề thi; câu giống từng chữ với ngân hàng.
- [ ] **+ Câu từ Ngân hàng** chèn tại con trỏ; Lưu; **Nguồn câu hỏi** hiện "Còn nguyên văn". Sửa câu đó trong Ngân hàng rồi mở lại: hiện "Ngân hàng đã đổi", **So sánh với câu gốc**, **Thay bằng bản hiện tại** (Ctrl+Z hoàn tác được).
- [ ] **Chốt đề** chỉ được khi đã có PDF khớp nội dung; sau đó không bỏ chốt được.

## Kết quả kiểm tự động (chạy tại máy phát triển, không thay cho nghiệm thu)
- `cargo test --lib --locked`: toàn bộ qua; `npm test`, `npm run build`, typecheck qua; CI `giao-dien` + `windows` xanh trên từng PR (xem trang PR).
- Hiệu năng đo được: thư viện 1.500 đề dựng chỉ mục 0,45 giây, đọc danh sách từ chỉ mục 18 ms; tệp 12 MB / 152.000 dòng mở 0,34 giây, lưu không đổi 0,29 giây và giữ nguyên byte; TikZ nặng (tikz-3dplot + 1.500 đoạn + tkz-tab) biên dịch 2,6 giây (TeX Live 2026); huỷ/hết giờ giết cả tiến trình cháu (kiểm bằng tiến trình thật).
- ex_test thật: bản Đề không chạy nội dung `\loigiai`, bản Lời giải có (`cargo test ... tex_live_that -- --ignored`, đặt `HEDU_TEX_BIN`).

## Giới hạn đã biết (nói thẳng trong ghi chú phát hành)
- Màn **Tạo đề** (ma trận/trộn mã) vẫn tắt bởi `FEATURES.exam=false`; lưu đề vào thư viện làm từ hộp Xuất của Ngân hàng. Đường trộn mã (`examToTex`) dựng lại câu từ bộ phân tích, nên CHƯA dùng để lưu đề; nếu bật lại phải kiểm cấu trúc trước.
- Chỉ nhận diện `ex_test` qua `\usepackage` đang hoạt động; cách khác thì chỉ có bản nguyên văn.
- Chưa làm: đổi tên/xoá/di chuyển TỪNG tệp trong cây tệp của dự án; BibTeX/Biber/makeindex; xuất Word; tô sáng chữ tìm thấy trong PDF; in trực tiếp (dùng "Mở bằng ứng dụng khác").
- Một khe hẹp còn lại: khi lưu, bước đổi tên tệp tạm thành tệp đích đi theo đường dẫn; thư mục cha bị hoán thành junction đúng khoảnh khắc đó (người khác có quyền ghi trong thư viện) có thể làm thay một tệp ở nơi khác. Mọi bước đọc và việc mở tệp tạm đã kiểm bằng chính tay cầm.
- Job Object gán sau khi tiến trình sinh ra (khoảng cực ngắn); máy không cho tạo job thì chỉ dừng được tiến trình chính (có cờ báo).

## Nháp ghi chú phát hành (chỉ để chủ kênh phát hành dùng; chưa ghi vào `GHI-CHU-PHAT-HANH.md`)
**Ngân hàng đề thi LaTeX (beta):** mục mới **Đề thi**: nhập đề `.tex`/thư mục dự án vào thư viện của HEdu (tệp gốc không bị sửa), thư mục ảo và bộ lọc, **Biên tập** nhiều tệp (CodeMirror, lưu an toàn, cảnh báo khi tệp đổi ngoài HEdu, bản nháp), **biên dịch PDF** bằng TeX Live (pdfLaTeX/XeLaTeX/LuaLaTeX, huỷ được cả cây tiến trình, giữ PDF tốt gần nhất), **xem PDF** ngay trong app, **PDF Đề và PDF Lời giải riêng** từ cùng một nguồn khi nhận diện chắc `ex_test`, chép câu **nguyên văn** từ Ngân hàng kèm nguồn UID, **Thùng rác đề** và **sao lưu/khôi phục thư viện đề** riêng, chốt đề, xuất/nhập gói. Không đổi cấu trúc dữ liệu ngân hàng câu hỏi (schema 3), ID, UID. Màn Tạo đề (trộn mã) vẫn tạm tắt. Sao lưu của Ngân hàng câu hỏi KHÔNG bao gồm thư viện đề: dùng "Sao lưu thư viện" trong mục Đề thi.
