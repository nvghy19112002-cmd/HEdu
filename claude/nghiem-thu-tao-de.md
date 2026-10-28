# Nghiệm thu Tạo đề từ Ngân hàng — danh sách cho chủ dự án

Trạng thái: **chờ nghiệm thu trên máy Windows thật**. Chưa phát hành. Thiết kế: `claude/thiet-ke-tao-de.md`. PR: #135 (lõi) và #136 (giao diện), đã gộp vào `main` (`24ed055`, `3c3639b`).

Chạy thử bằng bản riêng, không đụng ngân hàng thật:

```bash
npx tauri dev --config '{"identifier":"vn.hedu.app.thu","productName":"HEdu (thu)"}'
```

## Đã kiểm tự động (không thay cho nghiệm thu)
- `npm test` (có `examgen.test`, `examdraft.test`), typecheck, build.
- Biên dịch thật bằng pdflatex (TeX Live 2026) với `khaibaochung.tex` của dự án: phát hiện và sửa 3 lỗi chỉ lộ khi biên dịch thật (tham số rỗng của môi trường `name`; thiếu nhãn `\zlabel{\made-lastpage}`; câu có ký tự điều khiển U+0008).
- App Tauri thử (`vn.hedu.app.thu`, qua CDP): mẫu đề 2025 → 22 câu 10 điểm → khóa/đổi câu → Lưu vào Thư viện đề → 22/22 nguồn UID còn nguyên văn → biên dịch PDF 20 trang, 0 lỗi. Kiểm 1366×768, 1920×1080, 1536×864 ở DPI 125%: không tràn ngang.

## Việc thầy/cô thử trên máy thật
- [ ] Vào **Tạo đề**: bấm “Dùng mẫu đề 2025”; số câu hiện 12 / 4 / 6 và 10 điểm khi kho đủ câu.
- [ ] Đổi “Đã duyệt / Đã xác minh / Mọi câu”: số “kho” từng dòng đổi theo; câu “Cần sửa” không bao giờ vào đề.
- [ ] Thêm dòng theo Chương/Bài/Dạng; dòng thiếu câu viền đỏ, báo thiếu mấy câu; chưa xuất được khi còn thiếu.
- [ ] Hai dòng chồng lấn (vd “cả Chương 1” và “Bài 2 chương 1”) vẫn đủ câu khi kho đủ, không báo thiếu giả.
- [ ] Rê chuột vào một câu: **Khóa** (giữ khi bấm “Sinh lại”), **Đổi câu** (chọn trong danh sách cùng dòng), **Ngẫu nhiên**.
- [ ] Mã đề 101 là bản gốc (giữ thứ tự và phương án); các mã sau trộn. Bảng đáp án khớp: kiểm vài câu bằng tay ở mã 102–104.
- [ ] Câu có phương án kiểu “cả A và B đúng” giữ nguyên thứ tự phương án (nhãn “Giữ nguyên phương án”).
- [ ] Ở Ngân hàng chọn vài câu → **Thêm vào đề**: các câu vào Tạo đề dưới dạng câu đã khóa.
- [ ] **Lưu vào Thư viện đề** → mục Đề thi → mở → **Biên dịch PDF** (chế độ Nguyên văn hoặc Đề): ra PDF đủ các mã, tiêu đề đúng, chân trang “Trang x/y”, bảng đáp án ở cuối.
- [ ] Mở `de-101.tex`: câu giống từng chữ với ngân hàng. Sửa một câu trong Ngân hàng rồi mở lại đề: **Nguồn câu hỏi** báo “Ngân hàng đã đổi”.
- [ ] Đóng app mở lại: màn Tạo đề còn ma trận và thông tin đề đang soạn.
- [ ] Giao diện ở màn hình bạn dùng (laptop nhỏ, phóng to 125–150%).
- [ ] **BẮT BUỘC, tự động hóa không thay được:** ở Ngân hàng chọn một câu **chưa duyệt** → Thêm vào đề: phải hiện hộp hỏi `window.confirm` về “ngoại lệ”. Bấm **OK**: câu vào đề, có nhãn “Ngoại lệ”, `hedu-de.json` có mục `ngoaiLe` của câu đó. Bấm **Hủy**: câu đó không vào đề. Thử cả hai lần, và thử thêm một câu “Cần sửa” (phải bị từ chối, không có hộp hỏi).
- [ ] Đang có câu khóa, sang Ngân hàng đổi câu đó thành “Cần sửa” (hoặc sửa nội dung cho mất “Đã duyệt”), quay lại Tạo đề: hiện danh sách “câu đã khóa không còn vào được đề” kèm nguyên nhân; nút Lưu/Xuất bị khóa tới khi bấm “Bỏ khóa”.
- [ ] Số câu bị loại vì ký tự điều khiển lạ hiện đúng; mở “Xem câu bị loại” thấy #số, UID, nguyên nhân; câu đó vẫn còn nguyên trong Ngân hàng.
- [ ] Ghi chú điểm: phần I/II/III 0,25 / 1,0 / 0,5; Đúng/Sai theo số ý đúng 0,1 / 0,25 / 0,5 / 1,0; đổi điểm tự luận thì tổng điểm đổi theo.
- [ ] Banner “chưa xác minh Dạng” có nhắc rủi ro ID sai lớp. Nếu kho có câu Toán 10 mang mã lớp 12, thầy/cô có thấy cảnh báo đủ rõ không?

## Giới hạn đã biết
- Chưa làm (đã được chốt, xếp vào PR sau): mỗi mã đề một PDF và ZIP; lưu ma trận thành mẫu có tên (lưu bền, sao lưu/khôi phục); tránh câu đã dùng ở các đề trước theo phạm vi chọn. Word và mẫu trình bày (đen trắng/xanh/đỏ) để sau. Chờ ma trận thực tế của chủ dự án cho mẫu chính thức.
- Đề lưu vào Thư viện vẫn có `main.tex` gộp mọi mã (một PDF nhiều mã, KHÔNG có bảng đáp án) và nay thêm `main-<mã>.tex` từng mã (PR 3).
- Câu có ký tự điều khiển lạ trong LaTeX bị loại khỏi đề (và báo số lượng); cần mở câu đó trong Ngân hàng và sửa.
- Bản nháp đề đang soạn lưu tạm trong máy (localStorage), không nằm trong sao lưu `.db`; đề đã lưu vào Thư viện nằm trong sao lưu thư viện đề.

## PR 3 — Xuất PDF từng mã và gói ZIP (chờ nghiệm thu máy thật)
Đề lưu từ Tạo đề nay có `main-<mã>.tex` cho từng mã; nút **Xuất PDF từng mã / ZIP…** (màn Tạo đề, sau khi lưu) và **Xuất từng mã…** (Đề thi). Đáp án KHÔNG còn nằm cuối PDF đề: chỉ ở `dapan.tex` + `main-dapan.tex` (cho giáo viên) và CSV trong gói giáo viên.

### Đã kiểm tự động (không thay cho nghiệm thu)
- Rust: 14 test mới (tên tệp, CSV, đối chiếu nguồn, gói giáo viên/học sinh, lỗi giữa chừng, huỷ, không ghi đè, PDF hỏng, giới hạn 24 mã, bộ đệm theo tệp chính); ZIP đọc lại bằng bộ đọc ĐỘC LẬP của Windows (.NET) khớp tên tiếng Việt và SHA-256. Toàn bộ `cargo test --lib --locked`: 184 đạt.
- TS: `examexport.test`, `examgen.test` (mọi tệp chính của PDF đề không chèn đáp án/lời giải).
- App thử `vn.hedu.app.thu` + TeX Live thật, 4 mã đề: gói giáo viên có lời giải (8 lượt dịch, 40 giây), gói học sinh dùng lại bộ đệm; xuất lần hai ra tên khác; một mã lỗi giữa chừng ⇒ không ZIP, không tệp `.part`; huỷ khi đang dịch ⇒ không ZIP; sửa nguồn ⇒ bộ đệm mất hiệu lực (dấu vân đổi).
- `scripts/kiem-ro-ri-pdf.mjs` (cần TeX Live, chạy tay hoặc trong báo cáo kiểm): PDF chế độ Đề không chứa từ nào chỉ có trong lời giải; chế độ Đề dịch có và không có `\True` cho chữ và lệnh vẽ giống hệt (không đánh dấu đáp án); đối chứng bắt được khác biệt ở PDF lời giải.

### Việc thầy/cô thử trên máy thật
- [ ] Tạo đề → Lưu vào Thư viện đề → **Xuất PDF từng mã / ZIP…** → chọn **Gói học sinh**: ZIP chỉ có PDF đề từng mã; mở từng PDF, không có đáp án, lời giải, bảng đáp án.
- [ ] **Gói giáo viên** (bật “Kèm PDF lời giải”): có `de/`, `loigiai/`, `dapan/*.csv`, `nguon/`, `manifest.json`. Mở CSV trong Excel: đúng tiếng Việt, đáp án khớp PDF lời giải của đúng mã đề.
- [ ] Giải nén `nguon/`, biên dịch `main-<mã>.tex` bằng TeX Live của máy: ra PDF.
- [ ] Xuất hai lần liên tiếp: hai tệp ZIP tên khác nhau, tệp cũ không bị ghi đè.
- [ ] Bấm **Dừng** giữa lúc dịch: không có ZIP, không có tệp `.part` trong thư mục đích.
- [ ] Đề cũ (lưu bằng bản trước, chưa có `main-<mã>.tex`): mở **Xuất từng mã…** → thấy báo thiếu → **Bổ sung tệp chính từng mã…**: hộp xác nhận liệt kê tệp sẽ thêm, những gì **đã** đối chiếu được và những gì **chưa** chứng minh được (nói thẳng, vd đề lưu bằng bản trước không có dấu vân từng tệp, sổ nguồn chỉ ghi mã đầu); sau khi đồng ý có thêm một bản sao dự phòng của đề; tạo tất cả hoặc không (lỗi giữa chừng thì các tệp mới bị hoàn tác); không tệp nào đang có bị sửa. Thử thêm: sửa tay một câu trong `de-<mã>.tex` rồi bổ sung ⇒ bị từ chối.
- [ ] Đề không tạo bằng Tạo đề (nhập tay) mở **Xuất từng mã…**: báo rõ không dùng được, không báo lỗi lạ.
- [ ] Thư mục đích còn ít dung lượng: báo rõ không đủ chỗ trước khi dịch.
## PR 4A — Mẫu ma trận lưu bền (chờ nghiệm thu máy thật)
Nút **Mẫu ma trận…** ở màn Tạo đề: lưu ma trận hiện tại thành mẫu có tên, áp dụng (thay hoặc thêm), đổi tên, nhân bản, xóa có xác nhận. Mẫu lưu ở tệp phụ SQLite khoá `exam-templates` (cùng cơ chế `id-review`; không đổi schema ngân hàng, UID, ID6, LaTeX hay trạng thái xác minh). Một mẫu chỉ có: dòng ma trận (kèm tên và chuỗi tổ tiên lúc lưu), chính sách, điểm, số mã, lựa chọn trộn, phiên bản định dạng, dấu vân cây. **Không** có câu khóa, ngoại lệ, UID, thông tin trường/kỳ thi.

### Đã kiểm tự động (không thay cho nghiệm thu)
- TS `examtemplates.test` (64 phép thử): tạo/đổi tên/nhân bản/xóa và bền qua đóng/mở; tên rỗng/dài/trùng; **ghi lỗi không tạo thành công giả** (danh sách và đĩa y nguyên, kể cả khi chưa có nơi lưu); tệp hỏng/thiếu trường/bản ghi hỏng; bản ghi định dạng mới hơn được giữ nguyên từng byte; tệp có `v` mới hơn hoặc JSON hỏng thì **không ghi đè**; ID trùng; cây đổi (xóa Dạng, xóa lớp, đổi vị trí bài, đổi tên); áp dụng thay/thêm, mã dòng trùng, mẫu rỗng, phạm vi trùng lặp; sao lưu JSON qua `exportBackup/importBackup` thật (máy mới, bản cũ rồi mới, bản mới rồi cũ, file cũ không có `examTemplates`, bản ghi hỏng); khóa ghi khi khôi phục; 500 mẫu × 200 dòng.
- Rust `dbbackup`: mẫu nằm trong bản chụp `.db`, điểm khôi phục, bản trước cập nhật đúng lúc chụp; khôi phục `.db` trả đúng mẫu của thời điểm đó; bản beta.35 (chỉ biết `dup-decisions` và `id-review`) ghi khoá của nó không làm mất khoá mẫu và vẫn mở được ngân hàng.
- App thử `vn.hedu.app.thu` (SQLite thật, qua CDP): lưu mẫu bằng giao diện ⇒ có trong SQLite, không lộ UID/câu khóa/thông tin trường; **đóng hẳn app, mở lại** ⇒ mẫu còn; áp dụng + hoàn tác; chụp `.db` ⇒ đổi tên ⇒ khôi phục `.db` ⇒ tên trở về lúc chụp; sao lưu JSON ở Cài đặt có `examTemplates`; xóa mẫu ⇒ khôi phục từ file JSON bằng ô chọn tệp thật ⇒ mẫu trở lại.
- Giao diện 1366×768 (DPI 100%, 125%, 150%) và 1920×1080: hộp thoại vừa khung, không tràn ngang, nút Đóng luôn thấy, dòng không hợp lệ hiện cờ.

### Việc thầy/cô thử trên máy thật
- [ ] Tạo đề → dựng ma trận → **Mẫu ma trận…** → lưu “Giữa kỳ”; đóng app, mở lại: mẫu còn. Tạo mẫu trùng tên bị từ chối.
- [ ] Ma trận khác → **Áp dụng… → Thay**: hỏi xác nhận nếu đang có dòng/câu khóa; có nút **Hoàn tác áp dụng mẫu**. **Thêm**: giữ nguyên dòng, câu khóa, chính sách đang có.
- [ ] Đổi tên, nhân bản (tên “… (bản sao)”), xóa (có hỏi xác nhận).
- [ ] **Dòng không hợp lệ không được dùng để ra đề.** Áp một mẫu có dòng trỏ tới Dạng đã bị xóa khỏi cây (hoặc bài đã chuyển sang chương khác): dòng hiện cờ “không còn trong cây” hoặc “đã đổi vị trí”, **không lấy câu nào**, nút **Lưu vào Thư viện đề** và **Xuất** bị khóa, đầu trang có thông báo “chưa được xử lý”. “Đã đổi vị trí”: bấm **Xem và xác nhận…** (hiện phạm vi lúc lưu mẫu và hiện nay) rồi mới dùng được. “Không còn trong cây”: bấm **Chọn lại phạm vi…** chọn mục có thật, hoặc xóa dòng. Đóng app mở lại: cờ vẫn còn cho tới khi xử lý.
- [ ] Vào **Chương trình**, xóa một Dạng mà mẫu dùng; mở mẫu: báo “n dòng không còn hợp lệ”; áp dụng ⇒ dòng đó vẫn hiện tên cũ kèm “không còn trong cây”, không bị đổi sang Dạng khác. Đề không xuất được khi dòng đó thiếu câu.
- [ ] **Cài đặt → Dữ liệu & sao lưu**: tạo bản chụp .db, đổi tên mẫu, khôi phục bản chụp: tên mẫu trở về. Tạo file sao lưu JSON, xóa mẫu, khôi phục từ file JSON: mẫu trở lại.
- [ ] Quay về bản beta.35 trên dữ liệu có mẫu (nếu cần thử): ngân hàng vẫn mở bình thường.

### Giới hạn
- “Xuất ra JSON” (trao đổi sang cấu trúc cũ) không chứa mẫu: đó không phải sao lưu đầy đủ. Dùng bản chụp `.db` hoặc file sao lưu JSON.
- Mỗi lần đổi mẫu ghi lại cả tệp mẫu (kho rất lớn như 500 mẫu × 200 dòng ≈ 29 MB mất khoảng 0,2 giây trên máy kiểm thử; số đo này không phải bảo đảm hiệu năng). Giới hạn: 500 mẫu, 200 dòng mỗi mẫu.

## PR 4B — Tránh câu đã dùng (chưa phát hành)
Ô **“Tránh câu đã dùng trong…”** ở màn Tạo đề, mặc định **tắt**. Chỉ đọc: quét `hedu-de.json` và `.hedu/sources.json` của các đề đang có trong Thư viện (không kho riêng; không ghi gì vào ngân hàng/UID/ID6/LaTeX). Đề trong Thùng rác không tính, khôi phục thì tính lại. Đề không có UID đáng tin (vd nhập tay `.tex`) được báo “chưa thể đối chiếu đầy đủ”, không coi là chưa dùng. Phạm vi: thư mục ảo (gồm thư mục con), năm học, loại đề, đề chọn riêng (cùng nhóm “hoặc”, khác nhóm “và”, đề chọn riêng cộng thêm). Bộ lọc chạy **trước** khi phân bổ; thiếu câu thì báo số câu thiếu và số ứng viên bị loại, kèm nút **Cho phép dùng lại** do giáo viên bấm (ghi `tranhCauDaDung` vào `hedu-de.json`). Câu giáo viên đã khóa tay vẫn giữ. Chưa làm: nhãn “đã sửa sau khi dùng” (D5: chưa đủ căn cứ nên không hiển thị); bộ nhớ đệm quét theo `updatedAt` (quét 300 đề giả lập vài giây, số đo kiểm thử, không phải bảo đảm hiệu năng).
- [ ] Bật ô, chọn một thư mục/năm học: số đề và câu đối chiếu đúng; đưa một đề vào Thùng rác rồi mở lại màn Tạo đề: câu của đề đó không còn bị loại; khôi phục: bị loại lại.
- [ ] Ma trận lớn hơn số câu chưa dùng: báo thiếu + số ứng viên bị loại; không xuất được cho tới khi bấm “Cho phép dùng lại” (có hỏi xác nhận).
