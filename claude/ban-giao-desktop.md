# Bàn giao HEdu (10/11/2026 chiều, phiên rà soát toàn dự án — DỪNG GIỮA CHỪNG vì hết hạn mức)

Quy tắc chung ở `AGENTS.md`. Ghi đè tệp này mỗi lần dừng việc.

## Trạng thái
- main = `d9b6e20` (#284 đã gộp). beta.65 CHƯA phát hành; `GHI-CHU-PHAT-HANH.md` chưa có mục beta.65 (mục đầu vẫn là beta.64).
- Việc đang làm: chủ dự án nhờ rà soát toàn bộ dự án (mã, tài liệu, skills, AGENTS.md), sửa điều đã chắc, phần còn lại trình bằng MỘT tệp HTML để duyệt. **Tệp HTML chưa làm.**

## Nhánh `claude/ra-soat-don-dep` (commit tại máy, CHƯA đẩy, CHƯA mở PR)
Đã sửa: gỡ `texput.log` khỏi Git (+ `.gitignore`); gỡ 26 import thừa, 6 dòng khai báo thừa, hằng `HINT` (DupCheck) và 2 dòng thừa trong test.
Đã kiểm: `tsc --noUnusedLocals` 0 lỗi, `npm test` qua. Chưa chạy `npm run build`.

## Đã chắc nhưng CHƯA kịp sửa (làm tiếp trên cùng nhánh)
1. `ci.yml`: typecheck đang "chỉ cảnh báo" (`continue-on-error`) dù hiện 0 lỗi → cho chặn; thêm `noUnusedLocals` vào `tsconfig.json`.
2. `scripts/test.mjs`: danh sách 136 test gõ tay (đủ, không thiếu) → tự dò `src/lib/**/*.test.ts` để hết xung đột khi gộp.
3. `README.md`: lệnh `npm run tauri dev` trái mục 5 AGENTS (chạm dữ liệu thật); mô tả tính năng đã cũ.
4. `HUONG-DAN-PHAT-HANH.md`: ghi "giữ tối đa 3 bản cài" nhưng `prune-releases.mjs` giữ 3 bản mới nhất + kênh + bản ghim beta.34.
5. `AGENTS.md` 42 KB nạp mỗi phiên: chuyển lịch sử mục 7 sang `claude/lich-su-trang-thai.md`, chỉ giữ trạng thái hiện tại; mục 5 và 2a lặp nhau và lệch (mục 5 thiếu typecheck, `--locked`); danh sách "Chưa làm" cuối mục 7 đã lỗi thời (SQLite, Tạo đề, Word đều xong). PR #175 cùng ý đang mở từ 31/10.
6. `.claude/launch.json` (tại máy): cấu hình `hedu-tv` trỏ `D:/HEdu-tv` không còn dự án.
7. Bộ nhớ Claude chia hai thư mục: `...\projects\D--HEdu\memory` và `...\projects\C--Users-admin-AppData-Local-HEdu\memory`. Các ghi chú quy tắc (tiết kiệm token, không dùng ổ C, duyệt mẫu sản phẩm xuất, LaTeX là chính, không làm thi online) chỉ nằm ở thư mục sau nên phiên mở ở `D:\HEdu` không thấy → chép sang, dọn `MEMORY.md` (nhiều dòng "chưa làm" đã xong).
8. 103 nhánh tại máy, phần lớn đã gộp: xoá nhánh có PR đã gộp và SHA trùng.

## Cần chủ dự án quyết (đưa vào tệp HTML)
- Skill `hedu-project-advisor` (lặp AGENTS.md, còn mốc beta.18) và `hedu-ui-design-review` (màu cũ `#F4F1EA`/`#C8402A`, ghi "Tạo đề đang ẩn", nhắc `FilterMenu`/`QuestionDrawer`): xoá hoặc viết lại; hai skill nằm trong tài khoản claude.ai, Claude Code không sửa bền được.
- `release.yml` dán CẢ `GHI-CHU-PHAT-HANH.md` (83.578 ký tự; trần GitHub 125.000) vào bản phát hành và `latest.json`; khung "Có bản mới" trong app hiện toàn bộ → chỉ lấy vài mục mới nhất.
- `claude/quy-tac-muc-do.md` dẫn CV 7991/BGDĐT-GDTrH làm căn cứ khung 4 mức, nhưng công văn đó dùng 3 mức Biết/Hiểu/Vận dụng (cần đọc bản gốc); ma trận Excel đang xuất 4 mức.
- `node_modules` là symlink bị Git theo dõi (`/opt/npm-tools/node_modules`); gỡ có rủi ro khi chuyển về nhánh cũ.
- 7 PR mở lâu: #240 #208 #198 #180 #176 #175 #123. 172 nhánh trên GitHub. 4 worktree cũ (`D:/HEdu-kntt`, `D:/HEdu-mn`, `D:/HEdu-wt/*`).
- `claude/ban-giao-tai-khoan-moi.md` (kho công khai): lộ đường dẫn máy, cách quan sát MathHub; đã cũ. `TONG-KET-BETA9/20.md` và các bản thiết kế đã xong trong `claude/`: lưu trữ hoặc xoá.
- `src/lib/examtheme.mau.ts`: chưa theo dõi, không ai dùng.
- `styles.css` 252 KB, ~74 lớp không thấy trong mã, 200 mã màu rời; ~28 hàm export không ai dùng; clippy 18 cảnh báo (3 mục không dùng); Pandoc dò ở `D:\HEdu-tools\pandoc` cứng trong `examword.rs`.
- Ngoài repo: plugin ECC đã tắt nhưng còn 176 MB trên ổ C; plugin `design` (7 kết nối chưa đăng nhập) và nhiều skill không dùng vẫn nạp mô tả mỗi phiên.

Script rà soát để chạy lại: `D:\HEdu-rac\scratch\ra-soat\` (`orphans.mjs`, `css.mjs`, `exports.mjs`).
