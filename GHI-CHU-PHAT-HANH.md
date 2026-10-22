## Có gì mới trong beta.15

- **Kiểm duyệt câu hỏi:** mỗi câu có trạng thái **Chưa kiểm tra / Cần sửa / Đã duyệt** do chính thầy/cô đặt (máy không tự duyệt, kể cả khi biên dịch được). Đổi ở dưới mỗi thẻ hoặc trong khung Chi tiết; “Đã duyệt” có một bước xác nhận. Nhãn màu hiện trên thẻ và trên từng hàng danh sách.
- **Bộ lọc “Kiểm duyệt”** (Tất cả / Chưa kiểm tra / Cần sửa / Đã duyệt) kèm số đếm, dùng chung với các bộ lọc khác ở cả hai kiểu xem. Câu đổi trạng thái và rời bộ lọc thì có thông báo nhẹ.
- **Sửa LaTeX hoặc đổi loại câu** sẽ đưa câu về “Chưa kiểm tra” (có báo); đổi nhãn, mức độ, vị trí thì giữ nguyên. Câu nhân bản hoặc nhập mới luôn là “Chưa kiểm tra”.
- Chỉ báo “Đã lưu” khi đã ghi xuống đĩa; nếu lỗi sẽ báo rõ và có nút Thử lại.
- **Nhãn danh sách đúng:** `\begin{enumerate}[\it TH1:]` nay hiện `TH1:`, `TH2:` (nghiêng) thay vì lộ chữ `it`; hiểu `\alph*`, `\Alph*`, `\roman*`, `\Roman*`, `\arabic*` và danh sách lồng nhau (1. → (a) → i.). Sửa luôn lỗi nuốt mất mục `\item` đứng sau một danh sách lồng.
- **Lưới và trục không còn nét đậm nét nhạt:** nét thẳng ngang/dọc trong hình TikZ được vẽ tối thiểu 1 điểm ảnh, sắc nét đều ở zoom 80–150%. Nét chéo/cong, hình tô và “Xem chuẩn” giữ nguyên.
- **Ngân hàng gọn hơn:** tìm kiếm, kiểu xem, Ẩn/Hiện mục lục và nút **Bộ lọc** (có số bộ lọc đang bật) nằm trên một hàng; các bộ lọc xếp ngang; thanh “Đã chọn N câu” thấp hơn; nút Thao tác của thẻ nằm cùng hàng nhãn, **Nhân bản/Xoá** gom vào menu ba chấm (xoá cần bấm hai lần). Mục lục ẩn được ở cả Thẻ lẫn Danh sách; lựa chọn ẩn/hiện được nhớ theo máy.
- **Nút Đóng của ngăn sửa:** khi còn thay đổi chưa lưu, hộp hỏi nay nổi giữa màn hình, nền tối (trước đây chỉ là một thanh vàng nhỏ dưới nút nên dễ tưởng nút không bấm được). Esc trong hộp = Tiếp tục sửa.
- ⚠️ **Đổi cấu trúc dữ liệu (2→3):** sau khi cập nhật, bản app cũ **không mở được** dữ liệu mới. Bản sao lưu tự tạo trước khi cập nhật vẫn giữ dữ liệu cũ. Nội dung câu hỏi không đổi.

## Có gì mới trong beta.14

- **Ngân hàng có hai kiểu xem:** nút **Thẻ | Danh sách** ở đầu danh sách. “Danh sách” hiện các hàng gọn (số câu, mã ID, loại, mức độ, trích đoạn đề) bên trái và một khung **Chi tiết** đầy đủ bên phải. Đổi kiểu xem không mất bộ lọc, trang, các câu đã chọn hay công tắc “Hiện lời giải”. Chọn kiểu nào được nhớ cho máy này (mặc định vẫn là Thẻ).
- Bấm một hàng chỉ để **xem** câu đó; ô tick vuông riêng để **chọn nhiều câu** (xuất .tex…). Xoá câu đang xem thì chuyển sang câu bên cạnh. Có thể dùng bàn phím (Tab, Enter). Cửa sổ hẹp: bấm hàng thì Chi tiết hiện đầy màn hình, có nút “Quay lại danh sách”. Mục lục (lớp/chương/bài) có nút Ẩn/Hiện.
- **Hình ngang không còn nhỏ xíu:** hình gồm nhiều hình con xếp hàng ngang (ví dụ “bốn hình vẽ”) được phóng to hợp lý.
- **Đáp án A/B/C/D nằm trong ô viền**, đáp án đúng nổi bật bằng viền và nền xanh khi bật hiện đáp án.
- Dữ liệu, ID và sao lưu không đổi. (Chức năng “Kiểm duyệt câu hỏi” chưa có — đang chờ thầy duyệt cách lưu.)

## Có gì mới trong beta.13

- **Sửa bảng bị mất đường kẻ dưới cùng:** `\hline` ở cuối bảng nay kẻ suốt chiều ngang (trước đây chỉ hiện ở cột đầu).
- Dữ liệu, ID và sao lưu không đổi.

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
