# Đợt 1 — Củng cố ngân hàng: ID đáng tin (loại L, CHỜ CHỦ DỰ ÁN DUYỆT)

Mốc đối chiếu: `main` ca75b22, beta.34. Soạn 27/10/2026. **Cập nhật 28/10/2026:** duyệt nội dung TÁCH khỏi xác minh Dạng/mức độ (căn cứ kiểm chứng chỉ là Dạng giáo viên xác minh); câu bất đồng vào hàng đợi, không chặn nhập; thứ tự PR và tài liệu hiện hành ở `claude/phuong-an-gan-id-hoan-chinh.md`. Mục 3.1–3.3 dưới đây đã được thay/cập nhật bởi tài liệu đó khi mâu thuẫn. Chưa có dòng mã nào được sửa theo tài liệu này.
Bất biến: không đổi schema (3), định dạng ID6, UID, LaTeX/TikZ gốc, thuật toán dò trùng; không tự xoá/duyệt câu; không commit dữ liệu thật.

## 1. Vấn đề (từ góc nhìn giáo viên)
1. Nạp .tex có sẵn `%[ID]`: mã đúng cú pháp và còn trong cây là được **tin tuyệt đối** (`idFromLatex` → `toDrafts`, Extra.tsx). Không đối chiếu nội dung hay ngân hàng. Mã sai nhưng "trúng" một Dạng có thật sẽ vào ngân hàng như đã phân loại đúng; báo cáo nhập còn ghi `dung-ma`. Mức độ (N/H/V/C) cũng lấy từ mã.
2. Gợi ý (nội bộ/AI) chỉ chạy cho câu **không có ID hợp lệ** (`noIdRows`). Câu có ID không bao giờ được kiểm lại.
3. Ngân hàng hiện có không có cách soát ID cũ sai; không phân biệt "ID đã xác minh" với "ID chỉ do tệp nguồn ghi".
4. AI chọn Dạng chỉ ~77–80% (cần ≥ 95%, nhãn do giáo viên xác minh, ≥ 100 câu). Chưa có bộ nhãn; v4 chưa được đo.

## 2. So sánh ý tưởng nguồn mở (đã tra 27/10/2026; chỉ lấy ý tưởng, không chép mã)
- **cleanlab / confident learning**: dò nhãn sai bằng dự đoán *ngoài mẫu* (không nhìn nhãn của chính câu), chỉ cờ khi mô hình tin chắc khác nhãn hiện có. ⇒ Ta đã có `IdSuggester` với `excludeUid` (bỏ phiếu của chính câu): dùng nó làm "dự đoán ngoài mẫu" để soát ngân hàng và ID nhập vào. Không cần thư viện ML.
- **NAICS-GH (truy xuất rồi kiểm chứng)**: lấy ví dụ gần nhất đã có nhãn, rồi mới cho mô hình kiểm. ⇒ khớp quy tắc 15: ngân hàng làm bằng chứng cho AI.
- **Nemotron-CC-Math**: nhãn ngoài danh sách bị gộp vào "Khác". ⇒ tương ứng `form_id = null` / "Chưa phân loại"; không ép vào Dạng gần nhất.
- Không có dự án mở nào gộp nhập LaTeX + kiểm chứng + dò trùng (pyexams, examgen chỉ tạo đề) ⇒ phần này tự thiết kế, nhưng nguyên lý lấy từ trên.

## 3. Hành vi cần có
### 3.1 Phân hạng ID khi nhập (PR 1B)
Mỗi câu có ID hợp lệ được chấm bằng bằng chứng độc lập (không dùng chính ID để chấm):
- **Khớp**: gợi ý tin cậy "cao/vừa" (`IdSuggester`, loại trừ chính câu) cùng Dạng với ID; hoặc câu giống/gần giống **có Dạng do giáo viên xác minh** (không phải chỉ "Đã duyệt" nội dung) ở đúng Dạng đó.
- **Chưa kiểm chứng**: không đủ căn cứ (câu mới, kho thiếu mẫu, `cut`, có hình thiếu căn cứ).
- **Bất đồng**: bằng chứng độc lập tin cậy cao chỉ Dạng/Bài khác ID.
Tick "đồng ý" mới nhập với nhóm Bất đồng: mặc định **không nhập thẳng**; vào hàng chờ để giáo viên chọn (giữ ID cũ / theo gợi ý / vị trí chung). "Chưa kiểm chứng" được nhập nhưng mang trạng thái chưa xác minh (3.2). Mức độ từ ID cũng chỉ giữ khi không bất đồng với gợi ý; đổi mức độ vẫn chỉ khi giáo viên tick riêng.
AI (tuỳ chọn, xin phép từng lượt như hiện nay) có thể dùng để kiểm lô Bất đồng/Chưa kiểm chứng; không bắt buộc.

### 3.2 Trạng thái xác minh ID (PR 1C)
Mỗi câu có trạng thái: `da-xac-minh` (giáo viên chọn/xác nhận), `khop` (bằng chứng độc lập khớp), `chua-kiem-chung`, `nghi-sai`. Lưu ở **tệp phụ SQLite** khoá `id-review` (uid → trạng thái, ngày, `taxRev`, lý do), dựng lại/bỏ đi được, KHÔNG đổi schema, KHÔNG chạm LaTeX. Đổi cây ⇒ trạng thái `khop` hết hạn.
Bộ lọc mới trong Ngân hàng: "ID: chưa kiểm chứng / nghi sai / đã xác minh".

### 3.3 Soát ngân hàng hiện có (PR 1C)
Nút "Soát ID" chạy nền trên máy (không mạng): mỗi câu có ID được `IdSuggester` dự đoán ngoài mẫu; chỉ **cờ `nghi-sai` khi độ tin cậy "cao" và khác ID hiện có**. Hàng đợi xem từng câu: hiện ID hiện tại, gợi ý, câu dẫn chứng; giáo viên chọn Giữ / Đổi / Bỏ qua. Không tự sửa. Mỗi lựa chọn của giáo viên → trạng thái `da-xac-minh` (và là một nhãn chuẩn, xem 3.5). Đổi ID ghi cả vị trí và `%[ID]` theo `idapply` (quy tắc 10) kèm Hoàn tác.

### 3.4 "Chưa phân loại" (PR 1D)
Màn gom câu đang ở vị trí chung / thiếu Dạng / ID lỗi / `form_id = null`; gán hàng loạt có xem trước theo `idapply` (≤ 200 câu/lượt). Cần chủ dự án chốt: ngân hàng có nhóm "Chưa phân loại" riêng, hay vẫn dùng vị trí chung?

### 3.5 Bộ nhãn chuẩn sinh ra từ việc duyệt (PR 1E)
Mọi xác nhận ở 3.3 là nhãn do giáo viên xác minh. Công cụ "Đo độ chính xác AI" nhận nguồn "câu đã xác minh trong ngân hàng" (không xuất nội dung câu ra tệp công khai). Khi đủ ≥ 100 câu thì đo lại v4 (đúng nhóm ≥ 95%, bao phủ ≥ 50%) và đo model 3.6 Flash trước khi đổi mặc định.

### 3.6 Hoàn thiện ngân hàng (PR 1F, sau cùng)
Hàng đợi kiểm duyệt từng câu (phím tắt, vẫn KHÔNG duyệt hàng loạt); bộ lọc Nhãn chọn nhiều nhãn. Phục vụ Đợt 2: ma trận đề chỉ lấy câu **Đã duyệt** (đã được chủ dự án chọn) và nên thêm điều kiện ID `da-xac-minh`/`khop`.

## 4. Kế hoạch PR (mỗi PR kiểm được riêng, theo thứ tự)
| PR | Nội dung | Quy mô |
|---|---|---|
| 1A | Tài liệu này + sửa `quy-tac-gan-id-chuan.md` mục D (ID có sẵn = bằng chứng cần kiểm chứng) | S |
| 1B | Phân hạng ID khi nhập, hàng chờ Bất đồng, báo cáo nhập đổi nhãn `dung-ma` | M |
| 1C | Tệp phụ `id-review`, Soát ID, hàng đợi xem xét, bộ lọc, Hoàn tác | L (đụng lưu trữ phụ) |
| 1D | Chưa phân loại + gán hàng loạt | M |
| 1E | Nguồn đo từ câu đã xác minh; đo v4 và 3.6 Flash | M |
| 1F | Hàng đợi kiểm duyệt từng câu; lọc nhiều nhãn | M |
Mỗi PR: test (`npm test`, `cargo test --lib --locked`, build), CI xanh, chạy thử bằng `vn.hedu.app.thu`, chủ dự án duyệt riêng. Không phát hành khi chưa có lệnh riêng.

## 5. Rủi ro và cách chặn
- **Cờ sai làm giáo viên mất tin**: chỉ cờ khi tin cậy "cao" (đo GĐ0: đúng 95–98%, phủ 13–15%); phần còn lại để "chưa kiểm chứng", không cờ. Đo tỉ lệ cờ sai trên nhãn xác minh trước khi nâng ngưỡng.
- **Kho nhỏ/thiếu mẫu**: gợi ý yếu ⇒ nhiều câu "chưa kiểm chứng"; chấp nhận, không ép.
- **Lệch theo cây**: `taxRev` để trạng thái cũ tự hết hạn.
- **Hiệu năng**: soát hàng nghìn câu dùng chỉ mục dò trùng đã có (~14 KB/câu thêm cho Gán ID); chạy theo lô, huỷ được, không chặn giao diện.
- **Mất dữ liệu**: Soát ID chỉ đọc; chỉ ghi khi giáo viên chọn, qua `idapply` (kiểm lại trước khi ghi, Hoàn tác, điểm khôi phục khi ≥ 20 câu).
- **Quyền riêng tư**: AI chỉ khi bật, xin phép từng lượt; không đưa nhãn/câu thật vào repo.

## 6. Tiêu chí nghiệm thu
1. Nhập tệp mẫu có ID đúng/sai/thiếu/mâu thuẫn: ID sai-nhưng-hợp-lệ rơi vào Bất đồng (không nhập lặng lẽ); LaTeX nguyên văn.
2. Soát ID trên kho mẫu có chủ ý gắn sai: bắt được ≥ 80% câu gắn sai thuộc nhóm tin cậy cao; cờ sai ≤ 5% câu đúng (đo trên dữ liệu mô phỏng, rồi trên kho thật bằng nhãn xác minh).
3. Mọi đổi ID có Hoàn tác; không đổi trường nào ngoài vùng ID (quy tắc 11).
4. Không đổi schema; tệp phụ xoá đi không mất câu hay ID.
5. Chủ dự án nghiệm thu trên Windows thật, kể cả beta.34 (`claude/nghiem-thu-de-thi.md`).

## 7. Điều chủ dự án cần quyết (đề xuất của Claude in đậm)
1. Câu Bất đồng khi nhập: **vào hàng chờ chọn** / giữ ID cũ.
2. Trạng thái xác minh lưu ở **tệp phụ** / nhãn trong câu.
3. Câu "chưa kiểm chứng": **nhập được, gắn trạng thái** / bắt xem lại khi lô > 20 câu.
4. "Chưa phân loại": **nhóm riêng** / vị trí chung như cũ.
5. Có dùng AI để kiểm lô Bất đồng không (mặc định **tắt**, bật từng lượt).

## 8. Việc nên nhờ GPT (theo AGENTS.md mục 2; không bắt buộc)
- Rà đặc tả này, đặc biệt mục 3.1–3.3 và rủi ro cờ sai.
- Nghiên cứu phần mềm ngân hàng đề tương tự cho Đợt 2 (ma trận đề, trộn đề) và Đợt 4 (xuất Word từ `ex_test`); bàn giao theo mẫu GPT → Claude.
