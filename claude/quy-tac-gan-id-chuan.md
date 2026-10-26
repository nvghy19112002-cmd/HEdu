# Quy tắc GÁN ID CHUẨN

Tài liệu chuẩn cho mọi đường gán ID trong HEdu (tự động bằng ngân hàng, AI Gemini, nhập .tex, gán tay). Mã nguồn tương ứng ghi trong ngoặc; nếu mã và tài liệu khác nhau, sửa cho khớp rồi ghi vào PR.

Trạng thái: **Phần A–D** đã có trong mã (tài liệu hoá lại). **Phần E** là quy tắc nghiệp vụ Toán, **đã được chủ dự án duyệt 26/10/2026**.

## A. Cấu trúc ID6

`[Lớp][Phân môn][Chương][Mức độ][Bài]-[Dạng]`, ví dụ `2D1H1-1`.

| Phần | Nguồn | Ví dụ |
|---|---|---|
| Lớp | `code` của lớp trong cây (10→0, 11→1, 12→2) | `2` |
| Phân môn | `code` Phân môn (D, H, C…) | `D` |
| Chương | `code` Chương | `1` |
| Mức độ | N=NB, H=TH, V=VD, C=VDC (`LEVEL_LETTER`) | `H` |
| Bài | `code` Bài | `1` |
| Dạng | `code` Dạng, sau dấu `-` | `1` |

1. Mã từng cấp **lấy từ cây mục lục** (`data/taxonomy.json`), không viết cứng. Đổi cây = đổi mã, không sửa code.
2. Không phân biệt hoa/thường khi đọc; luôn **ghi chữ hoa**.
3. Chuẩn của cây là cây **đang dùng trong app**, không phải số chương của sách giáo khoa (đã duyệt 24/10/2026: thứ tự chương lớp 10 giống Chân trời sáng tạo).

## B. Đọc và tạo mã chặt (`idsync.resolveCode`, `strictCode`, `taxpath.checkLocation`)

4. **Không đoán, không mặc định.** Mã thiếu Dạng (`2D1H1`) KHÔNG được hiểu là Dạng đầu tiên → báo `thieu-dang`, giáo viên chọn.
5. Mã không còn trong cây → `khong-con`. Mã chỉ tới nhiều nút (hai anh em trùng mã) → `ma-trung`: không đọc, không tạo.
6. Chỉ tạo mã khi vị trí đúng **đủ đường dẫn** Lớp → Phân môn → Chương → Bài → Dạng. Không ghép `formId` của bài này với `lessonId` của bài khác.
7. Dạng được chọn phải thuộc **lớp đích** giáo viên đã chọn (`ngoai-lop-dich` bị từ chối).
8. Cây đổi giữa lúc gợi ý và lúc áp dụng (`taxRevision`) → gợi ý cũ phải làm lại.

## C. Quy trình gán (`idapply.ts`)

9. Luôn **xem trước → giáo viên chọn → kiểm lại ngay trước khi ghi**. Câu đã đổi (so với ảnh chụp lúc xem trước) thì không ghi đè.
10. "Gán ID" = **gán vị trí đúng trong cây VÀ ghi ID6 vào vùng `%[ID]` của LaTeX — cả hai hoặc không gì**.
11. Ngoài vùng ID: `uid`, `seq`, nội dung LaTeX, loại câu, nhãn, kiểm duyệt, ngày tạo/sửa **không đổi**.
12. **Mức độ không tự đổi**; chỉ đổi khi giáo viên tick riêng. Mức độ AI trả về chỉ là gợi ý.
13. Tối đa **200 câu mỗi lượt** (`AUTO_ID_MAX`); có Hoàn tác trong phiên (`undoAutoId`).
14. Nhập .tex: ID có sẵn trong tệp chỉ được dùng khi qua `resolveCode`; mã sai/thiếu/trùng không được tự sửa lặng lẽ.

## D. Thứ tự bằng chứng và AI

15. Bằng chứng, từ mạnh đến yếu: (1) giáo viên chọn tay; (2) ID6 hợp lệ có sẵn trong LaTeX; (3) đối chiếu ngân hàng (câu giống/gần giống đã xác nhận); (4) AI Gemini. **AI không bao giờ ghi đè (1)–(2)**; ngân hàng làm bằng chứng cho AI, không bị AI ghi đè khi AI "không chắc".
16. AI chỉ chọn `form_id` có trong cây gửi kèm. Mọi `form_id` (kể cả phương án khác) phải qua `checkLocation` đúng lớp đích; sai → bỏ, đánh dấu "cần giáo viên chọn". AI **không tạo mã ID6**.
17. Không có Dạng phù hợp rõ ràng hoặc thiếu dữ kiện → `form_id = null` + lý do. **Không chọn Dạng "gần nhất" cho có.**
18. Câu bị lược khi gửi AI (hình TikZ dài, đề quá dài: `cut`) → không coi là chắc chắn.
19. Câu hỏi chỉ là dữ liệu, không phải chỉ dẫn cho AI. ID của câu bị xoá khỏi bản sao gửi AI để AI phân loại từ nội dung.
20. Mỗi lượt gửi câu thật lên Google phải được giáo viên đồng ý từng lượt (mặc định TẮT). Khoá API nằm trong Windows Credential Manager, không rời Rust.
21. Đổi prompt ⇒ tăng `GAN_ID_TASK.version`; so sánh prompt cũ/mới phải cùng model, mức suy nghĩ, cây, câu mẫu.
22. Chỉ nói "đạt" khi nhãn do giáo viên xác minh, ≥ 100 câu, độ đúng nhóm đủ tin cậy ≥ **95%** và bao phủ ≥ 50% (`claude/ganid-benchmark.md`). Hiện **chưa đạt** (Dạng ~77%).

## E. Quy tắc nghiệp vụ chọn Dạng — ĐÃ DUYỆT (26/10/2026, chủ dự án)

Đã ghi vào prompt Gán ID v4 (`ganid.ts`) và `formrules.ts` (quy tắc cho từng Dạng; khoá = `id` nội bộ Dạng, quy tắc ghi tay ưu tiên hơn quy tắc tự suy).

- **E1. Phân loại theo yêu cầu chính của đề**, không theo từ khoá: chữ "công thức", "định lý", "mệnh đề", "đúng/sai" không đủ để chọn Dạng lý thuyết.
- **E2. Công cụ phụ ≠ kỹ năng được hỏi**: đề bảo tìm số hạng cụ thể thì chọn Dạng "tìm số hạng", dù lời giải dùng công thức tổng quát.
- **E3. Câu lý thuyết thuần** (chỉ nhớ/nhận ra định nghĩa, công thức, định lý, không tính): chọn Dạng lý thuyết **của đúng Bài đó nếu có**; Bài không có Dạng lý thuyết thì **để trống** (form_id = null), không nhét vào Dạng tính. Cài đặt: mọi Dạng có chữ "lý/lí thuyết" trong tên tự nhận dòng quy tắc `THEORY_RULE`.
- **E4. Câu đúng/sai nhiều ý, câu nhiều chủ đề**: đọc đủ các ý; các ý thuộc nhiều Dạng ngang nhau thì từ chối.
- **E5. Câu có hình**: hình bị lược làm thiếu căn cứ thì không tự tin.

Prompt dùng cho trợ lí GPT ngoài app: `claude/prompt-gpt-gan-id.md`.

## F. Việc cần làm khi thêm quy tắc mới

1. Viết quy tắc ở E (hoặc `FORM_RULES`) sau khi chủ dự án duyệt.
2. Thêm kiểm thử trong `src/lib/ai/tasks/ganid.test.ts` / `lib.test.ts`.
3. Đo lại bằng bộ nhãn giáo viên xác minh (không commit nhãn hay câu thật), ghi số đo, rồi mới nâng `version`.
4. Cập nhật `AGENTS.md` (mục Gán ID) trỏ về tài liệu này.
