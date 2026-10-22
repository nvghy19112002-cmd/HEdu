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
Mới nhất: `v0.1.0-beta.6` trên kênh beta.
- Xong: khung cập nhật hai kênh + quay lại + sao lưu; cây khung CT sửa được (nhập/xuất JSON); màn Ngân hàng mới; nhập liệu có cảnh báo lỗi từng câu; TikZ qua TeX Live (có chọn thư mục `bin`, tự dò).
- Issue #1 (TeX Live/TikZ, đã duyệt) — đang làm trên nhánh `claude/issue-1-texlive-packages`:
  - Xong P1/P2: đọc khai báo gói (`src/lib/packages.ts`), tra `kpsewhich`, tra tên gói bằng `tlmgr search` (có hỏi trước khi dùng mạng, KHÔNG tự cài), bảng cảnh báo gói trong màn Nhập liệu, phân loại lỗi log TeX.
  - Xong một phần P3/P4: chạy tiến trình có giờ chót cho cả `dvisvgm`, đọc ống song song (không treo), thư mục tạm riêng mỗi lần dịch, ghi SVG nguyên tử, tối đa 3 hình dịch cùng lúc.
  - Chưa làm: “Xem chuẩn” biên dịch nguyên câu với đầu file/ex_test; lưu đầu file (preamble) cùng câu hỏi (cần đổi schema → chờ duyệt riêng); hủy tiến trình con của TeX trên Windows.
- Chưa xác nhận trên máy thật: cài cập nhật tới beta.6, TikZ chạy được với `D:\texlive\texlive\2026\bin\windows`.
- Chưa làm: lưu câu hỏi bằng SQLite (cần chủ dự án duyệt thiết kế, thuộc loại L); bảng danh sách + khung xem trước; luồng tạo đề 3 bước; xuất Word/PDF; nhập từ Word; MathHub ~60.000 câu chưa được nhập.
- Các mục "Word Equation/MathType", mở rộng ngoài lớp 10–12 là hướng nghiên cứu, chưa thuộc phạm vi phát hành.
