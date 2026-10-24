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
