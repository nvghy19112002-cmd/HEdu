# Checklist nghiệm thu trên máy Windows thật (trước khi phát hành beta.30)

Chỉ chủ dự án nghiệm thu. Dùng bản chạy thử `npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'` (dữ liệu riêng `%APPDATA%\vn.hedu.app.thu`) hoặc bản cài sau khi **tạo file sao lưu**.

## A. Nhập .tex có sẵn ID
- [ ] Dán/mở file nhiều câu (vd `data_test_02.tex`: 200 câu, 197 có ID đúng, 3 không có ID). Bước "Kiểm tra" không tự nhập gì.
- [ ] Câu ID đúng đủ Dạng: hiện đúng mã, nhập đúng vị trí. Lưu ý mã lớp trong ID: `0` = Lớp 10.
- [ ] Hộp "Xác nhận nhập" có ô tick khi có câu: không có ID / ID không hợp lệ chưa chọn Dạng (vào vị trí chung) hoặc ID không ghi mã Dạng (vào Dạng đầu tiên). Chưa tick thì nút Nhập tắt.
- [ ] Gán ID tự động/Hỏi AI: AI "không chắc" ⇒ câu không tự chọn Dạng, giáo viên chọn.
- [ ] Sau khi nhập: LaTeX trong ngân hàng giống hệt file gốc (kể cả dòng `%[ID]`).

## B. Ngân hàng, Thùng rác, khôi phục, kiểm tra trùng, sao lưu
- [ ] Xoá 5 câu thử ⇒ Thùng rác có đủ 5; bấm "Mở Thùng rác" từ thông báo.
- [ ] Khung xem: Xem nhanh, Xem chuẩn (cần TeX Live), LaTeX gốc; Xuất .tex.
- [ ] Khôi phục 1 câu và nhiều câu; câu trùng mã/ vị trí không còn được giữ lại và báo lý do.
- [ ] Câu "Vị trí không còn": Chọn vị trí mới và khôi phục ⇒ xem trước ID cũ/mới, cảnh báo lệch `%[ID]`; câu về Ngân hàng ở trạng thái "Cần sửa".
- [ ] Xoá hẳn 1 câu (hộp xác nhận, nút "Giữ lại" ưu tiên); Dọn sạch Thùng rác cần 2 bước.
- [ ] Kiểm tra trùng chạy bình thường; Tạo file sao lưu rồi Khôi phục từ file thử trên dữ liệu thử.

## C. Đóng/mở lại và lỗi
- [ ] Sau mỗi bước ở A và B: đóng app, mở lại ⇒ dữ liệu còn nguyên (số câu Ngân hàng + Thùng rác khớp).
- [ ] (Máy thử) Khi ổ đĩa đầy/tệp bị khoá: app báo "chưa ghi được", không báo thành công giả.

## D. Cài đặt và AI
- [ ] 8 mục Cài đặt, ô tìm; khoá cũ tự thành "Cấu hình hiện tại".
- [ ] Thêm cấu hình khoá thứ hai, chọn đang dùng, Thử kết nối (câu giả "1+1"); xoá cấu hình ⇒ khoá xoá khỏi máy.
- [ ] Không có cấu hình đang dùng ⇒ nút Hỏi AI không gửi gì.
- [ ] Bộ đo (nâng cao): chỉ chạy khi bấm đồng ý cho từng model; chưa có nhãn chuẩn thì không kết luận đạt.

## E. Điều kiện phát hành beta.30
- [ ] CI Windows xanh trên `main`; `cargo test --lib` đạt.
- [ ] Nếu beta.30 có SQLite / hồ sơ người dùng / nhiều nguồn dữ liệu: cần thiết kế migration + sao lưu + quay lui được chủ dự án duyệt riêng (chưa có trong main).
- [ ] Phương án quay lại: bản trước còn trong mục Cập nhật → "Quay lại phiên bản trước"; bản sao lưu trước cập nhật còn.

## F. Lưu trữ SQLite (thêm ở S4) — thử trên bản chạy thử `vn.hedu.app.thu`, sau đó mới tới ngân hàng thật
- [ ] Mở HEdu có sẵn `hedu.json` cũ: hiện màn "Nâng cấp lưu trữ"; "Để sau" vẫn vào được bằng cách cũ; "Nâng cấp ngay" chuyển đủ câu (so số câu), tệp cũ còn nguyên, có thư mục `backups\migration-…`.
- [ ] Cài đặt → Dữ liệu & sao lưu → "Lưu trữ SQLite": Kiểm tra toàn vẹn báo tốt; Lưu bản chụp .db; Xuất ra JSON (thư mục mới) rồi thử mở `hedu.json` đó bằng HEdu cũ (beta.29) trên thư mục thử.
- [ ] Nhập từ 20 câu trở lên / xoá hàng loạt từ 20 câu / xoá hẳn khỏi Thùng rác / khôi phục từ file JSON: xuất hiện điểm khôi phục mới (tối đa 5, cũ nhất tự bị xoá); thử "Khôi phục điểm này…" ⇒ số câu quay về, có điểm "trước khi khôi phục" để quay lại.
- [ ] Đóng app bằng cách tắt đột ngột (Task Manager → End task) giữa lúc đang nhập: mở lại thấy dữ liệu trước lô đang ghi, không hỏng.
- [ ] Cập nhật beta → beta (bản thử có kho GitHub): có bản sao lưu trước cập nhật dạng .db; "Khôi phục sau cập nhật" đổi chỗ được hai bản.

## G. Nhập nhiều tệp (N2) — thử trên bản chạy thử `vn.hedu.app.thu` trước
- [ ] Nhập liệu → "Chọn nhiều tệp…" (Ctrl) và "Chọn thư mục…" (có thư mục con): bảng "Theo tệp" đúng số câu, ID đúng/thiếu Dạng/sai/không ID từng tệp; tệp 0 câu được báo; tệp không phải UTF-8 báo lỗi riêng, các tệp khác vẫn nhập được.
- [ ] Bỏ tick một tệp → số câu và rà trùng cập nhật; lô trên 5.000 câu bị chặn kèm hướng dẫn bỏ bớt tệp.
- [ ] "Thông tin lô nhập": ví dụ nhãn đúng (Nguồn / Lô / Thư mục / nhãn tuỳ ý); sau khi nhập, câu có đúng nhãn (xem ở trình sửa câu hoặc tìm chữ "Nguồn:" trong ô tìm Ngân hàng).
- [ ] LaTeX trong ngân hàng giống hệt tệp gốc; tệp nguồn không bị đổi.

## H. Báo cáo nhập (N3) — thử trên bản chạy thử `vn.hedu.app.thu` trước
- [ ] Sau khi bấm Nhập: hiện màn "Kết quả nhập" (không nhảy thẳng về Ngân hàng) với số tìm thấy / đã nhập / bỏ qua vì nghi trùng / bỏ qua theo bạn chọn; thống kê vị trí (theo ID, thiếu Dạng, gợi ý, vị trí chung) khớp với những gì đã xác nhận.
- [ ] Nhập nhiều tệp: bảng "Kết quả theo tệp" đúng; tệp không đọc được hiện ở phần lưu ý.
- [ ] "Lưu báo cáo (.csv)" mở được bằng Excel, tiếng Việt không vỡ chữ, mỗi câu một dòng, KHÔNG có nội dung câu hỏi; "Lưu bản tóm tắt (.md)" đọc được.
- [ ] Cài đặt → Dữ liệu & sao lưu → "Nhật ký nhập": thấy lần nhập vừa rồi (tối đa 20 lần), bấm mở xem lại; đóng và mở lại app vẫn còn; "Xoá nhật ký nhập" không ảnh hưởng ngân hàng.
- [ ] Chế độ lưu JSON cũ ("Để sau"): nhập vẫn thành công, báo cáo vẫn xem/lưu được, Nhật ký nhập ghi rõ là chưa giữ nhật ký.
