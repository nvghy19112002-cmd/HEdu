## Có gì mới trong beta.4

Bản này tập trung vào việc đọc kho câu hỏi LaTeX thật (đã thử trên 300 câu có 363 hình TikZ).

**Đọc đúng câu có hình**
- Hỗ trợ `\immini{đề}{hình}`: trước đây mã hình lọt vào đề bài và phần hình bị mất khi xuất lại. Nay đề và hình tách riêng, xuất ra vẫn đúng dạng hai cột như cũ.
- Hỗ trợ `\def\ten#1#2{…}` và `\newcommand{\ten}[2][…]{…}`: các khai báo vẽ hình được giữ riêng, không hiện lẫn vào đề. Khai báo nằm *bên trong* `tikzpicture` được giữ nguyên vì nó là một phần của hình.
- Nhận `\lq\lq … \rq\rq` thành dấu ngoặc kép, `\colon` thành dấu hai chấm.

**Báo lỗi xem trước khi nhập**
- Màn Nhập liệu kiểm tra từng câu trước khi nhập và báo rõ: công thức nào KaTeX không dịch được, ngoặc nhọn lệch ở phần nào, `\begin{…}` nào chưa đóng, câu nào thiếu lời giải, câu nào có hình.
- Bấm vào một câu để xem chính xác lỗi nằm ở đâu, kèm đoạn mã gây lỗi. Có nút lọc "chỉ xem câu có vấn đề".
- Kiểm tra chạy theo từng đợt nên dán vài trăm câu không làm treo giao diện (300 câu kiểm tra xong trong khoảng 2 giây).
- Các lệnh chỉ dùng khi in (`\hfill`, `\vspace`, …) không còn làm hỏng cả công thức.
