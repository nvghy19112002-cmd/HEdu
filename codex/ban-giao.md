# Bàn giao Codex

- Việc: củng cố màn Thư viện đề thi, không đụng phần Xử lí TeX của Claude.
- Nhánh: `codex/exam-library`, commit `c2f52e5`.
- Tệp sửa: `src/screens/ExamLibrary.tsx`.
- Đã làm: bỏ kết quả đọc chi tiết cũ khi chuyển nhanh giữa các đề; không cho tạo đề trống khi tên chỉ có khoảng trắng.
- Đã kiểm: `npm test`, `npm run typecheck`, `npm run build`, `git diff --check` đều đạt. Không có dữ liệu thật trong `data/test`, nên phần đó được bỏ qua.
- Xung đột: không sửa tệp nào trong PR #182 hoặc #183 của Claude; đặc biệt không đụng `src/styles.css`.
- Bước tiếp: mở PR không phải bản nháp vào `main`; chờ PR #182 được gộp trước, sau đó cập nhật nhánh và chạy lại kiểm tra.
