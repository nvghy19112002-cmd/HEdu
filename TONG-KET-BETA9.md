# Tổng kết sau cập nhật — v0.1.0-beta.9 (22/10/2026)

Dành cho ChatGPT đọc để quyết định bước tiếp theo. Nguồn sự thật: code trên `main`, `AGENTS.md`, Issue/PR. Phần "chưa xác nhận" chưa được thử trên máy Windows thật của chủ dự án.

## 1. Đã phát hành (kênh beta)
| Bản | Nội dung chính | PR |
|---|---|---|
| beta.7 | Bảng "Gói LaTeX" trong Nhập liệu (đọc khai báo gói, tra `kpsewhich`, tra tên gói bằng `tlmgr search` có hỏi trước khi dùng mạng, KHÔNG tự cài); phân loại lỗi log TeX; dịch hình an toàn hơn (giờ chót cho cả `dvisvgm`, đọc ống song song, thư mục tạm riêng, ghi SVG nguyên tử, tối đa 3 hình cùng lúc); sửa lỗi mất log/stage từ Rust ("[object Object]") | #4 |
| beta.8 | Dịch hình qua TeX → DVI → SVG, không cần Ghostscript (máy chủ dự án có Ghostscript 10.06, `dvisvgm --pdf` đòi < 10.01 hoặc mutool). lualatex/xelatex vẫn đi đường PDF | #5 |
| beta.9 | Nhúng bộ gói LaTeX riêng (`src-tauri/tex/`: ex_test, ex_tkz-euclide, tkz-tab-vn, tkz-linknodes, twemojis, shared-content) qua `TEXINPUTS`; đầu file vẽ hình mặc định = shared-content + ex_test; thẻ lỗi nêu tên lệnh chưa định nghĩa. Issue #2: sửa thẻ chồng nội dung (nguyên nhân: lớp `sel` trùng `.sel` của ô chọn), header Ngân hàng gọn, tạm ẩn Tạo đề bằng `FEATURES.exam=false` | #8, #10 |

Tác giả ex_test / tkz-tab-vn đã đồng ý cho dùng (chủ dự án xác nhận 22/10/2026).

## 2. Đã kiểm chứng ở đâu
- `npm test` đạt, gồm 300 câu thật (riêng tư, không đưa lên repo): đọc đủ 300 câu, nhận gói trên cả 300 câu.
- CI Windows (build + test Rust) xanh cho mọi PR.
- TeX Live Linux của Claude: kpsewhich đúng/thiếu, báo thiếu gói đúng, câu #0053 (`\IntervalLR`) qua bước LaTeX với preamble mới (dùng gói giả cho vietnam/tabvar/esvect/fontawesome/hobby vì máy thử thiếu).
- Giao diện: đo bằng Playwright (chọn 0/1/4/15 câu; 800/1366/1440/1920 px) — thẻ không chồng, không tràn, không cuộn ngang; các lối vào Tạo đề đã ẩn; bật lại cờ thì hiện lại.
- Chủ dự án đã thấy: bảng Gói LaTeX báo "12 gói đều dùng được" trên 300 câu; lỗi `dvisvgm`/Ghostscript (đã sửa ở beta.8); lỗi `\IntervalLR` (đã xử lý ở beta.9).

## 3. CHƯA xác nhận (cần chủ dự án thử beta.9 trên Windows)
1. Hình TikZ thật sự vẽ ra qua đường DVI trên máy chủ dự án (bước `dvisvgm` chưa thử được ngoài Windows).
2. Câu #0053 (`0D1N2-3`) vẽ được với `ex_test` nhúng.
3. Đầu file đã tự lưu trước đây trong cài đặt không tự cập nhật: cần "khôi phục mặc định" để nhận đầu file mới.
4. TikZ SVG tải bất đồng bộ trong thẻ Ngân hàng (chưa thử với hình thật).
5. Cập nhật trong app từ beta.8 lên beta.9 và bản sao lưu trước cập nhật.

## 4. Còn lại theo Issue
- **#1 (TeX Live/TikZ)**: còn "Xem chuẩn" (biên dịch nguyên câu có `\immini`, macro cùng phạm vi), hủy hẳn tiến trình con TeX trên Windows, lưu đầu file cùng câu hỏi (cần đổi schema → phải duyệt riêng).
- **#9 (parser/hiển thị)**: chưa làm. `\resizebox`, `\hspace`, ngoặc thừa lộ ra ở preview; câu 130 ngoặc lệch; bộ test hồi quy công khai không chứa câu thật.
- **#3, #7**: chưa làm, đúng phạm vi đã chốt.
- Tạo đề: tạm ẩn; mã và dữ liệu còn nguyên.

## 5. Chưa làm (ngoài Issue)
SQLite cho ngân hàng câu hỏi (loại L, cần duyệt thiết kế); bảng danh sách + khung xem trước; xuất Word/PDF; nhập từ Word; nhập MathHub ~60.000 câu.

## 6. Ràng buộc đang giữ
Không đổi schema (`CURRENT_SCHEMA = 2`), ID6, cơ chế backup/cập nhật; chỉ một bản sao lưu; kho công khai (không commit dữ liệu thật); phát hành chỉ qua workflow, beta trước stable.

## 7. Đề xuất thứ tự (để GPT cân nhắc)
1. Chủ dự án thử beta.9 (mục 3) và báo kết quả — quyết định mọi việc sau.
2. Nếu hình vẽ được: làm #9 (preview không lộ ký tự thừa + bộ test hồi quy công khai) rồi "Xem chuẩn" của #1.
3. Nếu hình lỗi: ưu tiên sửa theo log TeX người dùng gửi, chưa mở việc mới.
4. SQLite chỉ sau khi #9 ổn, vì đổi lưu trữ cần migration và chủ dự án duyệt.
