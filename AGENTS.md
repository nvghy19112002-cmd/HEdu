# HEdu — Quy tắc chung cho mọi AI (Claude, ChatGPT)

Đây là NƠI DUY NHẤT ghi quy tắc làm việc. `CLAUDE.md` (nếu có) chỉ trỏ về đây.
Chủ dự án là giáo viên Toán, không rành code: viết cho họ bằng tiếng Việt đời thường, không dùng thuật ngữ khi không cần.

## 1. Sản phẩm
App Windows (Tauri 2 / Rust + React / TypeScript) cho giáo viên Toán: ngân hàng câu hỏi LaTeX (ex_test), hình TikZ qua TeX Live có sẵn trên máy, tạo/trộn/xuất đề, ID tự động theo CT 2018, kiểm tra trùng. Dữ liệu lưu cục bộ.
Kho: `nvghy19112002-cmd/HEdu` (công khai), nhánh `main`.

## 2. Vai trò
| Ai | Làm gì |
|---|---|
| Chủ dự án | Nêu yêu cầu, xác nhận đúng sai về Toán, duyệt thay đổi lớn, nghiệm thu trên app thật, bấm phát hành |
| ChatGPT | Phân tích yêu cầu, viết phiếu việc, review PR có chọn lọc. KHÔNG sửa code trừ khi chủ dự án giao riêng và chỉ định khu vực |
| Claude | Xác minh code mới nhất, chọn cách làm, viết code + test, tạo PR/commit, phát hành |

Một việc chỉ có MỘT người triển khai. Hai AI không sửa cùng file / cùng nhánh.
Khi mâu thuẫn, thứ tự ưu tiên: (1) quyết định mới nhất của chủ dự án → (2) code, test, config trên nhánh làm việc → (3) Issue/PR → (4) README/tài liệu → (5) bộ nhớ AI và PDF bàn giao (chỉ là nền, phải kiểm chứng).

## 3. Quy mô việc (giữ ngắn để tiết kiệm token)
- **S** (sửa nhỏ, giao diện, chữ): chủ dự án nói thẳng với Claude, không cần Issue. Claude làm, chạy test, commit, báo 2–3 dòng.
- **M** (tính năng vừa): phiếu ngắn (hiện trạng, kết quả mong muốn, tiêu chí nghiệm thu). Issue hoặc chat đều được.
- **L** (đổi dữ liệu, kiến trúc, phát hành): bắt buộc có rủi ro, kế hoạch chia giai đoạn, tương thích ngược, và chủ dự án duyệt TRƯỚC khi làm.

Mẫu phiếu M/L: `[M/L] Tên` · Hiện trạng · Kết quả mong muốn (góc nhìn giáo viên) · Phạm vi / phần không được đụng · Rủi ro · Tiêu chí nghiệm thu (checklist).
Claude không coi giải pháp trong phiếu là mệnh lệnh: nếu có cách tốt hơn thì chọn và ghi lý do một dòng.

## 4. Bất khả xâm phạm (không tự ý thay đổi)
1. **Cấu trúc dữ liệu (schema)**: `CURRENT_SCHEMA` trong `src/lib/migrate.ts` phải bằng `SUPPORTED_SCHEMA` trong `src-tauri/src/lib.rs`. Đổi schema = viết migration + test dữ liệu cũ + chủ dự án duyệt.
2. **Sao lưu**: chỉ giữ MỘT bản trước cập nhật (`backups/before-update`). Ghi file luôn atomic + `.bak`. Không đổi thứ tự "tải → kiểm chữ ký → sao lưu → cài".
3. **Kho là công khai**: không bao giờ commit `data/test/` hay ngân hàng câu hỏi thật, khóa ký (`hedu.key`), mật khẩu, secrets.
4. **Phát hành**: chỉ bằng workflow `release.yml` (Run workflow, nhập `tag`). Số phiên bản do CI gắn, không sửa tay trong `package.json`/`tauri.conf.json`. Kênh `channel-stable|beta|previous` do workflow quản lý. Luôn đi beta trước stable; luôn có bản quay lại.
5. **ID CT 2018**: `[Lớp][Phân môn][Chương][Mức độ N/H/V/C][Bài]-[Dạng]` (vd `2D1H1-1`). Không tự sửa công thức mã. Mã trong cây khung là 1 ký tự, id nội bộ (`c2D1`, `l2D11`, `f2D111`) không đổi khi đổi tên/mã.
6. **LaTeX/TikZ**: bảo toàn nội dung gốc, không biến đổi âm thầm. Phải test ca khó (`\immini`, `\def` trong tikz, `\newcommand` có tham số, tkz-tab, tikz-3dplot) và ca máy thiếu TeX Live. TikZ dùng TeX Live đã cài trên máy người dùng, không đóng gói vào app.
7. **Toán học**: không tự đổi nghiệp vụ Toán; nghi ngờ thì hỏi chủ dự án.

## 5. Kiểm tra trước khi nói "xong"
- `npm test` phải qua (gồm `lib.test`, `bank.test` trên dữ liệu thật nếu có, `release-scripts.test`).
- Code Rust chỉ được xác minh bằng CI trên Windows (môi trường làm việc của Claude không biên dịch được Tauri). Đừng khẳng định "chạy được trên Windows" khi CI chưa xanh.
- Trước phát hành: test, build Windows xanh, dữ liệu người dùng an toàn, có phương án quay lại.

## 6. Tiết kiệm token
- Đọc đúng file cần thiết, không đọc lại toàn repo. Mở rộng khi có bằng chứng.
- Báo cáo ngắn: thay đổi chính · test đã chạy và kết quả · link PR/commit · việc còn tồn. Không kể nhật ký.
- Cập nhật `GHI-CHU-PHAT-HANH.md` (mỗi bản phát hành) và mục "Trạng thái" dưới đây để phiên sau không phải dò lại.
- Trao đổi giữa hai AI qua Issue/PR hoặc file Markdown ngắn, không dán cả hội thoại.

## 7. Trạng thái (Claude cập nhật sau mỗi đợt)
Mới nhất đã phát hành: `v0.1.0-beta.22` trên kênh beta (23/10/2026). Tổng kết chi tiết từng bản: `TONG-KET-BETA20.md`. Chưa có bản chính thức (stable) từ các đợt này; beta trước stable.
Đã phát hành, theo bản:
- beta.7: bảng “Gói LaTeX” (đọc khai báo gói, `kpsewhich`, `tlmgr search` có hỏi trước khi dùng mạng, không tự cài), phân loại lỗi log TeX, dịch hình an toàn hơn (Issue #1 P1–P4, PR #4).
- beta.8: dịch hình qua DVI, không cần Ghostscript (PR #5).
- beta.9: nhúng gói LaTeX riêng `src-tauri/tex/`, đầu file vẽ hình mặc định mới, báo tên lệnh chưa định nghĩa; Issue #2 (thẻ Ngân hàng hết chồng, header gọn, tạm ẩn Tạo đề bằng `FEATURES.exam` trong `src/lib/features.ts`) (PR #8, #10).
- beta.10: PR-A xem trước LaTeX dựng theo cấu trúc `src/lib/textflow.ts` + báo lỗi ngoặc có dòng/cột `srcdiag.ts` (Issue #9, PR #11); PR-B “Xem chuẩn” bằng TeX Live, biên dịch thử hàng loạt `xemchuan.ts` (Issue #1, PR #12); PR-C trình sửa câu dùng chung `QuestionEditor.tsx` + ngăn sửa `QuestionDrawer.tsx` (Issue #3, PR #13); PR-D zoom 80–150% `zoom.ts` (Issue #7, PR #14). Không đổi schema/Rust (ngoài quyền `core:webview:allow-set-webview-zoom`).
Sau beta.10 (nhánh `claude/fix-svg-ids-fig-scale`): SỬA hình SVG sai/cắt lệch — nguyên nhân: dvisvgm đặt id trùng (`clip1`, `clip2`…) và nhiều hình nhúng chung một trang nên hình sau bị cắt theo hình trước; nay mỗi hình có tiền tố id riêng (`src/lib/svgids.ts`, áp trong `TikzFigure` và `CompiledView`). Thêm “Cỡ hình trong xem trước” (`src/lib/figscale.ts`, Hệ thống): Cân bằng (mặc định) / Giữ nguyên + thanh 70–140%, lưu theo máy, hình có `\resizebox` giữ nguyên theo mã.
Beta.12 (nhánh `claude/fix-answers-layout`): (a) NGUYÊN NHÂN đáp án/ý đúng-sai bị đứt chữ: `.opt`/`.tf li` là `display:flex` nên mỗi mảnh con của `<Tex>` thành một ô flex riêng — nay bọc `<span class="opt-body"|"tf-body">`; (b) đáp án trắc nghiệm xếp 4/2/1 cột bằng cách ĐO bề rộng thật (`Choices` trong `QuestionView.tsx`, giống ex_test); (c) khung bao chữ Đ/S và hộp “ĐÁP ÁN” cho trả lời ngắn; (d) `barePathProblems` (srcdiag.ts) báo câu lệnh TikZ bắt đầu bằng toạ độ thiếu `\\draw` — đã biên dịch thử bằng pdflatex: TeX thật cũng không vẽ nét đó (câu 34, 35 trong 300 câu thử là trục số thiếu `\\draw`), nên HEdu chỉ BÁO, không tự thêm.
Beta.13: sửa bảng `tabular` mất đường kẻ dưới cùng — `\\hline` sau hàng cuối trước đây chỉ vẽ ở cột đầu (một ô rỗng); nay `ruleRow()` trong `textflow.ts` phủ đủ mọi cột (có test).
F1 Danh sách / Chi tiết (nhánh `claude/f1-bank-list-detail`, UI-only, KHÔNG đổi schema): công tắc `Thẻ | Danh sách` ở màn Ngân hàng, lưu theo máy `localStorage hedu.bankview`; cùng một đường lọc/sắp xếp/phân trang (`list`→`shown`) cho cả hai chế độ; `activeUid` (câu đang xem) tách khỏi `sel` (ô chọn nhiều); chỉ MỘT panel Chi tiết dùng `QuestionView`; hàng gọn dùng `plainSnippet` (`src/lib/snippet.ts`, không dựng KaTeX/TikZ); Sửa gọi ngăn sửa chung (PR-C). F2 Kiểm duyệt (nhánh `claude/f2-review-status`, Issue #21, ĐÃ được chủ dự án duyệt schema 2→3, bản gọn): `Question.review?: 'needs_fix'|'approved'` (vắng = Chưa kiểm tra, khoá theo `uid`); migration 2→3 chỉ nâng số phiên bản; `setReview` trong `store.ts` (chỉ báo thành công sau khi ghi đĩa, lỗi thì hoàn lại); sửa LaTeX hoặc đổi loại câu → về Chưa kiểm tra, đổi nhãn/mức độ/vị trí thì giữ; nhân bản/nhập mới = Chưa kiểm tra; không tự duyệt, không duyệt hàng loạt. UI: `ReviewControl.tsx`, bộ lọc “Kiểm duyệt” dùng chung đường lọc. Lưu ý quay lui: bản app cũ KHÔNG mở được dữ liệu schema 3; bản sao lưu trước khi cập nhật vẫn giữ dữ liệu schema 2. F3/F4/F5 còn trong backlog, chưa làm.
Chờ chủ dự án nghiệm thu trên máy Windows thật (chưa ai xác nhận): cập nhật trong app tới beta.10; hình TikZ qua DVI với `D:\texlive\texlive\2026\bin\windows`; câu #0053 với `ex_test` nhúng; “Xem chuẩn” với TeX Live thật; ngăn sửa; chụm ngón/Ctrl+lăn để zoom và quyền Tauri; đầu file đã tự lưu từ trước phải bấm “khôi phục mặc định” mới nhận đầu file mới.
Issue: #3, #7, #9 đã đóng (“ĐÃ XỬ LÝ beta.10 — chờ nghiệm thu”, mở lại nếu nghiệm thu thấy lỗi). #1 còn mở với 3 mục: lưu đầu file theo từng câu (đổi schema, cần duyệt riêng), hủy hẳn tiến trình con TeX trên Windows, nghiệm thu máy thật.
Chưa làm: lưu bằng SQLite (loại L, cần duyệt thiết kế); bảng danh sách + khung xem trước; luồng tạo đề 3 bước (Tạo đề đang ẩn); xuất Word/PDF; nhập từ Word; nhập MathHub ~60.000 câu. “Word Equation/MathType” và mở rộng ngoài lớp 10–12 chỉ là hướng nghiên cứu.
Ghi nhớ kỹ thuật: `node_modules` đang bị git theo dõi như một liên kết (symlink) — chưa xử lý, đừng chạy `npm i` làm mất nó (nếu mất: `git checkout node_modules`).

Đợt sau beta.15 (PR #23 nhãn enumerate + sửa tách `\item` sau danh sách lồng, PR #24 `src/lib/crisp.ts` nét ngang/dọc SVG sắc nét, PR-C bố cục Ngân hàng gọn: `.qbar`, Bộ lọc thu gọn `hedu.bankfilters`, mục lục ẩn được `hedu.banktree`, menu ba chấm `.more-menu`, hộp “thay đổi chưa lưu” dạng modal). Không đổi schema/ID/dữ liệu/updater. Chưa phát hành (đợi chủ dự án nghiệm thu).

Đợt giao diện V3 (PR #39–#46, phát hành beta.19): token màu Hướng B ở đầu `src/styles.css` (đừng thêm mã màu rời), thang cỡ chữ 12/13/14/16/20/24, bo góc 4/8/12, nút 28/36; Ngân hàng một hàng công cụ; Kiểm tra trùng chọn loại bằng một ô (ẩn "Cùng mẫu" mặc định); Nhập liệu có chỉ báo bước; trình sửa 3 chế độ xem (`hedu.qemode`); Hệ thống 4 nhóm + hỏi xác nhận khi khôi phục từ file. Bộ chụp ảnh `scripts/ui-shots.mjs` (dữ liệu giả lập, không dùng dữ liệu thật). Không đổi schema/ID/dữ liệu.
beta.20 (PR #48, không đổi schema/Rust): file sao lưu thủ công có khoá `dupSidecar` (quyết định trùng + `trash` + `gold`, khôi phục là gộp); thùng rác (`trashflow.ts`, câu chỉ rời ngân hàng sau khi thùng rác ghi xong; Hệ thống → Thùng rác); bộ nhãn chuẩn gắn mù ~150 cặp (`goldset.ts`, `GoldPanel.tsx`). Bản chụp trước cập nhật (Rust) chưa gồm tệp phụ; chưa nghiệm thu máy Windows thật.
Đợt V4 (phát hành beta.21, UI-only, không đổi schema/Rust): thanh `BankSidebar.tsx` + `FieldMenu.tsx` (một nơi duy nhất cho mọi bộ lọc; ngăn trượt khi hẹp/ẩn), logic thuần `src/lib/bankfilter.ts` (cascade, đếm theo chiều, `sanitize`) và `src/lib/figure.ts` (`figureState`: yes/no/unknown, chỉ xét phần trước `\loigiai`, có đệm theo uid). Bộ lọc thuộc tính ĐÃ chuyển khỏi `.qbar`; `FilterMenu.tsx` đã xoá. "Toàn kho" chỉ có hiệu lực khi có chữ tìm.
beta.21 thêm: ô Lớp/Phân môn tự thành ô chọn khi >3 mục (`SEG_MAX`, ĐÃ BỎ ở V5; tên lớp qua `gradeLabel` ở `taxonomy.ts`); ô đáp án gọn (`.opt`, `.tf .mark`, `.ans-box` trong `styles.css`; `Choices` đo bề rộng với `PAD=14`). LƯU Ý ID: `gradeNumber()` chỉ phân biệt Lớp 3–12; Lớp 1–2 và cấp khác chưa có mã — cần quyết định của chủ dự án trước khi mở rộng.
V5 (phát hành beta.22, UI-only): Lớp/Phân môn/Chương/Bài/Dạng luôn là ô chọn có ô tìm; lọc Lớp theo `gradeId` (không theo số lớp); chọn đủ mọi giá trị = Tất cả; trạng thái rỗng 4 loại (`BankEmpty.tsx`). Chi tiết trong `GHI-CHU-PHAT-HANH.md`.
