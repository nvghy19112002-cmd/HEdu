# Quy tắc GẮN MỨC ĐỘ (NB / TH / VD / VDC)

Chủ dự án duyệt ngày 30/10/2026. Áp dụng cho mọi đường đề xuất mức độ: Gán ID nhờ Claude, AI Gemini, gợi ý trong app.
Đây là phần bổ sung cho `claude/quy-tac-gan-id-chuan.md`. Mức độ là một chữ trong ID6 (N/H/V/C), tách riêng khỏi Dạng.

## 1. Đã chốt
- **Giữ 4 mức**: Nhận biết (N), Thông hiểu (H), Vận dụng (V), Vận dụng cao (C). Mô tả từng mức theo khung 4 mức quen dùng trong ma trận đề (CV 7991/BGDĐT-GDTrH và các ma trận đặc tả lớp 10–12).
- **Mức độ do giáo viên xác minh.** AI/máy chỉ đề xuất. Mức đề xuất không tự ghi vào câu. Giáo viên bấm "Dùng mức đề xuất" (phím K) hoặc "Xác nhận mức độ" (phím M) trong hàng đợi Xác minh.
- **Câu nhiều ý** (Đúng/Sai 4 ý, tự luận a/b/c…): mức độ do **giáo viên duyệt**. AI vẫn đề xuất theo ý khó nhất làm gợi ý. AI ghi "nhiều ý" trong lý do và không để độ chắc "cao" chỉ vì đã chắc Dạng.
- Mức độ của câu **không suy từ loại câu hay tên Dạng**. Trả lời ngắn không mặc nhiên là VD. Trắc nghiệm không mặc nhiên là NB/TH.
- Câu nhập không có ID mang **mức chung chọn ở màn Nhập**. Mức này chỉ là chỗ giữ, chưa phải mức thật của câu.

## 2. Mô tả bốn mức (căn cứ là yêu cầu tư duy của câu)

| Mức | Học sinh phải làm gì | Dấu hiệu nhận ra |
|---|---|---|
| **NB — Nhận biết** | Nhớ, nhận ra, nhắc lại định nghĩa, kí hiệu, công thức, tính chất; đọc kết quả trực tiếp | 1 bước; không biến đổi; dữ kiện đã ở dạng dùng ngay |
| **TH — Thông hiểu** | Hiểu và áp dụng trực tiếp MỘT kiến thức trong tình huống quen thuộc; chuyển cách biểu diễn; giải thích | 2–3 bước quen thuộc; bài mẫu trong sách giáo khoa |
| **VD — Vận dụng** | Phối hợp nhiều kiến thức/kỹ năng; có tham số phải lập điều kiện; đặt ẩn, mô hình hoá bài thực tế quen thuộc | Nhiều bước; phải tự chọn cách làm; có điều kiện cần kết hợp |
| **VDC — Vận dụng cao** | Giải quyết tình huống mới, ít quen; biện luận nhiều trường hợp; phối hợp kiến thức nhiều bài/chương; thực tế phức tạp | Không có lối mòn; chia trường hợp; lời giải dài, cần lập luận chặt |

### Ví dụ (Lớp 10, Chương 1 Tập hợp, lô 30/10/2026)
- NB: tìm $A\cap B$ khi $A$, $B$ đã liệt kê sẵn; tìm $\mathrm{C}_{\mathbb R}(2;+\infty)$; viết $\{x\mid 4\le x\le 9\}$ thành $[4;9]$.
- TH: giải bất phương trình rồi lấy giao hai khoảng; đếm số tập con; liệt kê tập nghiệm phương trình.
- VD: tìm $m$ để $A\subset B$ hoặc $A\cap B\ne\varnothing$ với đoạn/khoảng chứa tham số; bài Ven ba môn.
- VDC: tìm $m$ để $(A\cap B)\subset(-1;3)$, phải chia ba trường hợp theo $m$.

## 3. Cách quyết khi phân vân
1. Xét **ý/bước khó nhất bắt buộc phải làm** để ra đáp án, không xét bước phụ dễ nhất.
2. Hai mức kề nhau đều hợp lý: chọn mức thấp hơn và để `chac` = `thap` (hoặc `vua`). Giáo viên chốt.
3. Đề quá ngắn, hình bị lược, thiếu dữ kiện: không đề xuất mức "cao chắc".

## 4. Trong app
- Tệp lô Gán ID có các dòng hướng dẫn mức độ trong `huongDan` (`src/lib/claudeid.ts`, `HUONG_DAN`).
- Khi nhập đề xuất, mức đề xuất khác mức đang lưu được giữ ở `ReviewRec.propLevel` (tệp phụ `id-review`, không đổi schema).
- Hàng đợi Xác minh: phím **K** "Dùng mức đề xuất" đổi mức độ của câu (câu đã có ID thì ghi lại chữ mức độ trong `%[ID]`, cả hai hoặc không gì cả), rồi đặt Mức độ = "giáo viên xác minh". Có Hoàn tác (U).
- Dò lại Dạng và mức độ của câu đã có trong ngân hàng: chọn mục ở Cây mục lục → Gán ID nhờ Claude → tick **"Kiểm tra lại cả câu đã xác minh"** → Xuất lô (mã lô bắt đầu bằng `K`). Không xoá câu.
  - Claude đồng ý: câu đã xác minh giữ nguyên.
  - Khác Dạng: câu vào "Cần xem lại", Dạng đang lưu giữ nguyên. Giáo viên bấm P (dùng Dạng đề xuất) hoặc Y (giữ Dạng cũ).
  - Khác mức độ: thêm mức đề xuất. Câu đã xác minh Dạng vào nhóm "Mức độ cần xem". Giáo viên bấm K (dùng mức đề xuất) hoặc M (giữ mức cũ).
- Không bao giờ tự ghi Dạng hay mức độ hàng loạt.
