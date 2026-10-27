# Phương án hoàn chỉnh Gán ID (loại L) — bản đã chỉnh

Soạn 27/10/2026 từ bản phương án của GPT ("phân loại nhiều tầng, kiểm chứng độc lập, chỉ tự gán khi đủ bằng chứng") sau khi đối chiếu với mã thật và các quyết định đã duyệt. Thay thế mục 7 của `claude/thiet-ke-dot1-cung-co-ngan-hang.md` (thứ tự PR). Chưa có tính năng nào ở mục 3 trở đi được triển khai ngoài PR 1C.
Bất biến: không đổi schema (3), định dạng ID6, UID, LaTeX/TikZ gốc; không tự xoá/duyệt câu; không commit dữ liệu thật.

## 1. Giữ nguyên từ phương án của GPT (đồng ý)
- Taxonomy của HEdu là nguồn chuẩn duy nhất; không suy mã từ thứ tự chương sách hay ID nơi khác.
- Một Dạng chính tạo ID6; kiến thức phụ bằng nhãn. Câu tổng hợp không có Dạng chính rõ ràng ⇒ chờ xem xét, không ép.
- **Dạng và mức độ phân loại riêng; ba trạng thái độc lập**: Dạng (chưa xác minh / máy phân loại / giáo viên xác minh / cần xem lại), Mức độ (chưa xác minh / máy đề xuất / giáo viên xác minh), Nội dung (chưa duyệt / cần sửa / đã duyệt). "Máy phân loại" không tự thành "giáo viên xác minh".
- Nhiều tầng: A đối chiếu câu đã xác minh, B quy tắc toán đã kiểm thử, C tìm ứng viên, D AI có giới hạn (được phép từ chối), E kiểm chứng quyết định. Hai lượt AI đồng ý không tự động là đúng.
- Ba mức hành động: tự gán (chỉ khi đủ điều kiện và anh bật chính sách) / đề xuất cần xác nhận / chưa đủ căn cứ ⇒ "Chưa phân loại". Quyết định giáo viên đã xác nhận được bảo vệ; phát hiện mới chỉ tạo cảnh báo.
- Nhập và phân loại là hai việc riêng; câu khó không chặn cả lô.
- Mục tiêu nghiệm thu có độ tin cậy thống kê, đo riêng từng chỉ số, tách bộ đánh giá khỏi bộ chỉnh, chia theo họ câu; đo hiệu năng 1.000 → 10.000 → 60.000 câu trên Windows.

## 2. Chỉnh sửa so với bản của GPT
1. **"Chưa phân loại" không được mang ID giả.** Hiện câu vào "vị trí chung" bị HEdu ghi ID6 của Dạng đầu vào LaTeX, nhìn như đã phân loại. Sửa: câu chưa phân loại GIỮ LaTeX nguyên văn (không ghi `%[ID]`), có cờ `chưa phân loại` ở tệp phụ, không bao giờ làm căn cứ cho câu khác. (Vị trí vẫn phải có vì schema 3 bắt buộc; không đổi schema.)
2. **Nguồn bằng chứng.** Căn cứ kiểm chứng = câu có Dạng "giáo viên xác minh" HOẶC nội dung "Đã duyệt" (tạm thời, vì chưa có hàng đợi xác nhận Dạng), trừ câu "cần xem lại" hoặc "chưa phân loại". Khi hàng đợi duyệt (giai đoạn 2) có đủ nhãn thì chỉ còn "Dạng giáo viên xác minh". Trạng thái "máy phân loại" KHÔNG phải căn cứ.
3. **Điều kiện hết hiệu lực.** "Máy phân loại" hết hiệu lực khi cây đổi, nội dung đổi (không tính vùng `%[ID]`) hoặc Dạng/mức độ của câu bị đổi. "Giáo viên xác minh" chỉ mất hiệu lực khi nội dung hoặc Dạng đổi, hoặc đường dẫn không còn đúng trong cây; cây đổi chỉ tạo cảnh báo.
4. **Câu có ID bất đồng khi nhập lô lớn.** Không bắt giáo viên chọn từng câu trước khi nhập: lô lớn được phép đưa các câu bất đồng vào hàng chờ (giữ ID gốc trong tệp phụ, đánh dấu cần xem lại) rồi xử lý sau. Chọn từng câu trước khi nhập vẫn giữ cho lô nhỏ. Cần anh duyệt riêng trước khi triển khai (mục 6).
5. **Thống kê mục tiêu 99%.** Muốn kết luận "≥ 99% với tin cậy 95%" cho một nhóm cần xấp xỉ ≥ 300 câu đúng liên tiếp (không sai câu nào); với hàng trăm Dạng, không thể đòi mẫu như vậy cho TỪNG Dạng. Mở tự gán theo NHÓM (tầng bằng chứng × loại quy tắc × nhóm Dạng/Chương); Dạng thiếu mẫu chỉ được đề xuất, không tự gán. Thực tế gần nhất: chỉ câu trùng NGUYÊN VĂN với câu đã xác minh đo được độ đúng cao; các tầng còn lại bắt đầu ở mức "đề xuất".
6. **Giao dịch lô lớn.** Đo thật: 60.000 câu trong một giao dịch SQLite ≈ 4 giây. Giữ đơn vị ghi nhất quán ≤ 5.000 câu (đang dùng), không ép 60.000 câu vào một giao dịch; tiến độ và tiếp tục sau gián đoạn là việc riêng (giai đoạn 3, cần đặc tả L riêng).
7. **Một lần xác nhận AI cho một công việc.** Đúng hướng nhưng đổi quy tắc "xin phép từng lượt" (quy tắc 20): KHÔNG làm cho tới khi anh duyệt riêng. Đến lúc đó giữ nguyên: mặc định tắt, xin phép từng lượt.
8. **AI ngoài (GPT/Claude/Gemini).** Kế hoạch của anh: nhờ các AI này phân loại rồi nạp vào ngân hàng. ID do AI ngoài ghi trong tệp là bằng chứng nguồn "AI ngoài", vào app ở trạng thái Dạng "chưa xác minh", đi qua kiểm chứng PR 1B. Nhiều AI đồng ý cũng không tự thành "xác minh". Cần thêm "sổ tay phân loại" xuất từ HEdu (cây + mô tả + điều kiện chọn/không chọn) để đưa cho AI ngoài (giai đoạn 4); prompt GPT đã có ở `claude/prompt-gpt-gan-id.md`.

## 3. Dữ liệu: trạng thái xác minh (tệp phụ `id-review`, PR 1C)
Khoá = `uid` câu. Mỗi bản ghi: `form` (chua | may | gv | xem-lai), `level` (chua | may | gv), `src` (tep | ai-ngoai | goi-y | ai | tay | soat), `formId`, `level0`, `fp` (dấu nội dung đã bỏ vùng ID), `taxRev`, `at`, `unclassified?`, `why?`. Không đổi schema; xoá tệp thì mọi câu thành "chưa xác minh" (an toàn: thiếu bản ghi luôn hiểu là chưa xác minh). Ghi tệp phụ lỗi sau khi ghi câu cũng chỉ làm câu thành "chưa xác minh".
Quy ước tại thời điểm nhập: ID khớp ngân hàng ⇒ Dạng "máy"; chưa kiểm chứng hoặc bất đồng mà giữ ID ⇒ "chưa" (nguồn `tep`); theo gợi ý ⇒ "máy" (`goi-y`); vị trí chung ⇒ chưa phân loại. Mức độ luôn "chưa" khi nhập. Chỉ giáo viên (bấm xác nhận) tạo "gv".

## 4. Thứ tự triển khai (thay mục 7 của thiết kế Đợt 1)
1. **PR 1C — Nền xác minh**: tệp phụ `id-review`, hai trạng thái Dạng/Mức độ, nguồn bằng chứng, câu chưa phân loại không ghi ID giả, hiển thị trạng thái, nút xác nhận Dạng, lọc theo trạng thái.
2. **Hàng đợi duyệt** (cũ 1F + Soát ID): xem câu/hình rõ, phím tắt, hoàn tác, đồng thời xác nhận Dạng/mức độ; sinh nhãn chuẩn. Soát ID ngân hàng hiện có (chỉ đọc, cờ "cần xem lại").
3. **Nhập lớn chạy nền** (đặc tả L riêng): hàng đợi nền, tạm dừng/tiếp tục, chỉ mục gia tăng, bất đồng vào hàng chờ, đo 1k/10k/60k.
4. **Phân loại nhiều tầng**: mô tả/điều kiện chọn cho từng Dạng (`formrules`), xuất sổ tay cho AI ngoài, tầng A–E.
5. **Đánh giá độc lập** và mở tự gán dần theo nhóm đã đạt.
6. **Nghiệm thu thực tế**: bản sao dữ liệu thật, thao tác Windows, kiểm tra khôi phục.

## 5. Rủi ro đã nhận diện
- Tạm dùng "Đã duyệt" làm căn cứ có thể đưa Dạng chưa được xác nhận vào căn cứ nếu giáo viên duyệt nội dung mà không để ý Dạng ⇒ giai đoạn 2 sẽ tách hẳn.
- Tệp phụ không nằm trong cùng giao dịch với câu hỏi ⇒ mất đồng bộ chỉ làm câu thành "chưa xác minh", không làm sai Dạng.
- Chuyển câu "vị trí chung" sang không ghi ID đổi hành vi cũ: báo cáo nhập và hộp xác nhận phải ghi rõ.

## 6. Điều cần anh quyết (đề xuất của Claude in đậm)
1. Căn cứ tạm thời gồm "Đã duyệt" cho tới khi có hàng đợi xác nhận Dạng: **đồng ý** / chỉ "Dạng giáo viên xác minh".
2. Câu chưa phân loại **không ghi `%[ID]`** vào LaTeX / vẫn ghi ID vị trí chung như cũ.
3. Lô lớn: câu ID bất đồng **vào hàng chờ, xử lý sau** / vẫn bắt chọn trước khi nhập (chỉ áp dụng cho lô lớn, ngưỡng đề xuất 50 câu bất đồng).
4. Xác nhận AI **một lần cho một công việc** (vẫn mặc định tắt) / giữ xin phép từng lượt.

## 7. Quy tắc 15b–15d (chuyển vào `quy-tac-gan-id-chuan.md` mục D sau khi #128 được gộp, để không xung đột với 15a)
- **15b.** Dạng và mức độ có trạng thái xác minh riêng (tệp phụ `id-review`). Dạng: chưa xác minh / máy phân loại / giáo viên xác minh / cần xem lại. Mức độ: chưa / máy / giáo viên. "Máy phân loại" KHÔNG BAO GIỜ tự thành "giáo viên xác minh"; chỉ hành động xác nhận của giáo viên tạo trạng thái đó. Trạng thái hết hiệu lực khi nội dung (không tính vùng ID) hoặc Dạng/mức độ của câu đổi; riêng "máy phân loại" còn hết hiệu lực khi cây đổi.
- **15c.** Căn cứ kiểm chứng chỉ gồm câu có Dạng "giáo viên xác minh" hoặc nội dung "Đã duyệt" (tạm thời), trừ câu "cần xem lại" và "chưa phân loại". Câu chưa duyệt, cần sửa hoặc chỉ "máy phân loại" không bao giờ là căn cứ.
- **15d.** Câu "chưa phân loại" vào vị trí chung KHÔNG được HEdu ghi ID6 giả vào LaTeX; giữ nguyên LaTeX, có cờ ở tệp phụ, không làm căn cứ cho câu khác. Thiếu bản ghi trạng thái luôn hiểu là "chưa xác minh".
