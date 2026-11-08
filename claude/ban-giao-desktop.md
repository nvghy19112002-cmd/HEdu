# Bàn giao HEdu (08/11/2026, phiên Claude Code desktop)

Đọc tệp này trước khi làm tiếp. Quy tắc chung vẫn ở `AGENTS.md`.

## 1. Đã gộp / đã phát hành trong phiên
- **beta.63 đã PHÁT HÀNH** (kênh beta, PR #269): màn Câu hỏi dạng bảng gọn, hộp thoại ←/→, cây Mục lục gọn, huy hiệu Đ/S thẳng hàng, Tạo đề bỏ Form THPT, ẩn cột Tệp khi đề 1 tệp.
- **Đã gộp vào `main`, CHƯA phát hành:**
  - #270: ghi chú beta.63.
  - #271: thiết kế `claude/thiet-ke-thiet-lap-de.md`.
  - #272: **hộp thoại Thiết lập đề** (`examsetup.ts`, `ExamSetupDialog.tsx`). Chủ dự án đã chốt cả 5 phương án a: tự hiện khi nhập 1 đề; khung tiêu đề điền vào `\begin{name}` hoặc khung HEdu; file OCR thô chỉ báo + mở Xử lí TeX; La Mã liên tục; câu lạc phần sắp lại.

## 2. Nhánh đang làm: `claude/hoan-thien-beta64` (worktree `D:\HEdu-tv`)
Tách từ `main` sau #272. Đã đẩy lên GitHub, **chưa mở PR**. `npm test`, `tsc`, `npm run build` đều qua. Rust không đổi.

Nội dung (giai đoạn 3, bước 4–7 + góp ý của chủ dự án ngày 08/11):
- **Soạn TeX** (`TexScratch.tsx`, `CodeEditor.tsx`):
  - Một thanh trên: bàn nháp ▾, Mã/Mã+Xem/Xem, Công cụ ▾, Đưa vào Ngân hàng, Biên dịch PDF.
  - Tìm/Thay, Chuẩn hoá, Sắp theo ID nằm ở đầu khung mã.
  - Tab **Vấn đề** gom mọi lỗi; bấm một lỗi là nhảy tới dòng.
  - Tô cả khối `\begin{ex}…\end{ex}` của câu đang chọn, tô đỏ dòng lỗi (`CodeEditor.mark`, `onCursor`).
- **Tạo đề:** thanh 3 bước có ✓ (Ma trận › Chọn câu & xem trước › Trộn mã & lưu), nút Quay lại/Tiếp trên đầu, bảng cân bằng đáp án A–D.
- **Biên tập đề:** gom 3 nút ít dùng vào menu Công cụ ▾.
- **Trình chiếu:**
  - Màn riêng `src/screens/Slides.tsx`: các bộ | lưới slide xem trước (bấm là chiếu từ câu đó) | cách chiếu bằng công tắc, chọn nền Tối/Sáng.
  - Hộp "Thêm câu": dán LaTeX hoặc mở .tex.
  - `slideshow.ts` có PlayOpts: đếm ngược, tự hiện đáp án, trộn, cho xem lời giải, nền.
  - `SlideShow.tsx`: nền tối/sáng dịu mắt, điều khiển tự ẩn, có tham số `start`.
- **Nhập liệu:** kéo-thả tệp/thư mục (Tauri drag-drop), nút Lịch sử nhập (`settingsnav.requestPane`).
- **Sức khoẻ:** vòng điểm tổng; sửa lỗi cũ `.panel.is-compact > span` làm mất chữ (đổi sang `hl-panel`).
- **Đầu màn gọn** (`g3-head`) cho Hình, Thùng rác, Cài đặt, Chương trình.
- **Ngân hàng kiểu MathHub:**
  - Bảng + khung xem trước bên phải (`BankPreview.tsx`); ↑/↓ chuyển câu, Enter/bấm đúp mở cửa sổ lớn.
  - Sắp xếp mặc định "Mức độ tăng dần" (`qsort.ts`, có test).
  - Dạng Bảng là một khung vừa cửa sổ (`.bk-fit`): tìm kiếm trên dòng tiêu đề, thống kê một hàng, Mục lục | bảng | xem trước cao bằng nhau, mỗi phần tự cuộn.
  - Xác minh và Gán ID nhờ Claude lên đầu trang; bỏ ô "Chọn" trong khung xem trước.
- **Cây Mục lục** (Ngân hàng, Hình, Đề thi): mũi tên tam giác to; bấm lại tên mục đang mở thì thu gọn.
- **Tự co giãn theo cửa sổ** (`zoom.ts`: `fitFactor`, `FIT_REF` = 1720, giới hạn 65–130%, bật mặc định, tắt ở Cài đặt › Cỡ hiển thị):
  - Cửa sổ nhỏ thì cả giao diện thu theo đúng tỉ lệ, bố cục giữ y như toàn màn (theo yêu cầu chủ dự án).
  - Trong app Windows dùng zoom thật của WebView2. Trình duyệt dùng CSS zoom, nên ảnh chụp trình duyệt có dải trống dưới đáy (app không bị).

## 3. Bước tiếp (khi chủ dự án đồng ý)
1. Chủ dự án thử thêm trên app thử. Sửa góp ý còn lại nếu có.
2. Mở PR vào `main` (kèm `GHI-CHU-PHAT-HANH.md` + mục Trạng thái `AGENTS.md` cho beta.64), chờ CI xanh, **hỏi** rồi mới gộp.
3. Phát hành **beta.64** (`release.yml`, tag `v0.1.0-beta.64`) khi được bảo. Gộp gồm cả #272 Thiết lập đề.
4. **Bản chính thức (stable)**: chủ dự án muốn lên sau khi giao diện xong. Đây sẽ là bản stable ĐẦU TIÊN; quy tắc yêu cầu đi beta trước và nghiệm thu máy thật (các bản beta.49–63 chưa ai nghiệm thu) → cảnh báo rồi chờ chủ dự án xác nhận lại.

## 4. Chưa làm / giới hạn đã biết
- Xuất bộ trình chiếu ra PDF (Beamer).
- Kéo-thả tệp Word vào Nhập liệu (đang báo dùng nút đọc Word).
- Tự bọc `\begin{ex}` cho văn bản OCR thô.
- Nhập liệu, Cài đặt, Thùng rác mới gọn phần đầu, bố cục bên trong giữ như cũ.
- Cửa sổ dưới khoảng 1120px không thu thêm nữa mà dàn lại: chưa soát kỹ cỡ này.
- Kho thử có câu #0001 hỏng mã (mất dấu `\`): lỗi dữ liệu thử, không phải lỗi giao diện.
- Hàng đợi ý tưởng: Trình chiếu "vippro" thêm (Beamer, ghi chú); `claude/de-xuat-mau-in.md` HyMath GĐ2–3; Vẽ hình nhờ Claude (cần đặc tả L).

## 5. Cách chạy / kiểm (máy chủ dự án)
- **App thử** (KHÔNG đụng dữ liệu thật), chạy trong `D:\HEdu-tv`:
  `TMP=D:/hedu-tmp TEMP=D:/hedu-tmp CARGO_TARGET_DIR=D:/hedu-build-target npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'`
  - Tắt app thử: chỉ tắt tiến trình `D:\hedu-build-target\debug\hedu.exe` và tiến trình giữ cổng 1420.
  - Không tắt `C:\Users\admin\AppData\Local\HEdu\hedu.exe` (app thật).
- **Chụp ảnh soát giao diện:** `node D:\hedu-tmp\pw\shots.mjs D:/hedu-tmp/shots 1366x768,1920x1040 bank,chieu,tex,...`
  - Dùng Edge có sẵn + `playwright-core` cài riêng trong `D:\hedu-tmp\pw`, chạy trên dev server cổng 1420 với dữ liệu mẫu.
  - Script đang tắt tự co giãn để ảnh không lệch đáy.
- `D:\HEdu\.claude\launch.json` có thêm cấu hình `hedu-tv` (chạy dev server của `D:\HEdu-tv`).
- Thư mục tạm, không commit: `D:\HEdu\.claude\mock-ui` (bản sao thiết kế 1.2), `D:\HEdu\.claude\anh-giao-dien`.
- **Lưu ý môi trường:** Bash ở máy này làm hỏng dấu `\` và nháy trong heredoc → sửa tệp bằng công cụ Write/Edit hoặc script Python ghi ra tệp.
