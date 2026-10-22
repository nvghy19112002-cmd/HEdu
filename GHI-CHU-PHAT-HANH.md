## Có gì mới trong beta.12

- **Đáp án dài không còn bị bẻ xấu:** đáp án trắc nghiệm tự xếp 4, 2 hoặc 1 cột tuỳ độ dài thật (như ex_test), nên phân số/biểu thức dài không bị xuống dòng lung tung.
- **Sửa câu đúng/sai bị đứt chữ:** nhãn `b)`, `d)` không còn tách dấu `)` xuống dòng, nội dung ý không bị cắt xén.
- **Khung rõ ràng cho đáp án:** chữ Đ / S nằm trong ô viền màu; đáp án trả lời ngắn nằm trong hộp “ĐÁP ÁN”.
- **Báo mã nguồn thiếu `\draw`:** câu lệnh TikZ bắt đầu bằng toạ độ (ví dụ `(\xmin,0)--(\xmax,0);`) thì TeX không vẽ nét nào — HEdu báo đúng dòng, không tự sửa. Trong 300 câu thử, câu trục số 34 và 35 dính lỗi này (thêm `\draw` ở đầu dòng là hiện trục).
- Dữ liệu, ID và sao lưu không đổi.

## Có gì mới trong beta.11

- **Sửa hình TikZ bị cắt hoặc tô sai** (ví dụ hình Venn tô gạch, đồ thị có tiếp tuyến): các hình trong cùng một trang không còn “dính” vùng cắt của nhau. Những câu có `\clip`, tô gạch hay tô màu chuyển nên được xem lại.
- **Cỡ hình trong xem trước cân bằng hơn:** hình quá nhỏ được nới ra, hình quá to được thu lại (giữ tỉ lệ; hình đã đặt `\resizebox` giữ theo mã). Chỉnh ở Hệ thống → “Cỡ hình trong xem trước”: Cân bằng / Giữ nguyên, thanh 70–140%. “Xem chuẩn” vẫn là kích thước thật.
- Dữ liệu, ID và sao lưu không đổi.

## Có gì mới trong beta.10

- **Xem trước LaTeX đúng hơn:** dựng theo cấu trúc câu — `\resizebox`, `\hspace`, nhiều hình trong `center`, danh sách, bảng, `\immini` hai cột (kể cả trong lời giải). Hình thứ hai của `\immini` và hình đứng sau `\choice` trước đây không hiện, nay đã hiện. Lệnh chưa hiểu được hiện ra và câu gắn nhãn “Xem trước chưa dựng chuẩn”; lỗi ngoặc/môi trường báo kèm dòng, cột (không tự sửa mã của bạn).
- **“Xem chuẩn” bằng TeX Live:** nút “TeX” trên thẻ ở Ngân hàng biên dịch nguyên câu với đầu file của Hệ thống; ở Nhập liệu có “Biên dịch thử N câu” (dừng được, một câu lỗi không chặn cả đợt), lỗi chia nhóm: thiếu gói, thiếu lệnh, lỗi mã, quá giờ.
- **Sửa câu bằng ngăn bên phải:** bấm “Sửa” trong Ngân hàng mở ngăn ngay bên cạnh, giữ nguyên bộ lọc, trang và các câu đang chọn; hỏi khi thoát mà chưa lưu; Ctrl+S chỉ lưu câu đang sửa. Giao diện soạn gọn hơn: hai khung Mã LaTeX | Xem trước, “Thuộc tính” thu gọn, bảng ký hiệu dạng hộp nhỏ; bỏ giấy ô ly, “Gõ trực quan” và nút Xuất Word chưa có. Đổi loại câu có xác nhận và hoàn tác được.
- **Phóng to / thu nhỏ giao diện (80–150%):** Ctrl + lăn chuột, chụm hai ngón trên bàn di chuột, hoặc Ctrl + / − / 0. Có chỉ báo mức zoom và mục “Cỡ hiển thị” trong Hệ thống; nhớ riêng cho từng máy.
- Dữ liệu, ID và sao lưu không đổi.

## Có gì mới trong beta.9

- **Đã nhúng sẵn bộ gói LaTeX của bạn:** `ex_test`, `tkz-tab-vn`, `tkz-linknodes`, `ex_tkz-euclide`, `twemojis` và danh sách gói dùng chung (`shared-content`). Các lệnh như `\IntervalLR`, `\IntervalGRF` dùng được ngay khi vẽ hình, không cần cài thêm gì.
- **Đầu file vẽ hình mặc định giống bộ đề của bạn:** nạp đủ tikz, tkz-euclide, tkz-tab, pgfplots, thư viện TikZ, tcolorbox, yhmath, esvect, twemojis… rồi `ex_test`. Xem và sửa ở Hệ thống → Vẽ hình TikZ (nếu bạn đã tự sửa đầu file trước đây, bấm khôi phục mặc định để nhận bản mới).
- **Báo lỗi rõ hơn:** khi hình lỗi vì lệnh chưa định nghĩa, thẻ lỗi nêu tên lệnh (ví dụ `\IntervalLR`).
- Cần TeX Live của máy có sẵn các gói chuẩn như `vietnam`, `tabvar`, `esvect`, `fontawesome`, `hobby` (bộ đề của bạn đã dùng sẵn).
- **Sửa lỗi Ngân hàng:** chọn nhiều câu không còn làm thẻ bị ép thấp và chồng nội dung lên nhau. Công tắc “Hiện lời giải” vẫn dùng được khi đang chọn câu.
- **Header Ngân hàng gọn hơn**, danh sách lên cao hơn.
- **Tạm ẩn “Tạo đề”** (thanh bên, nút Thêm vào đề, ô lệnh Ctrl+K) để tập trung hoàn thiện Ngân hàng và Nhập liệu. Mã và dữ liệu vẫn giữ nguyên, bật lại được.
