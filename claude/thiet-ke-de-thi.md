# E0 — Thiết kế Ngân hàng đề thi LaTeX (loại L)

Trạng thái: chủ dự án đã duyệt phương án A và D1–D6 kèm 9 điều kiện (mục 2). Nguồn yêu cầu sản phẩm: bản đặc tả E0–E6 (26/10/2026) và 5 quyết định nghiệp vụ trong đó. Mốc đối chiếu: `main` 037aee1, beta.33.
Bất biến: không đổi schema 3, ID6, UID, LaTeX/TikZ gốc; không chạm `hedu.db` hay ngân hàng thật; không tự phát hành.

## 1. Kiến trúc (phương án A)
- Thư viện: `<app_data_dir>/exam-library/projects/<uuid>/`. App thử `vn.hedu.app.thu` có thư viện riêng. Nguồn sự thật là các tệp trong thư mục dự án; chỉ mục `exam-library/index.json` dựng lại được (xoá đi không mất gì).
- Mỗi dự án có `.hedu/manifest.json` (không chứa nội dung đề), `.hedu/sources.json` (UID nguồn, E5), `.hedu/versions/` (điểm kiểm).
- Cạnh `projects/`: `backups/` (sao lưu thư viện), `trash/` (thùng rác dự án, tách khỏi Thùng rác câu hỏi). Bộ đệm biên dịch và PDF nằm ở `<app_data_dir>/cache/exam-build/`, ngoài thư mục nguồn.
- Manifest (v1): `manifestVersion, projectId, name, kind(single|multi), mainFile (có thể null = chưa chọn), createdAt, updatedAt, metadata{grade,schoolYear,examType,tags}, status(draft|needs_review|finalized), compile{engine,timeoutSecs,runs}, source{mode:"copied",originalPathDisplay,fingerprint}, files[{rel,bytes,sha256}]`. Đường dẫn trong manifest luôn là đường dẫn tương đối dùng `/`.
- Nhập = sao chép nhị phân từng byte (giữ BOM, CRLF), ghi SHA-256; tệp/thư mục gốc không bị đụng. Trùng tên → dự án mới (UUID khác), không ghi đè.

## 2. Chín điều kiện kỹ thuật và cách đáp ứng
1. **An toàn PDF đề.** Không coi nguồn nguyên trạng là "Đề". Mỗi PDF sinh ra có nhãn chế độ do HEdu xác định: `de` hoặc `loigiai`. Chế độ chỉ được gán khi nhận diện CHẮC: tìm đúng một dòng `\usepackage[...]{ex_test}` (có thể nằm ở tệp phụ); chế độ `de` = bản dẫn xuất (chỉ trong thư mục build) có `dethi` và không có `loigiai`; `loigiai` = có `loigiai`, không có `dethi`. Không nhận diện chắc (không thấy dòng, thấy nhiều dòng mâu thuẫn, macro tự định nghĩa) → KHÔNG xuất PDF mang tên "Đề"; chỉ cho "Biên dịch nguyên văn" với nhãn "Chưa xác định chế độ — có thể chứa lời giải". Tệp nguồn không bao giờ bị sửa.
2. **Biên dịch thành công** = tiến trình thoát mã 0 + không có lỗi nghiêm trọng trong log (`!`, `Fatal error`, `Emergency stop`, thiếu tệp nhập) + có PDF mới hơn lần chạy. Có PDF nhưng lỗi → "PDF không hợp lệ để phát hành", không xuất bản. Luôn giữ PDF tốt gần nhất (nhãn "Bản cũ").
3. **Bản chụp nhất quán.** Sao lưu = khóa dự án, ghi nhận (kích thước + mtime + hash) từng tệp, chép sang thư mục tạm, kiểm lại sau khi chép; có tệp đổi trong lúc chép → huỷ và báo, không báo thành công. Gồm `.tex`, ảnh, `.sty`, manifest, sources.json. Khôi phục luôn ra dự án MỚI rồi đối chiếu hash từng tệp.
4. **Phụ thuộc LaTeX.** Khoá bộ đệm = băm của MỌI tệp trong dự án thuộc phạm vi build (không chỉ main.tex) + engine + số lượt + chế độ + phiên bản gói đi kèm (`support::rev()`) + phiên bản TeX Live. Tệp có đuôi lạ/không hỗ trợ trong dự án → cảnh báo hiển thị, không bỏ qua lặng lẽ.
5. **Windows và bảo mật.** Nhập từ chối symlink/junction/reparse point, tên dành riêng (CON, NUL, COM1…), ký tự cấm, thoát thư mục gốc (`..`, đường dẫn tuyệt đối), đường dẫn quá dài, tệp quá giới hạn. Biên dịch (E2): không qua shell, `-no-shell-escape`, không tự cài gói; huỷ cả cây tiến trình bằng Job Object (`KILL_ON_JOB_CLOSE`), có test huỷ cây tiến trình thật; `taskkill` chỉ là phương án dự phòng được ghi rõ là kém an toàn hơn.
6. **Trình soạn.** CodeMirror 6 (E3) phải giữ đúng mã hoá/BOM/CRLF khi không sửa (so hash sau Lưu), có trạng thái chưa lưu, cảnh báo xung đột khi tệp đổi ngoài app (so mtime+size+hash trước khi ghi). pdf.js đóng gói offline, worker cùng nguồn; kiểm tra CSP trên bản thử (E2b).
7. **Không tự động hoá khi chưa an toàn.** Thêm câu vào đề = chép NGUYÊN VĂN `latex` của câu, không qua parser dựng lại. Trộn mã đề chỉ chạy khi kiểm cấu trúc đạt; không chắc → giữ nguyên và báo giáo viên.
8. **Sao lưu độc lập.** `hedu.db` không phải sao lưu của thư viện đề. Có chức năng sao lưu/khôi phục thư viện đề riêng (E4); bản mới lỗi thì không xoá bản tốt.
9. **Hiệu năng.** Không nạp cả thư viện vào RAM: danh sách đọc từ chỉ mục (chỉ trường tóm tắt), nội dung tệp nạp khi mở tab. Có test dữ liệu giả: tệp lớn, nhiều dự án, nhiều tab, TikZ nặng (E2/E3/E6).

## 3. Biên dịch (E2)
Thư mục build riêng cho mỗi dự án, chỉ chép tệp đã đổi. `Command` với đối số cố định (`-interaction=nonstopmode -file-line-error -no-shell-escape`), cwd = thư mục build, tối đa 2 lượt. Xuất bản PDF bằng ghi tạm rồi đổi tên. Log đọc `tệp:dòng:` để nhảy dòng; không chắc thì hiện log thô. Gói trùng tên gói đi kèm: tệp của dự án được ưu tiên và có thông báo.

## 4. Kế hoạch PR
| PR | Nội dung | Test chính |
|---|---|---|
| E1 | Mô hình dự án, nhập tệp đơn/thư mục (an toàn đường dẫn, hash), tạo mới, đọc danh sách, màn Thư viện đề thi cơ bản | Rust: hash trước/sau, nguồn không đổi, từ chối đường dẫn nguy hiểm, trùng tên, chỉ mục dựng lại; TS: phát hiện tệp chính, lọc |
| E2a | Biên dịch toàn tài liệu, Job Object, nhật ký, xuất bản PDF | huỷ cây tiến trình thật, quá giờ, PDF lỗi không xuất bản |
| E2b | Trình xem PDF (pdf.js) | CSP trên bản thử |
| E3 | Trình soạn nhiều tab, lưu atomic, xung đột | giữ byte khi không sửa |
| E4 | Thư viện hoàn chỉnh, thùng rác, sao lưu/khôi phục riêng; **đóng nốt TOCTOU còn lại** (xem dưới) | khôi phục + so hash; test hoán đổi thư mục cha thành junction đúng lúc mở tệp |
| E5 | Tích hợp Tạo đề, câu nguyên văn + UID, hai chế độ đề/lời giải | nhận diện chế độ, không lộ lời giải |
| E6 | Kiểm thử Windows tổng thể, hiệu năng, tài liệu | checklist nghiệm thu |
Mỗi PR: test, build, CI Windows xanh, chạy thử bằng `vn.hedu.app.thu`, chủ dự án duyệt riêng. Phát hành chỉ sau E6 và lệnh riêng.

## 5. Rủi ro còn lại ghi nhận cho E4 (từ review PR #113)
E1 đã chặn đi theo liên kết/junction bằng `open_inside` (kiểm từng thành phần, mở không-đi-theo, kiểm tay cầm, so đường dẫn thật với thư mục gốc) và mở lại mỗi tệp lúc chép. Còn một khoảng cực hẹp: giữa lần kiểm đường dẫn cuối và lúc mở tệp, thư mục cha vẫn có thể bị hoán thành junction. Cách chặn trọn vẹn là mở theo tay cầm thư mục gốc của Windows (NtCreateFile/`openat` tương đối, không đi theo điểm phân tích) và kiểm đường dẫn cuối của tay cầm đã mở (GetFinalPathNameByHandle). Làm ở E4 (sao lưu/khôi phục cần đúng cơ chế này), kèm test hoán đổi thư mục cha đúng lúc mở.

## 6. Trạng thái triển khai (26/10/2026) và điểm khác thiết kế ban đầu
Đã làm đủ E1–E5 theo từng PR (xem `claude/nghiem-thu-de-thi.md`); E6 = kiểm thử hiệu năng + tài liệu nghiệm thu. Chưa phát hành, chưa nghiệm thu máy Windows thật.
- **Lưu trữ**: phương án A đúng như duyệt. Thêm trường `folder` (thư mục ảo, tương thích ngược: vắng = chưa xếp) trong manifest; không đổi `manifestVersion`.
- **Biên dịch (E2a)**: thư mục build `cache/exam-build/<id>/work` giữ giữa các lần dịch (chép tệp đổi, xoá tệp đã xoá khỏi nguồn). Thành công = mã thoát 0 + không có lỗi nghiêm trọng + có PDF; có PDF mà lỗi thì bỏ, giữ bản tốt cũ. Dừng cả cây tiến trình bằng Job Object (không dùng taskkill); kiểm bằng tiến trình cháu thật.
- **Xem PDF (E2b)**: pdf.js 4.10.38 bản legacy đã nén, chép vào `dist/` lúc build, nạp bằng `import()`; `isEvalSupported:false`, `useWorkerFetch:false`, `disableFontFace:true` để hợp CSP hiện có (không nới CSP). PDF chuyển qua IPC nhị phân.
- **Soạn (E3)**: CodeMirror 6 (một khung nhìn, mỗi tệp một trạng thái riêng kể cả hoàn tác). Mã hoá byte nằm ở Rust: nhớ BOM/CRLF; tệp UTF-16/không UTF-8/trộn xuống dòng chỉ xem. Lưu = so dấu vân → chụp bản cũ (`.hedu/versions`, tối đa 10) → ghi tạm → đổi tên → cập nhật sổ.
- **Thư viện (E4)**: sao lưu giữ 5 bản, tên theo thời gian (đến mili-giây), chỉ dọn bản cũ sau khi bản mới thành công; khôi phục luôn ra dự án mới và đối chiếu hash. Chốt đề cần PDF còn khớp (`files_hash`).
- **TOCTOU**: `open_inside` kiểm bằng tay cầm đã mở (`GetFinalPathNameByHandleW`); tệp tạm/tệp mới kiểm tay cầm trước khi ghi. Khe còn lại: bước đổi tên tệp tạm → tệp đích vẫn theo đường dẫn (xem tài liệu nghiệm thu).
- **Hai chế độ (E5)**: KHÁC phương án ban đầu "thêm `\PassOptionsToPackage`": vì `loigiai` và `dethi` loại trừ nhau, HEdu sửa đúng MỘT lệnh `\usepackage[...]{ex_test}` trong BẢN DẪN XUẤT ở thư mục build và hiện dòng đã đổi. Chỉ làm khi nhận diện chắc (đúng một lệnh đang hoạt động); nếu không thì chỉ có "nguyên văn". Bản Lời giải còn tắt `\anloigiai` đang bật. Đã chứng minh với `ex_test` thật.
- **Nguồn UID**: sổ `.hedu/sources.json` lưu cả bản LaTeX đã chép (để nhận ra "có thể đã thay đổi" mà không cần đoán). Ghi nguồn khi LƯU, chỉ cho đoạn còn nguyên văn trong tệp.
- **Chưa làm** (đưa vào backlog): đổi tên/xoá/di chuyển từng tệp trong cây tệp; BibTeX/Biber; tô sáng chữ tìm trong PDF; bật lại màn Tạo đề (cần kiểm cấu trúc trước khi trộn mã).
