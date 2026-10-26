# Bàn giao HEdu sang phiên Claude Code mới (26/10/2026, sau E6 Ngân hàng đề thi LaTeX)

## Git (26/10/2026)
- `main` đã có: E0 (#112), E1 (#113), E2a (#116) trên nền `v0.1.0-beta.33` (beta.33 là bản phát hành gần nhất; chưa có bản phát hành nào chứa Ngân hàng đề thi).
- Đang chờ chủ dự án duyệt gộp, **xếp chồng** (gộp theo thứ tự): #118 E2b xem PDF → #121 E3 biên tập → #122 E4 thư viện hoàn chỉnh → #124 E5 Đề/Lời giải + nguồn UID → PR E6 (kiểm thử hiệu năng + tài liệu). Sau mỗi lần gộp, đổi nền PR kế tiếp về `main`.
- Chưa phát hành. Phát hành chỉ khi chủ dự án ra lệnh riêng (`release.yml`, nhập `tag`); chủ dự án nói sẽ ra lệnh ở cuộc trò chuyện khác sau khi kênh khác cập nhật GitHub.

## Đọc gì trước
`claude/thiet-ke-de-thi.md` (thiết kế đã duyệt + mục 6 trạng thái/điểm khác), `claude/nghiem-thu-de-thi.md` (danh sách nghiệm thu Windows, giới hạn đã biết, nháp ghi chú phát hành), `AGENTS.md`.

## Module mới (Rust `src-tauri/src/`, giao diện `src/`)
- `examlib.rs` (nhập/sổ/chỉ mục/kiểm tra, `open_inside` an toàn liên kết), `examcompile.rs` (biên dịch, chế độ, PDF tốt gần nhất), `examprofile.rs` (nhận diện ex_test, bản dẫn xuất Đề/Lời giải), `examfiles.rs` (đọc/ghi tệp giữ byte, bản nháp), `examadmin.rs` (thông tin, sao chép, Thùng rác đề, sao lưu/khôi phục, gói), `examsources.rs` (nguồn UID, tạo đề từ tệp), `proc.rs` (`run_job`, Job Object).
- TS: `lib/examlib.ts`, `examcompile.ts`, `examfiles.ts`, `examfacets.ts`, `examsources.ts`, `pdfview.ts`; màn `screens/ExamLibrary.tsx`, `ExamWorkspace.tsx`; thành phần `PdfViewer`, `CodeEditor`, `BankPicker`, `SourcesPanel`, `ExamAdminPanels`, `ExamInfoForm`.
- Mục thanh bên "Đề thi" (không dùng cờ `FEATURES.exam`; cờ đó vẫn tắt màn Tạo đề).

## Kiểm thử đã chạy (tại máy phát triển)
`cargo test --lib --locked`, `npm test`, `npm run build`, typecheck; kiểm tay với TeX Live 2026 (`HEDU_TEX_BIN=<thư mục bin> cargo test --lib --locked tex_live_that -- --ignored --nocapture`). Giao diện đã thử bằng trình duyệt với dữ liệu giả lập; **chưa bấm thử trong cửa sổ Tauri thật, chưa nghiệm thu Windows thật**.

## Việc tiếp
1. Chủ dự án nghiệm thu theo `claude/nghiem-thu-de-thi.md`; gộp các PR theo thứ tự.
2. Backlog: đổi tên/xoá/di chuyển từng tệp trong cây tệp; BibTeX/Biber; bật lại màn Tạo đề (kiểm cấu trúc trước khi trộn mã); nghiệm thu mục G, H, I của beta.30; đo lô nhập lớn (giới hạn 5.000 câu/lô).
3. Mẹo kỹ thuật: Bash heredoc làm hỏng dấu `\` của LaTeX/Rust: dùng công cụ Write hoặc Edit cho tệp có `\`. Typecheck cần `@types/node` (dùng `--typeRoots`). `node_modules` do `npm ci`; `Cargo.lock`/`package-lock.json` được theo dõi (dùng `--locked`).

## Quy tắc không đổi
- Không đổi schema (3), ID6, UID, LaTeX/TikZ gốc; không tự xoá/duyệt câu; repo công khai nên không commit dữ liệu thật, khoá API, thông tin cá nhân.
- Không bao giờ chạy app thử bằng identifier thật: `npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'`.
- Chỉ phát hành khi chủ dự án nói rõ; chỉ gộp PR khi chủ dự án đồng ý đúng PR đó. PR qua REST GitHub (không có `gh`), token từ `git credential fill`.
- Chủ dự án là giáo viên Toán không viết code: trả lời tiếng Việt dễ hiểu; nghiệp vụ chưa rõ thì hỏi.
