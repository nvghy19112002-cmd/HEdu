# Bàn giao toàn bộ HEdu cho tài khoản Claude khác (30/10/2026)

Đọc tệp này đầu tiên, rồi `AGENTS.md` (quy tắc dự án, mục 7 Trạng thái), `claude/ban-giao-desktop.md`, `GHI-CHU-PHAT-HANH.md`.
Chủ dự án là giáo viên Toán, không viết code: trả lời tiếng Việt đời thường, ngắn; tự làm trọn nhánh → commit → PR → CI, không bảo họ tự bấm.

## 1. Bắt đầu phiên mới thế nào
- Mở Claude Code ở thư mục `D:\HEdu` (bản clone làm việc). `C:\Users\admin\AppData\Local\HEdu` chỉ là nơi cài app thật, KHÔNG phải repo.
- Cùng máy Windows ⇒ bộ nhớ Claude (`C:\Users\admin\.claude\projects\…\memory\`) vẫn đọc được ở tài khoản mới nếu mở đúng thư mục cũ. Khác máy ⇒ chỉ còn tệp này và các tệp trong `claude/`.
- Hội thoại cũ KHÔNG chuyển sang được. Không chạy hai tài khoản cùng lúc trên cùng thư mục (một việc một người).
- Việc đầu tiên: `git fetch origin --prune`, xem `main`, PR đang mở, bản phát hành (mục 6).

## 2. Trạng thái tại lúc bàn giao
- `main` = `ec1c051` (PR #166). Bản phát hành mới nhất: **`v0.1.0-beta.44`**, kênh beta trỏ beta.44. Releases còn giữ beta.42, .43, .44 và beta.34 (ghim ở `scripts/giu-lai-phat-hanh.json`); kênh stable/previous trống.
- Trong ngày 30/10: beta.41 (#162 đọc ID cuối dòng `\begin{ex}`) → beta.42 (#164 chuẩn hoá khi nạp .tex) → beta.43 (#165 mục "Chưa có ID") → beta.44 (#166 xem trước hiểu `label=\alph*)`, mẫu khaibaochung nạp `enumitem`).
- Nhánh `claude/ghi-chep-beta44` (commit `b8fd20d`, chỉ tài liệu: cập nhật AGENTS.md mục 7 + `ban-giao-desktop.md`) và tệp này: nằm chung một PR, chờ chủ dự án đồng ý gộp.
- PR mở khác: **#123** (quy tắc phối hợp 3 phiên, chỉ AGENTS.md, từ 26/10) — chờ chủ dự án quyết gộp hay đóng. Không tự gộp.
- Issue mở: #1 (lưu đầu file theo từng câu — đổi schema, cần duyệt; huỷ hẳn tiến trình con TeX trên Windows; nghiệm thu máy thật).
- Dữ liệu thật của chủ dự án (30/10): khoảng 1.673 câu, gần hết lớp 10, cộng 47 câu Chương 1 Mệnh đề nhập "Dán trực tiếp" không ID (nay nằm ở mục "Chưa có ID", nhóm "Chưa rõ lớp"). 251 câu lớp 12 xoá 28/10: chủ dự án KHÔNG cần khôi phục.

## 3. Việc đang dở / việc tiếp theo
1. **Nghiệm thu trên máy Windows thật** (chưa làm cho beta.39–44): theo `claude/tong-nghiem-thu-beta.md`, `claude/nghiem-thu-de-thi.md`. Riêng beta.43: nhập câu không ID → hiện ở "Chưa có ID", không hiện/ghi `2D1H1-1`; Sửa câu → Lưu không thêm `%[…]`; chọn mục → Gán ID nhờ Claude → nhập đề xuất → câu sang đúng Dạng sau khi xác minh.
2. **Gán ID nhờ Claude** (mục 5): lô `L20261030-121152` (47 câu mệnh đề) ĐÃ có `de-xuat-…json`, chờ chủ dự án bấm "Nhập đề xuất mới nhất". Lô `L20261030-110000` (300 câu) xuất TRƯỚC bản sửa beta.43, có 47 câu mang `"lop": 12` giả ⇒ đừng làm lô này; bảo chủ dự án xuất lô mới.
3. **OCR Toán → ex_test** (dự án riêng, thư mục `D:\OCR_Claude\HEdu-OCR`, bàn giao riêng ở `D:\OCR_Claude\HEdu-OCR\BAN_GIAO.md`): còn trang 46 trở đi (Bài 2 Tập hợp) của PDF Toán 10.
4. Chờ chủ dự án quyết: đề án cây KNTT + Gán ID V4 (đã duyệt bộ chữ A/G/S/T, trả lời Q3–Q9, CHƯA viết mã; phải qua Cổng A → B → C); xác nhận AI một lần cho một công việc; ví dụ gửi AI có lấy câu "Đã duyệt" không; bật lại màn Tạo đề cũ (`FEATURES.exam=false`, không tự bật).
5. Trước nhập hàng loạt: nhập lớn chạy nền (giới hạn 5.000 câu/lô, 2.000 tệp, 20 MB/tệp, gán ID tự động 200 câu/lượt).
6. Backlog: hot fix `\allowdisplaybreaks` câu #2086 (xem trước báo "Chưa hiểu"); Word/Excel theo mẫu TNMaker/AZOTA/OLM/SmartTest (cần tệp mẫu), QR, phiếu tô; xuất ma trận Excel; đồng bộ sửa tay .tex; hedu.sty giai đoạn 2–4; đổi tên/xoá/di chuyển tệp trong cây tệp đề thi; BibTeX/Biber.
7. Worktree `D:\HEdu-kntt` (nhánh `claude/kntt-khung-1a`, 4b6728e, sạch) và nhiều nhánh cục bộ cũ đã gộp: hỏi chủ dự án trước khi xoá.

## 4. Môi trường máy (Windows, chủ dự án)
- **Ổ C gần đầy: KHÔNG ghi gì ra ổ C.** Luôn `export TMP=D:/hedu-tmp TEMP=D:/hedu-tmp` trước `npm test`/script; script tạm, ảnh chụp để `D:\HEdu-rac\scratch`; build Rust `CARGO_TARGET_DIR=D:/hedu-build-target`.
- Công cụ: Node 24, Rust ở `D:\DevTools\rustup` + `D:\DevTools\cargo` (phiên cũ có thể cần `export RUSTUP_HOME='D:\DevTools\rustup' CARGO_HOME='D:\DevTools\cargo' PATH="/d/DevTools/cargo/bin:$PATH"`), npm cache `D:\DevTools\npm-cache`, TeX Live 2026 ở `D:\texlive\texlive\2026\bin\windows` (test TeX thật: `HEDU_TEX_BIN=<thư mục đó>`). **Không có `gh`.**
- Lệnh: `npm test` (đủ, ~2 phút), `npm run build`, `npm run typecheck` (CI chỉ cảnh báo), `cargo test --lib --locked`; `npm run dev` → http://localhost:1420 (dữ liệu mẫu, lưu ở localStorage trình duyệt).
- **App Tauri thử luôn dùng identifier riêng**, không chạm ngân hàng thật `%APPDATA%\vn.hedu.app`: `npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'`. Tắt đúng PID `target\debug\hedu.exe` + node `scripts/dev.mjs`; KHÔNG tắt `C:\Users\admin\AppData\Local\HEdu\hedu.exe` (app thật). Không chụp màn hình bằng cách đưa cửa sổ lên trước.
- Bash heredoc làm hỏng `\` của LaTeX: dùng công cụ Write/Edit. Python sửa tệp phải `newline=''` (repo dùng LF, `.gitattributes eol=lf`).

## 5. Quy trình hay dùng
**GitHub không có `gh`** — token lấy từ `git credential fill`. Các script sẵn ở `D:\HEdu-rac\scratch`:
- `openpr3.mjs "<tiêu đề>" <nhánh> <tệp-mô-tả.md> [base]` — mở PR.
- `ci.mjs status <PR>` / `ci.mjs merge <PR>` — xem check-runs; squash-merge có khoá đúng HEAD.
- `waitci.mjs <PR>` — chờ CI (windows + giao-dien) xong.
- `release41.mjs` (mẫu; bản gần nhất `release43.mjs`): sửa `TAG` và `MAIN_SHA` rồi `node … dispatch` (kiểm main chưa đổi, tag chưa có, không lượt nào đang chạy) → `node … runs`; `waitrun.mjs <run-id>` chờ xong và liệt kê Releases.
- Kiểm kênh: `curl -sL https://github.com/nvghy19112002-cmd/HEdu/releases/download/channel-beta/latest.json`.

**Phát hành** chỉ bằng `release.yml` (workflow_dispatch, ref main, input `tag` dạng `v0.1.0-beta.N`); ghi chú lấy nguyên `GHI-CHU-PHAT-HANH.md` ⇒ thêm mục "Có gì mới trong beta.N" lên đầu tệp TRƯỚC khi gộp/phát hành. Chỉ phát hành khi chủ dự án nói rõ; chỉ gộp PR khi chủ dự án đồng ý đúng PR đó (câu "fix lỗi và phát hành nhanh" / "cứ phát hành" là đồng ý cho việc đang nói).

**Commit/PR**: nhánh `claude/<tên>` từ `origin/main`, viết tiếng Việt, cuối commit `Co-Authored-By: Claude …`, cuối mô tả PR `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Mô tả PR nói rõ đã kiểm gì, CHƯA kiểm gì.

**"làm lô mới nhất"** (Gán ID nhờ Claude): trong `D:\HEdu-gan-id` lấy `hedu-gan-id-*.json` mới nhất CHƯA có `de-xuat-<lô>.json`; đọc `huongDan`, `dang`, `cau`; phân loại thật từng câu (Dạng cùng lớp — `"lop": null` thì chọn lớp hợp nhất; mức NB/TH/VD/VDC; `chac` cao/vua/thap; `lyDo` một câu); ghi `de-xuat-<lô>.json` = `{"format":"hedu-gan-id-de-xuat","v":1,"lo","boi":"Claude","cau":[{k,fp,dang,muc,chac,lyDo}]}`, chép nguyên `k`, `fp`, đủ mọi câu; kiểm id Dạng có trong `dang`. Báo số câu, phân bố độ chắc; nhắc bấm "Nhập đề xuất mới nhất". Câu đối chứng trộn ngầm — không đoán câu nào.

## 6. Kiến trúc nhanh (chỗ hay đụng)
- Giao diện React/TS `src/`, lõi Rust/Tauri `src-tauri/src/`. Lưu SQLite, tệp phụ `id-review` (trạng thái xác minh Dạng, `src/lib/idreview.ts`) — không đổi schema 3, ID6, UID, LaTeX gốc.
- Ngân hàng: `screens/Bank.tsx`, lọc/đếm `lib/bankfilter.ts` (`BankFilters.noId` = mục "Chưa có ID": `null` / `'all'` / số lớp, 0 = chưa rõ lớp), cây `components/BankTree.tsx`, `lib/banktree.ts`.
- Câu "Chưa có ID" = bản ghi id-review có `unclassified: true` (+ `lop` nếu biết); vị trí lưu kèm câu chỉ là chỗ giữ, không hiện, không thành ID. Rời mục khi giáo viên chọn Dạng (Sửa câu / hàng đợi Xác minh). Hàm: `gradeOfEff`, `keepNoId` trong `idreview.ts`.
- Nhập: `screens/Extra.tsx`, `lib/importplan.ts`, `lib/importbatch.ts`, `lib/extest.ts`. Sửa câu: `components/QuestionEditor.tsx`. Gán ID nhờ Claude: `lib/claudeid.ts`, `components/ClaudeIdDialog.tsx`, Rust `idexchange.rs`. Hàng đợi xác minh: `lib/verifyqueue.ts`, `components/VerifyQueue.tsx`.
- Quy tắc ID chuẩn: `claude/quy-tac-gan-id-chuan.md` ("máy" không bao giờ tự thành "giáo viên xác minh"; duyệt nội dung tách khỏi xác minh Dạng; không ghi ID giả).

## 7. Quy tắc không đổi
- Repo công khai: không commit dữ liệu thật, khoá API, thông tin cá nhân.
- Không tự xoá/duyệt câu của chủ dự án; không tái cấu trúc ngoài phạm vi; thay đổi cỡ L (schema, kiến trúc) phải được duyệt trước.
- Tính năng lạ: xem dự án mã nguồn mở tương tự trên GitHub trước khi viết.
- Báo cáo: (1) Đã làm (2) Kiểm thử (3) Git (4) Còn tồn (5) Cần quyết định — ngắn, tiếng Việt.
