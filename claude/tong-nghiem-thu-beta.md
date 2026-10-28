# Tổng nghiệm thu beta: Tạo đề (PR 3, 4A, 4B)

Trạng thái: `main` = 8f5c7ac (gộp #140, CI `Kiểm tra` xanh). Chưa tạo tag, chưa phát hành. Phiên bản đề xuất: **`v0.1.0-beta.36`** (beta.35 là bản mới nhất đã phát hành). Chỉ phát hành khi chủ dự án ra lệnh riêng và mục "Chặn phát hành" bên dưới đã được thử.

Chi tiết từng bước nằm ở `claude/nghiem-thu-tao-de.md`. Thử bằng bản cài hoặc app thử `vn.hedu.app.thu`; không thử trên ngân hàng thật nếu chưa sao lưu `.db`.

## Đã kiểm tự động (không thay cho nghiệm thu)
| Mục | Kết quả |
|---|---|
| `npm test`, typecheck (0 lỗi), build, `cargo test --lib` (204) | đạt, trên HEAD #140 |
| CI `windows`, `giao-dien` trên #140; `Kiểm tra` trên `main` sau gộp | xanh |
| 4B trong app Tauri thử (dữ liệu giả lập, qua CDP) | lọc, thiếu câu, dùng lại, xác nhận lại khi thêm đề, chặn lưu khi Thư viện đổi, dấu vết `hedu-de.json`, Thùng rác/khôi phục: đạt |
| Quét 1.500 đề giả lập | 710 ms (số đo kiểm thử, không phải bảo đảm) |
| PDF/ZIP với TeX Live thật (PR 3), sao lưu/khôi phục mẫu (4A) | đã kiểm ở PR tương ứng |

## Chưa thử trên Windows thật (thầy/cô tick)
**Chặn phát hành**
- [ ] Hộp `window.confirm` khi đưa câu chưa duyệt từ Ngân hàng vào đề: **OK** (vào đề, nhãn "Ngoại lệ", `hedu-de.json` có `ngoaiLe`), **Hủy** (chỉ câu đạt mức vào đề), câu **"Cần sửa"** bị từ chối.
- [ ] Kiểm lộ đáp án: Gói học sinh, mở **từng** PDF, không thấy đáp án, lời giải, bảng đáp án (cả khi nguồn có `\True`).

**Tạo đề**
- [ ] Ma trận 12/4/6 → xem trước → khóa, đổi câu, ngẫu nhiên → Lưu vào Thư viện đề. Dòng "không còn trong cây" khóa nút Lưu/Xuất.

**Mẫu ma trận (4A)**
- [ ] Lưu, áp dụng (thay/thêm), đổi tên, nhân bản, xóa có xác nhận; đóng mở app mẫu vẫn còn; Hoàn tác áp dụng mẫu.

**Tránh câu đã dùng (4B)**
- [ ] Mặc định tắt. Bật, chọn thư mục/năm học/loại đề: số đề và số câu đối chiếu đúng, logic "hoặc/và" hiển thị đúng.
- [ ] Đưa một đề vào Thùng rác rồi mở lại Tạo đề: câu của đề đó hết bị loại; khôi phục: bị loại lại.
- [ ] Ma trận lớn hơn số câu chưa dùng: báo thiếu + số ứng viên bị loại; chỉ xuất được sau khi bấm "Cho phép dùng lại" (có hỏi xác nhận). Thêm đề mới dùng câu đó: phải xác nhận lại.
- [ ] Câu khóa tay đã dùng: có cảnh báo; `hedu-de.json` có `tranhCauDaDung.cauKhoaDaDung`.
- [ ] Đề nhập tay (`.tex`): hiện "chưa thể đối chiếu đầy đủ", không bị coi là chưa dùng.

**PDF/ZIP (PR 3)**
- [ ] Gói giáo viên: `de/`, `loigiai/`, `dapan/*.csv` (mở bằng Excel, đúng tiếng Việt), `nguon/` biên dịch lại được, `manifest.json`.
- [ ] Xuất hai lần: hai ZIP tên khác nhau; **Dừng** giữa chừng: không ZIP, không `.part`; đề cũ: Bổ sung tệp chính từng mã; ổ gần đầy: báo trước.

**Sao lưu/khôi phục**
- [ ] Cài đặt → Dữ liệu & sao lưu: chụp `.db`, đổi tên mẫu, khôi phục: tên trở về. Sao lưu JSON: xóa mẫu, khôi phục: mẫu trở về; mở bản JSON cũ không có `examTemplates` vẫn được.
- [ ] Đề trong Thư viện và Thùng rác còn nguyên sau khôi phục; ngân hàng mở bình thường.

## Giới hạn đã biết (không chặn beta)
- 4B chưa hiển thị nhãn "đã sửa sau khi dùng" (D5: chưa đủ căn cứ); chưa có bộ nhớ đệm quét.
- Sổ nguồn UID chỉ ghi câu của mã đầu; đề cũ không có dấu vân nguồn.
- "Xuất ra JSON" kiểu cũ không chứa mẫu ma trận; dùng bản chụp `.db` hoặc file sao lưu JSON.
