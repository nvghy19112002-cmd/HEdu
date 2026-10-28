# Nghiệm thu Tạo đề từ Ngân hàng — danh sách cho chủ dự án

Trạng thái: **chờ nghiệm thu trên máy Windows thật**. Chưa phát hành. Thiết kế: `claude/thiet-ke-tao-de.md`. PR: #135 (lõi), #136 (giao diện).

Chạy thử bằng bản riêng, không đụng ngân hàng thật:

```bash
npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'
```

## Đã kiểm tự động (không thay cho nghiệm thu)
- `npm test` (có `examgen.test`, `examdraft.test`), typecheck, build.
- Biên dịch thật bằng pdflatex (TeX Live 2026) với `khaibaochung.tex` của dự án: phát hiện và sửa 3 lỗi chỉ lộ khi biên dịch thật (tham số rỗng của môi trường `name`; thiếu nhãn `\zlabel{\made-lastpage}`; câu có ký tự điều khiển U+0008).
- App Tauri thử (`vn.hedu.app.thu`, qua CDP): mẫu đề 2025 → 22 câu 10 điểm → khóa/đổi câu → Lưu vào Thư viện đề → 22/22 nguồn UID còn nguyên văn → biên dịch PDF 20 trang, 0 lỗi. Kiểm 1366×768, 1920×1080, 1536×864 ở DPI 125%: không tràn ngang.

## Việc thầy/cô thử trên máy thật
- [ ] Vào **Tạo đề**: bấm “Dùng mẫu đề 2025”; số câu hiện 12 / 4 / 6 và 10 điểm khi kho đủ câu.
- [ ] Đổi “Đã duyệt / Đã xác minh / Mọi câu”: số “kho” từng dòng đổi theo; câu “Cần sửa” không bao giờ vào đề.
- [ ] Thêm dòng theo Chương/Bài/Dạng; dòng thiếu câu viền đỏ, báo thiếu mấy câu; chưa xuất được khi còn thiếu.
- [ ] Hai dòng chồng lấn (vd “cả Chương 1” và “Bài 2 chương 1”) vẫn đủ câu khi kho đủ, không báo thiếu giả.
- [ ] Rê chuột vào một câu: **Khóa** (giữ khi bấm “Sinh lại”), **Đổi câu** (chọn trong danh sách cùng dòng), **Ngẫu nhiên**.
- [ ] Mã đề 101 là bản gốc (giữ thứ tự và phương án); các mã sau trộn. Bảng đáp án khớp: kiểm vài câu bằng tay ở mã 102–104.
- [ ] Câu có phương án kiểu “cả A và B đúng” giữ nguyên thứ tự phương án (nhãn “Giữ nguyên phương án”).
- [ ] Ở Ngân hàng chọn vài câu → **Thêm vào đề**: các câu vào Tạo đề dưới dạng câu đã khóa.
- [ ] **Lưu vào Thư viện đề** → mục Đề thi → mở → **Biên dịch PDF** (chế độ Nguyên văn hoặc Đề): ra PDF đủ các mã, tiêu đề đúng, chân trang “Trang x/y”, bảng đáp án ở cuối.
- [ ] Mở `de-101.tex`: câu giống từng chữ với ngân hàng. Sửa một câu trong Ngân hàng rồi mở lại đề: **Nguồn câu hỏi** báo “Ngân hàng đã đổi”.
- [ ] Đóng app mở lại: màn Tạo đề còn ma trận và thông tin đề đang soạn.
- [ ] Giao diện ở màn hình bạn dùng (laptop nhỏ, phóng to 125–150%).

## Giới hạn đã biết
- Xuất Word, xuất ZIP nhiều mã (mỗi mã một PDF), mẫu trình bày (đen trắng/xanh/đỏ), lưu ma trận thành mẫu có tên, “tránh câu đã dùng ở đề trước”: chưa làm (xem câu hỏi ở `claude/thiet-ke-tao-de.md` mục 7).
- Đề lưu vào Thư viện chứa **tất cả mã** trong một dự án (một PDF nhiều mã). Muốn mỗi mã một PDF: làm ở PR sau.
- Câu có ký tự điều khiển lạ trong LaTeX bị loại khỏi đề (và báo số lượng); cần mở câu đó trong Ngân hàng và sửa.
- Bản nháp đề đang soạn lưu tạm trong máy (localStorage), không nằm trong sao lưu `.db`; đề đã lưu vào Thư viện nằm trong sao lưu thư viện đề.
