# Bàn giao HEdu (10/11/2026 tối, sau đợt rà soát toàn dự án)

Quy tắc chung ở `AGENTS.md`. Ghi đè tệp này mỗi lần dừng việc.

## Trạng thái
- main = `d9b6e20` (#284 đã gộp). beta.65 CHƯA phát hành; `GHI-CHU-PHAT-HANH.md` chưa có mục beta.65 (phải viết trước khi phát hành).
- **PR #285** (nhánh `claude/ra-soat-don-dep`): kết quả rà soát. Chờ CI xanh rồi HỎI chủ dự án trước khi gộp.

## PR #285 gồm
- `AGENTS.md` 42 KB → 18 KB; lịch sử mục 7 chuyển nguyên văn sang `claude/lich-su-trang-thai.md`; mục 5 khớp mục 2a.
- `ci.yml`: typecheck chặn (hết "chỉ cảnh báo"); `tsconfig.json` bật `noUnusedLocals`.
- Gỡ 26 import + 6 khai báo thừa, hằng `HINT` (DupCheck), 2 dòng thừa trong test.
- `scripts/test.mjs` tự dò `src/lib/**/*.test.ts`.
- Gỡ `texput.log`; sửa `README.md`, `HUONG-DAN-PHAT-HANH.md`.

Đã kiểm: `npm test` (136 tệp), `npm run typecheck`, `npm run build`, `cargo clippy --lib --locked` (không lỗi). Chưa chạy app (không đổi hành vi), không chạy lại `cargo test` (không đụng Rust).

## Việc tại máy đã làm (ngoài Git)
- Xoá 83 nhánh tại máy đã gộp (danh sách tên + SHA: `D:\HEdu-rac\scratch\ra-soat\branches-to-delete.txt`).
- Bộ nhớ Claude `...\projects\D--HEdu\memory`: chép 7 ghi chú quy tắc từ thư mục bộ nhớ thứ hai, xoá 19 ghi chú việc đã xong, viết lại `MEMORY.md` (sao lưu ở `D:\HEdu-rac\scratch\ra-soat\memory-backup`).
- `.claude/launch.json`: bỏ cấu hình `hedu-tv`.

## Chờ chủ dự án duyệt: 22 đề xuất
Phiếu duyệt: `.claude/ra-soat-2026-11-10.html` (cũng đăng ở artifact riêng của chủ dự án). Mã mục:
- A1 xoá skill `hedu-project-advisor` · A2 viết lại `hedu-ui-design-review` · A3 tắt plugin/skill không dùng · A4 gỡ hẳn ECC · A5 phát hành chỉ dán ghi chú bản mới nhất (tệp ghi chú 83.578 ký tự, trần GitHub 125.000) · A6 dọn `claude/` và `TONG-KET-*` · A7 dọn thư mục bộ nhớ thứ hai.
- B1 đóng 7 PR cũ (#175 #198 #208 #180 #123; #176 và #240 cần quyết) · B2 xoá ~170 nhánh trên GitHub · B3 xoá 3 worktree cũ · B4 gỡ symlink `node_modules` khỏi Git · B5 gỡ `claude/ban-giao-tai-khoan-moi.md` · B6 chuyển `src/lib/examtheme.mau.ts` ra ngoài.
- C1 sửa câu dẫn CV 7991 trong `quy-tac-muc-do.md` (công văn dùng 3 mức; chưa đọc bản gốc) · C2 tuỳ chọn xuất ma trận 3 mức · C3 thông báo còn ghi "mục Hệ thống" (5 chỗ) · C4 thông báo Pandoc ghi `D:\HEdu-tools\pandoc`.
- D1 dọn `styles.css` (252 KB, ~74 lớp chết, 324 mã màu rời) · D2 ~50 hàm export không dùng · D3 18 cảnh báo clippy + clippy vào CI · D4 tệp quá lớn (tách khi đụng tới) · D5 gộp #285.

Script rà soát chạy lại được: `D:\HEdu-rac\scratch\ra-soat\` (`orphans.mjs`, `css.mjs`, `exports.mjs`).

## Bước tiếp
CI #285 xanh → hỏi gộp. Chủ dự án chọn mục nào trong 22 đề xuất thì làm mục đó, mỗi mục một PR nhỏ.
