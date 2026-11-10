# HEdu

Ứng dụng Windows cho giáo viên Toán: ngân hàng câu hỏi LaTeX (gói `ex_test`) gán ID theo CT 2018, kiểm tra trùng, hình TikZ dịch bằng TeX Live có sẵn trên máy, tạo và trộn đề theo ma trận, thư viện đề thi, xuất PDF / `.tex` / Word / Excel đáp án, trình chiếu câu hỏi. Dữ liệu lưu cục bộ trên máy.

Công nghệ: Tauri 2 (Rust) + React/TypeScript, đóng gói bằng esbuild, cập nhật qua GitHub Releases.

## Lệnh thường dùng

```
npm ci               # cài thư viện đúng theo package-lock.json
npm test             # kiểm thử logic (tự dò mọi src/lib/**/*.test.ts) + script phát hành
npm run typecheck    # kiểm tra kiểu TypeScript
npm run build        # đóng gói giao diện vào dist/
npm run dev          # xem giao diện bằng trình duyệt tại http://localhost:1420 (chỉ dữ liệu mẫu)
cargo test --lib --locked   # kiểm thử phần Rust (chạy trong src-tauri/)
```

Chạy app desktop khi phát triển **luôn dùng mã nhận diện riêng** để không chạm dữ liệu thật của bản đã cài (`%APPDATA%\vn.hedu.app`):

```
npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'
```

Đóng gói bản cài và phát hành chỉ làm qua workflow `release.yml`, xem [HUONG-DAN-PHAT-HANH.md](HUONG-DAN-PHAT-HANH.md).

## Cấu trúc

- `src/` giao diện và logic (`lib/` là phần lõi, có kiểm thử; `screens/` các màn; `components/`).
- `src-tauri/` phần desktop (Rust): lưu trữ SQLite và sao lưu, biên dịch LaTeX/TikZ, thư viện đề, xuất Word/Excel/PDF, cập nhật theo kênh. `src-tauri/tex/` là các gói LaTeX đi kèm.
- `.github/workflows/` kiểm tra mỗi lần đẩy mã (`ci.yml`), phát hành (`release.yml`).
- `scripts/` đóng gói, kiểm thử, cấu hình phát hành, dọn bản cũ, quét Defender.
- `claude/` tài liệu thiết kế, quy tắc gán ID và bàn giao. Quy tắc làm việc cho AI: [AGENTS.md](AGENTS.md).

## An toàn dữ liệu

Ghi nguyên tử (file tạm rồi đổi tên) kèm `.bak`; trước mỗi lần cập nhật giữ đúng một bản sao lưu; có số phiên bản cấu trúc dữ liệu và bước nâng cấp; app từ chối mở hoặc ghi đè dữ liệu có cấu trúc mới hơn mình hiểu.
