## Có gì mới trong beta.8

- **Sửa lỗi "Dịch ra PDF được nhưng chuyển sang SVG thì lỗi"** (Ghostscript 10.x quá mới so với dvisvgm). Hình TikZ giờ dịch theo đường TeX → DVI → SVG nên **không cần Ghostscript**. Bạn không phải làm gì thêm.
- Hình đã dịch hỏng trước đây không bị nhớ lại, nên sẽ tự dịch lại. Nếu hình nào vẫn lỗi, bấm *Xem log TeX* và gửi lại.
- Mục Hệ thống ghi rõ cách dịch của từng bộ dịch; lualatex/xelatex vẫn đi đường PDF.
