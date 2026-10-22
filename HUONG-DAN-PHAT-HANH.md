# Hướng dẫn phát hành HEdu (dành cho người không viết code)

Mỗi đợt cập nhật gồm hai bước: **thử bằng beta**, rồi **đưa lên bản chính thức**. Bạn chỉ cần nhờ Claude "phát hành beta" hoặc "phát hành chính thức", hoặc tự làm theo phần 3 và 4.

## 1. Cách hoạt động (một phút)

| Kênh | Ai nhận | Dùng khi |
|---|---|---|
| **Chính thức** | Mọi người dùng | Bản đã thử kỹ |
| **Thử nghiệm (beta)** | Chỉ máy bạn chọn kênh beta trong *Hệ thống* | Thử bản mới trước |
| **Bản trước** | Nút "Quay lại bản trước" | Bản mới có lỗi |

Trên GitHub luôn chỉ giữ tối đa **3 bản cài**: chính thức, bản trước, beta mới nhất. Bản cũ hơn tự bị xóa.

Trên máy người dùng luôn có đúng **1 bản sao lưu dữ liệu**: lấy ngay trước lần cập nhật gần nhất. Mỗi lần cập nhật, bản sao lưu cũ được thay bằng bản mới, nên không bao giờ chất đống. Dữ liệu nằm ở thư mục dữ liệu của app (hiện đường dẫn trong *Hệ thống*), không nằm trong thư mục cài đặt nên cập nhật không đụng tới.

## 2. Làm một lần: chuẩn bị

1. Tạo tài khoản GitHub, tạo kho **Public** (ví dụ `hedu`). Public để app tải bản mới không cần đăng nhập.
2. Kết nối GitHub trong cài đặt claude.ai, rồi gửi tên kho `chủ/kho` cho Claude để Claude đẩy mã lên.
3. **Tạo khóa ký** (để app chỉ chịu cài bản do bạn phát hành):
   - Trên máy Windows có cài Node.js, mở PowerShell, chạy:
     `npx @tauri-apps/cli signer generate -w $HOME\.tauri\hedu.key`
   - Đặt mật khẩu (nhớ kỹ). Lệnh tạo 2 file: `hedu.key` (riêng tư, **không đưa ai**) và `hedu.key.pub`.
   - Mở kho trên GitHub → *Settings → Secrets and variables → Actions → New repository secret*. Tạo 2 secret:
     `TAURI_SIGNING_PRIVATE_KEY` = toàn bộ nội dung file `hedu.key`,
     `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = mật khẩu vừa đặt.
   - Gửi nội dung file `hedu.key.pub` cho Claude (đây là khóa công khai, an toàn) để lưu vào `src-tauri/updater.pub`.
   - Vào *Actions → Kiểm tra khóa ký → Run workflow*. Thấy hai dấu ✓ là xong.
   - Cất `hedu.key` và mật khẩu ở nơi an toàn. Mất khóa thì người dùng cũ phải cài lại bằng tay.

## 3. Phát hành beta để thử

1. Sửa `GHI-CHU-PHAT-HANH.md` (nội dung này hiện ở khung "Có bản mới" trong app).
2. Vào kho trên GitHub → thẻ **Actions** → chọn **Phát hành** ở cột trái → nút **Run workflow** bên phải → gõ tên phiên bản dạng `v0.2.0-beta.1` → bấm **Run workflow**.
3. GitHub tự kiểm thử, đóng gói, ký và đưa vào kênh beta (khoảng 10–15 phút). Xong thì thẻ Actions hiện dấu tích xanh.
4. Trên máy bạn: *Hệ thống → Kênh cập nhật: Thử nghiệm → Kiểm tra bản mới → Cập nhật*.
5. Dùng thử kỹ. Có lỗi thì sửa rồi phát hành `v0.2.0-beta.2`.

## 4. Đưa lên chính thức

Khi beta chạy ổn, làm lại bước 2 nhưng gõ `v0.2.0` (không có chữ beta). Bản này vào kênh Chính thức; bản chính thức cũ tự thành "bản trước"; beta cũ bị dọn.

## 5. Có sự cố

- **Bản mới lỗi**: *Hệ thống → Quay lại bản trước*. Dữ liệu: *Khôi phục dữ liệu trước cập nhật*. Cả hai đều làm lại được (bấm lần nữa để đảo ngược).
- **Mở app báo "dữ liệu thuộc bản mới hơn"**: do quay lại bản cũ sau khi dữ liệu đã lên cấu trúc mới. App không mở và không ghi đè gì. Chọn cập nhật lại, hoặc khôi phục dữ liệu trước cập nhật.
- **Mất mạng khi cập nhật**: không sao, chưa cài gì, thử lại sau.

## 6. Quy tắc đặt tên tag

`v1.2.3` = chính thức. `v1.2.3-beta.1` = beta. Tên khác bị từ chối ngay từ đầu, không phát hành nhầm.
