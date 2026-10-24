## Có gì mới trong beta.31 (đã phát hành 24/10/2026, kênh beta; commit 5303e3f): sửa lỗi rà soát SQLite
Chỉ gồm PR #101 (so với beta.30). Không đổi schema (3), ID6, UID, LaTeX gốc, Rust.
- **Cập nhật / khôi phục sau cập nhật** không chạy khi còn thay đổi CHƯA ghi xuống đĩa (trước đây chỉ ghi nốt mà không kiểm tra kết quả).
- **Lô lớn** (nhập/xoá/khôi phục hàng chục nghìn câu) đi trong MỘT giao dịch SQLite (đo thật: 60.000 câu ~4 giây); lỗi ⇒ không ghi gì, thử lại ghi đủ.
- Cài đặt → Nguồn dữ liệu / Tổng quan / thông tin chẩn đoán hiện đúng chế độ lưu trữ (SQLite hay JSON cũ) và đường dẫn tệp.
- Kiểm tra kiểu (typecheck) sạch lỗi; thêm @types/node.
- Chưa nghiệm thu máy Windows thật. Giao dịch chung Thùng rác + Ngân hàng (S6), hồ sơ người dùng, nhiều nguồn: tạm hoãn.

## Có gì mới trong beta.30 (đã phát hành 24/10/2026, kênh beta): lưu trữ SQLite + các cải tiến dữ liệu
Không đổi schema logic (3), ID6, UID, LaTeX gốc, cây mục lục, thuật toán dò trùng. Gồm PR #91–#99.
- **SQLite làm nơi lưu chính** (PR #96–#99): lưu nhanh (sửa một câu ~1 ms thay vì ghi lại cả tệp), mất điện/tắt đột ngột không hỏng dữ liệu, nạp theo trang cho ngân hàng lớn. Lần mở đầu có `hedu.json` cũ, HEdu hiện màn **"Nâng cấp lưu trữ"**; chỉ chuyển khi bạn bấm xác nhận, chụp nguyên trạng vào `backups/migration-…`, đối chiếu từng câu, tệp cũ không bị xoá. "Để sau" vẫn dùng cách cũ.
- **Sao lưu/khôi phục SQLite**: điểm khôi phục tự động (tối đa 5) trước nhập/xoá hàng loạt từ 20 câu, xoá hẳn khỏi Thùng rác, khôi phục từ file; bản chụp .db; khôi phục từ bản chụp/điểm; **Xuất ra JSON** để quay về bản cũ; Kiểm tra toàn vẹn (Cài đặt → Dữ liệu & sao lưu → Lưu trữ SQLite). Sao lưu trước cập nhật vẫn đúng một bản.
- Khôi phục câu "Vị trí không còn" vào vị trí mới do giáo viên chọn (xem trước ID cũ/mới, câu về "Cần sửa") — PR #92.
- Nhập .tex có sẵn ID: phân loại ID, bắt xác nhận khi câu vào vị trí chung hoặc Dạng đầu tiên — PR #94.
- Gán ID bằng Gemini: quy tắc câu lý thuyết thuần, AI "không chắc" không bị ngân hàng ghi đè (PR #91); bộ đo độ chính xác trong Cài đặt → AI Gemini (PR #93, chưa có số đo thật).
- **Lưu ý quay lui:** sau khi nâng cấp, bản HEdu cũ (beta.29 trở về trước) không thấy dữ liệu mới; dùng "Xuất ra JSON". Dữ liệu cũ vẫn còn trong `data` và `backups`.
- **Chưa nghiệm thu trên máy Windows thật.** Chưa thử thật: cập nhật beta lên beta (sao lưu trước cập nhật dạng .db), cắt điện thật. Hồ sơ người dùng/nhiều nguồn dữ liệu: beta.31.

## Có gì mới trong beta.29 (đã phát hành 24/10/2026, kênh beta; gồm PR #83–#89): Thùng rác độc lập, Cài đặt mới, Gemini nhiều khoá
Không đổi schema (3), ID6, UID, LaTeX gốc, cây mục lục, thuật toán dò trùng. Chờ chủ dự án nghiệm thu trên máy Windows thật.
- **An toàn dữ liệu Thùng rác (PR #83)**: khôi phục ghi Ngân hàng trước rồi mới gỡ khỏi Thùng rác; xoá hẳn không đụng Ngân hàng; khoá chống bấm đôi; lỗi ghi ở giữa chừng chỉ hoàn lại đúng phần của thao tác đó. Không thể làm mất câu khi một trong hai tệp ghi lỗi (xấu nhất = câu nằm ở cả hai nơi).
- **Màn Thùng rác riêng (PR #84)** trên thanh bên, có số câu: tìm (chữ/số #/ID/LaTeX), lọc Lớp/Loại/Ngày/Trạng thái, sắp xếp, phân trang, chọn nhiều, nhắc khi gần đầy (1.000 câu, không tự xoá). Gỡ khỏi Cài đặt.
- **Khung xem câu (PR #85)**: Xem nhanh / Xem chuẩn bằng TeX Live (chỉ khi bấm) / LaTeX gốc; Xuất .tex.
- **Xung đột và dọn dẹp (PR #86)**: lý do từng câu chưa khôi phục được, So sánh hai bản, Đến câu trong Ngân hàng, Khôi phục tất cả…, Dọn sạch Thùng rác… (2 bước).
- **Cài đặt 8 mục + tìm cài đặt (PR #87)**: Tổng quan, Nguồn dữ liệu, Giao diện, LaTeX & TikZ, AI Gemini, Dữ liệu & sao lưu, Cập nhật, Giới thiệu & trợ giúp (có sao chép thông tin chẩn đoán, không lộ khoá).
- **Gemini tối đa 5 cấu hình khoá (PR #88)**: mỗi khoá một mục riêng trong kho mật khẩu Windows; khoá cũ của beta.27 giữ nguyên (tự thành "Cấu hình hiện tại"); chọn bằng tay, không tự chuyển khi lỗi/hết lượt; hộp xin phép nêu cấu hình đích.
- **PR-7**: toast xoá một câu có nút "Mở Thùng rác"; hộp xác nhận khôi phục từ file nói rõ "thay ngân hàng" và "gộp tệp phụ"; thông báo hết hạn mức ngày nêu rõ HEdu không tự chuyển tài khoản.
- Lưu ý quay lui: tệp `ai_profiles.json` là tệp mới (bản cũ bỏ qua); khoá cũ không bị đổi nên quay về beta.27 vẫn dùng được khoá cũ. Giới hạn đã biết: chưa chọn được vị trí mới cho câu "Vị trí không còn" (chờ chủ dự án duyệt cách làm); chưa thử Gemini thật với nhiều cấu hình.

## Có gì mới trong beta.28 (đã phát hành 24/10/2026, kênh beta): sửa lỗi AI "trả lời quá lâu"
Không đổi schema (3), ID6, LaTeX gốc, cây mục lục. Gồm PR #81.
- **Sửa lỗi**: ở beta.27, nút "Thử kết nối"/"Hỏi AI" có thể báo "AI trả lời quá lâu". Nguyên nhân: Gemini 3.8 Flash mặc định "suy nghĩ" rất lâu trước khi trả lời (> 120 giây cho câu thử 1 + 1) và dùng hết giới hạn chữ cho phần suy nghĩ. Nay HEdu luôn đặt mức suy nghĩ thấp nhất model cho phép, nới giới hạn chữ và thời gian chờ (300 giây/lượt). Đo thật với câu thử: 3.8 Flash ~27 giây, 3.6 Flash ~1,5 giây.
- Thêm lựa chọn model **Gemini 3.6 Flash (nhanh)** trong Hệ thống → AI; mặc định vẫn là 3.8 Flash cho tới khi có số liệu so sánh độ chính xác.
- Số liệu đo AI trên 100 câu thật của chủ dự án (3.8 Flash, 10 câu/lượt; nhãn chưa được giáo viên xác minh): đúng Dạng — chỉ ngân hàng 65,5%, chỉ AI 76,2%, AI + ngân hàng 79,8%; đúng Chương — 98,8% khi kết hợp. Khi AI và ngân hàng cùng chọn: đúng 88,7%.

## Có gì mới trong beta.27 (đã phát hành 24/10/2026, kênh beta): AI Gemini cho Gán ID tự động
Không đổi schema (3), công thức ID6, LaTeX gốc, cây mục lục, thuật toán dò trùng. CÓ thêm phần Rust (thư viện reqwest, rustls, keyring, tokio — chủ dự án duyệt). Gồm PR #77–#79.
- **Hệ thống → AI (Gemini)**: dán khoá API miễn phí (tạo ở aistudio.google.com) — khoá cất trong kho mật khẩu của Windows, không hiện lại, không nằm trong dữ liệu hay file sao lưu. Chọn model (mặc định Gemini 3.8 Flash; 2.5 Pro cho câu khó nếu gói miễn phí cho phép). Công tắc **"Cho phép gửi nội dung câu hỏi tới Google" mặc định TẮT**. Nút **Thử kết nối** gửi câu "1 + 1" (không có dữ liệu ngân hàng).
- **Nút "Hỏi AI"** trong bảng Gán ID (Ngân hàng) và ô gợi ý ở Nhập liệu: trước mỗi lượt HEdu hỏi lại số câu và đúng nội dung sẽ gửi (đề + lời giải, ≤5 câu mẫu, cây Chương › Bài › Dạng của lớp đó). Mỗi lượt ≤10 câu; có tiến độ, nút Dừng; hết lượt miễn phí trong ngày thì dừng và giữ kết quả đã có.
- **AI dẫn đầu, ngân hàng làm bằng chứng**: AI và ngân hàng cùng chọn ⇒ "Tin cậy cao" (tự tick); ngân hàng chưa chắc mà AI chắc ⇒ theo AI; khác nhau ⇒ hiện cả hai, nhãn thấp, không tự tick. AI chỉ được chọn Dạng có thật trong lớp đó (sai/bịa ⇒ bỏ). Mức độ AI gợi ý vẫn chỉ tham khảo.
- Lớp AI dùng chung cho các tính năng sau này (mỗi tính năng một "nhiệm vụ AI" có prompt + khuôn kết quả riêng); chỉ gọi đúng địa chỉ chính thức của Google.
- Gói miễn phí: Google có thể dùng nội dung gửi lên để cải thiện sản phẩm và người duyệt có thể đọc. HEdu không gửi thông tin cá nhân.
- CHƯA đo độ chính xác của AI trên câu thật (cần chủ dự án duyệt lượt gửi); chưa nghiệm thu trên máy thật.

## Có gì mới trong beta.26 (đã phát hành 24/10/2026, kênh beta): Gán ID tự động (chỉ đối chiếu ngân hàng, không AI)
Không đổi schema (3), công thức ID6, LaTeX gốc, cây mục lục, thuật toán dò trùng. Không gửi dữ liệu ra ngoài. Gồm PR #72–#75 (chủ dự án duyệt phạm vi GĐ1 ngày 24/10/2026).
- **Gán ID tự động ở Ngân hàng**: chọn câu (tối đa 200/lượt) → **Gán ID tự động** → bảng xem trước: ID hiện tại → dự kiến, vị trí gợi ý (★) hoặc 2 phương án khác hoặc giữ nguyên, nhãn tin cậy cao/vừa/thấp/không đủ căn cứ. Chỉ câu **tin cậy cao** được tick sẵn. **Mức độ không bao giờ tự đổi** (ô "Đổi mức độ" phải tick riêng, gợi ý chỉ tham khảo). Kiểm lại ngay trước khi ghi: câu đã sửa/xoá, cây đã đổi, vị trí sai đường dẫn/khác lớp ⇒ không ghi. Chỉ đổi vị trí; nội dung, nhãn, kiểm duyệt, ngày sửa giữ nguyên.
- **Hoàn tác trong phiên**: thanh "Đã gán vị trí mới cho N câu — Hoàn tác"; câu đã bị sửa tiếp/xoá sau lần gán thì giữ nguyên (hỏi trước). Đóng app thì hết hoàn tác.
- **Nhập liệu**: nút tuỳ chọn "Gán ID tự động cho N câu không có ID"; câu có `%[ID]` hợp lệ giữ nguyên; mặc định chỉ dùng gợi ý tin cậy cao/vừa, còn lại dùng vị trí chung.
- **Sửa lỗi**: `%[ID]` ghi mã Dạng không có trong cây trước đây bị lặng lẽ xếp vào Dạng đầu tiên của Bài ⇒ nay báo "không hợp lệ". Ghi lỗi khi thao tác hàng loạt trước đây có thể hoàn lại nhầm cả sửa đổi khác xảy ra cùng lúc ⇒ nay chỉ hoàn lại câu của chính thao tác đó.
- Độ chính xác đo trên bản sao 313 câu thật (nhãn chưa được giáo viên xác nhận; kiểm định chéo theo họ): Dạng đúng ở gợi ý đầu 74–76%, nằm trong 3 gợi ý 90–91%; nhãn "cao" đúng 92–96% (phủ 13–16%), "vừa" 79–84%. Mức độ gợi ý chỉ ~65% nên không tự áp.
- Chưa thử trên Windows thật với ngân hàng thật, chưa thử zoom 125–150%. Gemini (AI) chưa có — chờ duyệt GĐ2.

## Có gì mới trong beta.25 (đã phát hành 23/10/2026, kênh beta): màn Kiểm tra trùng dễ dùng hơn
Không đổi schema (3), ID6, LaTeX gốc, thuật toán dò trùng. Đã được chủ dự án duyệt phương án.
- **Sửa lỗi**: khoá phạm vi quét (`scopeKey`) trước đây luôn là `"[]"` khi không chọn Khối ⇒ đổi Phân môn/Chương/Bài/Dạng/câu đã chọn/kiểu đối chiếu không hiện cảnh báo "danh sách quét đã cũ" (PR #66); đếm "câu đã thêm/sửa/xoá sau lần quét" không còn đếm đôi; các lần ghi quyết định chạy tuần tự.
- **Sau mỗi quyết định tự chuyển sang cặp kế**, có banner **Hoàn tác** 10 giây (khôi phục đúng quyết định cũ hoặc xoá nếu là cặp mới); nút **‹ Cặp trước / Cặp tiếp ›**, "Cặp x/N · còn M chưa xử lý".
- **Trạng thái lưu**: Đang lưu / Đã lưu / Chưa lưu được + nút "Thử lưu lại".
- **Công cụ ▾** gom Xuất quyết định, Nhập quyết định, Nhãn chuẩn. **Nhập quyết định có bước xem trước** (thêm N, cập nhật M, bỏ qua K) rồi mới Áp dụng.
- **Lý do** có thể tự gõ (vẫn có gợi ý chọn sẵn). **Gợi ý giữ câu đã duyệt** khi hai câu giống nguyên mã/chỉ khác trình bày mà đúng một câu đã duyệt (chỉ là chữ gợi ý, không tự xoá).
- Hiện ghi chú khi bộ dò phải giới hạn ứng viên (`candidatesCapped`) — không tuyên bố đã kiểm tra tuyệt đối mọi cặp.
- Chưa thử trên Windows thật, chưa thử zoom 125–150%.

## Có gì mới trong beta.24 (đã phát hành, nằm trong bản v0.1.0-beta.25): thanh chọn nhiều gọn hơn, xuất .tex nguyên văn, "Lưu thành…"
Không đổi schema (3), ID6, cây mục lục, thuật toán kiểm tra trùng. CÓ đổi Rust/cấu hình (đã được chủ dự án duyệt): thêm `tauri-plugin-dialog`, quyền `dialog:allow-save`, lệnh `save_text_file`.
- **Xuất .tex NGUYÊN VĂN**: chép đúng mã LaTeX gốc, chỉ cập nhật dòng `%[ID]`. Trước đây file xuất bị dựng lại (mất ghi chú `%`, chữ trên hình bị dời vào `\immini`, `\newcommand` bị kéo ra ngoài). Ước lượng dung lượng tính theo độ dài thật.
- **Lưu thành…**: hộp xem file xuất ra có nút "Lưu thành…" mở hộp lưu của Windows (đặt tên, chọn thư mục); trước đây chỉ có "Tải về" kiểu trình duyệt. Áp dụng cả cho file sao lưu. Chưa thử trên máy Windows thật.
- **Thanh chọn nhiều còn 5 nút**: Xuất .tex · Kiểm tra trùng · Thao tác khác ▾ (Cần sửa / Về Chưa kiểm tra / Chuyển vào Thùng rác) · Bỏ chọn trang · Bỏ chọn tất cả. ĐÃ BỎ "Đổi mức độ" và "Chỉ xem đã chọn"; "Gắn nhãn" tạm ẩn (mã vẫn còn).
- Đổi bộ lọc hoặc chữ tìm ⇒ tự bỏ chọn câu ngoài kết quả mới (có thông báo). Kiểm tra trùng từ thanh chọn mặc định đối chiếu với toàn ngân hàng. Sau khi chuyển vào Thùng rác có nút **Hoàn tác** 30 giây. Menu đóng khi bấm ra ngoài.
- **Xuất .tex có 2 kiểu** (bấm "Xuất .tex" ở thanh chọn): (1) **Chỉ file câu hỏi**: một file .tex chứa các câu chép NGUYÊN VĂN từ ngân hàng, không khai báo, không sửa dòng `%[ID]`; (2) **Thư mục biên dịch được** (chỉ bản cài Windows): tạo thư mục mới (không ghi đè, trùng tên thì thêm -2) gồm `main.tex`, `khaibaochung.tex` (mẫu từ bộ đề của chủ dự án, phần tên/số điện thoại để trống), `cauhoi.tex`, các gói đi kèm (`ex_test.sty`, `ex_tkz-euclide.sty`, `tkz-tab-vn.sty`, `tkz-linknodes.sty`, `twemojis.sty`, `shared-content.tex`) và `CAN-CO-GI.md` (cách biên dịch + gói cần có + lệnh `tlmgr install`). Mã: `src/lib/texproject.ts`, Rust `texfolder.rs` (+ quyền `dialog:allow-open`). Đã thử biên dịch thư mục mẫu 21 câu bằng pdfLaTeX (máy thử thiếu gói tiếng Việt nên chỉ kiểm được phần lệnh LaTeX); CHƯA thử trên Windows thật.
- Chưa làm: màn "Xử lí TeX / xem trước khi xuất" (chủ dự án sẽ gửi danh sách chức năng cần; dự kiến beta.25).

## Có gì mới trong beta.23: Chọn nhiều & thao tác hàng loạt ở Ngân hàng
Chỉ đổi giao diện và thao tác dữ liệu; KHÔNG đổi schema (3), ID6, cây mục lục, LaTeX gốc, thuật toán kiểm tra trùng, sao lưu, bộ nhãn chuẩn. (Gồm PR #55–#59 + sửa tốc độ chỉ mục tìm kiếm.)
- **Chọn nhiều**: ô "Chọn trang (20)", "Chọn tất cả N câu trong kết quả lọc" (qua mọi trang; hỏi lại khi > 1.000 câu), "Bỏ chọn trang", "Bỏ chọn tất cả", "Chỉ xem đã chọn". Lựa chọn GIỮ khi đổi trang, bộ lọc, sắp xếp, Thẻ/Danh sách; thanh chọn cho biết "N câu · a ở trang này · b ngoài trang · c ngoài bộ lọc". Không có Ctrl+A toàn kho.
- **Thanh thao tác chọn nhiều**: Xuất .tex (theo kiểu sắp xếp đang chọn; cảnh báo > 1.000, từ chối > 5.000), Kiểm tra trùng trong các câu đã chọn, **Gắn nhãn** (thêm/bỏ nhãn, xem trước số câu đổi, giữ nhãn khác), **Đổi mức độ** (nhắc mã ID đổi theo mức độ), Thao tác khác: Đánh dấu "Cần sửa" / Về "Chưa kiểm tra", **Chuyển vào Thùng rác**. Mọi thao tác ghi MỘT lần, báo trung thực "Đã lưu nhãn: X/Y câu"; ghi lỗi thì hoàn lại đủ ("KHÔNG câu nào bị thay đổi"). Không đổi latex, uid, số thứ tự, loại câu, ngày sửa. KHÔNG có "Đã duyệt hàng loạt", đổi loại câu hàng loạt, sửa LaTeX hàng loạt.
- **Xoá hàng loạt vào Thùng rác** (tất cả hoặc không câu nào): kiểm tra sức chứa cả lô (thùng rác tối đa 1.000; thiếu chỗ ⇒ từ chối, không cắt bớt, không bỏ câu cũ) → ghi thùng rác một lần → xoá khỏi ngân hàng một lần và kiểm tra ghi; lỗi thì hoàn lại ngân hàng và gỡ bản vừa cất (nếu gỡ cũng lỗi: câu nằm ở cả hai nơi, không mất, có báo). ≥ 50 câu phải tick xác nhận. Đã sửa (PR-0): trước đây thùng rác âm thầm cắt còn 1.000 câu mới nhất.
- **Sắp xếp** (Mới cập nhật / Cũ nhất / Số thứ tự tăng–giảm), **phân trang trên + dưới** đồng bộ, 20 hoặc 50 câu/trang; Danh sách–Chi tiết có Câu trước/Câu tiếp và phím ↑/↓ (qua ranh giới trang).
- **"+ Câu hỏi mới" theo vị trí đang xem**: tự điền Lớp/Chương/Bài/Dạng (và Mức độ nếu chỉ lọc một mức); nếu đang có bản nháp chưa lưu thì hỏi "Giữ bản nháp / Bỏ bản nháp". "‹ Về Ngân hàng" trở lại đúng bộ lọc, chữ tìm, sắp xếp, trang (trong phiên; lựa chọn không lưu qua màn khác).
- **Tốc độ**: chữ tìm kiếm của từng câu được nhớ theo câu (trước đây dựng lại cả kho, ≈ 1,1 giây ở 60.000 câu, sau MỖI thao tác). Đo giả lập 60.000 câu: chọn tất cả 14 ms, gắn nhãn cả kho ≈ 0,2 s, đổi mức độ ≈ 0,19 s, chuyển 1.000 câu vào thùng rác ≈ 0,15 s.
- Chưa làm: chuyển vị trí (Lớp/Chương/Bài/Dạng) hàng loạt (chờ chủ dự án quyết); chưa nghiệm thu trên máy Windows thật.

## Có gì mới trong beta.22 (V5): Mục lục & Bộ lọc luôn là ô chọn
Chỉ đổi giao diện và logic lọc; KHÔNG đổi schema, ID6, cây mục lục, LaTeX, kiểm tra trùng, thùng rác, nhãn chuẩn, sao lưu.
- Lớp, Phân môn, Chương, Bài, Dạng LUÔN là ô chọn (bỏ `SEG_MAX`), luôn đủ 5 ô vị trí + 4 ô thuộc tính; ô cấp dưới chưa chọn được thì mờ và ghi lý do, nên bố cục không nhảy khi chọn.
- Hộp chọn luôn có ô tìm (tên hoặc mã, bỏ dấu), cuộn được, có số câu từng mục; mục 0 câu mờ nhưng chọn được. Gõ chữ ngay trên ô khi đang đóng rồi Enter để chọn (vd gõ 12, Enter). Mỗi ô đang lọc có nút ✕ (đổi cấp trên thì cấp dưới tự về Tất cả).
- SỬA LỖI: lọc Lớp trước đây theo SỐ lớp nên các lớp mã chữ (đều là 0) bị gộp. Nay lọc theo id Lớp trong cây (`gradeId`); câu chưa gán chương dự phòng theo số lớp nếu số đó duy nhất. Không đổi ID câu.
- SỬA LỖI: chọn đủ mọi giá trị Mức độ/Loại câu coi như "Tất cả" (không huy hiệu, không viền xanh, không bật nút Xoá bộ lọc). Ô tích là ô tích thật.
- Trạng thái rỗng tách 4 loại (`BankEmpty.tsx`, `emptyKind`): kho trống / mục chưa có câu (nút "Xem cả …") / có câu nhưng bộ lọc loại hết (chip từng điều kiện kèm "→ N" câu sẽ có, bấm ✕ bỏ riêng) / do chữ tìm. Thêm số đếm `inScope` (bỏ qua chữ tìm và thuộc tính).
- Chưa làm (cần quyết định riêng): nút "+ Câu hỏi mới" ở trạng thái rỗng chưa tự điền vị trí đang xem; mở rộng ID cho Lớp 1–2 và cấp học khác (xem `claude/de-xuat-v5-dropdown-thong-nhat.md`, mục 8).

## Có gì mới trong beta.21 (Mục lục & Bộ lọc mới + đáp án gọn hơn)

Chỉ đổi giao diện màn Ngân hàng; dữ liệu (schema 3), ID, LaTeX gốc, Kiểm tra trùng, thùng rác, sao lưu **không đổi**.

- **Một thanh "Mục lục & bộ lọc"** bên trái, hai nhóm: *Theo chương trình* (Lớp → Phân môn → Chương → Bài → Dạng) và *Lọc câu hỏi* (Mức độ, Loại câu, Hình, Duyệt). Thanh ngang chỉ còn tìm kiếm, Thẻ/Danh sách, Kiểm tra trùng, Bộ lọc/Mục lục — không còn ô lọc nào bị nhân đôi.
- **Lớp = 4 nút, Phân môn = nút phân đoạn; Chương/Bài/Dạng = ô chọn** có số câu từng mục (mục 0 câu hiện mờ nhưng vẫn chọn được). Đổi cấp trên thì cấp dưới tự đặt lại; chọn chương mà chưa chọn phân môn thì tự điền phân môn.
- **Mức độ và Loại câu vẫn chọn nhiều giá trị.**
- **Bộ lọc mới "Hình"**: Có hình / Không hình / Chưa xác định — suy ra từ mã LaTeX (TikZ, ảnh, bảng biến thiên; **không** tính hình chỉ nằm trong lời giải; bảng `tabular` không phải hình). Không biên dịch TikZ, không lưu vào dữ liệu. Câu có lệnh lạ chưa chắc là hình vào "Chưa xác định", không bị xếp vào "Không hình".
- **Số đếm đúng hơn**: số của mỗi lựa chọn tính theo các bộ lọc khác (trước đây chọn "Thông hiểu" thì "Vận dụng" hiện 0). Số ở lớp/chương/bài cũng theo bộ lọc.
- **Xoá bộ lọc** (chỉ 4 thuộc tính) và **Đặt lại toàn bộ** (mục lục + bộ lọc + chữ tìm; giữ các câu đã tick). "Toàn kho" của ô tìm chỉ có hiệu lực khi đang gõ chữ.
- **Cửa sổ hẹp / zoom 150% / đã ẩn thanh trái**: thanh thành ngăn trượt (nút "Bộ lọc" hoặc "Mục lục & lọc"), cùng một thành phần, giữ nguyên trạng thái; Esc đóng.
- **Nhiều lớp, nhiều phân môn**: từ 4 lớp trở lên (hoặc >3 phân môn) ô Lớp/Phân môn tự chuyển thành ô chọn có số câu và ô tìm (khi >12 mục); ít hơn thì vẫn là nút bấm. Tên lớp lấy từ khung chương trình (không còn gắn cứng "Lớp N").
- **Ô đáp án gọn và đẹp hơn**: trắc nghiệm bỏ khung to quanh từng đáp án — chữ cái trong vòng tròn nhỏ, đáp án đúng tô nền xanh nhạt + chữ cái đặc (cao ≈26px, trước ≈42px); Đúng/Sai: nhãn Đ/S nhỏ nằm ngay sau a) b) c) d); "Đáp án" trả lời ngắn là một nhãn gọn một dòng.
- Giới hạn về nhiều cấp học: mã ID hiện chỉ 1 ký tự cho lớp (0,1,2 = lớp 10–12; 3–9 = lớp 3–9) nên **Lớp 1–2 và cấp ngoài phổ thông (đại học…) cần một quyết định riêng về cách đánh mã** — chưa làm (theo quy tắc không tự đổi công thức ID).
- Giới hạn: chưa nghiệm thu máy Windows thật; "Không hình" mới kiểm chứng trên bộ thử tự soạn và 300 câu mẫu (gần như toàn câu có hình) — cần thầy/cô gắn nhãn ~40 câu thuần chữ để chứng minh; hiệu năng 60.000 câu chỉ đo giả lập (lọc+đếm ≈ 15 ms lần sau, ≈ 135 ms lần đầu trên máy làm việc).

## Có gì mới trong beta.20 (Kiểm tra trùng: sao lưu, thùng rác, nhãn chuẩn)

- **Sao lưu đầy đủ hơn**: file sao lưu thủ công nay kèm cả quyết định "trùng/giữ cả hai", thùng rác và bộ nhãn chuẩn; khôi phục là GỘP (bản mới hơn thắng, không xoá gì).
- **Thùng rác**: loại câu trong Kiểm tra trùng hoặc xoá ở Ngân hàng đều phải xác nhận và chuyển vào thùng rác (Hệ thống → Thùng rác: Khôi phục / Xoá hẳn). Câu chỉ rời ngân hàng sau khi thùng rác đã ghi xong.
- **Nhãn chuẩn**: gắn mù ~150 cặp (không hiện nhận định của máy) để đo độ chính xác thật của bộ phát hiện trên kho của thầy/cô; có báo cáo từng loại.
- Không đổi schema, không đổi Rust. Bản beta.18 cũ sẽ bỏ qua phần thêm này và có thể làm mất nếu tự ghi lại file.

## Có gì mới trong beta.19 (giao diện V3 — "Mực xanh & giấy ô ly")

Chỉ đổi giao diện. Dữ liệu ngân hàng (schema 3), ID, khung chương trình, LaTeX gốc và thuật toán kiểm tra trùng **không đổi**; Tạo đề vẫn tạm ẩn.

- **Bảng màu mới:** xanh mực cho nút chính và mục đang chọn, đỏ chỉ dành cho lỗi/xoá; mọi màu gom về một chỗ; chữ và viền đạt độ tương phản chuẩn.
- **Khung ứng dụng:** thanh bên trái gọn (64px), cỡ chữ và độ bo góc thống nhất, nút thấp hơn; mục "Khung CT" đổi tên **Chương trình**.
- **Ngân hàng:** tìm kiếm, bộ lọc, kiểu xem, Kiểm tra trùng và Mục lục nằm trên **một hàng**; câu đầu tiên lên cao hơn (1366×768: từ y=186 xuống 124). Cửa sổ hẹp/zoom 150% tự ẩn mục lục lần đầu (bấm "Mục lục" để bật).
- **Kiểm tra trùng:** một ô chọn loại nghi vấn, "Cùng mẫu" ẩn mặc định; hàng cặp đầu tiên từ y≈620 lên ≈228, vùng so sánh rộng hơn.
- **Nhập liệu:** chỉ báo 4 bước; dán 3 câu là thấy ngay kết quả rà soát; nút "Nhập N câu" ghim đáy.
- **Trình sửa câu:** ba chế độ xem **Mã | Mã + Xem trước | Xem trước**, nhớ theo máy.
- **Hệ thống:** chia 4 nhóm; "Khôi phục từ file…" nay **hỏi xác nhận** trước khi thay toàn bộ ngân hàng.
- Giới hạn đã biết: chưa có ô Lớp/Phân môn thả xuống (giữ cây mục lục); quyết định Nhập/Bỏ/Chờ ở màn Nhập liệu vẫn là ô chọn; Kiểm tra trùng vẫn là lớp phủ toàn màn hình; chưa nghiệm thu trên máy Windows thật.

## Có gì mới trong beta.18 (kiểm tra trùng V2)

- **Xử lý cặp trùng ngay trong màn Kiểm tra trùng:** hai câu hiện cân xứng (cạnh nhau khi rộng, xếp dọc khi hẹp), Toán/TikZ không bị méo; có tab “Khác biệt” theo ký hiệu. “Mở sửa” rồi quay lại đúng cặp; “Loại một câu…” đưa tới Ngân hàng để xoá (HEdu không tự xoá, không tự gộp).
- **Quét theo phạm vi:** Khối 10/11/12 · Phân môn · Chương · Bài · Dạng · các câu đang chọn · toàn ngân hàng; có kiểu “đối chiếu với toàn ngân hàng”. Quét bị dừng giữa chừng không bao giờ hiện là “không trùng”; câu bị sửa sau khi quét được báo là danh sách đã cũ.
- **Bộ dò chính xác hơn:** sửa lỗi nhầm cặp chỉ khác `\begin{center}`, tên môi trường, màu, cột bảng; bổ sung lớp ứng viên theo “dấu vân tay sự kiện” để không bỏ sót ở ngân hàng lớn. Có bộ 40 cặp thử và kiểm thử hiệu năng.
- **Nhập file .tex / dán LaTeX:** rà trùng cả mới↔ngân hàng và mới↔mới, quyết định từng câu (nhập / bỏ qua / giữ lại xem), kiểm tra lại ngay trước khi ghi.
- **Nhớ quyết định:** “Giữ cả hai — không phải trùng / biến thể hợp lệ” và “Để xem sau” lưu ở tệp phụ riêng (không đổi dữ liệu ngân hàng); sửa nội dung một câu thì quyết định cũ tự hết hiệu lực. Có xuất/nhập file quyết định.
- Giới hạn đã biết: tệp quyết định không nằm trong “Sao lưu trước cập nhật” (dùng Xuất quyết định để lưu riêng); chưa có xoá/thùng rác trực tiếp; chưa tích hợp AI.
- Dữ liệu ngân hàng (schema 3), ID và sao lưu không đổi.

## Có gì mới trong beta.16

- **Bộ lọc của Ngân hàng thành một hàng nút thả xuống** (Mức độ · Loại câu · Kiểm duyệt, thêm Dạng toán khi đã chọn bài). Mỗi nút hiện tóm tắt lựa chọn; bấm mở bảng có số câu từng mục; có nút “Xoá N bộ lọc”. Câu hỏi đầu tiên nay nằm cao hơn khoảng 330px ở màn 1366×768.
- Màn Hệ thống nhắc rõ: từ beta.15 bản cũ hơn không mở được dữ liệu mới, hãy dùng “Sao lưu trước cập nhật”.

## Có gì mới trong beta.15

- **Kiểm duyệt câu hỏi:** mỗi câu có trạng thái **Chưa kiểm tra / Cần sửa / Đã duyệt** do chính thầy/cô đặt (máy không tự duyệt, kể cả khi biên dịch được). Đổi ở dưới mỗi thẻ hoặc trong khung Chi tiết; “Đã duyệt” có một bước xác nhận. Nhãn màu hiện trên thẻ và trên từng hàng danh sách.
- **Bộ lọc “Kiểm duyệt”** (Tất cả / Chưa kiểm tra / Cần sửa / Đã duyệt) kèm số đếm, dùng chung với các bộ lọc khác ở cả hai kiểu xem. Câu đổi trạng thái và rời bộ lọc thì có thông báo nhẹ.
- **Sửa LaTeX hoặc đổi loại câu** sẽ đưa câu về “Chưa kiểm tra” (có báo); đổi nhãn, mức độ, vị trí thì giữ nguyên. Câu nhân bản hoặc nhập mới luôn là “Chưa kiểm tra”.
- Chỉ báo “Đã lưu” khi đã ghi xuống đĩa; nếu lỗi sẽ báo rõ và có nút Thử lại.
- **Nhãn danh sách đúng:** `\begin{enumerate}[\it TH1:]` nay hiện `TH1:`, `TH2:` (nghiêng) thay vì lộ chữ `it`; hiểu `\alph*`, `\Alph*`, `\roman*`, `\Roman*`, `\arabic*` và danh sách lồng nhau (1. → (a) → i.). Sửa luôn lỗi nuốt mất mục `\item` đứng sau một danh sách lồng.
- **Lưới và trục không còn nét đậm nét nhạt:** nét thẳng ngang/dọc trong hình TikZ được vẽ tối thiểu 1 điểm ảnh, sắc nét đều ở zoom 80–150%. Nét chéo/cong, hình tô và “Xem chuẩn” giữ nguyên.
- **Ngân hàng gọn hơn:** tìm kiếm, kiểu xem, Ẩn/Hiện mục lục và nút **Bộ lọc** (có số bộ lọc đang bật) nằm trên một hàng; các bộ lọc xếp ngang; thanh “Đã chọn N câu” thấp hơn; nút Thao tác của thẻ nằm cùng hàng nhãn, **Nhân bản/Xoá** gom vào menu ba chấm (xoá cần bấm hai lần). Mục lục ẩn được ở cả Thẻ lẫn Danh sách; lựa chọn ẩn/hiện được nhớ theo máy.
- **Nút Đóng của ngăn sửa:** khi còn thay đổi chưa lưu, hộp hỏi nay nổi giữa màn hình, nền tối (trước đây chỉ là một thanh vàng nhỏ dưới nút nên dễ tưởng nút không bấm được). Esc trong hộp = Tiếp tục sửa.
- ⚠️ **Đổi cấu trúc dữ liệu (2→3):** sau khi cập nhật, bản app cũ **không mở được** dữ liệu mới. Bản sao lưu tự tạo trước khi cập nhật vẫn giữ dữ liệu cũ. Nội dung câu hỏi không đổi.

## Có gì mới trong beta.14

- **Ngân hàng có hai kiểu xem:** nút **Thẻ | Danh sách** ở đầu danh sách. “Danh sách” hiện các hàng gọn (số câu, mã ID, loại, mức độ, trích đoạn đề) bên trái và một khung **Chi tiết** đầy đủ bên phải. Đổi kiểu xem không mất bộ lọc, trang, các câu đã chọn hay công tắc “Hiện lời giải”. Chọn kiểu nào được nhớ cho máy này (mặc định vẫn là Thẻ).
- Bấm một hàng chỉ để **xem** câu đó; ô tick vuông riêng để **chọn nhiều câu** (xuất .tex…). Xoá câu đang xem thì chuyển sang câu bên cạnh. Có thể dùng bàn phím (Tab, Enter). Cửa sổ hẹp: bấm hàng thì Chi tiết hiện đầy màn hình, có nút “Quay lại danh sách”. Mục lục (lớp/chương/bài) có nút Ẩn/Hiện.
- **Hình ngang không còn nhỏ xíu:** hình gồm nhiều hình con xếp hàng ngang (ví dụ “bốn hình vẽ”) được phóng to hợp lý.
- **Đáp án A/B/C/D nằm trong ô viền**, đáp án đúng nổi bật bằng viền và nền xanh khi bật hiện đáp án.
- Dữ liệu, ID và sao lưu không đổi. (Chức năng “Kiểm duyệt câu hỏi” chưa có — đang chờ thầy duyệt cách lưu.)

## Có gì mới trong beta.13

- **Sửa bảng bị mất đường kẻ dưới cùng:** `\hline` ở cuối bảng nay kẻ suốt chiều ngang (trước đây chỉ hiện ở cột đầu).
- Dữ liệu, ID và sao lưu không đổi.

## Có gì mới trong beta.12

- **Đáp án dài không còn bị bẻ xấu:** đáp án trắc nghiệm tự xếp 4, 2 hoặc 1 cột tuỳ độ dài thật (như ex_test), nên phân số/biểu thức dài không bị xuống dòng lung tung.
- **Sửa câu đúng/sai bị đứt chữ:** nhãn `b)`, `d)` không còn tách dấu `)` xuống dòng, nội dung ý không bị cắt xén.
- **Khung rõ ràng cho đáp án:** chữ Đ / S nằm trong ô viền màu; đáp án trả lời ngắn nằm trong hộp “ĐÁP ÁN”.
- **Báo mã nguồn thiếu `\draw`:** câu lệnh TikZ bắt đầu bằng toạ độ (ví dụ `(\xmin,0)--(\xmax,0);`) thì TeX không vẽ nét nào — HEdu báo đúng dòng, không tự sửa. Trong 300 câu thử, câu trục số 34 và 35 dính lỗi này (thêm `\draw` ở đầu dòng là hiện trục).
- Dữ liệu, ID và sao lưu không đổi.

## Có gì mới trong beta.11

- **Sửa hình TikZ bị cắt hoặc tô sai** (ví dụ hình Venn tô gạch, đồ thị có tiếp tuyến): các hình trong cùng một trang không còn “dính” vùng cắt của nhau. Những câu có `\clip`, tô gạch hay tô màu chuyển nên được xem lại.
- **Cỡ hình trong xem trước cân bằng hơn:** hình quá nhỏ được nới ra, hình quá to được thu lại (giữ tỉ lệ; hình đã đặt `\resizebox` giữ theo mã). Chỉnh ở Hệ thống → “Cỡ hình trong xem trước”: Cân bằng / Giữ nguyên, thanh 70–140%. “Xem chuẩn” vẫn là kích thước thật.
- Dữ liệu, ID và sao lưu không đổi.

## Có gì mới trong beta.10

- **Xem trước LaTeX đúng hơn:** dựng theo cấu trúc câu — `\resizebox`, `\hspace`, nhiều hình trong `center`, danh sách, bảng, `\immini` hai cột (kể cả trong lời giải). Hình thứ hai của `\immini` và hình đứng sau `\choice` trước đây không hiện, nay đã hiện. Lệnh chưa hiểu được hiện ra và câu gắn nhãn “Xem trước chưa dựng chuẩn”; lỗi ngoặc/môi trường báo kèm dòng, cột (không tự sửa mã của bạn).
- **“Xem chuẩn” bằng TeX Live:** nút “TeX” trên thẻ ở Ngân hàng biên dịch nguyên câu với đầu file của Hệ thống; ở Nhập liệu có “Biên dịch thử N câu” (dừng được, một câu lỗi không chặn cả đợt), lỗi chia nhóm: thiếu gói, thiếu lệnh, lỗi mã, quá giờ.
- **Sửa câu bằng ngăn bên phải:** bấm “Sửa” trong Ngân hàng mở ngăn ngay bên cạnh, giữ nguyên bộ lọc, trang và các câu đang chọn; hỏi khi thoát mà chưa lưu; Ctrl+S chỉ lưu câu đang sửa. Giao diện soạn gọn hơn: hai khung Mã LaTeX | Xem trước, “Thuộc tính” thu gọn, bảng ký hiệu dạng hộp nhỏ; bỏ giấy ô ly, “Gõ trực quan” và nút Xuất Word chưa có. Đổi loại câu có xác nhận và hoàn tác được.
- **Phóng to / thu nhỏ giao diện (80–150%):** Ctrl + lăn chuột, chụm hai ngón trên bàn di chuột, hoặc Ctrl + / − / 0. Có chỉ báo mức zoom và mục “Cỡ hiển thị” trong Hệ thống; nhớ riêng cho từng máy.
- Dữ liệu, ID và sao lưu không đổi.

## Có gì mới trong beta.9

- **Đã nhúng sẵn bộ gói LaTeX của bạn:** `ex_test`, `tkz-tab-vn`, `tkz-linknodes`, `ex_tkz-euclide`, `twemojis` và danh sách gói dùng chung (`shared-content`). Các lệnh như `\IntervalLR`, `\IntervalGRF` dùng được ngay khi vẽ hình, không cần cài thêm gì.
- **Đầu file vẽ hình mặc định giống bộ đề của bạn:** nạp đủ tikz, tkz-euclide, tkz-tab, pgfplots, thư viện TikZ, tcolorbox, yhmath, esvect, twemojis… rồi `ex_test`. Xem và sửa ở Hệ thống → Vẽ hình TikZ (nếu bạn đã tự sửa đầu file trước đây, bấm khôi phục mặc định để nhận bản mới).
- **Báo lỗi rõ hơn:** khi hình lỗi vì lệnh chưa định nghĩa, thẻ lỗi nêu tên lệnh (ví dụ `\IntervalLR`).
- Cần TeX Live của máy có sẵn các gói chuẩn như `vietnam`, `tabvar`, `esvect`, `fontawesome`, `hobby` (bộ đề của bạn đã dùng sẵn).
- **Sửa lỗi Ngân hàng:** chọn nhiều câu không còn làm thẻ bị ép thấp và chồng nội dung lên nhau. Công tắc “Hiện lời giải” vẫn dùng được khi đang chọn câu.
- **Header Ngân hàng gọn hơn**, danh sách lên cao hơn.
- **Tạm ẩn “Tạo đề”** (thanh bên, nút Thêm vào đề, ô lệnh Ctrl+K) để tập trung hoàn thiện Ngân hàng và Nhập liệu. Mã và dữ liệu vẫn giữ nguyên, bật lại được.
