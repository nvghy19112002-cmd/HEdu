# Đo chất lượng AI Gán ID (không tự chạy)

Mục tiêu đo kiểm: **≥ 95% đúng Dạng trong nhóm "đủ tin cậy"**, luôn báo kèm **độ bao phủ**. Chưa có nhãn chuẩn của giáo viên thì KHÔNG được nói "đã đạt".

## Bộ nhãn (do giáo viên xác minh, KHÔNG đưa lên kho công khai)
- Tệp riêng trên máy: mỗi câu một dòng `{ "id", "latex", "grade", "truth": "<form_id>" | null }`; `truth = null` = trong cây không có Dạng phù hợp (AI nên từ chối).
- Nên có: câu lý thuyết thuần (có Dạng phù hợp và không có), câu dễ nhầm (có chữ "công thức/mệnh đề" nhưng phải tính toán), câu vận dụng, câu có hình. Tối thiểu 100 câu mới kết luận (`MIN_SAMPLE`).

## So sánh công bằng
Prompt cũ (v1) và mới (v2) dùng CÙNG: model, mức suy nghĩ, cây chương trình, câu mẫu ngân hàng, cách chia lô (10 câu/lượt). Model Flash-Lite (`gemini-3.5-flash-lite`) chỉ đo khi tài khoản có model này; không đổi mặc định trước khi có số đo.

## Chỉ số (`src/lib/ai/benchmark.ts`, `scoreRun`)
precision nhóm đủ tin cậy · bao phủ · độ đúng toàn tập · tỉ lệ gán bừa câu không có Dạng · tỉ lệ từ chối đúng · tỉ lệ từ chối nhầm câu có Dạng · tỉ lệ lỗi JSON · thời gian/câu.

## Quy tắc an toàn
- Mỗi lượt gửi câu thật lên Google phải được chủ dự án xác nhận từng lượt (hộp xin phép trong app). Không chạy tự động.
- Không commit bộ nhãn hay kết quả có nội dung câu thật.
