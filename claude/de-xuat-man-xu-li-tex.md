# Đề xuất: màn "Xử lí TeX" cho HEdu (để GPT đọc và góp ý)

Người viết: Claude Code, 01/11/2026. Trạng thái: **đề xuất, CHƯA viết mã.** Chủ dự án đã duyệt hướng **Đợt 1** (01/11/2026). Tài liệu này để GPT rà và góp ý trước khi Claude lập kế hoạch chi tiết và viết mã.

## 1. Yêu cầu của chủ dự án (nguyên ý)

- Màn "Xử lí TeX" trong HEdu: **đã tích hợp sẵn đủ gói khai báo**. Giáo viên chỉ nhập nội dung cơ bản (như dữ liệu một đề thi: các khối `\begin{ex}…\end{ex}`) là **biên dịch được**.
- Tham khảo cách MathHub làm (bản cài trên máy chủ dự án, `F:\Mathhub`) để làm **tốt hơn**.
- Chủ dự án là giáo viên Toán, không viết code; muốn bớt thao tác tay.

## 2. MathHub đang làm gì ở màn "Xử lí TeX" (khảo sát 01/11/2026)

Claude chỉ đọc bản cài (ứng dụng Electron: React + trình soạn Monaco + SQLite + KaTeX + pandoc), không sửa gì, và **không sao chép mã** của MathHub; dưới đây chỉ là mô tả chức năng.

| Nhóm | MathHub có |
|---|---|
| Bố cục | Một khung soạn lớn bên trái, khung xem trước bên phải kéo rộng/hẹp được; thanh trạng thái "N câu · M có mã hợp lệ". |
| Khai báo | Gắn sẵn (khaibaochung + ex_test + các .sty đi kèm app); người dùng chỉ gõ nội dung. |
| Chuẩn hóa | Một nút chạy chuỗi ~17 luật viết lại **cả văn bản tại chỗ** (bỏ ký tự ẩn, `\frac`→`\dfrac`, `\int`→`\displaystyle\int`, `cases`→`\heva`, bọc số trong `\choice`, thụt lề…). Có Hoàn tác của trình soạn, **không có xem trước thay đổi**. |
| Phân tích cấu trúc | Đọc từng khối `ex`, báo Đạt / Lỗi / Tổng, danh sách câu lỗi kèm lý do, bấm để nhảy tới dòng. |
| Sắp xếp theo cấu trúc | Xếp theo ID: lớp → phân môn → chương → bài → dạng → loại câu → mức độ; chèn dòng chú thích tiêu đề "LỚP 10 · Đại số", tên chương, tên bài; câu không mã dồn cuối. |
| Gán ID | Chọn nút trong cây để chèn `%[mã]`; "Gán ID tự động" tìm câu giống bằng vector nhúng (cần khoá API). |
| Macro / công cụ | Chèn hình TikZ dựng sẵn (điểm, đường tròn, cung, tam giác, đa giác, ký hiệu, đồ thị, khối đa diện, mặt tròn xoay); bộ công cụ vẽ; **~39 công cụ sửa lỗi** chia 3 nhóm (sửa lỗi thường gặp; sửa lỗi công thức: dấu `$`, dấu phẩy/chấm phẩy, `\left\right` dư, `^0`→`^\circ`, `$$`→`\[…\]`, tách hàng nghìn…; đổi môi trường: `tasks`/`enumerate`/`itemchoice`…), áp cho **vùng chọn hoặc cả văn bản**. |
| Bảng biến thiên / đồ thị | BBT từ hệ số, BBT dựng bằng chuột, vẽ đồ thị → sinh mã tkzTab/TikZ. |
| Xem trước | 3 kiểu: **Từng khối** (mỗi câu thành ảnh SVG), **Cả đề** (gộp thành đề rồi ra PDF), **Tài liệu** (biên dịch nguyên văn có chương, lý thuyết). Biên dịch pdflatex chạy 2 lượt, chờ tối đa 90 giây. |
| Lỗi biên dịch | Chỉ báo **lỗi đầu tiên** trong log, trừ số dòng phần đầu tệp để ra dòng trong nội dung. |
| Xuất | Bộ .tex tự biên dịch (kèm khai báo + .sty), Word .docx (công thức MathType), hoặc chuyển các câu sang màn Xuất đề. |

## 3. Chỗ HEdu có thể làm tốt hơn

1. **Không biến đổi âm thầm** (AGENTS.md mục 4.6): mọi sửa tự động phải **xem trước thay đổi** (trước/sau), chọn luật nào áp dụng, rồi mới ghi; có Hoàn tác.
2. **Báo lỗi theo từng câu**, không chỉ lỗi đầu tiên: HEdu đã có đọc log nhiều lỗi (`examcompile.rs::parse_log`), phân loại lỗi, gợi ý gói thiếu (`missingpkg.ts`), báo lệch ngoặc có dòng/cột (`srcdiag.ts`).
3. **Liên thông**: MathHub đứng riêng; HEdu nối được với Ngân hàng (nhập có kiểm tra trùng + ID chặt), Thư viện đề (dự án có PDF), Tạo đề, Gán ID nhờ Claude.
4. **Khai báo minh bạch**: cho xem khai báo đang dùng và thêm gói riêng, thay vì một hộp đen.

## 4. HEdu đã có gì để dựng màn này (không làm lại)

- Khai báo đề: `src/lib/hedusty.ts` (`hedu.sty` v1.0, `khaibaochung.tex` mỏng, `hedu-khaibao.tex`, `hedu-goithem.tex` tự sinh từ câu hỏi qua `collectNeeds`).
- Biên dịch: Rust `examcompile.rs` (chọn engine, chạy nhiều lượt, `parse_log` ra danh sách lỗi có tệp/dòng, hủy được, chế độ Đề/Lời giải qua `examprofile.rs`), `proc.rs` (`run_job`, Job Object để hủy hẳn tiến trình con trên Windows), `tikz.rs` (dịch hình có bộ đệm).
- Xem trước nhanh không cần TeX: `render.ts` + `textflow.ts` (KaTeX + dựng cấu trúc), "Xem chuẩn" bằng TeX Live + bộ đệm (`xemchuan.ts`, `xemchuancache.ts`).
- Trình soạn: `components/CodeEditor.tsx` (CodeMirror 6), `PdfViewer.tsx`.
- Đọc câu: `extest.ts` (`parseExTest`, chuẩn hoá khi nạp chỉ bốc khối hoàn chỉnh), `idtex.ts`/`idsync.ts` (đọc/ghi `%[ID]` chặt), `srcdiag.ts`.
- Nhập ngân hàng: màn Nhập liệu (`screens/Extra.tsx`, `importplan.ts`, `importbatch.ts`) có kiểm tra trùng, phân loại ID, báo chỗ bỏ.

## 5. Đề xuất chức năng (3 đợt)

### Đợt 1 — Bàn nháp biên dịch được (ĐÃ DUYỆT hướng, 01/11/2026)

- **Mục riêng trên thanh bên** "Xử lí TeX" (Claude đề xuất mục riêng vì Nhập liệu thiên về nhập hàng loạt vào kho; chủ dự án duyệt Đợt 1 theo đề xuất).
- **Khung soạn** (CodeMirror) + **khung xem trước** kéo rộng/hẹp; nội dung tự lưu theo máy (bản nháp), không vào ngân hàng.
- **Khai báo ẩn**: HEdu tự bọc nội dung thành tài liệu đầy đủ: `\documentclass…` + `\input{khaibaochung}` (→ `hedu.sty` → `hedu-khaibao.tex` + `hedu-goithem.tex` tự sinh từ nội dung) + `\begin{document}` + nội dung + `\end{document}`. Dòng "Khai báo đang dùng" bấm mở xem; nút thêm gói riêng khi biên dịch báo thiếu (dùng lại `missingpkg.ts`).
- **Xem trước hai tầng**: (a) **nhanh** — dựng ngay khi gõ bằng `render.ts` (không cần TeX), theo từng câu; (b) **chuẩn** — biên dịch bằng TeX Live ra PDF (bấm nút, hoặc tự chạy khi ngừng gõ vài giây — xem câu hỏi Q3), hiện trong `PdfViewer`.
- **Lỗi theo từng câu**: khi ghép tài liệu, ghi lại mỗi khối `ex` nằm từ dòng nào tới dòng nào trong tệp ghép, để đổi dòng lỗi trong log → "Câu k, dòng d của nội dung". Danh sách lỗi (không chỉ lỗi đầu), bấm nhảy tới dòng trong khung soạn; lời giải thích tiếng Việt (dùng lại phân loại lỗi có sẵn).
- **Thanh trạng thái**: số câu, số câu có ID hợp lệ (đọc chặt bằng `idsync`), số câu lỗi cú pháp nhanh (`srcdiag`), trạng thái TeX Live.
- Chế độ Đề / Lời giải (nếu nhận diện chắc cách bật lời giải của ex_test, như Thư viện đề).

### Đợt 2 — Chỉnh sửa an toàn

- **Chuẩn hóa có xem trước**: chạy các luật trên bản sao, hiện danh sách thay đổi (trước → sau, theo câu), giáo viên bỏ tick luật/câu không muốn, bấm "Áp dụng" mới ghi; có Hoàn tác. Tối thiểu dùng lại phần chuẩn hoá khi nạp đã có (bỏ BOM, CRLF→LF, khoảng trắng cuối dòng, bỏ khối comment/dở); luật "làm đẹp công thức" kiểu `\frac`→`\dfrac` phải **tắt mặc định** và để giáo viên tự chọn (đổi bản in).
- **Công cụ sửa lỗi theo nhóm** (dấu `$`, dấu phẩy thập phân `{,}`, `\left\right` dư, `^0`→`^\circ`, `$$`→`\[…\]`, đổi môi trường danh sách…), áp cho vùng chọn hoặc cả văn bản, cũng qua xem trước thay đổi.
- **Kiểm cấu trúc**: thiếu `\end{ex}`, thiếu đáp án/`\True`, thiếu lời giải, ngoặc lệch, ID sai/thiếu Dạng → danh sách bấm được.
- **Sắp xếp theo ID** (lớp → chương → bài → dạng → loại → mức) có dòng chú thích tiêu đề; câu "Chưa có ID" dồn cuối. Chỉ đổi thứ tự khối và thêm dòng chú thích, không sửa nội dung câu.

### Đợt 3 — Nối với phần còn lại

- **Đưa vào Ngân hàng**: chuyển nội dung sang luồng Nhập liệu có sẵn (kiểm tra trùng, phân loại ID, xác nhận) — không có đường nhập thứ hai.
- **Lưu thành đề trong Thư viện** (dự án có `main.tex` + khai báo) và **Tạo đề từ các câu này**.
- **Gán ID nhờ Claude** ngay tại màn (xuất lô từ các khối, áp dụng đề xuất vào **văn bản** chứ không vào kho).
- Công cụ chèn hình / bảng biến thiên / đồ thị (lớn nhất, làm sau cùng, cần phiếu riêng).

## 6. Phương án kỹ thuật cho Đợt 1 (cần GPT góp ý)

Hai cách biên dịch bàn nháp:

- **A. Lệnh Rust riêng `tex_scratch_compile` (Claude đề xuất).** Ghi tệp ghép vào thư mục nháp của app (trong `%APPDATA%\…\scratch-tex\`, không đụng ngân hàng hay Thư viện), dùng lại `engine_command`, `run_job`, `parse_log`, hủy được; trả PDF + danh sách lỗi. Ưu: không làm rối Thư viện, không cần manifest/băm tệp. Nhược: thêm một lệnh Rust (phải `cargo test --lib` + CI Windows).
- **B. Dự án nháp ẩn trong Thư viện đề**, gọi `exam_compile` sẵn có. Ưu: dùng lại toàn bộ (PDF tốt gần nhất, chế độ Đề/Lời giải). Nhược: phải thêm cờ "ẩn" vào manifest/danh sách Thư viện (đụng dữ liệu Thư viện), ghi nhiều tệp mỗi lần biên dịch.

Ánh xạ lỗi theo câu: khi ghép, lưu bảng `[câu k: dòng bắt đầu, dòng kết thúc]` theo dòng của tệp ghép; lỗi ở `main.tex` dòng L → câu có khoảng chứa L, dòng trong nội dung = L − số dòng phần đầu. Lỗi nằm trong tệp khai báo → báo "lỗi ở khai báo" (không nhảy).

Không đổi schema ngân hàng, ID6, UID; không ghi vào ngân hàng ở Đợt 1.

## 7. Rủi ro

- Biên dịch chậm (TikZ nhiều, 2 lượt) → cần hủy được, không chặn giao diện, không chạy chồng; tự biên dịch khi ngừng gõ có thể tốn máy.
- Tiến trình TeX treo trên Windows (Issue #1) → dùng `run_job` (Job Object) như Thư viện.
- Nội dung dán từ nguồn ngoài có `\input`, `\write18`, đường dẫn tuyệt đối → biên dịch không bật shell-escape; chặn/ cảnh báo `\input`/`\include` ra ngoài thư mục nháp.
- Bản nháp lưu theo máy có thể lớn → giới hạn kích thước, cảnh báo.
- Chuẩn hóa (Đợt 2) làm đổi bản in → bắt buộc xem trước, luật làm đẹp tắt mặc định.

## 8. Tiêu chí nghiệm thu Đợt 1 (nháp)

- [ ] Dán 1–200 khối `\begin{ex}…\end{ex}` (có TikZ, tkz-tab, `\immini`) → bấm biên dịch ra PDF đúng như khi xuất đề bằng HEdu.
- [ ] Không cần gõ `\documentclass`, `\usepackage`, `\begin{document}`; gói lạ được báo kèm nút thêm.
- [ ] Lỗi hiện **theo câu và dòng của nội dung**, bấm nhảy đúng chỗ; lỗi ở khai báo báo riêng.
- [ ] Hủy biên dịch được; máy thiếu TeX Live báo rõ, xem trước nhanh vẫn chạy.
- [ ] Không ghi gì vào ngân hàng hay Thư viện; tắt app mở lại còn bản nháp.
- [ ] `npm test`, `npm run build`, `cargo test --lib`, CI Windows xanh; chạy thử app với `vn.hedu.app.thu`.

## 9. Câu hỏi cho GPT / chủ dự án

- **Q1.** Phương án biên dịch A (lệnh riêng) hay B (dự án ẩn trong Thư viện)? Claude đề xuất A.
- **Q2.** Nội dung bàn nháp: chỉ các khối `ex`, hay cho cả "tài liệu" (chương, lý thuyết, ví dụ — như chế độ "Tài liệu" của MathHub)? Claude đề xuất Đợt 1 chỉ khối `ex` + chữ giữa các khối, chế độ Tài liệu để sau.
- **Q3.** Biên dịch chuẩn tự chạy khi ngừng gõ (vd sau 3 giây) hay chỉ khi bấm nút? Claude đề xuất **chỉ khi bấm** (Ctrl+S / nút), xem trước nhanh vẫn chạy ngay.
- **Q4.** Luật chuẩn hóa nào của MathHub nên có ở HEdu, luật nào **không** nên (vì đổi bản in hoặc sai nghĩa, vd đổi dấu phẩy toạ độ thành `{,}` — MathHub đã tự tắt luật này)?
- **Q5.** Bố cục: hai khung trái/phải như MathHub, hay theo 3 chế độ "Mã / Mã + Xem trước / Xem trước" như trình sửa câu hiện có của HEdu (để giao diện thống nhất)? Claude đề xuất dùng lại 3 chế độ của HEdu.
- **Q6.** Có cần xem trước "Từng khối" (mỗi câu một ảnh, như MathHub) ở Đợt 1 không, hay PDF cả bàn nháp là đủ?

Góp ý xin ghi vào PR của tài liệu này hoặc gửi chủ dự án chuyển lại cho Claude.
