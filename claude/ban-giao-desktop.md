# Bàn giao HEdu (02/11/2026 tối — chủ dự án đổi sang tài khoản Claude mới)

Quy tắc làm việc: `AGENTS.md`. Ghi nhớ chi tiết hơn (lệnh nhanh, mẹo) nằm trong bộ nhớ Claude Code trên máy: `bat-dau-phien-moi.md`.

## Đã phát hành (kênh beta, 02/11)
- **beta.49** (#199–#202): Thư viện đề bấm thẻ mở thẳng màn biên tập; thanh tab nhiều đề (tối đa 8, nhớ tab, biên dịch song song ≤ 2); ngăn Thông tin bên phải, menu chuột phải, Space xem nhanh PDF, kéo-thả .tex để nhập; Cài đặt › Đề thi (mẫu in, thông tin mặc định).
- **beta.50** (#203): màn Biên tập đề gọn (thanh công cụ một hàng, cây tệp tự ẩn, kéo chia PDF, nhật ký gập); soạn kiểu TeXstudio (gợi ý lệnh, tự `\end`, tự đóng ngoặc, thu gọn khối).
- **beta.51** (#204): sửa bôi đen không thấy màu; Ctrl+T/U chú thích đầu dòng, Ctrl+K xoá dòng, Alt+Enter đóng môi trường, Alt+Shift+M, Ctrl+Shift+I, Ctrl+R, Ctrl+G; nút ⌨ Phím tắt.

## Chờ chủ dự án quyết (CI đã xanh)
- **#205** Mẫu in HyMath GĐ1: tệp đề chỉ có dữ liệu (dùng `\TieuDeDeSo`, không `\documentclass`) bấm Biên dịch là HEdu ghép phần đầu theo 1 trong 8 mẫu HyMath (chỉ trong thư mục build, XeLaTeX); bản Đề / Đề in trắng đen / Lời giải; Cài đặt có tên giáo viên + năm học. Đã dịch thật đề `toan10_gk1_taythanh_2627` với cả 8 mẫu: 0 lỗi.
- **#206** đề xuất `claude/de-xuat-mau-in.md` (GĐ1 đã duyệt) — gộp cùng #205.
- Sau khi gộp: ghi chú beta.52 + phát hành, chỉ khi chủ dự án nói rõ.
- **#207** (xem nhanh minipage) do một phiên khác làm; #198 thừa (nên đóng); #180, #176, #175, #123 cũ.

## Đang chạy / bước tiếp
1. **Quét kho hình TikZ MathHub** (19.853 hình, bản chép chỉ đọc ở `D:\HEdu-rac\tikz-scan`, ngoài repo): thử 300 hình dịch được 98,7%. Chạy lại nếu dừng: `python quet.py 0 6`, rồi `python bao-cao.py` → `bao-cao.md`. Kho này của MathHub: chỉ dùng trên máy, KHÔNG đưa vào repo công khai.
2. **Vẽ hình nhờ Claude** (cần đặc tả, chờ duyệt): chạy Claude Code chính hãng ở chế độ không cửa sổ bằng gói Pro của chủ dự án; skill quy tắc vẽ; dựng toạ độ tính toán; vòng tự so ảnh; thư viện hình mẫu; chỉnh bằng bảng điểm. Không tự xoay 2 tài khoản. Chủ dự án sẽ gửi đoạn chat quy tắc vẽ TikZ cũ.
3. **HyMath GĐ2** (ảnh mẫu, thêm mẫu, mẫu theo từng đề, mẫu thứ 9 theo 4 ảnh chủ dự án gửi) và **GĐ3** (chuẩn hoá đề ở Xử lí TeX; Tạo đề theo chuẩn HyMath).
4. Hỏi lại lỗi "không gõ được %" sau khi chủ dự án cập nhật beta.51.

## Chưa nghiệm thu trên máy thật
Toàn bộ beta.49–51 và #205.
