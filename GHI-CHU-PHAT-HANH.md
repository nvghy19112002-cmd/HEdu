## Có gì mới trong beta.5

**Vẽ hình TikZ thật bằng TeX Live trên máy bạn**
- Mỗi hình trong câu hỏi được dịch thành ảnh SVG qua `pdflatex` rồi `dvisvgm`, hiện ngay trong khung xem trước thay cho khung giữ chỗ.
- Hình đã dịch được nhớ lại trong thư mục dữ liệu, nên lần sau mở câu đó hiện tức thì.
- Hình lỗi thì báo rõ: câu lỗi đầu tiên của TeX, kèm nút "Xem log TeX" để biết sai dòng nào, và nút "Dịch lại".
- Nếu máy chưa có TeX Live, app nói rõ là chưa tìm thấy chứ không im lặng.

**Mục Hệ thống có phần cài đặt vẽ hình**
- Nút **Kiểm tra TeX Live**: dịch thử một hình và báo kết quả cùng phiên bản.
- Chọn bộ dịch (pdflatex, lualatex, xelatex), đặt giới hạn thời gian, bật/tắt tự vẽ hình.
- Sửa được **đầu file LaTeX** dùng khi dịch hình, phòng khi TeX Live của bạn thiếu gói nào đó.
- Nút xoá toàn bộ hình đã dịch.

Mặc định đã nạp sẵn: tikz, tikz-3dplot, tkz-tab, tkz-euclide, pgfplots và các thư viện tikz hay dùng.
