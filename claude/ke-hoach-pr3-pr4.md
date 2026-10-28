# Kế hoạch PR 3 và PR 4 của Tạo đề (chờ chủ dự án duyệt, chưa triển khai)

Trạng thái: **phương án để duyệt**. Chưa viết mã, chưa phát hành. Căn cứ: #135, #136 đã gộp (`24ed055`, `3c3639b`) và quyết định Q5, Q7, Q8 trong `claude/thiet-ke-tao-de.md`.

## 1. Điều đã rà soát trong mã hiện có (ảnh hưởng tới thiết kế)
| Phát hiện | Hệ quả |
|---|---|
| `exam_compile` chỉ dịch `manifest.main_file`; PDF tốt gần nhất lưu **một bản mỗi chế độ** (`last-good.pdf`, `last-good-de.pdf`, `last-good-loigiai.pdf`) | Muốn mỗi mã đề một PDF phải cho phép chọn tệp chính theo từng lần dịch và lưu bản tốt theo (chế độ, tệp chính). Không thể chỉ gọi lại `exam_compile` nhiều lần |
| Dự án do #136 tạo chỉ có `main.tex` chứa **tất cả mã** nối nhau | Cần thêm `main-<mã>.tex` cho từng mã; dự án cũ (đã lưu bằng #136) chưa có |
| Cargo không có thư viện ZIP; PDF đã nén sẵn | Có thể tự viết bộ ghi ZIP "stored" (không nén, chỉ dùng thư viện chuẩn, khoảng 80 dòng + CRC32) thay vì thêm dependency |
| Thư viện đề có sẵn: sổ `index.json`, `.hedu/sources.json` (UID đã chép), thùng rác đề, sao lưu thư viện đề riêng, metadata đề (lớp, năm học, loại, nhãn, thư mục ảo) | Việc "câu đã dùng" nên **dẫn xuất** từ chính các đề trong thư viện, không lập kho mới |
| Mẫu ma trận cần lưu bền; mẫu mô hình `id-review` (sidecar SQLite, sao lưu `.db`, JSON sao lưu, đóng băng khi khôi phục) đã chạy tốt ở beta.35 | Dùng lại đúng mẫu đó cho mẫu ma trận |
| Hiệu năng đã đo: thư viện 1.500 đề dựng chỉ mục 0,45 giây; chọn câu 60.000 câu × 24 dòng dưới 3 giây | Quét UID đã dùng khả thi nếu chỉ đọc tệp nhỏ và có bộ nhớ đệm theo `updatedAt` |

## 2. PR 3 — Xuất đề nâng cao
### Phạm vi
1. **Tệp chính theo mã.** Dự án mới sinh thêm `main-<mã>.tex` (gọi `khaibaochung` + `de-<mã>` + bảng đáp án của mã đó). `main.tex` (tất cả mã) vẫn giữ.
2. **Biên dịch theo tệp chính.** `CompileOpts.main` tùy chọn (phải là `.tex` nằm trong danh sách tệp của dự án). Không đặt = như cũ (mọi bản tốt và bộ đệm hiện có vẫn đúng). Có đặt: bản tốt lưu theo `(chế độ, tệp chính)`, dấu vân bộ đệm có thêm tên tệp chính.
3. **Xuất ZIP.** Lệnh mới `exam_codes_export(id, dest, options)`:
   - dịch tuần tự từng mã (có tiến độ và nút Dừng, tái dùng `exam_compile_cancel`), mặc định chế độ **Đề**; tùy chọn thêm **Lời giải**;
   - gom vào thư mục tạm: `<mã>/de-<mã>.pdf`, `<mã>/de-<mã>.tex`, (tùy chọn) `<mã>/loigiai-<mã>.pdf`, `dapan-<mã>.csv`, và `manifest.json` (SHA-256 từng tệp, hạt giống, UID và đáp án từng mã, phiên bản HEdu, TeX Live, thời điểm);
   - **đối soát manifest với đủ mã** (mỗi mã có PDF hợp lệ, đáp án đủ) rồi mới ghi ZIP bằng tệp tạm + đổi tên; một mã lỗi thì **không tạo ZIP**, báo rõ mã nào lỗi và vì sao, các mã đã dịch xong vẫn giữ trong bộ đệm để thử lại không dịch lại.
4. **Giao diện.** Sau "Lưu vào Thư viện đề": hộp "Xuất PDF từng mã / ZIP" với tiến độ, nút Dừng, danh sách kết quả từng mã; tên tệp có thể truy nguyên.
5. **Đáp án theo mã.** `dapan-<mã>.csv` và bảng đáp án trong `main-<mã>.tex`, sinh từ đúng ánh xạ trộn; mâu thuẫn đáp án chặn xuất (đã có từ #136).

### Không làm
Không đổi `manifestVersion`, schema ngân hàng, UID. Không thêm dependency. Không sửa dự án cũ im lặng. Không tự chốt đề. Word không nằm trong PR này.

### Kiểm thử
- Rust: `main` ngoài danh sách tệp bị từ chối; hai tệp chính không ghi đè bản tốt của nhau; bộ đệm cũ (không `main`) vẫn dùng được; bộ ghi ZIP đọc lại được bằng bộ đọc độc lập (kiểm CRC, tên có dấu tiếng Việt, tệp rỗng); mã lỗi giữa chừng không để lại ZIP dở.
- TS: sinh `main-<mã>.tex` đúng; manifest khớp tệp; đối soát bắt thiếu mã.
- Biên dịch thật bằng TeX Live với 4 mã; kiểm bằng app thử (`vn.hedu.app.thu`); đo thời gian một mã và 24 mã.

### Tác động tới Thư viện đề, hiệu năng, khôi phục
- Thư viện: chỉ thêm tệp vào dự án mới và thêm một tùy chọn biên dịch; dự án cũ không đổi. "Chốt đề" vẫn dựa vào tệp chính của manifest (nói rõ trong giao diện: chốt áp dụng cho bản gộp, không cho từng mã).
- Hiệu năng: dịch tuần tự, mỗi mã vài giây tới vài chục giây tùy hình TikZ; 24 mã có thể mất vài phút nên bắt buộc có tiến độ, Dừng, và dùng lại bộ đệm.
- Khôi phục: bản tốt theo mã nằm trong `cache/` (dựng lại được); ZIP chỉ là sản phẩm xuất, nguồn thật vẫn là dự án trong thư viện (được sao lưu thư viện đề).

## 3. PR 4 — Mẫu ma trận và quản lý sử dụng câu
### 3A. Mẫu ma trận lưu bền
- Lưu ở tệp phụ SQLite `exam-templates` (cùng cơ chế `id-review`): có trong sao lưu `.db`, trong sao lưu JSON thủ công (thêm trường `examTemplates`, gộp theo `id`, bản mới hơn thắng), đóng băng ghi khi khôi phục; bản web dùng `localStorage` như bản lưu tạm.
- Một mẫu: `{ id, name, rows, policy, scoring, options (số mã, trộn…), createdAt, updatedAt }`. **Không** lưu câu khóa, ngoại lệ, UID, thông tin trường (đó là của từng đề).
- Thao tác: tạo (từ ma trận hiện tại), đổi tên, nhân bản, xóa (hỏi xác nhận), áp dụng. Áp dụng vào ma trận đang có hỏi "thay hay thêm". Mẫu tham chiếu nút cây đã bị xóa: giữ dòng, đánh dấu "không còn trong cây", không tự sửa.
- Ghi lỗi: giống `commitRecs` (chỉ báo thành công sau khi ghi đĩa, lỗi thì hoàn lại).

### 3B. Theo dõi câu đã dùng
- **Nguồn dữ liệu = các đề đang có trong Thư viện** (không kho riêng): UID trong `hedu-de.json` (đề sinh bằng Tạo đề) và trong `.hedu/sources.json` (đề lưu từ Ngân hàng, mọi trạng thái nguyên văn/đã đổi). Đề trong thùng rác không tính; khôi phục đề thì tính lại. Vì dẫn xuất nên không thể lệch với thư viện.
- Lệnh Rust `exam_usage_scan(filter)` đọc có chọn lọc, trả `uid → [{đề, năm học, học kỳ/loại, thư mục, ngày}]`, bộ nhớ đệm theo `updatedAt` của từng đề; đo ở 1.500 đề.
- **Phạm vi tránh tái dùng do giáo viên chọn**: theo thư mục ảo (vd "Lớp 12/Học kỳ 1"), theo năm học, theo loại đề, hoặc chọn từng đề cụ thể. Mặc định **tắt**. Không cấm vĩnh viễn câu nào.
- Giao diện: ô "Tránh câu đã dùng trong…" ở phần ma trận; hiện "đã loại N câu ứng viên vì đã dùng ở …"; nhãn "Đã dùng ở: <đề>" trong danh sách đổi câu; thiếu câu thì báo thiếu kèm nút **"Cho phép dùng lại câu đã dùng ở …"** do giáo viên bấm (không tự nới), việc nới được ghi vào `hedu-de.json`.
- Đổi nội dung câu sau khi đã dùng: vẫn tính "đã dùng" theo UID (xem quyết định D5).
- Bảo toàn UID và ngân hàng: chỉ đọc; không ghi gì vào câu.

### Kiểm thử
Mẫu: ghi lỗi hoàn lại, sao lưu/khôi phục `.db` và JSON, nhân bản, xóa có xác nhận, đóng băng khi khôi phục, nút cây đã xóa. Sử dụng câu: thiếu câu thì báo và không tự nới, phạm vi (thư mục/năm học/đề cụ thể), thùng rác và khôi phục, `sources.json` và `hedu-de.json`, đề hỏng không làm sập quét, 1.500 đề dưới ngưỡng thời gian.

## 4. Thứ tự và phụ thuộc
1. **PR 3** (độc lập, nền cho PR 4 vì mỗi mã sẽ có tệp riêng).
2. **PR 4A** mẫu ma trận (độc lập, nhỏ).
3. **PR 4B** theo dõi câu đã dùng (cần `hedu-de.json` từ #136, đã có).
PR 4A và 4B tách riêng để duyệt và quay lui từng phần. Mỗi PR có test, CI Windows, thử bằng app thử; **không phát hành** cho tới khi bạn ra lệnh riêng.

## 5. Quyết định cần chủ dự án chốt
Mỗi mục có đáp án đề nghị.
| # | Câu hỏi | Đề nghị |
|---|---|---|
| D1 | ZIP gồm gì cho mỗi mã? | PDF **Đề** + nguồn `.tex` + đáp án `.csv`; PDF **Lời giải** là tùy chọn (mặc định tắt) vì dịch thêm một lượt mỗi mã |
| D2 | Đáp án từng mã dạng nào? | `.csv` trong ZIP và bảng đáp án ở cuối `main-<mã>.tex`; PDF đáp án riêng từng mã để sau |
| D3 | Quy ước tên tệp | `<kỳ thi>-<mã>-de.pdf`, `<kỳ thi>-<mã>-loigiai.pdf`, `<kỳ thi>-dapan-<mã>.csv`; ZIP `<kỳ thi>-<yyyy-mm-dd>-<8 ký tự đầu hạt giống>.zip` (bỏ dấu, ký tự an toàn trên Windows) |
| D4 | Đề đã lưu bằng #136 (chưa có `main-<mã>.tex`) | Thêm nút "Bổ sung tệp chính từng mã" (sinh từ `hedu-de.json`, hỏi trước khi ghi); không tự sửa |
| D5 | Câu đã đổi nội dung sau khi dùng có còn tính "đã dùng"? | Có (theo UID), kèm nhãn "đã sửa sau khi dùng" |
| D6 | "Đã dùng" chỉ tính đề sinh bằng Tạo đề và đề lưu từ Ngân hàng, hay cả đề `.tex` nhập tay? | Chỉ hai loại có UID. Dò nội dung trong đề nhập tay (so khớp gần đúng) để sau, có thể sai nên cần duyệt riêng |
| D7 | Mẫu ma trận lưu những gì? | Dòng ma trận, chính sách lấy câu, điểm, số mã và tùy chọn trộn; **không** lưu thông tin trường/kỳ thi, câu khóa, ngoại lệ |
| D8 | Phạm vi tránh tái dùng có thể chọn gì? | Thư mục ảo, năm học, loại đề, hoặc từng đề; mặc định tắt |
| D9 | Giới hạn số mã mỗi lần xuất ZIP | Tối đa 24 mã (bằng giới hạn hiện có), có cảnh báo thời gian |
