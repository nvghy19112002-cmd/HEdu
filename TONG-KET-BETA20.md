# HEdu — Tổng kết chi tiết đến v0.1.0-beta.20 (bàn giao cho ChatGPT / AI khác)

Cập nhật: 23/10/2026. Kho: `nvghy19112002-cmd/HEdu` (công khai), nhánh `main`. Bản phát hành mới nhất: **v0.1.0-beta.20** (kênh Thử nghiệm/beta, prerelease). Chưa có bản chính thức (stable) cho các đợt gần đây.

> Quy tắc làm việc nằm ở `AGENTS.md` (nơi duy nhất). File này là BẢN ĐỌC NHANH + CHI TIẾT về những gì đã đổi. Khi mâu thuẫn: quyết định mới nhất của chủ dự án → code/test → Issue/PR → tài liệu → bộ nhớ AI.

## 0. Tóm tắt một đoạn

HEdu là app Windows (Tauri 2 / Rust + React / TypeScript) cho giáo viên Toán: ngân hàng câu hỏi LaTeX (`ex_test`), hình TikZ qua TeX Live có sẵn trên máy, ID tự động theo CT 2018, kiểm tra trùng. Dữ liệu cục bộ. Chủ dự án không rành code → giao tiếp tiếng Việt đời thường, Claude viết toàn bộ code. Schema dữ liệu hiện là **3** (giao diện `CURRENT_SCHEMA` = Rust `SUPPORTED_SCHEMA` = 3). Từ beta.15 đến nay KHÔNG đổi schema, KHÔNG đổi Rust (beta.20 cũng không).

## 1. Dòng thời gian phát hành (gần nhất trước)

| Bản | Nội dung chính | PR |
|---|---|---|
| **beta.20** | Kiểm tra trùng: sao lưu đầy đủ + thùng rác + bộ nhãn chuẩn | #48 |
| **beta.19** | Giao diện V3 "Mực xanh & giấy ô ly" (chỉ giao diện) | #39–#47 |
| **beta.18** | Kiểm tra trùng V2 (phạm vi, so sánh cân xứng, rà trùng khi nhập, nhớ quyết định) | #29–#38 |
| beta.16 | Bộ lọc Ngân hàng thành hàng nút thả xuống; nhắc giới hạn quay lui | #25–#28 |
| beta.15 | Kiểm duyệt câu hỏi (schema 2→3); nhãn enumerate đúng; nét SVG sắc đều | #22–#24 |
| beta.14 | Ngân hàng Thẻ/Danh sách + Chi tiết; hình ngang không nhỏ xíu; khung đáp án | #19–#20 |
| beta.13 | Sửa bảng mất đường kẻ dưới cùng | #17 |
| beta.12 | Đáp án 4/2/1 cột theo độ rộng thật; khung Đ/S; báo thiếu `\draw` | #16 |
| beta.11 | Sửa hình SVG bị cắt/tô sai do trùng id; cỡ hình cân bằng | #15 |
| beta.10 | Xem trước theo cấu trúc; "Xem chuẩn" TeX; ngăn sửa; zoom 80–150% | #11–#14 |
| beta.9 | Nhúng gói LaTeX riêng; đầu file vẽ hình mặc định mới; tạm ẩn Tạo đề | #8, #10 |
| beta.7–8 | Bảng Gói LaTeX; dịch hình qua DVI (không cần Ghostscript) | #4, #5 |

## 2. beta.20 — Kiểm tra trùng: sao lưu đầy đủ, thùng rác, nhãn chuẩn (PR #48)

Bối cảnh: sau beta.18/19 có cuộc rà soát hệ thống câu trùng (kết luận: đầy đủ về chức năng, nhưng CHƯA chứng minh trên dữ liệu thật; còn 3 khoảng hở). Chủ dự án duyệt làm cả ba.

### 2.1 Quyết định trùng nằm trong sao lưu thủ công
- Quyết định trùng lưu ở tệp phụ `data/dup-decisions.json` (Rust `load_dup_decisions`/`save_dup_decisions`; `sidecar_valid` chỉ yêu cầu `v` là số và `recs` là mảng).
- Mở rộng **chỉ ở phía TypeScript**: thêm hai mảng tuỳ chọn `trash` và `gold` vào cùng tệp (KHÔNG đổi Rust, KHÔNG đổi schema `hedu.json`).
- File sao lưu thủ công (Hệ thống → Tạo file sao lưu) nay có thêm khoá `dupSidecar` = `{v:1, recs, trash?, gold?}` (hàm `sidecarForBackup()`).
- Khôi phục từ file: `restoreSidecar()` **GỘP** (bản có `at` mới hơn thắng; không xoá gì). `migrate()` chịu được khoá thừa.
- Nút tạo sao lưu nay `async`: nếu quyết định chưa nạp thì `await loadDecisions()` trước (và `App.tsx` nạp quyết định ngay khi khởi động).
- Giới hạn: bản chụp "Sao lưu trước cập nhật" (do Rust làm) CHƯA kèm sidecar. Bản beta.18 cũ bỏ qua phần thêm nhưng nếu tự ghi lại tệp phụ thì có thể làm mất `trash`/`gold`.

### 2.2 Thùng rác + xoá có xác nhận
- File mới `src/lib/trashflow.ts` → `moveToTrash(q)`; `src/lib/dupdecisions.ts` thêm `TrashRec`, `TRASH_CAP = 1000`, `trashList/trashCount/trashAdd/trashRemove`; `restoreQuestion(q)` trong `store.ts`.
- **Quy tắc an toàn:** câu chỉ bị bỏ khỏi ngân hàng SAU KHI thùng rác đã ghi xuống đĩa thành công. `trashAdd` trả `false` khi ghi lỗi và tự hoàn lại → không mất câu.
- Trong Kiểm tra trùng (`DupCheck.tsx` → `PairView`): "Loại một câu…" → "Chuyển câu A/B … vào thùng rác…" → hộp xác nhận (`alertdialog`) → "Chuyển vào thùng rác" hoặc "Giữ lại". Prop mới `onTrash`.
- Ở Ngân hàng (`Bank.tsx`): `removeQuestion` nay async và gọi `moveToTrash` (thay cho `deleteQuestion` trực tiếp) — mọi cách xoá đều đi qua thùng rác.
- Hệ thống → **Thùng rác (N câu)** (`TrashPanel` trong `System.tsx`, hiện tối đa 50): **Khôi phục** (trả câu về ngân hàng) / **Xoá hẳn…** (có xác nhận).

### 2.3 Bộ nhãn chuẩn (gold set) đo độ chính xác bộ dò trùng
- Mục đích: có số đo THẬT độ chính xác bộ dò trên kho của giáo viên (trước đó chỉ đo trên dữ liệu giả lập/ca thử).
- `src/lib/goldset.ts`: `GOLD_TARGET = 150`; `sampleGold(questions, pairs, skip, n, seed)` lấy mẫu phân tầng theo loại bộ dò (tỉ lệ: raw .10, same .15, conflict .10, near .25, template .15, insufficient .05) + cặp đối chứng (cùng bài, bộ dò KHÔNG báo, loại `none`); `evaluateGold(recs)` ra báo cáo.
- Nhãn: `true_dup` (trùng thật) / `keep_both` (giữ cả hai) / `different` (khác nhau) / `unsure` (chưa chắc). Lưu trong `gold` của tệp phụ.
- UI `src/components/GoldPanel.tsx` (+ `GoldReportView`), mở từ nút "Nhãn chuẩn" trong Kiểm tra trùng. **Gắn mù:** `PairCompare` có prop `blind` ẩn khối nhận định của máy (`dc-why`). Phím 1–3 gắn nhãn; "Xem báo cáo".
- Báo cáo: ma trận theo từng loại; độ chính xác của nhóm "chắc chắn" (raw + same); độ chính xác ở chế độ xem mặc định; tổng số trùng thật / trong tầm nhìn / bị sót. Lưu ý: mẫu phân tầng nên tổng số chỉ mang tính chỉ báo.
- Esc khi đang ở Nhãn chuẩn không đóng cả Kiểm tra trùng (bảo vệ `!document.querySelector('.gold')`).

### 2.4 Kiểm thử beta.20
- `npm test` OK: thêm khối "Thùng rác, nhãn chuẩn, sao lưu (V3)" trong `dupdecisions.test.ts` (12 kiểm tra) và `goldset.test.ts` (14 kiểm tra, đã đăng ký trong `scripts/test.mjs`).
- Playwright e2e (dữ liệu giả lập 308 câu), 15/15: xác nhận 2 bước; gắn nhãn mù; báo cáo; Esc; số câu giảm đúng 1 rồi khôi phục đủ; file sao lưu có `schema:3` + `dupSidecar` (thùng rác 1, nhãn 3); xoá ở Ngân hàng cũng vào thùng rác; không lỗi JS.
- CI: giao-dien (có `npm run typecheck`) + windows đều xanh. Máy làm việc của Claude không có `@types/react` nên typecheck cục bộ nhiễu; kiểu dữ liệu chỉ được xác minh bởi CI.
- Phát hành: `release.yml` chạy xanh; tài sản: `HEdu_0.1.0-beta.20_x64-setup.exe`, `.sig`, `latest.json`.

### 2.5 Giới hạn đã biết của beta.20
- Chưa ai thử trên máy Windows thật.
- Độ chính xác thật của bộ dò vẫn chưa biết cho tới khi giáo viên gắn ~150 nhãn trên kho thật.
- Hiệu năng ~60.000 câu chưa đo trên máy thật (3.000 câu quét ~0,7 giây).
- Bản chụp trước cập nhật (Rust) chưa gồm tệp phụ.
- Tích hợp AI chưa bắt đầu (cần quyết định: AI chạy ở đâu; có được gửi dữ liệu ngân hàng ra ngoài không).

## 3. beta.19 — Giao diện V3 "Mực xanh & giấy ô ly" (PR #39–#47)

Chỉ đổi giao diện; schema/ID/dữ liệu/thuật toán trùng không đổi.
- **PR-0 (#39)**: bộ chụp ảnh giao diện `scripts/ui-shots.mjs` + dữ liệu giả lập `scripts/ui-fixtures.mjs` (có test). KHÔNG dùng dữ liệu thật.
- **PR-A (#40)**: token màu Hướng B ở đầu `src/styles.css` (xanh mực cho nút chính/đang chọn; đỏ CHỈ cho lỗi/xoá); bỏ mã màu rời khỏi thành phần — đừng thêm mã màu rời.
- **PR-B (#41)**: thang cỡ chữ 6 bậc (12/13/14/16/20/24), bo góc 4/8/12, chiều cao nút 28/36, thanh bên 64px, nhãn "Khung CT" → **Chương trình**.
- **PR-C (#42)**: Ngân hàng một hàng công cụ (`.qbar`, `.fbar{display:contents}`), đầu trang 48px; mục lục tự ẩn khi cửa sổ <1000px; câu đầu tiên ở 1366×768 từ y=186 lên 124.
- **PR-D (#43)**: Kiểm tra trùng — một ô chọn loại (`kindKey`, `dc-kindsel`), "Cùng mẫu" ẩn mặc định; cặp đầu từ y≈620 lên ≈228.
- **PR-E (#44)**: Nhập liệu — chỉ báo 4 bước, kết quả thấy ngay, nút "Nhập N câu" ghim đáy, ô chọn trạng thái.
- **PR-F (#45)**: Trình sửa — ba chế độ xem **Mã | Mã + Xem trước | Xem trước** (`vmode`, nhớ theo máy `hedu.qemode`).
- **PR-G (#46)**: Hệ thống 4 nhóm; "Khôi phục từ file…" có hỏi xác nhận (`pendingFile`); màn Chương trình gọn (`ct-tools`).
- **PR-H (#47)**: ghi chú phát hành, cập nhật trạng thái.
- Chưa làm (cố ý): ô Lớp/Phân môn thả xuống (đang giữ cây mục lục); Kiểm tra trùng vẫn là lớp phủ toàn màn hình; chưa có phím `[` `]`; quyết định Nhập/Bỏ/Chờ vẫn là ô chọn; Chương trình chưa kiểu cây + bảng chi tiết; trạng thái "Đã lưu" và hộp thoại chưa gom dùng chung.

## 4. beta.18 — Kiểm tra trùng V2 (PR #29–#38)

Kiến trúc hệ thống trùng (để AI sau khỏi dò lại):
- `src/lib/dup2.ts`: bộ so sánh mới. `DupKind = raw | same | conflict | near | template | unrelated | insufficient`; `FP_VERSION = 1`; `NEAR_MIN = 0.5`. Tạo "dấu vân tay" nội dung + dấu vân tay sự kiện.
- `src/lib/dupindex.ts` (`DupIndex`): chỉ mục ứng viên → quét toàn ngân hàng không O(n²); có tiến độ và huỷ.
- `src/lib/dupscope.ts`: `ScanMode = inside | vsAll`; phạm vi Khối/Phân môn/Chương/Bài/Dạng/câu đang chọn/toàn kho; quét dừng giữa chừng không bao giờ hiện là "không trùng"; câu sửa sau khi quét → báo danh sách cũ.
- `src/lib/dupdiff.ts`: xem khác biệt theo ký hiệu (tab "Khác biệt").
- `src/lib/dupimport.ts`: rà trùng khi nhập `.tex`/dán LaTeX — mới↔kho và mới↔mới, quyết định từng câu (`import | skip | hold`), `MAX_HITS = 12`, kiểm tra lại ngay trước khi ghi.
- `src/lib/dupdecisions.ts`: `PairDecision = not_duplicate | legit_variant | review_later`; khoá quyết định = cặp uid + dấu vân tay nội dung (rawKey) + `DUP_ALGO_VERSION = 1`; sửa nội dung → quyết định cũ thành `stale` (sửa chỉ khoảng trắng không làm cũ). `DecisionStatus = none | valid | stale`. Lý do chọn sẵn: `WHY_CHOICES`.
- `src/lib/dup.ts` (+ `dup.baseline.test.ts`): bộ dò cũ giữ làm cầu nối `findDuplicates` và baseline lỗi; `src/lib/dupfixtures.ts`: bộ 40 cặp thử khó.
- PR-1 (#33) sửa lỗi: tên môi trường LaTeX không còn thành chữ; tra cứu theo dữ kiện; khẳng định nguyên mã bằng so chuỗi thật. HEdu KHÔNG tự xoá, KHÔNG tự gộp câu trùng.
- UI: `DupCheck.tsx` (danh sách cặp, phân trang), `PairCompare.tsx` (so sánh cân xứng: cạnh nhau khi rộng/dọc khi hẹp), "Mở sửa" rồi quay lại đúng cặp.

## 5. Từ beta.7 đến beta.17 (nền tảng, còn hiệu lực)

- **Gói LaTeX** (beta.7/9): bảng "Gói LaTeX" đọc khai báo gói, `kpsewhich`, `tlmgr search` (hỏi trước khi dùng mạng, không tự cài); nhúng gói riêng ở `src-tauri/tex/` (`ex_test`, `tkz-tab-vn`, `tkz-linknodes`, `ex_tkz-euclide`, `twemojis`, `shared-content`). Đầu file vẽ hình mặc định giống bộ đề thật; sửa ở Hệ thống → Vẽ hình TikZ (đầu file đã tự lưu từ trước phải bấm "khôi phục mặc định").
- **Dịch hình** (beta.8): qua DVI + dvisvgm, không cần Ghostscript. TikZ dùng TeX Live đã cài trên máy người dùng (vd `D:\texlive\texlive\2026\bin\windows`), không đóng gói.
- **Xem trước theo cấu trúc** (beta.10): `src/lib/textflow.ts` dựng `\resizebox`, `\hspace`, `center` nhiều hình, danh sách, bảng, `\immini` hai cột; `src/lib/srcdiag.ts` báo lỗi ngoặc có dòng/cột và `barePathProblems` (toạ độ thiếu `\draw` — HEdu chỉ BÁO, không tự thêm).
- **"Xem chuẩn" bằng TeX Live** + "Biên dịch thử N câu" (`xemchuan.ts`): dừng được; một câu lỗi không chặn cả đợt; lỗi chia nhóm (thiếu gói / thiếu lệnh / lỗi mã / quá giờ).
- **Ngăn sửa** `QuestionDrawer.tsx` + `QuestionEditor.tsx` dùng chung; hỏi khi thoát chưa lưu; Ctrl+S chỉ lưu câu đang sửa.
- **Zoom 80–150%** (`zoom.ts`; quyền Tauri `core:webview:allow-set-webview-zoom`).
- **SVG** (beta.11): `svgids.ts` thêm tiền tố id riêng cho mỗi hình (dvisvgm đặt id trùng `clip1…` làm hình sau bị cắt theo hình trước); `figscale.ts` cỡ hình Cân bằng/Giữ nguyên + thanh 70–140%.
- **Đáp án** (beta.12): `.opt-body`/`.tf-body` sửa đứt chữ; `Choices` đo độ rộng thật để xếp 4/2/1 cột.
- **Bảng** (beta.13): `ruleRow()` phủ đủ cột cho `\hline` cuối.
- **Ngân hàng Thẻ/Danh sách** (beta.14, F1, UI-only): `localStorage hedu.bankview`; `activeUid` tách khỏi `sel`; một panel Chi tiết; hàng gọn dùng `plainSnippet` (`snippet.ts`).
- **Kiểm duyệt** (beta.15, F2, schema 2→3): `Question.review?: 'needs_fix'|'approved'` (vắng = Chưa kiểm tra); `setReview` chỉ báo thành công sau khi ghi đĩa; sửa LaTeX/đổi loại câu → về Chưa kiểm tra; không tự duyệt, không duyệt hàng loạt. ⚠ Bản app cũ KHÔNG mở được dữ liệu schema 3; bản sao lưu trước cập nhật vẫn giữ schema 2.
- **Nhãn enumerate** (beta.15): `\it TH1:`, `\alph*`, `\roman*`, lồng nhau; `crisp.ts` nét thẳng ngang/dọc SVG tối thiểu 1px.
- **Tạo đề đang tạm ẩn** (`FEATURES.exam` trong `src/lib/features.ts`), mã vẫn giữ.

## 6. Bản đồ mã nguồn nhanh

- `src/screens/`: `Bank.tsx`, `Editor.tsx`, `Exam.tsx`(ẩn), `Extra.tsx` (Nhập liệu…), `Curriculum.tsx`, `System.tsx` (Hệ thống, gồm `TrashPanel`).
- `src/components/`: `DupCheck`, `PairCompare`, `GoldPanel`, `QuestionDrawer`, `QuestionEditor`, `QuestionView`, `FilterMenu`, `ReviewControl`, `TikzFigure`, `CompiledView`, `PackagePanel`, `ZoomControl`, `CommandPalette`…
- `src/lib/`: `store.ts` (kho dữ liệu, sao lưu), `migrate.ts` (`CURRENT_SCHEMA = 3`), `id.ts`/`taxonomy.ts`/`curriculum*.ts` (ID CT 2018), `tikz.ts`/`render.ts`/`textflow.ts`, họ `dup*.ts`, `goldset.ts`, `trashflow.ts`.
- `src-tauri/src/`: `lib.rs` (`SUPPORTED_SCHEMA = 3`), `storage.rs` (đọc/ghi atomic + `.bak`, tệp phụ), `tikz.rs`, `texpkg.rs`, `proc.rs`, `support.rs`. Rust chỉ được xác minh bằng CI Windows.
- `scripts/`: `test.mjs` (danh sách test), `ui-shots.mjs`, `ui-fixtures.mjs`, `release-scripts.test.mjs`, `prune-releases.mjs`.

## 7. Quy tắc cốt lõi cần giữ (trích AGENTS.md)

1. `CURRENT_SCHEMA` (migrate.ts) = `SUPPORTED_SCHEMA` (lib.rs). Đổi schema = migration + test dữ liệu cũ + chủ dự án duyệt.
2. Chỉ MỘT bản `backups/before-update`; ghi file luôn atomic + `.bak`.
3. Kho công khai: không commit `data/test/`, ngân hàng thật, khoá ký, mật khẩu.
4. Phát hành CHỈ bằng `release.yml` khi chủ dự án nói; số phiên bản do CI gắn; luôn beta trước stable.
5. ID CT 2018: `[Lớp][Phân môn][Chương][Mức độ N/H/V/C][Bài]-[Dạng]` (vd `2D1H1-1`).
6. LaTeX/TikZ: bảo toàn nội dung gốc; test ca khó.
7. Không tự đổi nghiệp vụ Toán.
8. Chưa khẳng định "chạy được trên Windows" khi CI chưa xanh; và nay vẫn CHƯA có nghiệm thu máy thật.

## 8. Việc còn lại / backlog

- **Chủ dự án nghiệm thu trên Windows thật**: cập nhật lên beta.20; thùng rác (loại câu → Hệ thống → Khôi phục); tạo file sao lưu rồi khôi phục; Nhãn chuẩn trên kho thật (~150 cặp) để lấy báo cáo độ chính xác; Ngân hàng 1366×768 và zoom 150%; Nhập `.tex`; trình sửa 3 chế độ với câu có TikZ; "Xem chuẩn" với TeX Live thật.
- **Cần quyết định**: tích hợp AI (chạy ở đâu; có gửi dữ liệu ra ngoài không).
- **Đo**: hiệu năng ~60.000 câu trên máy thật.
- **Backlog**: F4 sửa hàng loạt; F5 lưu bộ lọc; lưu đầu file theo từng câu (đổi schema, cần duyệt riêng); huỷ hẳn tiến trình TeX trên Windows; SQLite; bật lại Tạo đề; xuất Word/PDF; nhập từ Word; nhập MathHub ~60.000 câu; các mục "chưa làm" của V3; đưa tệp phụ vào bản chụp trước cập nhật (Rust).

## 9. Cách làm việc / công cụ của Claude (để AI khác không lặp lại thử nghiệm)

- GitHub: `gh api` REST (GraphQL bị chặn); PR → chờ CI (`giao-dien` + `windows`) → squash merge.
- Phát hành: `gh api repos/nvghy19112002-cmd/HEdu/actions/workflows/release.yml/dispatches -X POST -f ref=main -f 'inputs[tag]=v0.1.0-beta.N'`.
- Kiểm thử cục bộ: `npm test`, `npm run build`; giao diện bằng Playwright (`scripts/ui-shots.mjs`, dữ liệu giả lập).
- Môi trường Claude không cài được `@types/*` (mạng npm chặn) nên typecheck thật chỉ ở CI (`npm run typecheck`).
