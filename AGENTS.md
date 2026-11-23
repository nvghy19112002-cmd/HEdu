# HEdu — Quy tắc chung cho mọi AI (Claude, ChatGPT)

Đây là NƠI DUY NHẤT ghi quy tắc làm việc. `CLAUDE.md` (nếu có) chỉ trỏ về đây.
Chủ dự án là giáo viên Toán, không rành code: viết cho họ bằng tiếng Việt đời thường, không dùng thuật ngữ khi không cần.

## 1. Sản phẩm
App Windows (Tauri 2 / Rust + React / TypeScript) cho giáo viên Toán: ngân hàng câu hỏi LaTeX (ex_test), hình TikZ qua TeX Live có sẵn trên máy, tạo/trộn/xuất đề, ID tự động theo CT 2018, kiểm tra trùng. Dữ liệu lưu cục bộ.
Kho: `nvghy19112002-cmd/HEdu` (công khai), nhánh `main`.
Định hướng dài hạn (KHÔNG phải lệnh triển khai): ngân hàng câu hỏi, kiểm tra trùng, soạn thảo + quản lý dự án LaTeX, TikZ và công cụ Toán, biên dịch TeX Live + xem PDF, tạo/trộn/xuất đề, kiểm tra chất lượng nội dung, nhiều người dùng/không gian làm việc/nguồn dữ liệu riêng.

## 2. Vai trò và phối hợp
| Ai | Làm gì | Không làm |
|---|---|---|
| Chủ dự án (giáo viên Toán) | Định hướng, ưu tiên; quyết định nghiệp vụ Toán, cách ra đề/kiểm duyệt; chọn phương án giao diện; nghiệm thu trên app thật; duyệt kiến trúc/dữ liệu, gộp PR, phát hành | Không cần viết code hay thao tác kỹ thuật |
| ChatGPT (GPT) | Phân tích nhu cầu, nghiên cứu, đề xuất UI/UX + kiến trúc, viết đặc tả/phiếu việc, rà PR | **Không viết mã vào repo**, không gộp PR, không phát hành |
| Claude Code | Kiểm tra code + Git mới nhất; phản biện đề xuất; viết code + test; chạy app thử trên Windows; kiểm Rust/TS/Tauri/LaTeX/TikZ; tạo nhánh/commit/PR; báo kết quả + bằng chứng + giới hạn | Không gộp PR khi chưa được duyệt cho đúng PR đó; không phát hành khi chưa được yêu cầu rõ (mục 5) |

Nguyên tắc:
1. Chủ dự án quyết định cuối cùng về nghiệp vụ và sản phẩm. Không suy đoán nghiệp vụ Toán: nhiều cách hiểu hợp lý → hỏi.
2. GPT đề xuất → Claude kiểm chứng với code thật → triển khai sau khi phạm vi được duyệt. Đề xuất của GPT không mặc nhiên đúng; Claude không làm theo nếu sai/lỗi thời. Bất đồng → Claude trình bằng chứng ngắn + phương án, chủ dự án chọn.
3. Một việc một người triển khai; hai AI không sửa cùng file/nhánh cùng lúc.
4. Ý tưởng nghiên cứu chưa được chọn thì không phải việc cần làm.
5. Không hỏi lại điều đã rõ hoặc đã được duyệt.

Thứ tự ưu tiên khi mâu thuẫn: (1) quyết định rõ ràng mới nhất của chủ dự án → (2) quy tắc bảo vệ dữ liệu + quy trình trong file này → (3) code, test, cấu hình đã xác minh → (4) đặc tả/Issue/PR đã duyệt → (5) tài liệu tham khảo của GPT/Claude → (6) bộ nhớ AI, lịch sử trò chuyện, bản bàn giao (phải kiểm chứng).
Nếu (1) đụng (2) (ví dụ có nguy cơ mất dữ liệu): Claude cảnh báo rủi ro, chờ chủ dự án xác nhận lại rồi mới làm.

Khi nào hỏi chủ dự án:
- HỎI: nghiệp vụ có nhiều cách hiểu; đổi dữ liệu/ID/schema/cách lưu; nguy cơ mất dữ liệu hoặc mất tương thích; quyết định giao diện/luồng dùng quan trọng; thao tác nhạy cảm (gộp, phát hành, quyền).
- KHÔNG HỎI: đặt tên, chia hàm, tổ chức test; sửa lỗi lập trình đã rõ hành vi đúng; chọn thư viện trong phạm vi đã duyệt; chạy thử bằng dữ liệu mẫu; tối ưu không đổi nghiệp vụ.
- Khi hỏi: gom thành một nhóm ngắn, mỗi câu có phương án + đề xuất tốt nhất.

Bàn giao (hai AI không đọc chung lịch sử; mọi bàn giao nằm trong tin nhắn chủ dự án gửi, file repo hoặc GitHub):
- GPT → Claude: vấn đề · hành vi cần có · phương án đề xuất · rủi ro · tiêu chí nghiệm thu · điều chủ dự án đã duyệt.
- Claude → GPT/chủ dự án: báo cáo theo mẫu mục 6 + link PR + điểm cần GPT rà hoặc chủ dự án quyết.

## 2a. Chỉ Claude lập trình (chủ dự án chốt 01/11/2026)

Từ 01/11/2026 chủ dự án **không dùng Codex để lập trình nữa: 100% mã do Claude Code viết** (theo quyết định hiện tại; nếu sau này đổi sẽ ghi lại ở đây). GPT chỉ phân tích, đề xuất, rà PR. Vì một người viết mã nên không còn chia vùng tệp giữa hai AI; vẫn giữ các quy tắc sau.

**Nhánh, commit, PR**
- Nhánh `claude/<tên>`, luôn tạo từ `main` mới nhất; không commit thẳng `main`.
- Mỗi PR một việc nhỏ; mô tả theo mục 5 (thay đổi · lý do · đã kiểm gì · chưa kiểm gì · tệp chung đã đụng).
- Trước khi mở PR: `npm test`, `npm run typecheck`, `npm run build`; đụng Rust thì `cargo test --lib --locked`; đụng giao diện thì xem bằng `npm run dev` (dữ liệu mẫu) hoặc app thử `vn.hedu.app.thu`. **Không bao giờ** chạy app với dữ liệu thật `%APPDATA%\vn.hedu.app`.
- Chỉ chủ dự án cho gộp (đúng PR đó) và cho phát hành; Claude **không tự gộp, không tự phát hành**. Nhiều PR xếp chồng thì gộp theo thứ tự, PR sau cập nhật theo `main` mới và chạy lại test trước khi gộp. Hai PR cùng thêm dòng vào `styles.css`, `lib.rs`…: bên gộp sau tự nối tay, giữ phần của cả hai, chạy lại test.
- Tệp dùng chung (`src/styles.css`, `src/App.tsx`, `src/app-context.tsx`, `src-tauri/src/lib.rs`, `package.json`, `Cargo.toml`, lock): chỉ thêm, CSS thêm ở **cuối tệp** trong khối có chú thích tên tính năng.
- Nhờ GPT rà PR khi chủ dự án muốn: GPT ghi ý kiến vào PR, không sửa nhánh.

**Môi trường máy chủ dự án**
- Ổ C gần đầy: không ghi ra ổ C. `TMP=D:/hedu-tmp`, `TEMP=D:/hedu-tmp`; build Rust `CARGO_TARGET_DIR=D:/hedu-build-target`; tệp tạm ở `D:\HEdu-rac\scratch`.
- Không tắt `C:\Users\admin\AppData\Local\HEdu\hedu.exe` (app thật). Chỉ tắt tiến trình app thử (`D:\hedu-build-target\debug\hedu.exe`) do mình mở.
- Không commit dữ liệu thật, khoá API, `data/test/`.

**Bàn giao**: mỗi lần dừng việc dở, cập nhật `claude/ban-giao-desktop.md` (ghi đè, ngắn: việc đang làm · nhánh/PR · tệp đã đổi · đã kiểm gì · bước tiếp). Trạng thái chung (mục 7) và `GHI-CHU-PHAT-HANH.md` do bên được giao phát hành cập nhật.

## 3. Quy mô việc (giữ ngắn để tiết kiệm token)
- **S** (sửa nhỏ, giao diện, chữ): chủ dự án nói thẳng với Claude, không cần Issue. Claude làm trên nhánh, chạy test, mở PR, báo 2–3 dòng (vẫn theo quy trình PR ở mục 5).
- **M** (tính năng vừa): phiếu ngắn (hiện trạng, kết quả mong muốn, tiêu chí nghiệm thu). Issue hoặc chat đều được.
- **L** (đổi dữ liệu, kiến trúc, phát hành): bắt buộc có rủi ro, kế hoạch chia giai đoạn, tương thích ngược, và chủ dự án duyệt TRƯỚC khi làm.

Mẫu phiếu M/L: `[M/L] Tên` · Hiện trạng · Kết quả mong muốn (góc nhìn giáo viên) · Phạm vi / phần không được đụng · Rủi ro · Tiêu chí nghiệm thu (checklist).
Claude không coi giải pháp trong phiếu là mệnh lệnh: nếu có cách tốt hơn thì chọn và ghi lý do một dòng.
- Mỗi PR một chức năng nhỏ hoặc một nhóm thay đổi liên quan, làm xong và kiểm được trong một phiên khi khả thi. Sửa tối thiểu đủ giải quyết vấn đề; không tự tái cấu trúc phần không liên quan.
- SQLite, migration, sao lưu/khôi phục, tài khoản, đồng bộ: luôn là L — cần đặc tả + phương án kiểm thử riêng.

## 4. Bất khả xâm phạm (không tự ý thay đổi)
1. **Cấu trúc dữ liệu (schema)**: `CURRENT_SCHEMA` trong `src/lib/migrate.ts` phải bằng `SUPPORTED_SCHEMA` trong `src-tauri/src/lib.rs`. Đổi schema = viết migration + test dữ liệu cũ + chủ dự án duyệt.
2. **Sao lưu**: chỉ giữ MỘT bản trước cập nhật (`backups/before-update`). Ghi file luôn atomic + `.bak`. Không đổi thứ tự "tải → kiểm chữ ký → sao lưu → cài".
3. **Kho là công khai**: không bao giờ commit `data/test/` hay ngân hàng câu hỏi thật, khóa ký (`hedu.key`), mật khẩu, secrets.
4. **Phát hành**: chỉ bằng workflow `release.yml` (Run workflow, nhập `tag`). Số phiên bản do CI gắn, không sửa tay trong `package.json`/`tauri.conf.json`. Kênh `channel-stable|beta|previous` do workflow quản lý. Luôn đi beta trước stable; luôn có bản quay lại.
5. **ID CT 2018**: `[Lớp][Phân môn][Chương][Mức độ N/H/V/C][Bài]-[Dạng]` (vd `2D1H1-1`). Không tự sửa công thức mã. Mã trong cây khung là 1 ký tự, id nội bộ (`c2D1`, `l2D11`, `f2D111`) không đổi khi đổi tên/mã.
6. **LaTeX/TikZ**: bảo toàn nội dung gốc, không biến đổi âm thầm. Phải test ca khó (`\immini`, `\def` trong tikz, `\newcommand` có tham số, tkz-tab, tikz-3dplot) và ca máy thiếu TeX Live. TikZ dùng TeX Live đã cài trên máy người dùng, không đóng gói vào app.
7. **Toán học**: không tự đổi nghiệp vụ Toán; nghi ngờ thì hỏi chủ dự án.
8. **Không tự**: duyệt hàng loạt câu hỏi; xoá/ghi đè ngân hàng thật; đổi cấu trúc cây chương trình khi chưa đánh giá ảnh hưởng; đổi thuật toán dò trùng khi thiếu kiểm chứng; reset/force Git làm mất thay đổi.

## 5. Kiểm tra trước khi nói "xong"
- `npm test` phải qua (gồm `lib.test`, `bank.test` trên dữ liệu thật nếu có, `release-scripts.test`). `npm run typecheck` và `npm run build` phải qua (CI chặn cả ba).
- Rust: chạy `cargo test --lib --locked` (trong `src-tauri/`) tại máy trước khi mở PR nếu máy có Rust (máy Windows của chủ dự án có). CI Windows vẫn BẮT BUỘC xanh trước khi gộp; máy không có Rust/crates.io thì chỉ dựa vào CI. Đừng khẳng định "chạy được trên Windows" khi CI chưa xanh.
- **Chạy thử app Tauri KHÔNG được chạm dữ liệu thật.** `npx tauri dev` mặc định dùng `identifier` `vn.hedu.app` = cùng thư mục `%APPDATA%\vn.hedu.app` với bản đã cài (ngân hàng câu hỏi thật). Luôn chạy với mã nhận diện riêng:
  `npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'`
  Dữ liệu thử nằm ở `%APPDATA%\vn.hedu.app.thu` (ban đầu trống). Cổng 1420 phải trống (tắt `npm run dev` cũ trước). Bản chạy thử không tự cập nhật được (chưa gắn kho GitHub). Không sửa `identifier` trong `tauri.conf.json`. Xem giao diện bằng trình duyệt (`npm run dev`, http://localhost:1420) chỉ dùng dữ liệu mẫu, an toàn.
- Lỗi đã xác định phải có test hồi quy. Build đạt ≠ chức năng đúng: kiểm hành vi người dùng (nút, luồng dữ liệu) khi đụng giao diện.
- Chỉ chủ dự án nghiệm thu: Claude không viết "đã nghiệm thu"; ghi rõ "chưa thử trên máy thật / zoom / dữ liệu lớn" nếu chưa kiểm.
- Trước phát hành: test, build Windows xanh, dữ liệu người dùng an toàn, có phương án quay lại.
- `Cargo.lock` và `package-lock.json` được theo dõi trong Git; đổi dependency phải cập nhật lock trong cùng PR (CI dùng `npm ci` và `--locked`). Action trong workflow ghim theo SHA; nâng phiên bản thì tra SHA chính thức rồi ghi tag trong chú thích. Báo cáo bảo mật: `claude/bao-cao-bao-mat-beta33.md`.
- Phát hành có cổng Defender: `tauri-action` tạo bản NHÁP → `scripts/quet-defender.ps1` (cập nhật định nghĩa, giải nén bộ cài, quét từng tệp) → sạch mới công khai và chuyển kênh. Bị báo hoặc không quét được = không phát hành; không thêm ngoại lệ để vượt cổng.

**Quy trình mọi thay đổi (kể cả việc S, kể cả chỉ sửa tài liệu):**
1. Tạo nhánh `claude/<tên-ngắn>` từ `main` mới nhất. Không commit thẳng vào `main`.
2. Lập trình + test kèm theo.
3. Kiểm tra tại máy: `npm test`, `npm run typecheck`, `npm run build`, `cargo test --lib --locked` khi đụng Rust, chạy thử app (cách trên) khi đụng giao diện/Rust.
4. Mở PR (không phải bản nháp) vào `main`, mô tả: thay đổi · lý do · đã kiểm gì · điều người duyệt cần biết.
5. Đợi CI (`giao-dien` + `windows`) xanh, báo chủ dự án và HỎI trước khi gộp. Chỉ squash-merge khi chủ dự án đồng ý rõ cho đúng PR đó.
6. Sau khi gộp: cập nhật `main` tại máy, xoá nhánh.
7. Phát hành (`release.yml`) chỉ khi chủ dự án yêu cầu rõ; đồng ý gộp KHÔNG phải là đồng ý phát hành.

## 6. Tiết kiệm token và báo cáo
- Đọc đúng file cần; không dán lại file dài; không kể lại lịch sử; không kiểm lại điều chưa thay đổi; không chạy lại test nặng khi không có lý do; không tạo tài liệu trùng; không mở agent/công cụ không liên quan. KHÔNG được tiết kiệm bằng cách bỏ test cần thiết hay kiểm tra an toàn dữ liệu.
- Việc khó (kiến trúc, lỗi khó, dữ liệu quan trọng): Claude đề nghị chủ dự án chọn model mạnh hơn trong app.
- Phiên quá dài: cập nhật `claude/ban-giao-desktop.md` (ghi đè, không tạo file mới): việc đang làm · file đã đổi · test · bước tiếp.
- Mỗi bản phát hành: cập nhật `GHI-CHU-PHAT-HANH.md` và mục 7 "Trạng thái". Mục 7 chỉ giữ trạng thái HIỆN TẠI (tối đa ~15 dòng): khi thêm bản mới thì chuyển dòng của bản cũ sang đầu `claude/lich-su-trang-thai.md`, không để dồn lại ở đây (tệp này nạp vào mọi phiên).
- Trao đổi giữa hai AI qua Issue/PR hoặc file Markdown ngắn, không dán cả hội thoại.
- Mẫu báo cáo mặc định: (1) Đã làm · (2) Kiểm thử: số test, kết quả, giới hạn · (3) Git: nhánh, commit, PR · (4) Còn tồn · (5) Cần chủ dự án quyết định (chỉ khi thật cần). Không kể nhật ký dài trừ khi được yêu cầu điều tra.

## 7. Trạng thái (chỉ ghi hiện tại; lịch sử ở `claude/lich-su-trang-thai.md`)
- **Đã phát hành mới nhất:** `v0.1.0-beta.64` (09/11/2026, kênh beta). Chưa có bản stable nào; stable đầu tiên cần chủ dự án xác nhận. Bản ghim để quay lại: `v0.1.0-beta.34` (`scripts/giu-lai-phat-hanh.json`).
- **Trên `main`, chưa phát hành (dự kiến `v0.1.0-beta.65`, chờ lệnh):** #274–#284 — Xuất Word ở Tạo đề và Word theo mẫu in, chỉ giữ mẫu Sky Panel (`ACTIVE_THEME_IDS`), tăng tốc biên dịch + HyMath dịch bằng pdfLaTeX, Tạo đề in theo Sky Panel (`examsky.ts`), Lời giải tô đáp án đúng, trình chiếu ra PDF (`slidepdf.ts`), kéo-thả Word vào Nhập liệu, giao diện giai đoạn 3 bước 7 (Hộp Xuất đề 6 ô, Sửa câu có câu trước/sau, So sánh trùng tô xanh/cam). **`GHI-CHU-PHAT-HANH.md` chưa có mục beta.65: phải viết trước khi phát hành.**
- **Chưa nghiệm thu trên máy Windows thật:** mọi thay đổi từ beta.49 trở đi (chỉ mới thử bằng test, trình duyệt với dữ liệu mẫu và app thử `vn.hedu.app.thu`).
- **Chủ dự án đã chốt:** LaTeX là chính, Word là phụ (đóng gói Pandoc, nhập hình Word, `.doc` để sau); không làm thi online và chấm thi; mọi sản phẩm xuất ra (Excel/PDF/Word/.tex) phải gửi mẫu thật cho chủ dự án duyệt trước khi gộp; tiết kiệm token là tiêu chí tiên quyết.
- **Đang chờ chủ dự án quyết:** đề án KNTT + Gán ID V4 (Q3–Q9); "Xác nhận cả nhóm" ở hàng đợi Xác minh; hồ sơ người dùng/nhiều nguồn dữ liệu (S5–S7, tạm hoãn); các mục trong báo cáo rà soát 10/11/2026.
- **Ghi nhớ kỹ thuật còn hiệu lực:**
  - Schema dữ liệu = 3 (SQLite + tệp phụ); trường mới trên câu chỉ CỘNG THÊM (`preamble`, `images`).
  - `node_modules` bị Git theo dõi như một liên kết (symlink); trên máy `D:\HEdu` đã đặt `git update-index --skip-worktree node_modules` rồi cài thành thư mục thật. Đừng commit thay đổi `node_modules`.
  - Test: `scripts/test.mjs` tự dò mọi `src/lib/**/*.test.ts`; thêm test chỉ cần tạo tệp. `tsconfig.json` bật `noUnusedLocals` (import/biến thừa làm typecheck đỏ).
  - Dịch thử mẫu in phải chép `src-tauri/tex/*.sty` vào thư mục dịch (bản `ex_test.sty` của TeX Live khác bản nhúng).
  - Màu và cỡ chữ: dùng biến trong khối "GIAO DIỆN MỚI · GIAI ĐOẠN 3" cuối `src/styles.css`, không thêm mã màu rời.
  - Giới hạn nhập: 5.000 câu/lô, 2.000 tệp, 20 MB/tệp; gán ID tự động 200 câu/lượt.
  - Gửi câu thật lên AI bên ngoài: phải chủ dự án đồng ý từng lượt.
