# HEdu — Tiến độ chi tiết cho GPT (26/10/2026, sau beta.33)

Mục đích: để GPT nắm đúng hiện trạng rồi đề xuất tính năng kế tiếp. Đây là nhật ký sự thật, không phải lệnh triển khai. Quy tắc làm việc đầy đủ nằm ở `AGENTS.md`. Mọi đề xuất của GPT sẽ được Claude kiểm chứng với code thật trước khi làm; chủ dự án quyết định cuối cùng.

## 1. Sản phẩm trong một đoạn
App Windows (Tauri 2: Rust + React/TypeScript) cho giáo viên Toán THPT. Ngân hàng câu hỏi LaTeX (định dạng `ex_test`), mỗi câu có ID theo CT 2018 (`[Lớp][Phân môn][Chương][Mức độ N/H/V/C][Bài]-[Dạng]`, ví dụ `2D1H1-1`). Hình TikZ dựng bằng TeX Live có sẵn trên máy. Dữ liệu lưu cục bộ (SQLite). Chủ dự án là giáo viên Toán, không viết code. Kho công khai `nvghy19112002-cmd/HEdu`, nhánh `main`.

## 2. Trạng thái phát hành
- Bản mới nhất: `v0.1.0-beta.33` (kênh beta, 26/10/2026) = beta.32 + dò trùng nhẹ. Chưa có bản chính thức (stable). Quy tắc: beta trước, stable sau; luôn có bản quay lại.
- CHƯA AI NGHIỆM THU trên máy Windows thật cho các bản beta.29 → beta.33. Mọi thử nghiệm giao diện của Claude là trình duyệt + dữ liệu mô phỏng, không phải app Tauri thật với dữ liệu thật.
- Checklist nghiệm thu: `claude/nghiem-thu-beta30.md` (mục F lưu trữ SQLite, G nhập nhiều tệp, H báo cáo nhập, I nhãn).

## 3. Những gì ĐÃ có (theo nhóm chức năng)
**Ngân hàng câu hỏi**: duyệt theo cây Lớp → Phân môn → Chương → Bài → Dạng; chế độ Thẻ / Danh sách; bộ lọc Mức độ, Loại câu, Hình, Duyệt (Chưa kiểm tra / Cần sửa / Đã duyệt), **Nhãn**; tìm chữ (cả toàn kho); sắp xếp; chọn nhiều (trang / kết quả lọc); thao tác hàng loạt: Gắn nhãn, Đánh dấu Cần sửa, Gán ID tự động, Xuất .tex, Chuyển vào Thùng rác (có Hoàn tác). Cố ý KHÔNG có duyệt hàng loạt hay sửa LaTeX hàng loạt.
**Soạn/sửa câu**: trình sửa dùng chung (3 chế độ xem), xem trước LaTeX dựng theo cấu trúc, báo lỗi ngoặc có dòng/cột, "Xem chuẩn" bằng TeX Live, hình TikZ qua DVI (không cần Ghostscript), bảng Gói LaTeX.
**Nhập liệu** (đợt vừa xong): dán mã hoặc **chọn nhiều tệp / cả thư mục** (.tex/.txt, UTF-8 bắt buộc, chỉ đọc, tối đa 2.000 tệp, 20 MB/tệp, sâu 6 cấp); bảng "Theo tệp" (bỏ tick tệp không nhập); rà trùng với ngân hàng và trong chính lô; Gán ID bằng gợi ý nội bộ hoặc AI Gemini; mỗi câu nhập có nhãn `Nguồn: <tệp>`, `Lô: <tên>`, tuỳ chọn `Thư mục: …` và nhãn tự đặt; nhập lô ≥20 câu tự chụp điểm khôi phục; **màn Kết quả nhập** (tìm thấy / nhập / bỏ qua vì trùng / bạn bỏ qua; vị trí theo ID, Dạng đầu, gợi ý, vị trí chung; lỗi xem trước; TeX; theo tệp), lưu `.csv` (Excel đọc được, KHÔNG chứa nội dung câu) và `.md`; **Nhật ký nhập** 20 lần gần nhất (Cài đặt → Dữ liệu & sao lưu); nút "Xem các câu vừa nhập". Giới hạn tạm: 5.000 câu/lô.
**Kiểm tra trùng**: bộ dò nhiều tầng (giống nguyên mã, cùng câu, gần trùng, mâu thuẫn đáp án, cùng mẫu khác dữ kiện); so cặp có giải thích; quyết định của giáo viên ("không trùng", "giữ cả hai", "xem sau") được nhớ; bộ nhãn chuẩn ~150 cặp để đo độ chính xác. Chỉ mục dùng chung với Nhập liệu.
**Gán ID tự động**: gợi ý Dạng theo TF-IDF + câu tương tự trong kho; AI Gemini tuỳ chọn (xin phép mỗi lượt, khoá lưu trong Windows Credential Manager, tối đa 5 cấu hình khoá). Đo 100 câu thật (Gemini 3.8 Flash, mức suy nghĩ thấp): chọn đúng Dạng 76,2% (AI) / 79,8% (trộn); đồng thuận 88,7%.
**Thùng rác độc lập**: xem/tìm/lọc, khôi phục (kể cả vào vị trí mới khi "vị trí không còn"), xoá hẳn có xác nhận.
**Lưu trữ & an toàn dữ liệu**: SQLite là nơi lưu chính (WAL, ghi gia tăng, nạp theo trang, mất điện không hỏng); nâng cấp từ `hedu.json` cũ có xác nhận; điểm khôi phục tự động (≤5); bản chụp .db; xuất ra JSON để quay về; kiểm tra toàn vẹn; chỉ MỘT bản sao lưu trước cập nhật; cập nhật/khôi phục bị chặn khi còn thay đổi chưa ghi.
**Khác**: cập nhật trong app qua GitHub (kênh beta/stable/previous), phóng to 80–150%, Cài đặt 8 mục có ô tìm, xuất .tex 2 kiểu (nguyên văn / thư mục dự án).
Tạm ẩn: màn **Tạo đề** (cờ `FEATURES.exam`), chưa có xuất Word/PDF.

## 4. Bản đồ kỹ thuật ngắn (để GPT hiểu ranh giới)
- Lõi thuần (dễ kiểm thử, không phụ thuộc giao diện): `src/lib/` — `bankfilter.ts` (lọc + đếm theo chiều), `importbatch.ts`, `importreport.ts`, `importid.ts`, `dup2.ts` (so cặp), `dupindex.ts` (chỉ mục), `dupimport.ts`, `idsuggest.ts`, `batchops.ts`, `taxonomy.ts`/`taxpath.ts`.
- Rust (`src-tauri/src/`): `db.rs`, `jsonmig.rs`, `dbbackup.rs`, `dbcmd.rs` (SQLite), `importfs.rs` (đọc tệp nguồn), `ai.rs` (Gemini), `texfolder.rs`, và các lệnh TeX/cập nhật.
- Dữ liệu: schema 3 (`Question.review` thêm ở F2). Nhãn nằm trong `Question.tags` (không đổi schema). Tệp phụ SQLite (khoá `dup-decisions`, `import-reports`) giữ quyết định trùng, Thùng rác, nhãn chuẩn, nhật ký nhập.
- Test: `npm test` (~50 bộ, gồm test cơ sở dò trùng frozen), `npm run build`, `cargo test --lib`; CI `giao-dien` + `windows`.

## 5. Số đo quy mô (thật, trên dữ liệu mô phỏng)
- SQLite: lưu 60.000 câu (77 MB) một giao dịch ~4 s; nạp 60.000 câu ~6,3 s; lọc/sắp xếp 60.000 câu ~0,1 s.
- Chỉ mục dò trùng: trước ~36–44 KB RAM/câu, dựng 1,9 s (5k) / 7,7 s (20k) / 29 s (60k). Beta.33 giảm bộ nhớ khoảng 55% (mô phỏng 10k câu: 10,6 → 4,8 KB/câu), thời gian tương đương, kết quả dò trùng giống hệt từng byte (đã đối chiếu 602 câu). Gán ID thêm ~14 KB/câu.
- Gán ID bằng AI chậm với số lượng lớn (10 câu/lượt, 1–2 phút) ⇒ với hàng nghìn câu nên dựa vào ID có sẵn trong tệp nguồn.
- Giới hạn 5.000 câu/lô GIỮ NGUYÊN cho đến khi đo được trên Windows thật với ngân hàng lớn.

## 6. Việc đã quyết "hoãn" hoặc chưa quyết
- Hoãn: S6 (giao dịch chung Thùng rác + Ngân hàng — rủi ro hồi quy lớn hơn lợi ích hiện tại), hồ sơ người dùng / nhiều nguồn dữ liệu (S5).
- Chờ dữ liệu từ chủ dự án: đo lại Gemini cần nhãn đã kiểm; đổi model mặc định (3.6 Flash / Flash-Lite) cần đo.
- Chưa quyết (nghiệp vụ): nhóm **"Chưa phân loại"** cho câu thiếu/sai ID thay vì dồn vào "vị trí chung"; mở rộng ID cho Lớp 1–2 và cấp khác (hiện `gradeNumber()` chỉ Lớp 3–12); nhập từ Word; MathHub ~60.000 câu; Word Equation/MathType (chỉ là hướng nghiên cứu).
- Bộ lọc Nhãn hiện chọn một nhãn mỗi lần. Nhật ký nhập không có ở chế độ JSON cũ.

## 7. Ứng viên cho tính năng kế tiếp (Claude gợi ý để GPT cân nhắc, CHƯA được chọn)
1. **Nghiệm thu + đo lô lớn trên Windows thật** (điều kiện để nâng giới hạn 5.000/lô): lô thật 5.000–20.000 câu trên `vn.hedu.app.thu`.
2. **"Chưa phân loại" / hàng đợi xếp lại**: màn gom các câu đang ở vị trí chung hoặc thiếu Dạng, gán hàng loạt theo gợi ý có xem trước.
3. **Hàng đợi kiểm duyệt**: duyệt lần lượt từng câu "Chưa kiểm tra" theo lô/nhãn với phím tắt (vẫn không duyệt hàng loạt).
4. **Tạo đề / trộn đề / xuất PDF-Word** (đang ẩn): luồng 3 bước, trộn phương án, ma trận mức độ; cần quyết định nghiệp vụ Toán từ chủ dự án.
5. **Chất lượng nội dung**: báo cáo câu lỗi LaTeX/TikZ theo lô (đã có Xem chuẩn hàng loạt), câu không có đáp án đúng, câu thiếu lời giải.
6. **Nhập từ Word** (cần khảo sát định dạng đề thật của chủ dự án trước).
7. Hồ sơ người dùng / nhiều nguồn dữ liệu (đã thiết kế, đang hoãn).

## 8. Ràng buộc GPT cần giữ khi đề xuất
- Không đổi schema, ID6, UID, thuật toán dò trùng, cây chương trình nếu chưa có đánh giá ảnh hưởng + chủ dự án duyệt. Mọi thứ về SQLite/sao lưu/migration là loại L (cần đặc tả + phương án kiểm thử riêng).
- LaTeX/TikZ phải bảo toàn nguyên văn; phải có test ca khó (`\immini`, `\def` trong tikz, `\newcommand` có tham số, tkz-tab, tikz-3dplot) và ca máy thiếu TeX Live.
- Không duyệt hàng loạt, không xoá/ghi đè ngân hàng thật, không commit dữ liệu thật vào kho công khai. Chạy thử app Tauri chỉ với `vn.hedu.app.thu`.
- Đề xuất nên theo mẫu bàn giao GPT → Claude: vấn đề · hành vi cần có · phương án đề xuất · rủi ro · tiêu chí nghiệm thu · điều chủ dự án đã duyệt. Kèm phân loại quy mô S/M/L.

## 9. Lịch sử PR gần nhất (tham chiếu)
#101 rà soát SQLite (beta.31) · #104 N1 đọc tệp nguồn · #105 N2 nhập nhiều tệp + nhãn · #107 N3 báo cáo nhập · #108 N4 bộ lọc Nhãn + Gắn nhãn hàng loạt (đều trong beta.32) · #110 dò trùng nhẹ (beta.33) · #103 phương án nhập nhiều tệp (tài liệu, đã gộp). Chi tiết từng bản: `GHI-CHU-PHAT-HANH.md`; trạng thái ngắn: `AGENTS.md` mục 7; việc dở cho phiên Claude kế: `claude/ban-giao-desktop.md`.
