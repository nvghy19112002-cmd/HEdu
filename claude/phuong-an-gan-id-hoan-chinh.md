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
2. **Nguồn bằng chứng (đã chốt 28/10/2026).** Căn cứ kiểm chứng = CHỈ câu có Dạng "giáo viên xác minh" (trừ "cần xem lại" / "chưa phân loại"). **Duyệt nội dung ("Đã duyệt") tách hẳn khỏi xác minh Dạng/mức độ**: chỉ để tham khảo, KHÔNG tự thành nhãn ID chuẩn. Trạng thái "máy phân loại" cũng KHÔNG phải căn cứ. Hệ quả: ngân hàng hiện có chưa có câu nào làm căn cứ cho tới khi giáo viên xác nhận Dạng (hàng đợi xác minh, PR 1E).
3. **Điều kiện hết hiệu lực.** "Máy phân loại" hết hiệu lực khi cây đổi, nội dung đổi (không tính vùng `%[ID]`) hoặc Dạng/mức độ của câu bị đổi. "Giáo viên xác minh" chỉ mất hiệu lực khi nội dung hoặc Dạng đổi, hoặc đường dẫn không còn đúng trong cây; cây đổi chỉ tạo cảnh báo.
4. **Câu có ID bất đồng (đã chốt 28/10/2026): vào hàng đợi, không chặn nhập.** Mặc định "chờ xác minh": giữ ID gốc ở đúng vị trí tệp ghi, LaTeX nguyên văn, Dạng "cần xem lại", Dạng máy đề xuất lưu ở tệp phụ (`prop`), ID nguyên bản lưu ở `orig`. Giáo viên vẫn chọn ngay từng câu được (giữ ID / theo gợi ý / chưa phân loại). Quyết định cũ mất hiệu lực (gợi ý, cây hoặc câu đổi) thì quay về "chờ xác minh", không ghi vị trí mới.
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
1. ~~Căn cứ tạm gồm "Đã duyệt"~~ — **ĐÃ CHỐT (28/10/2026): chỉ "Dạng giáo viên xác minh"**; duyệt nội dung tách riêng.
2. Câu chưa phân loại không ghi `%[ID]` — **ĐÃ CHỐT**.
3. Câu ID bất đồng vào hàng đợi, không chặn nhập — **ĐÃ CHỐT**.
4. Xác nhận AI **một lần cho một công việc** (vẫn mặc định tắt) / giữ xin phép từng lượt — **CHƯA quyết, chưa làm**.

## 7. Quy tắc 15b–15d (chuyển vào `quy-tac-gan-id-chuan.md` mục D sau khi #128 được gộp, để không xung đột với 15a)
- **15b.** Dạng và mức độ có trạng thái xác minh riêng (tệp phụ `id-review`). Dạng: chưa xác minh / máy phân loại / giáo viên xác minh / cần xem lại. Mức độ: chưa / máy / giáo viên. "Máy phân loại" KHÔNG BAO GIỜ tự thành "giáo viên xác minh"; chỉ hành động xác nhận của giáo viên tạo trạng thái đó. Trạng thái hết hiệu lực khi nội dung (không tính vùng ID) hoặc Dạng/mức độ của câu đổi; riêng "máy phân loại" còn hết hiệu lực khi cây đổi.
- **15c.** Căn cứ kiểm chứng chỉ gồm câu có Dạng "giáo viên xác minh" hoặc nội dung "Đã duyệt" (tạm thời), trừ câu "cần xem lại" và "chưa phân loại". Câu chưa duyệt, cần sửa hoặc chỉ "máy phân loại" không bao giờ là căn cứ.
- **15d.** Câu "chưa phân loại" vào vị trí chung KHÔNG được HEdu ghi ID6 giả vào LaTeX; giữ nguyên LaTeX, có cờ ở tệp phụ, không làm căn cứ cho câu khác. Thiếu bản ghi trạng thái luôn hiểu là "chưa xác minh".

## 8. Sao lưu và khôi phục trạng thái xác minh (PR 1C, bổ sung 28/10/2026)
Ba loại "bản sao" khác nhau, đã ghi rõ trên giao diện:
| Loại | Gồm trạng thái xác minh ID? | Dùng để |
|---|---|---|
| **Bản chụp `.db`, điểm khôi phục, bản trước cập nhật** (SQLite) | **Có, nguyên trạng** (cả bảng tệp phụ nằm trong tệp .db) | Sao lưu ĐẦY ĐỦ và khôi phục. Có kiểm toàn vẹn. Kiểm thử: `dbbackup::tests::ban_chup_diem_khoi_phuc_va_truoc_cap_nhat_deu_giu_trang_thai_xac_minh`. |
| **File sao lưu JSON** ("Sao lưu thủ công") | **Có** (`idReview`; file cũ không có thì mọi câu là "chưa xác minh") | Mang ngân hàng sang máy khác. Khôi phục THAY câu hỏi, GỘP tệp phụ (bản mới hơn thắng, không xoá bản ghi chỉ có ở máy hiện tại). Không gồm điểm khôi phục. |
| **Xuất ra JSON (cấu trúc cũ)** | **Có**, ở `id-review.json` cạnh `hedu.json` và `dup-decisions.json` (bản HEdu cũ bỏ qua tệp lạ) | Trao đổi / quay về bản HEdu cũ. KHÔNG phải sao lưu đầy đủ (không có điểm khôi phục, nhật ký). Chuyển ngược JSON → SQLite mang theo `id-review.json`; tệp hỏng bị bỏ qua kèm cảnh báo (mọi câu thành "chưa xác minh"), không chặn chuyển. |
Quy tắc an toàn khi thay cả tệp dữ liệu (khôi phục `.db`, khôi phục sau cập nhật): ghi nốt trạng thái hiện tại, rồi KHOÁ ghi để bản trong bộ nhớ không đè lên bản vừa khôi phục; sau khôi phục app tải lại. Cập nhật/khôi phục không bị chặn vô cớ khi không có gì chưa ghi.

## 9. Hàng đợi xác minh từng câu (PR 1E, 28/10/2026)
Nút "Hàng đợi xác minh (N)" trong Ngân hàng, xử lý các câu của DANH SÁCH ĐANG LỌC chưa được giáo viên xác minh Dạng. Nhóm theo thứ tự: cần xem lại → chưa phân loại → máy phân loại → chưa xác minh.
- Phím: `Y`/Enter xác nhận Dạng · `M` xác nhận mức độ · `N` cần xem lại · `1`-`3` đổi sang Dạng gợi ý (rồi xác nhận) · `D` chọn Dạng khác · `U` hoàn tác · `S`/`→` bỏ qua · `←` về trước · `L` lời giải · `?` bảng phím · `Esc` đóng.
- Đổi Dạng = đổi vị trí và ghi ID6 mới vào `%[ID]` cùng lúc, mức độ giữ nguyên; không ghi được thì không đổi gì. Hoàn tác trả lại ĐÚNG vị trí và LaTeX cũ nếu câu chưa bị sửa tiếp; hoàn tác cũng là một bước trong lịch sử.
- Duyệt NỘI DUNG là ô riêng trong hàng đợi, không bị các phím trên đổi; không tự thành xác minh Dạng.
- Gợi ý chỉ để tham khảo (dựa trên câu trong ngân hàng), không phải căn cứ kiểm chứng. Mỗi lần giáo viên xác nhận tạo thêm căn cứ kiểm chứng cho câu nhập sau.
- Chưa làm: hàng đợi chạy nền cho lô rất lớn, phím tắt tuỳ biến, lưu vị trí đang xem giữa các phiên.
