# Thiết kế Tạo đề từ Ngân hàng câu hỏi

Trạng thái: PR 1 (lõi sinh đề) đã làm; PR 2 (giao diện) đang làm. Chưa phát hành. Các lựa chọn dưới đây là đề xuất của Claude theo yêu cầu "bạn thiết kế"; những chỗ chủ dự án chưa trả lời được ghi ở mục 7 và làm theo đáp án đề nghị.

## 1. Mục tiêu
Giáo viên chọn câu từ Ngân hàng (theo ma trận hoặc chọn tay), xem trước đề giống bản in, sinh nhiều mã đề, lưu vào Thư viện đề để biên dịch PDF/xuất .tex. Giao diện gọn, đẹp, nhanh như TIAD nhưng chỉ học ý tưởng, không chép mã, thương hiệu hay hình ảnh.

Nguyên tắc nghiệp vụ:
1. Câu hỏi chép **nguyên văn** từ Ngân hàng. Trộn phương án chỉ hoán vị các nhóm `{…}` của `\choice`, mọi chữ khác giữ từng byte (khác `examToTex` cũ dựng lại câu từ bộ phân tích nên bị tắt).
2. Đáp án suy ra từ chính phép hoán vị; câu không nhận diện chắc (thiếu `\True`, nhiều `\choice`, phương án kiểu "cả A và B đúng"…) thì **không trộn** và ghi lý do. Đáp án không đọc được hiện dấu `?`, không đoán.
3. Chọn câu theo ma trận bằng **luồng cực đại**: các dòng chồng lấn không bị báo thiếu giả như chọn tham lam. Thiếu thật thì nói rõ thiếu mấy câu, không tự nới mức độ hay Dạng, không tự lấy câu chưa duyệt.
4. Điều kiện đủ dùng có 3 mức, mặc định "Đã duyệt nội dung": (a) Đã duyệt; (b) Đã duyệt + Dạng và mức độ do giáo viên xác minh; (c) mọi câu trừ "Cần sửa" (kèm cảnh báo). Câu "Cần sửa" luôn bị loại.
5. Hạt giống, ma trận và câu được chọn lưu kèm để tái hiện đúng đề.
6. Điểm tính bằng số nguyên (phần trăm điểm), không sai số số thực.
7. Dùng khai báo của giáo viên (`khaibaochung.tex`: môi trường `name`, `\caulc/\cauds/\caukq/\cautl`, `\made`), nên đề ra giống đề họ vẫn làm.

## 2. Luồng người dùng
Ba bước, hiện cùng lúc trên màn rộng (thanh bước ở đầu trang):
1. **Ma trận**: bảng các dòng yêu cầu (phạm vi Lớp/Chương/Bài/Dạng, loại câu, mức độ, số câu). Mỗi dòng hiện ngay "Kho: N câu" và trạng thái đủ/thiếu. Có thanh tổng: số câu, điểm, phân bố mức độ.
2. **Xem và chỉnh**: trang đề xem trước (dựng KaTeX/TikZ như Ngân hàng), tab mã đề. Mỗi câu có Khóa, Đổi câu (chọn trong ứng viên cùng dòng), Bỏ.
3. **Xuất**: Lưu vào Thư viện đề (rồi biên dịch PDF trong HEdu), Xuất .tex, bảng đáp án. Xuất Word hiện nút "Sẽ có sau".

Lối vào thứ hai: ở Ngân hàng chọn câu → "Thêm vào đề" → các câu đó vào đề dưới dạng câu khóa.

## 3. Dữ liệu
- Ma trận (`Row`): `{ id, scope{kind,id}, type, level|any, count }`. Một dòng có thể là cả chương hoặc một Dạng cụ thể.
- Không thêm bảng hay đổi schema ngân hàng. Bản nháp đang soạn lưu trong `localStorage` (chỉ để tiện, không phải nơi lưu chính). Nơi lưu bền là **dự án trong Thư viện đề**: `main.tex`, `de-<mã>.tex`, `dapan.tex`, `khaibaochung.tex`, `hedu-de.json` (ma trận, hạt giống, UID và đáp án từng mã).
- Nguồn UID (E5): ghi sổ nguồn cho `de-<mã đầu>.tex` (mã đầu giữ thứ tự và phương án gốc nên còn "nguyên văn"). Ngân hàng đổi sau này chỉ báo "đã đổi", không tự sửa đề.

## 4. Giao diện (hướng thiết kế)
Giữ token màu hiện có (Mực xanh & giấy ô ly), nền sáng, nhấn navy.
- Thanh bước 1-2-3, chip tóm tắt "42 câu · 10 điểm · 4 mã".
- Bảng ma trận kiểu thẻ-hàng: tên phạm vi dạng đường dẫn rút gọn, chọn loại/mức bằng ô chọn nhanh, bộ đếm số câu, thanh "kho" tô màu (đủ/thiếu).
- Biểu đồ cột phân bố mức độ và phần (SVG nhẹ, không thêm thư viện).
- Trang đề xem trước giống giấy A4 trên nền xám, câu hiện thao tác khi rê chuột/focus.
- Bảng bên phải: thông tin đề, số mã, tùy chọn trộn, điều kiện đủ dùng. Dưới 1100 px: thành các khối xếp dọc.
- Phím tắt và tên truy cập đầy đủ; kiểm 1366×768 và DPI 125-150%.

## 5. Chia PR
| PR | Nội dung | Kiểm |
|---|---|---|
| 1 | Lõi: `examgen.ts` (phân bổ luồng cực đại, điều kiện, trộn nguyên văn, đáp án, dựng .tex), test, thiết kế này | npm test, typecheck, **biên dịch thử bằng TeX Live thật** với khaibaochung của giáo viên |
| 2 | Giao diện Tạo đề mới, thay màn cũ, bật `FEATURES.exam`, lưu vào Thư viện đề, mở biên dịch PDF | thử trình duyệt + app Tauri (`vn.hedu.app.thu`), 1366×768 |
| sau | Ma trận từ Dạng đã xác minh, xuất ZIP nhiều mã, mẫu trình bày, Word | theo thứ tự ưu tiên của chủ dự án |

## 6. Đối chiếu mã nguồn mở (chỉ học ý tưởng)
[ExamShuffle](https://github.com/gokcemay/ExamShuffle) (trộn câu và phương án LaTeX), [exam_maker](https://github.com/ieyada/exam_maker) (ngân hàng theo chương/chủ đề/độ khó, bản riêng từng thí sinh, đáp án), [banky](https://github.com/godber/banky) (cấu hình YAML, trộn câu/phương án, đáp án), [AutoQP](https://github.com/milind2k4/AutoQP) (ngân hàng + ma trận + LaTeX). Không dự án nào cho sẵn phân bổ toàn cục hay trộn nguyên văn; HEdu tự làm hai phần đó và có kiểm thử.

## 7. Câu hỏi cho chủ dự án (đáp án đề nghị đã được làm theo)
Xem phần trả lời trong cuộc trò chuyện; bản cuối được cập nhật vào đây khi chủ dự án chốt.
