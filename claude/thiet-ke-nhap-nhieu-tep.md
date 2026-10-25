# [M/L] Nhập nhiều tệp + nhãn nguồn + báo cáo nhập — PHƯƠNG ÁN TRÌNH DUYỆT

Trạng thái: **chỉ là phương án, chưa viết code.** Chờ chủ dự án duyệt (D1–D7). 25/10/2026.
Không đổi: schema 3, ID6, UID, LaTeX/TikZ, cây chương trình, thuật toán dò trùng. Không thêm đồng bộ/tài khoản.

## 1. Hiện trạng đã kiểm trên mã
- Màn Nhập liệu (`src/screens/Extra.tsx`) nhận **một** chuỗi: dán vào ô hoặc chọn **một** tệp `.tex/.txt` (đọc bằng `FileReader` của trình duyệt). Mọi thứ (rà trùng, quyết định, nhập) đánh theo số thứ tự câu trong chuỗi đó; mỗi câu có số dòng.
- Rà trùng đã hỗ trợ "câu mới ↔ kho" và "câu mới ↔ câu mới trong lô"; đã có tiến độ + Dừng; danh sách hiện 200 câu một lần; ID được phân loại (đúng / thiếu Dạng / sai / không có) và bắt xác nhận khi vào vị trí chung (PR #94).
- Nhập luôn gắn `tags: []` — **chưa có cách ghi lại câu đến từ đâu**. `Question.tags` đã có sẵn (không cần đổi schema), tìm chữ trong Ngân hàng có tìm cả nhãn, nhưng **Ngân hàng không hiện nhãn trên thẻ và không có bộ lọc nhãn**; hộp "Gắn nhãn hàng loạt" (`BatchDialogs.tsx`) đã viết nhưng đang ẩn khỏi thanh chọn.
- Kết quả nhập chỉ là một thông báo ngắn ("Đã nhập N câu, bỏ qua M câu"). Không có báo cáo lưu lại. Bảng `journal` của SQLite có sẵn nhưng chỉ chứa dòng ngắn (≤ 500 ký tự).
- Số đo (dữ liệu giả): rà trùng mỗi câu nhập mới tốn ~40 KB RAM; kho 60.000 câu dựng chỉ mục ~29 giây — phần này sẽ làm ở nhóm "dò trùng nhẹ" riêng, nên PR này **tạm giới hạn mỗi lô ≤ 5.000 câu**.

## 2. Phương án

### 2.1 Chọn nguồn (D1, D2)
- Nút mới: **"Chọn nhiều tệp…"** (Ctrl/Shift) và **"Chọn thư mục…"** (quét cả thư mục con) bằng hộp chọn của Windows; vẫn giữ dán trực tiếp và chọn một tệp.
- Việc đọc tệp làm ở **Rust theo từng tệp** (không dùng FileReader): lệnh `import_scan(đường dẫn…)` trả danh sách (tên, thư mục con, kích thước, lý do bỏ qua) và `import_read(đường dẫn)` đọc từng tệp có tiến độ. Chỉ nhận `.tex` / `.txt`; **bắt buộc UTF-8** (tệp bảng mã khác bị liệt kê "không đọc được" kèm lý do, **không đoán bảng mã**, không sửa tệp); bỏ BOM.
- Giới hạn (có thông báo rõ khi vượt): ≤ 2.000 tệp, ≤ 20 MB/tệp, ≤ 5.000 câu/lô (tạm, tới khi dò trùng nhẹ hơn), độ sâu thư mục ≤ 6. Vượt ⇒ chia lô, không cắt lặng lẽ.
- Chỉ **đọc**: không sửa, đổi tên hay xoá tệp nguồn.

### 2.2 Gộp nhiều tệp thành MỘT lô (không viết lại màn)
- Thay chuỗi duy nhất bằng danh sách `nguồn = {tên, thư mục con, văn bản}`; mỗi câu nhớ **tệp + số dòng trong tệp đó**. Mọi chỗ còn lại (rà trùng, quyết định, ID, xác nhận, nhập) giữ nguyên vì vẫn đánh theo thứ tự câu.
- Thẻ **"Theo tệp"** trước khi nhập: mỗi tệp một dòng (số câu tìm được · ID đúng/thiếu/sai · nghi trùng · lỗi đọc). Bộ lọc "Chỉ hiện tệp…" trong danh sách câu. Tệp không có `\begin{ex}…\end{ex}` được liệt kê "0 câu" (không nhận phần ngoài khối `ex`).
- Trùng giữa các tệp trong cùng lô được phát hiện như hiện nay (mới ↔ mới).

### 2.3 Nhãn nguồn (D3)
Dùng `tags` có sẵn (không đổi schema). Khung **"Thông tin lô nhập"**:
- ☑ Gắn tên tệp: nhãn `Nguồn: <tên tệp>` (mặc định bật).
- ☑ Gắn mã lô: nhãn `Lô: 2026-10-25 14:30` (có thể đổi tên lô).
- ☐ Gắn thư mục con (khi chọn thư mục): `Thư mục: Lop12/HamSo`.
- Ô "Nhãn thêm cho cả lô" (nhiều nhãn, ví dụ `Sách KNTT 12`, `Đề 2024`).
- Nhãn gắn lúc nhập; sửa sau bằng "Gắn nhãn hàng loạt" (bật lại nút đã viết sẵn ở thanh chọn).

### 2.4 Xem và lọc theo nhãn (D4)
- Ngân hàng: hiện tối đa 2 nhãn trên thẻ/hàng danh sách (+ "N nhãn nữa"); thêm bộ lọc **"Nhãn"** trong thanh lọc (ô tìm nhãn, số câu mỗi nhãn, chọn nhiều = "có một trong các nhãn"), dùng chung đường lọc hiện có.

### 2.5 Báo cáo nhập (D5)
- Sau khi nhập hiện **"Kết quả nhập"**: tổng (tìm thấy / nhập / bỏ qua vì trùng / bạn chọn bỏ / chờ quyết định), ID (đúng, thiếu Dạng, sai, không có → đã vào vị trí chung), cảnh báo; bảng theo tệp; số câu có lỗi xem trước TeX nếu đã biên dịch thử. Nút **Lưu báo cáo (.csv/.md)** và **Xem các câu vừa nhập** (mở Ngân hàng lọc theo nhãn lô).
- CSV đầy đủ từng dòng: tệp, dòng, quyết định, lý do, trạng thái ID, ID6, uid, số thứ tự mới. **Không chứa nội dung câu hỏi.**
- Lưu lại trong SQLite (khoá `import-reports` của tệp phụ — không đổi cấu trúc bảng): tóm tắt + các dòng có vấn đề của **20 lô gần nhất**; xem lại ở Cài đặt → Dữ liệu & sao lưu → "Nhật ký nhập". Chế độ JSON cũ: chỉ lưu tệp báo cáo.
- Lô ≥ 20 câu vẫn tự chụp điểm khôi phục trước khi nhập (đã có); ghi vào báo cáo thời điểm điểm khôi phục.

### 2.6 Hoàn tác (D6)
Không làm nút "Hoàn tác lô" riêng ở bản đầu (Thùng rác chỉ chứa 1.000 câu; lô lớn không đưa vào được). Cách quay lại: **điểm khôi phục "Trước khi nhập hàng loạt"** (đã có, mất các thay đổi làm sau đó — hộp xác nhận nêu rõ). Nếu sau này cần hoàn tác chính xác từng lô, thêm riêng.

### 2.7 Câu thiếu/sai ID (D7)
Giữ hành vi hiện tại (vào vị trí chung đã chọn, phải tick xác nhận). Trạng thái **"Chưa phân loại"** thật sự (không vào vị trí chung) làm riêng sau khi bạn quyết (đụng cách xếp vị trí).

## 3. Chia PR (mỗi PR nhỏ, CI xanh, bạn duyệt rồi mới gộp)
| PR | Nội dung |
|---|---|
| N1 | Rust: quét/đọc tệp & thư mục (giới hạn, UTF-8, BOM) + test (tệp lạ, quá lớn, sai mã hoá, thư mục sâu, tên tiếng Việt) |
| N2 | Nhập nhiều nguồn: chọn tệp/thư mục, danh sách nguồn, thẻ "Theo tệp", bộ lọc theo tệp, khung Thông tin lô nhập + gắn nhãn khi nhập, giới hạn lô |
| N3 | Báo cáo nhập: màn Kết quả, CSV/MD, lưu 20 lô trong SQLite, "Nhật ký nhập" |
| N4 | Ngân hàng: hiện nhãn, bộ lọc Nhãn, bật lại "Gắn nhãn hàng loạt" |

## 4. Rủi ro và cách phòng
| Rủi ro | Phòng |
|---|---|
| Đọc nhầm/hỏng tệp | Chỉ đọc; UTF-8 bắt buộc, không đoán; liệt kê tệp bỏ qua + lý do; nội dung câu giữ nguyên văn (đã có test) |
| Nhập 5.000 câu treo giao diện | Quét và rà trùng có tiến độ + Dừng (đã có), danh sách 200 câu/lần, ghi 1 giao dịch |
| Nhãn lẫn lộn/sai chính tả | Nhãn có tiền tố cố định (`Nguồn:`, `Lô:`), xem trước nhãn sẽ gắn, sửa/bỏ hàng loạt sau |
| Báo cáo lộ nội dung | Chỉ tệp/dòng/ID/uid, không có LaTeX |
| Đường dẫn do giao diện truyền vào Rust | Chỉ `.tex/.txt`, chỉ đọc, giới hạn kích thước; ứng dụng cục bộ, không nhận nội dung từ web |
| Hồi quy luồng Nhập liệu | Giữ nguyên các quy tắc (ID, trùng, xác nhận, điểm khôi phục); test cũ (`importid`, `dupimport`, …) phải còn đạt; thêm test nhiều nguồn |

## 5. Tiêu chí nghiệm thu
- [ ] Chọn 3 tệp (+ 1 tệp không phải UTF-8 + 1 tệp không có `ex`) → danh sách "Theo tệp" đúng số câu và báo đúng lý do bỏ qua.
- [ ] Chọn thư mục có thư mục con → nhận đủ tệp `.tex/.txt`, bỏ qua tệp khác.
- [ ] Câu trùng giữa hai tệp được báo; câu nhập có nhãn `Nguồn:`/`Lô:` đúng; LaTeX giống từng ký tự tệp gốc.
- [ ] Nhập ≥ 20 câu tạo điểm khôi phục; báo cáo ghi đúng số liệu; CSV mở được bằng Excel (UTF-8 có BOM).
- [ ] Ngân hàng lọc theo nhãn lô ra đúng các câu vừa nhập.
- [ ] Tắt đột ngột giữa lúc nhập: mở lại thấy hoặc cả lô hoặc không câu nào của lô (một giao dịch).

## 6. Cần chủ dự án duyệt
D1 (đọc tệp/thư mục bằng Rust, chọn nhiều tệp + thư mục) · D2 (giới hạn: 2.000 tệp, 20 MB/tệp, 5.000 câu/lô tạm thời, chỉ UTF-8) · D3 (nhãn bằng `tags`: `Nguồn:`, `Lô:`, `Thư mục:` + nhãn tuỳ ý) · D4 (hiện nhãn + bộ lọc Nhãn + bật lại Gắn nhãn hàng loạt) · D5 (báo cáo: CSV/MD không chứa nội dung, lưu 20 lô gần nhất trong SQLite) · D6 (hoàn tác bằng điểm khôi phục, chưa có nút riêng) · D7 (giữ hành vi ID sai hiện tại; "Chưa phân loại" làm riêng).
