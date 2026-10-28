# Thiết kế Tạo đề từ Ngân hàng câu hỏi

Trạng thái: PR #135 (lõi) và #136 (giao diện) đang chờ duyệt gộp; chưa phát hành. Các quyết định nghiệp vụ ở mục 7 đã được chủ dự án chốt (28/10/2026).

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
| 3 | Mỗi mã đề một PDF + ZIP giáo viên/học sinh (Q5, D1–D3, D9): đã làm, chờ duyệt | biên dịch thật nhiều mã, ZIP đọc lại bằng bộ đọc độc lập, lộ đáp án/lời giải, huỷ, lỗi giữa chừng |
| 4 | Mẫu ma trận lưu bền có sao lưu/khôi phục (Q7) và tránh tái dùng câu theo phạm vi chọn (Q8) | sao lưu/khôi phục, thiếu câu thì báo, không tự nới |
| sau | Mẫu theo ma trận thực tế của chủ dự án (Q9), mẫu trình bày, Word (Q10) | theo thứ tự ưu tiên của chủ dự án |

## 6. Đối chiếu mã nguồn mở (chỉ học ý tưởng)
[ExamShuffle](https://github.com/gokcemay/ExamShuffle) (trộn câu và phương án LaTeX), [exam_maker](https://github.com/ieyada/exam_maker) (ngân hàng theo chương/chủ đề/độ khó, bản riêng từng thí sinh, đáp án), [banky](https://github.com/godber/banky) (cấu hình YAML, trộn câu/phương án, đáp án), [AutoQP](https://github.com/milind2k4/AutoQP) (ngân hàng + ma trận + LaTeX). Không dự án nào cho sẵn phân bổ toàn cục hay trộn nguyên văn; HEdu tự làm hai phần đó và có kiểm thử.


## 7. Quyết định của chủ dự án (đã chốt 28/10/2026)
| # | Quyết định | Cách làm trong mã |
|---|---|---|
| Q1 | Mặc định "Đã duyệt nội dung" để dùng ngân hàng hiện có. Duyệt nội dung **không phải** xác minh phân loại. Ra đề chính thức phải cảnh báo câu chưa xác minh | Banner luôn hiện số câu chưa xác minh Dạng/mức độ và nhắc ID hợp lệ vẫn có thể sai lớp (đã từng có câu Toán 10 mang mã lớp 12) |
| Q2 | Điểm tối đa phần I/II/III = 0,25 / 1,0 / 0,5. Câu Đúng/Sai chấm theo số ý đúng: 1 ý 0,1; 2 ý 0,25; 3 ý 0,5; 4 ý 1,0. Tự luận có thang riêng, cấu hình được. Tách điểm tối đa của câu khỏi điểm thực tế của học sinh | `DS_POINTS_CENTI`, `dsPoints`; ô "Điểm tối đa mỗi câu tự luận"; ghi chú trên giao diện; `hedu-de.json` ghi cả hai |
| Q3 | Mã đầu giữ nguyên thứ tự và phương án gốc, mã khác trộn theo lựa chọn; lưu seed, ánh xạ UID, đáp án; tái tạo chính xác | `hedu-de.json`: hạt giống, câu khóa, ngoại lệ, UID và đáp án từng mã |
| Q4 | Mẫu 12 TN + 4 Đ/S + 6 TLN; 5 NB / 4 TH / 3 VD chỉ là preset của HEdu, **không** ghi là quy định của Bộ; sửa toàn bộ được | Nút "Dùng mẫu HEdu 12/4/6" kèm chú thích |
| Q5 | Mỗi mã một PDF và ZIP: PR 3 riêng sau khi hai PR hiện tại đạt | Chưa làm |
| Q6 | Dùng `khaibaochung.tex` của dự án; tiếp tục nghiệm thu tiêu đề, chân trang, số trang, mã đề, ngắt trang theo PDF thực tế | Có trong danh sách nghiệm thu |
| Q7 | Lưu ma trận thành mẫu có tên, **lưu bền**, sao lưu/khôi phục được, không chỉ `localStorage`; tạo, đổi tên, nhân bản, xóa có xác nhận | Chưa làm (PR sau) |
| Q8 | Tránh tái dùng câu đã có trong các đề trước theo phạm vi giáo viên chọn (học kỳ, năm học hoặc đề cụ thể); hiện số ứng viên bị loại; thiếu thì báo và cho nới có chủ đích, không tự nới; không cấm mãi mãi | Chưa làm (PR sau) |
| Q9 | Chờ ma trận thực tế của chủ dự án; chưa coi ma trận HEdu là biểu mẫu của Bộ | Chờ |
| Q10 | Word làm sau, không chặn TeX/PDF | Nút "sắp có" |

### Quy tắc an toàn đã chốt kèm theo (làm trong PR #136)
1. **Câu khóa không lách được chính sách.** Khóa chỉ giữ câu khi câu vẫn đạt mức lấy câu đang chọn. Ngoại lệ (vd chọn tay câu chưa duyệt từ Ngân hàng) phải được giáo viên xác nhận rõ bằng hộp hỏi, được ghi dấu vết (UID, thời điểm, lý do) trong bản nháp và `hedu-de.json`, và hiện nhãn "Ngoại lệ" trên câu. "Cần sửa" và câu có ký tự điều khiển lạ **không bao giờ** vào đề, kể cả khi có ngoại lệ.
2. **Câu khóa mất hiệu lực phải báo.** Câu khóa bị loại (đã xóa, thành "Cần sửa", đổi nội dung nên mất "Đã duyệt", đổi loại/mức, ký tự lạ…) được liệt kê kèm nguyên nhân; chưa xuất được cho tới khi giáo viên xử lý (bỏ khóa hoặc sửa).
3. **Không xuất khi đáp án hoặc tổng chưa khớp.** Mỗi mã đề được kiểm: đáp án đầy đủ (không `?`), khớp `\True`/đáp số trong chính văn bản đã trộn, nhất quán giữa các mã; đối chiếu độc lập số câu, loại câu, bộ câu, điểm so với ma trận. Có lỗi thì nút Lưu/Xuất khóa và hiện danh sách (kèm số câu ở Ngân hàng).
4. **Câu hỏng giữ nguyên trong Ngân hàng**, chỉ bị loại khỏi tập ứng viên; giao diện liệt kê số câu, `#số` và UID, nguyên nhân.
5. Đổi câu trong đề không sửa câu nguồn trong Ngân hàng và không làm mất ánh xạ đáp án (có test).
