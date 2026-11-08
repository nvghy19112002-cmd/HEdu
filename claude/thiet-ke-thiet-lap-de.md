# [M] Hộp thoại "Thiết lập đề" — bản thiết kế chờ duyệt

Trạng thái: **chưa viết mã**, chờ chủ dự án duyệt các câu hỏi ở mục 7.
Nguồn yêu cầu: góp ý của chủ dự án ngày 07/11/2026 (sau beta.62).

## 1. Vấn đề
Nhập một đề `.tex` vào Thư viện xong, giáo viên phải tự gõ khung tiêu đề và lời mở đầu từng phần
("PHẦN I. Câu trắc nghiệm…", "Thí sinh trả lời từ câu 1 đến câu 12…"), tự đếm số câu, tự đặt
`\setcounter{ex}{0}` cho đúng chỗ. Đề lấy từ file OCR thô thì câu các loại thường lẫn lộn, chưa có tiêu đề phần.

## 2. Kết quả mong muốn (góc nhìn giáo viên)
Nhập đề → hiện hộp thoại **Thiết lập đề**:
1. Khung tiêu đề điền sẵn (Sở, Trường, Tổ từ *Cài đặt › Đề thi › Thông tin mặc định*), giáo viên chỉ sửa Kỳ thi, Môn, Thời gian…
2. Máy **tự đếm câu theo từng phần** dựa vào lệnh trong câu, hiện bảng: Phần · Loại · Số câu · Câu nào.
3. Lời mở đầu mỗi phần **tự điền đúng số câu**, sửa được ngay trong ô.
4. Bấm **OK** → máy chèn đoạn mở đầu vào đúng trước câu đầu tiên của mỗi phần. Có **xem trước** và **Hoàn tác**.

Hộp thoại cũng mở lại được bằng nút **Thiết lập đề** trong màn Biên tập đề (khi đổi số câu, thêm phần…).

## 3. Cách nhận diện (đã chốt với chủ dự án)
Mỗi khối `\begin{ex}…\end{ex}` được xếp phần theo lệnh có trong câu (bỏ qua phần lời giải `\loigiai`):

| Lệnh trong câu | Phần | Loại |
|---|---|---|
| `\choiceTF` | II | Đúng/Sai |
| `\choice` | I | Trắc nghiệm 4 phương án |
| `\shortans` | III | Trả lời ngắn |
| không có lệnh nào | IV | Tự luận |

- Câu trả lời ngắn mà **chưa có `\shortans`** sẽ bị xếp vào Tự luận (chủ dự án đã chốt). Trong bảng, giáo viên đổi phần của từng câu bằng ô chọn.
- Dùng lại bộ đọc câu sẵn có `extest.ts` (đã hiểu `\choiceTF`, `\choice`, `\shortans`, `\True`), không viết bộ đọc mới.
- Câu bị chú thích (`%`) hoặc khối thiếu `\end{ex}`: không đếm, báo dòng.

**Đề đã có tiêu đề phần.** Máy nhận các dạng: `\caulc` `\cauds` `\caukq` `\cautl` (khaibaochung), dòng chứa
`PHẦN I/II/III/IV` (in hoa hoặc thường, có `\textbf` hay không), `\section`/`\subsection` có chữ "Phần".
Khi đó hộp thoại hỏi: **Cập nhật** (thay đúng các đoạn đó bằng đoạn mới) hoặc **Giữ nguyên** (chỉ thêm phần còn thiếu).

**Câu xen kẽ** (ví dụ một câu Tự luận nằm giữa Phần I): báo rõ câu nào, hai lựa chọn — *Sắp lại theo phần*
(chuyển nguyên khối câu, không sửa chữ nào bên trong) hoặc *Giữ thứ tự, chỉ chèn tiêu đề* (khi đó không chèn được, phải sửa tay).

## 4. Đoạn mở đầu sẽ chèn
Mẫu Phần I theo đúng mẫu chủ dự án gửi; Phần II–IV Claude soạn theo cấu trúc đề THPT từ 2025:

```latex
\noindent\textbf{PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.} \textit{Thí sinh trả lời từ câu 1 đến câu 12. Mỗi câu hỏi thí sinh chỉ chọn một phương án.}\par
\vspace{6pt}
\setcounter{ex}{0}

\noindent\textbf{PHẦN II. Câu trắc nghiệm đúng sai.} \textit{Thí sinh trả lời từ câu 1 đến câu 4. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.}\par
\vspace{6pt}
\setcounter{ex}{0}

\noindent\textbf{PHẦN III. Câu trắc nghiệm trả lời ngắn.} \textit{Thí sinh trả lời từ câu 1 đến câu 6.}\par
\vspace{6pt}
\setcounter{ex}{0}

\noindent\textbf{PHẦN IV. Tự luận.} \textit{Thí sinh trình bày lời giải chi tiết từ câu 1 đến câu 3.}\par
\vspace{6pt}
\setcounter{ex}{0}
```

- Số câu (12, 4, 6, 3) máy tự điền theo đếm thực tế. Đề chỉ 1 câu thì ghi "Thí sinh trả lời câu 1."
- Số La Mã đánh **liên tục theo các phần có mặt** (đề không có Đúng/Sai thì Trả lời ngắn thành PHẦN II) — cần chủ dự án chốt (Q4).
- Mỗi đoạn có dòng đánh dấu `% HEdu: phan-1` … để lần sau mở lại hộp thoại nhận ra và thay đúng chỗ, không chèn trùng.
- Lời văn từng phần sửa được trong hộp thoại; lời đã sửa lưu theo máy để lần sau dùng lại (như Thông tin mặc định).

## 5. Khung tiêu đề
Ô: Sở/Phòng · Trường · Tổ · Kỳ thi (tên đề) · Môn · Thời gian (phút) · Ghi chú dưới thời gian · Mã đề (tuỳ chọn).
Điền sẵn từ Thông tin mặc định + tên đề lúc nhập. Cách ghi vào tệp xem Q2.

## 6. An toàn dữ liệu và phạm vi
- **Không sửa chữ nào bên trong câu.** Chỉ chèn/thay các đoạn tiêu đề phần và khung tiêu đề; *Sắp lại theo phần* chỉ chuyển nguyên khối.
- Ghi bằng cách ghi tệp sẵn có (atomic + `.bak`); trước khi ghi lưu một phiên bản vào lịch sử phiên bản của đề → **Hoàn tác** một bấm.
- Giữ nguyên kiểu xuống dòng (CRLF/LF) và mã hoá UTF-8 của tệp.
- Đề nhiều tệp: sửa tệp chứa nhiều khối `ex` nhất (thường là tệp nội dung), hiện tên tệp trong hộp thoại, đổi được.
- Không đổi schema, ID, ngân hàng câu hỏi; không cần Rust mới (dùng lệnh đọc/ghi tệp đề đã có).
- Mã: `src/lib/examsetup.ts` (thuần: nhận diện → kế hoạch → áp dụng, có test) + `src/components/ExamSetupDialog.tsx`; gắn vào hộp "Nhập đề vào thư viện" (`ExamLibrary.tsx`) và thanh công cụ `ExamWorkspace.tsx`. Ước 1 PR.
- Test bắt buộc: đề chuẩn 12/4/6/0; đề xen kẽ; đề đã có `\caulc…`; đề có `PHẦN I` gõ tay; câu bị chú thích; `\immini`, TikZ có `\def`, `\newcommand` có tham số trong câu (không được đụng); CRLF; chạy lại hộp thoại lần hai không chèn trùng.

## 7. Cần chủ dự án quyết định
- **Q1. Hộp thoại hiện lúc nào?** (a) *Đề xuất:* tự hiện ngay sau khi bấm "Nhập vào thư viện" một đề, có ô "Không hỏi lại"; nhập nhiều đề một lúc thì không hiện. (b) Chỉ hiện khi bấm nút "Thiết lập đề".
- **Q2. Khung tiêu đề ghi vào tệp thế nào?** (a) *Đề xuất:* tệp đã dùng khaibaochung (`\begin{name}…`) thì điền vào đó; tệp khác thì chèn một khung bảng đơn giản (2 cột: Sở/Trường bên trái, Kỳ thi/Môn/Thời gian bên phải). (b) Chỉ lưu vào Thông tin đề trong thư viện, không ghi vào tệp.
- **Q3. File OCR thô chưa có `\begin{ex}`** (chỉ có "Câu 1.", "A. … B. …"): (a) *Đề xuất:* đợt này hộp thoại báo "chưa có khung câu" và có nút **Mở ở Xử lí TeX** để bọc câu trước, rồi quay lại; (b) làm luôn bộ tự bọc `ex` từ chữ "Câu 1." trong hộp thoại (lớn hơn, dễ sai, nên để đợt sau).
- **Q4. Số La Mã khi thiếu phần:** (a) *Đề xuất:* đánh liên tục (I, II, III theo phần có mặt); (b) giữ cố định I = trắc nghiệm, II = Đúng/Sai, III = trả lời ngắn, IV = tự luận.
- **Q5. Câu xen kẽ:** (a) *Đề xuất:* mặc định chọn "Sắp lại theo phần" nhưng phải bấm OK sau khi xem trước; (b) mặc định giữ thứ tự.
