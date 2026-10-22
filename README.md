# HEdu

Ứng dụng Windows cho giáo viên Toán: soạn câu hỏi LaTeX (gói `ex_test`), ngân hàng câu hỏi gán ID6 theo CT 2018, kiểm tra trùng, tạo đề theo ma trận, trộn nhiều mã đề, xuất `.tex`.

Công nghệ: Tauri 2 (Rust) + React/TypeScript, đóng gói bằng esbuild, cập nhật qua GitHub Releases.

## Lệnh thường dùng

```
npm install          # cài thư viện
npm test             # kiểm thử logic (ex_test, ID6, trùng, tạo đề, schema, script phát hành)
npm run build:single # tạo dist/hedu-xem-thu.html, mở bằng trình duyệt để xem thử giao diện
npm run tauri dev    # chạy app desktop (cần Rust + WebView2)
npm run tauri build  # đóng gói bản cài NSIS
```

## Cấu trúc

- `src/` giao diện và logic (`lib/` là phần lõi, có kiểm thử).
- `src-tauri/` phần desktop: lưu dữ liệu an toàn (`storage.rs`, có kiểm thử), cập nhật 2 kênh (`lib.rs`).
- `.github/workflows/` kiểm tra mỗi lần đẩy mã, phát hành theo tag.
- `scripts/` đóng gói, cấu hình phát hành, dọn bản cũ.

## An toàn dữ liệu

Ghi nguyên tử (file tạm rồi đổi tên) kèm `.bak`; trước mỗi lần cập nhật giữ đúng một bản sao lưu; có số phiên bản cấu trúc dữ liệu và bước nâng cấp; app từ chối mở hoặc ghi đè dữ liệu có cấu trúc mới hơn mình hiểu.

Quy trình phát hành: xem [HUONG-DAN-PHAT-HANH.md](HUONG-DAN-PHAT-HANH.md).
