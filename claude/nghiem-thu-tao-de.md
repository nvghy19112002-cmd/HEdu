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
- [ ] Ở Ngân hàng chọn một câu **chưa duyệt** → Thêm vào đề: hiện hộp hỏi “ngoại lệ”; chọn OK thì câu vào đề có nhãn “Ngoại lệ”; chọn Hủy thì câu đó không vào đề.
- [ ] Đang có câu khóa, sang Ngân hàng đổi câu đó thành “Cần sửa” (hoặc sửa nội dung cho mất “Đã duyệt”), quay lại Tạo đề: hiện danh sách “câu đã khóa không còn vào được đề” kèm nguyên nhân; nút Lưu/Xuất bị khóa tới khi bấm “Bỏ khóa”.
- [ ] Số câu bị loại vì ký tự điều khiển lạ hiện đúng; mở “Xem câu bị loại” thấy #số, UID, nguyên nhân; câu đó vẫn còn nguyên trong Ngân hàng.
- [ ] Ghi chú điểm: phần I/II/III 0,25 / 1,0 / 0,5; Đúng/Sai theo số ý đúng 0,1 / 0,25 / 0,5 / 1,0; đổi điểm tự luận thì tổng điểm đổi theo.
- [ ] Banner “chưa xác minh Dạng” có nhắc rủi ro ID sai lớp. Nếu kho có câu Toán 10 mang mã lớp 12, thầy/cô có thấy cảnh báo đủ rõ không?

## Giới hạn đã biết
- Chưa làm (đã được chốt, xếp vào PR sau): mỗi mã đề một PDF và ZIP; lưu ma trận thành mẫu có tên (lưu bền, sao lưu/khôi phục); tránh câu đã dùng ở các đề trước theo phạm vi chọn. Word và mẫu trình bày (đen trắng/xanh/đỏ) để sau. Chờ ma trận thực tế của chủ dự án cho mẫu chính thức.
- Đề lưu vào Thư viện vẫn có `main.tex` gộp mọi mã (một PDF nhiều mã, KHÔNG có bảng đáp án) và nay thêm `main-<mã>.tex` từng mã (PR 3).
- Câu có ký tự điều khiển lạ trong LaTeX bị loại khỏi đề (và báo số lượng); cần mở câu đó trong Ngân hàng và sửa.
- Bản nháp đề đang soạn lưu tạm trong máy (localStorage), không nằm trong sao lưu `.db`; đề đã lưu vào Thư viện nằm trong sao lưu thư viện đề.

## PR 3 — Xuất PDF từng mã và gói ZIP (chờ nghiệm thu máy thật)
Đề lưu từ Tạo đề nay có `main-<mã>.tex` cho từng mã; nút **Xuất PDF từng mã / ZIP…** (màn Tạo đề, sau khi lưu) và **Xuất từng mã…** (Đề thi). Đáp án KHÔNG còn nằm cuối PDF đề: chỉ ở `dapan.tex` + `main-dapan.tex` (cho giáo viên) và CSV trong gói giáo viên.

### Đã kiểm tự động (không thay cho nghiệm thu)
- Rust: 14 test mới (tên tệp, CSV, đối chiếu nguồn, gói giáo viên/học sinh, lỗi giữa chừng, huỷ, không ghi đè, PDF hỏng, giới hạn 24 mã, bộ đệm theo tệp chính); ZIP đọc lại bằng bộ đọc ĐỘC LẬP của Windows (.NET) khớp tên tiếng Việt và SHA-256. Toàn bộ `cargo test --lib --locked`: 184 đạt.
- TS: `examexport.test`, `examgen.test` (mọi tệp chính của PDF đề không chèn đáp án/lời giải).
- App thử `vn.hedu.app.thu` + TeX Live thật, 4 mã đề: gói giáo viên có lời giải (8 lượt dịch, 40 giây), gói học sinh dùng lại bộ đệm; xuất lần hai ra tên khác; một mã lỗi giữa chừng ⇒ không ZIP, không tệp `.part`; huỷ khi đang dịch ⇒ không ZIP; sửa nguồn ⇒ bộ đệm mất hiệu lực (dấu vân đổi).
- `scripts/kiem-ro-ri-pdf.mjs` (cần TeX Live, chạy tay hoặc trong báo cáo kiểm): PDF chế độ Đề không chứa từ nào chỉ có trong lời giải; chế độ Đề dịch có và không có `\True` cho chữ và lệnh vẽ giống hệt (không đánh dấu đáp án); đối chứng bắt được khác biệt ở PDF lời giải.

### Việc thầy/cô thử trên máy thật
- [ ] Tạo đề → Lưu vào Thư viện đề → **Xuất PDF từng mã / ZIP…** → chọn **Gói học sinh**: ZIP chỉ có PDF đề từng mã; mở từng PDF, không có đáp án, lời giải, bảng đáp án.
- [ ] **Gói giáo viên** (bật “Kèm PDF lời giải”): có `de/`, `loigiai/`, `dapan/*.csv`, `nguon/`, `manifest.json`. Mở CSV trong Excel: đúng tiếng Việt, đáp án khớp PDF lời giải của đúng mã đề.
- [ ] Giải nén `nguon/`, biên dịch `main-<mã>.tex` bằng TeX Live của máy: ra PDF.
- [ ] Xuất hai lần liên tiếp: hai tệp ZIP tên khác nhau, tệp cũ không bị ghi đè.
- [ ] Bấm **Dừng** giữa lúc dịch: không có ZIP, không có tệp `.part` trong thư mục đích.
- [ ] Đề cũ (lưu bằng bản trước, chưa có `main-<mã>.tex`): mở **Xuất từng mã…** → thấy báo thiếu → **Bổ sung tệp chính từng mã…**: hộp xác nhận liệt kê tệp sẽ thêm; sau khi đồng ý có thêm một bản sao dự phòng của đề; không tệp nào bị sửa.
- [ ] Đề không tạo bằng Tạo đề (nhập tay) mở **Xuất từng mã…**: báo rõ không dùng được, không báo lỗi lạ.
- [ ] Thư mục đích còn ít dung lượng: báo rõ không đủ chỗ trước khi dịch.
