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
12. **Mức độ không tự đổi**; chỉ đổi khi giáo viên tick riêng. Mức độ AI trả về chỉ là gợi ý. Cách xác định mức: `claude/quy-tac-muc-do.md` (4 mức, đã duyệt 30/10/2026).
13. Tối đa **200 câu mỗi lượt** (`AUTO_ID_MAX`); có Hoàn tác trong phiên (`undoAutoId`).
14. Nhập .tex: ID có sẵn trong tệp chỉ được dùng khi qua `resolveCode`; mã sai/thiếu/trùng không được tự sửa lặng lẽ.
14a. **Gán ID nhờ Claude — áp dụng luôn** (chủ dự án chọn 31/10/2026, ngoại lệ có chủ đích của mục 9 và 12): nhập tệp đề xuất là ghi luôn Dạng + mức độ + ID6 Claude chọn cho câu CHƯA được giáo viên xác minh Dạng (kể cả câu "Chưa có ID"), một lần bấm, trạng thái "Máy phân loại" / mức "Máy đề xuất" (nguồn AI ngoài) — không bao giờ thành "giáo viên xác minh" (15b). Câu giáo viên đã xác minh giữ nguyên (lô thường: chỉ để đo; lô Kiểm tra lại: khác Dạng ⇒ "Cần xem lại"). Không ghi được ID ⇒ vào hàng đợi như cũ. Điểm khôi phục trước lô ≥ 20 câu, câu và trạng thái ghi cả hai hoặc không gì, Hoàn tác trong phiên (`claudeapply.ts`). Chủ dự án sẽ rà lại sau.

## D. Thứ tự bằng chứng và AI

15. Bằng chứng, từ mạnh đến yếu: (1) giáo viên chọn tay hoặc xác nhận; (2) đối chiếu ngân hàng (câu giống/gần giống mà **Dạng đã được giáo viên xác minh**, xem 15c); (3) AI Gemini; (4) ID6 hợp lệ có sẵn trong LaTeX **khi chưa được kiểm chứng**. **AI không bao giờ ghi đè (1)**; ngân hàng làm bằng chứng cho AI, không bị AI ghi đè khi AI "không chắc".
15a. **ID có sẵn trong LaTeX là bằng chứng CẦN KIỂM CHỨNG, không phải sự thật** (duyệt 27/10/2026, `claude/thiet-ke-dot1-cung-co-ngan-hang.md`). Mã đúng cú pháp và còn trong cây chưa chứng minh đúng Dạng. Khi nhập, ID được đối chiếu với bằng chứng độc lập (gợi ý loại trừ chính câu, tính trên các câu **có Dạng do giáo viên xác minh**, xem 15c): **Khớp** thì vào; **Chưa kiểm chứng** thì vào nhưng mang trạng thái chưa xác minh; **Bất đồng** (bằng chứng tin cậy cao chỉ Dạng khác) thì KHÔNG chặn cả lô: giữ nguyên LaTeX và ID gốc, đánh dấu "cần xem lại" và đưa vào hàng đợi xác minh (giáo viên vẫn chọn ngay được: giữ ID / theo gợi ý / chưa phân loại). Đổi Dạng/vị trí giữ mức độ gốc; đổi mức độ phải là lựa chọn riêng. Quyết định gắn với kết quả đã xem (gợi ý, cây, nội dung); đổi một trong các thứ đó thì quyết định cũ mất hiệu lực. Kiểm lại ngay trước khi ghi.
15b. **Ba trục độc lập** (đã chốt 28/10/2026): *Nội dung* (chưa kiểm tra / cần sửa / đã duyệt), *Dạng* (chưa xác minh / máy phân loại / giáo viên xác minh / cần xem lại), *Mức độ* (chưa xác minh / máy đề xuất / giáo viên xác minh). Không tự chuyển từ duyệt nội dung sang xác minh Dạng hoặc mức độ; "máy phân loại" KHÔNG BAO GIỜ tự thành "giáo viên xác minh": chỉ hành động xác nhận của giáo viên tạo trạng thái đó. Trạng thái (tệp phụ `id-review`) hết hiệu lực khi nội dung (không tính vùng `%[ID]`) hoặc Dạng/mức độ của câu đổi; riêng "máy phân loại" còn hết hiệu lực khi cây đổi; "giáo viên xác minh" mà Dạng không còn đúng đường dẫn trong cây thì thành "cần xem lại". Thiếu bản ghi luôn hiểu là "chưa xác minh". Mỗi thay đổi lưu lịch sử.
15c. **Căn cứ kiểm chứng ID** chỉ gồm câu có Dạng "giáo viên xác minh" còn hiệu lực (trừ "cần xem lại" và "chưa phân loại"). Nội dung "Đã duyệt", gợi ý máy/AI, và Dạng "máy phân loại" KHÔNG phải căn cứ.
15d. **Chưa phân loại**: câu vào vị trí chung KHÔNG được HEdu ghi ID6 giả vào LaTeX; giữ nguyên LaTeX, có cờ ở tệp phụ, không làm căn cứ cho câu khác; không tự lấy Dạng đầu tiên để tạo ID.
15e. **Sao lưu**: bản chụp `.db`, điểm khôi phục và bản trước cập nhật mang nguyên trạng thái xác minh (sao lưu ĐẦY ĐỦ). File sao lưu JSON thủ công mang theo `idReview` (khôi phục thay ngân hàng, GỘP trạng thái: bản mới hơn thắng, cùng uid xác định theo `at` rồi lịch sử rồi trạng thái an toàn hơn; bản ghi của uid không tồn tại bị bỏ). JSON trao đổi cấu trúc cũ gồm `hedu.json` + `id-review.json` (tuỳ chọn); đó KHÔNG phải sao lưu đầy đủ. Thay cả tệp dữ liệu thì ghi nốt rồi khoá ghi để trạng thái cũ trong bộ nhớ không đè bản vừa khôi phục. Ghi trạng thái lỗi ⇒ không hiện xác minh giả (trả lại trạng thái cũ).
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
