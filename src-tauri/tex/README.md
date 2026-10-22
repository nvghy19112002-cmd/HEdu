# Gói LaTeX đi kèm HEdu

Các tệp này do chủ dự án cung cấp (bộ gói quen dùng khi soạn đề với `ex_test`). HEdu nhúng chúng vào chương trình
và giải nén vào thư mục dữ liệu của app khi dịch hình, rồi cho TeX Live của máy tìm thấy qua `TEXINPUTS`.
Nhờ vậy `\IntervalLR`, `\usepackage{ex_test}`, `tkz-tab-vn`… dùng được mà không phải cài gì thêm.

| Tệp | Nguồn / tác giả |
|---|---|
| `ex_test.sty` | Ex_test 3.1, Trần Anh Tuấn và Dương Phước Sang |
| `ex_tkz-euclide.sty` | Ex_test, Trần Anh Tuấn |
| `tkz-tab-vn.sty` | Trần Anh Tuấn |
| `tkz-linknodes.sty` | Alain Matthes (LPPL) |
| `twemojis.sty` | twemojis v1.3.1 (LPPL) |
| `shared-content.tex` | Danh sách gói dùng chung của bộ đề, do chủ dự án cung cấp |

Khi cập nhật một tệp ở đây, `SUPPORT_REV` trong `src-tauri/src/support.rs` tự đổi (theo nội dung) nên hình đã dịch được dịch lại.
Chủ dự án xác nhận (22/10/2026) đã được tác giả đồng ý cho dùng `ex_test.sty` và `tkz-tab-vn.sty` trong HEdu.
