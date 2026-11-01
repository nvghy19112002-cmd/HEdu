## Có gì mới trong beta.49 (kênh beta): Thư viện đề mở nhiều đề bằng tab, mẫu in
Gồm PR #199–#202 (so với beta.48). Không đổi schema ngân hàng, UID, nội dung câu hỏi hay tệp của các đề đã có. Đã thử bằng bộ kiểm thử và bản thử trên trình duyệt với dữ liệu giả lập; chưa thử trên máy Windows thật với Thư viện đề và TeX Live của thầy/cô. Đây là bản beta.

**Điều chính cần biết**
- **Bấm thẻ đề là mở thẳng màn biên tập** (không qua hộp Thông tin). Thông tin đề: nút "Thông tin…" ở màn biên tập (#199).
- **Mở nhiều đề cùng lúc bằng tab** ở trên cùng: tab "Thư viện" luôn ở đầu, tối đa 8 đề. Trên tab: ● có tệp chưa lưu, ⟳ đang biên dịch, ⏳ chờ lượt, ! biên dịch lỗi. Ctrl+Tab đổi tab (hoặc Ctrl+PageDown/PageUp), Ctrl+W đóng tab, bấm chuột giữa vào tab cũng đóng. "← Thư viện" và Esc chỉ về tab Thư viện, đề vẫn mở. Tắt app mở lại vẫn nhớ các tab. Biên dịch cùng lúc tối đa 2 đề, đề thứ ba tự chờ lượt (#200).
- **Thông tin đề ở ngăn bên phải**; **chuột phải vào thẻ đề** có menu Mở, Xem nhanh PDF, Thông tin, Sao chép, Hiện trong Explorer, Xuất gói, Thùng rác; **Space** trên thẻ xem nhanh PDF; **kéo tệp .tex hoặc thư mục** từ Explorer thả vào Thư viện để nhập (#201).
- **Cài đặt › Đề thi**: chọn mẫu in (hiện có "Mặc định HEdu", in giống hệt trước) và **Thông tin mặc định** (Sở/Phòng, Trường, Tổ) tự điền vào đề mới ở Tạo đề (#202).

**Lời khuyên**
- Thử mở 2–3 đề, sửa một đề rồi đổi tab, bấm Biên dịch ở cả ba đề, tắt app mở lại xem tab còn không.
- Đặt Thông tin mặc định ở Cài đặt › Đề thi rồi tạo một đề mới ở Tạo đề, biên dịch và so bản in với đề cũ.
- Kéo một tệp .tex vào Thư viện đề để thử nhập.

## Có gì mới trong beta.48 (kênh beta): Xử lí TeX làm việc theo nhóm câu; Ngân hàng chọn mục trước
Gồm PR #186–#197 (so với beta.47). Không đổi schema ngân hàng, UID hay nội dung LaTeX của câu trong ngân hàng (chỉ Gán ID trên bàn nháp chèn `%[ID]` vào chữ của bàn nháp, và chỉ khi bạn bấm Chèn). Đã thử bằng bộ kiểm thử, bản thử trên trình duyệt với dữ liệu mẫu và test Rust; chưa thử trên máy Windows thật với ngân hàng và TeX Live của thầy/cô. Đây là bản beta.

**Điều chính cần biết**
- **Ngân hàng: phải chọn mục ở cây mục lục mới hiện câu.** Chưa chọn gì thì khung trống ghi hướng dẫn kèm nút "Tất cả" và từng Lớp. "Tất cả" vẫn xem được cả kho. Ô Tìm tìm trong mục đã chọn; gõ `#số` vẫn tìm đúng câu trong toàn kho (#195).
- **Xử lí TeX — nút "Đưa vào Ngân hàng (N câu)…"**: mở màn Nhập liệu với các câu của bàn nháp, đi đủ các bước như mọi lần nhập (rà trùng, kiểm ID, xem lại rồi mới ghi). Bàn nháp giữ nguyên (#187).
- **Xử lí TeX — thanh công cụ gọn**: một hàng, các việc phụ nằm trong menu **Công cụ ▾**; bàn nháp trống có hướng dẫn 3 bước; dòng "PDF" ở chân màn bấm được (#187, #194).
- **Chọn, lọc và làm theo nhóm câu**: tick câu; lọc theo Chưa có ID / Có lỗi / Có hình / Cần xem lại / Có thể trùng / Lỗi biên dịch / Đã chọn. Khi có câu đã chọn, **Biên dịch, Chuẩn hoá, Tìm–Thay, Lưu .tex, Gán ID, Đưa vào Ngân hàng** chỉ chạy trên các câu đó. **Tìm và thay thế** có xem trước từng dòng. Lỗi biên dịch gắn vào từng câu, có nút "Lỗi kế tiếp ▸" (#188).
- **Mở tệp .tex vào bàn nháp** (nối vào cuối) và **Lưu ra tệp .tex** (#189).
- **Kiểm tra trùng với ngân hàng** ngay trên bàn nháp: nhãn "trùng #xxxx" (#190).
- **Soát nội dung**: công thức hỏng, ngoặc lệch, thiếu đáp án đúng, thiếu lời giải… chỉ báo, không tự sửa (#196).
- **Nhiều bàn nháp có tên** (đổi qua lại, đổi tên, xoá); bàn nháp chính giữ nguyên tệp cũ (#191).
- **Gán ID nhờ Claude trên bàn nháp**: xuất lô cho câu chưa có ID, xem trước đề xuất, chèn `%[ID]`, có Hoàn tác (#192).
- **Lưu thành đề trong Thư viện đề** (câu chép nguyên văn; bàn nháp không đổi) (#197).
- Sửa: thẻ câu ở Ngân hàng không còn mất dấu căn √ (#186). Quy tắc dự án: chỉ Claude viết mã (#193).

**Lời khuyên**
- Thử Ngân hàng trước: mở lên, chọn một Lớp/Chương, thử ô Tìm và `#số`.
- Thử luồng: dán một đề vào Xử lí TeX → Soát nội dung → Kiểm tra trùng → Gán ID nhờ Claude → Đưa vào Ngân hàng, và thử Lưu thành đề rồi mở trong mục Đề thi.
- Cập nhật lên bản này xong, bàn nháp cũ vẫn còn trong "Bàn nháp chính".

## Có gì mới trong beta.47 (kênh beta): màn mới "Xử lí TeX"
Gồm PR #179, #181, #182, #184 (so với beta.46). Không đổi schema ngân hàng, UID hay nội dung LaTeX của câu trong ngân hàng. Đã thử bằng bộ kiểm thử, TeX Live thật và bản chạy thử của app với dữ liệu giả; chưa thử với ngân hàng thật. Đây là bản BETA.

**Điều chính cần biết**
- **Mục mới "Xử lí TeX"** trên thanh bên: bàn nháp để dán/gõ các khối `\begin{ex}…\end{ex}`. Khai báo gói có sẵn, không cần `\documentclass`. Bàn nháp **không ghi vào ngân hàng** hay Thư viện đề.
- **Danh sách câu** bên phải: dòng đầu–cuối, tình trạng ID (chưa có / sai / không có trong cây / có trong cây), số lỗi; bấm câu là khung mã nhảy tới đúng dòng, kèm **xem nhanh** câu đó (có thể khác PDF). Báo câu thiếu `\end{ex}`, `\end{ex}` thừa, chữ ngoài khối câu, dán nhầm cả tài liệu, lệnh đọc/ghi tệp.
- **Bản nháp tự lưu** 1,5 giây sau khi ngừng gõ (Ctrl+S lưu ngay); tắt app mở lại vẫn còn. "Xoá nội dung" có hỏi lại, Ctrl+Z lấy lại.
- **Biên dịch PDF** (nút hoặc Ctrl+Enter) bằng TeX Live trên máy: lỗi báo theo **câu và dòng**, bấm để nhảy tới; PDF cũ mang nhãn "bản trước" khi mã đã đổi hoặc lần vừa rồi lỗi; gói thiếu có nút "Thêm gói"; nút "Sao chép báo lỗi" để gửi Claude. PDF là bản **nguyên văn, có thể chứa lời giải** — đừng phát cho học sinh khi chưa xem lại.
- **Chuẩn hoá…** có xem trước từng dòng đổi; chỉ đổi khi bấm Áp dụng, có Hoàn tác. Luật kỹ thuật bật sẵn (ký tự ẩn, khoảng trắng cuối dòng…); luật công thức tắt sẵn (`^0`→`^\circ`, `\frac`→`\dfrac`, `$$`→`\[ \]`, `3,5`→`3{,}5`), chỉ sửa bên trong công thức, không đụng chú thích hay hình TikZ.
- **Sắp xếp theo ID…**: xếp câu theo lớp → chương → bài → dạng → mức độ, câu chưa có ID dồn cuối, thêm dòng tiêu đề chương; nội dung câu giữ nguyên.
- Sửa: xem trước không còn báo "Chưa hiểu" với `\usetikzlibrary` đặt ngoài hình (#179).

**Lời khuyên**
- Thử: dán vài câu có hình vào Xử lí TeX → Biên dịch PDF → sửa một chỗ sai rồi biên dịch lại.

## Có gì mới trong beta.46 (kênh beta): Gán ID nhờ Claude áp dụng luôn, một lần bấm
Gồm PR #174, #177 (so với beta.45). Không đổi schema ngân hàng hay UID; LaTeX chỉ đổi ở vùng ID `%[…]`. Đã thử bằng bộ kiểm thử và trên trình duyệt với dữ liệu mẫu; chưa thử với ngân hàng thật. Đây là bản BETA.

**Điều chính cần biết**
- **Nhập đề xuất là áp dụng luôn**: nút “Nhập và áp dụng đề xuất mới nhất” (hộp Gán ID nhờ Claude) ghi ngay Dạng, mức độ và ID Claude chọn vào câu chưa được thầy/cô xác minh, kể cả câu “Chưa có ID” (câu rời mục đó, có ID). Không cần duyệt từng câu trong hàng đợi nữa.
- Các câu này mang trạng thái **“Máy phân loại”** (mức “Máy đề xuất”) nên rà lại sau được; không câu nào bị đánh dấu “giáo viên xác minh” thay thầy/cô.
- **Câu thầy/cô đã xác minh giữ nguyên.** Câu không ghi được ID mới vẫn vào hàng đợi Xác minh như cũ.
- **Hoàn tác**: nút “Hoàn tác lần áp dụng này” trong hộp (còn trong lần mở app đó). Lô từ 20 câu có điểm khôi phục tự động trước khi ghi.
- **Lô lấy đúng câu đang tick**: có câu đang tick ở Ngân hàng thì lô chỉ gồm các câu đó (không tick thì lấy danh sách đang lọc); nút Gán ID nhờ Claude có thêm ở thanh câu đã chọn.

**Lời khuyên**
- Quy trình gọn: Xuất lô → nhắn Claude “làm lô mới nhất” → bấm “Nhập và áp dụng đề xuất mới nhất”.

## Có gì mới trong beta.45 (kênh beta): mức độ, "Kiểm tra lại" nhờ Claude, tìm theo số câu, Tạo đề
Gồm PR #168–#172 (so với beta.44). Không đổi schema ngân hàng, UID hay nội dung LaTeX của câu. Đã thử bằng bộ kiểm thử có sẵn và trên trình duyệt với dữ liệu mẫu; chưa thử với ngân hàng thật. Đây là bản BETA.

**Điều chính cần biết**
- **Mức độ đề xuất dùng được ngay (phím K)**: trong hàng đợi Xác minh, khi Claude đề xuất mức khác mức đang lưu, có nút “Dùng mức đề xuất”. Câu đã có ID thì chữ mức độ trong ID đổi theo; câu Chưa có ID không bị thêm ID. M vẫn là giữ mức đang lưu. Có Hoàn tác.
- **Quy tắc mức độ 4 mức** (NB/TH/VD/VDC theo yêu cầu tư duy; câu nhiều ý do thầy/cô chốt) đã ghi vào hướng dẫn của mỗi lô gửi Claude.
- **“Kiểm tra lại cả câu đã xác minh”** (hộp Gán ID nhờ Claude): chọn một mục trong Cây mục lục, tick ô này rồi Xuất lô (mã lô bắt đầu bằng K). Claude soát lại Dạng và mức độ; câu không bị xoá hay đổi. Câu Claude thấy khác Dạng vào “Cần xem lại” (Dạng cũ giữ nguyên, bấm P dùng đề xuất hoặc Y giữ cũ); câu chỉ khác mức độ vào nhóm mới “Mức độ cần xem” (K hoặc M).
- **Nhập đề xuất không còn xoá xác nhận mức độ** thầy/cô đã bấm trước đó.
- **Ô Tìm ở Ngân hàng nhận số câu** dạng `#2086`, tìm trong toàn kho.
- **Cây mục lục** dùng hết chiều cao khung, đi bằng phím mũi tên, tự cuộn tới mục đang chọn.
- **Tạo đề**: hết báo kho 0 câu; các ô Lớp/Chương/Bài/Dạng ghi số câu cạnh từng lựa chọn; lớp mặc định là lớp có nhiều câu nhất; câu Chưa có ID không bị bốc vào đề.

**Lời khuyên**
- Lô đã nhập trước bản này không có nút K. Muốn dò lại mức độ một mục, dùng “Kiểm tra lại” cho mục đó.

## Có gì mới trong beta.44 (kênh beta): xem trước hiểu nhãn danh sách `label=`
Gồm một PR nhỏ (so với beta.43). Không đổi schema ngân hàng, UID hay nội dung LaTeX của câu. Đã thử bằng bộ kiểm thử có sẵn và biên dịch thật bằng TeX Live; chưa thử với ngân hàng thật. Đây là bản BETA.

**Điều chính cần biết**
- **Xem trước hiểu `\begin{enumerate}[label=\alph*)]`** (và `label=(\arabic*)`, `label=\Alph*.`, `label=\roman*)`, kể cả khi có thêm khóa khác như `leftmargin=*`, `itemsep=…`). Trước đây xem trước hiện chữ “label=a)”; khóa không phải nhãn không còn bị đọc nhầm thành nhãn.
- **Mẫu `khaibaochung` của bộ đề xuất ra nạp `enumitem` (shortlabels) thay cho `enumerate`.** Nhãn ngắn cũ `[a)]`, `[(1)]`, `[\alph*)]` vẫn chạy như trước; dạng `label=` nay biên dịch đúng. Nếu bạn tự thêm gói `enumerate` trong khai báo riêng thì gói đó đè lên và `label=` sẽ in sai.
- Lý do: câu nạp từ OCR dùng `label=\alph*)`, còn nhãn ngắn `[a)]` báo lỗi “Package enumitem Error: a) undefined” khi dự án nạp enumitem thường.

**Lời khuyên**
- Mở một câu có danh sách a) b) c) d) trong Ngân hàng và xem trước, rồi biên dịch thử bộ đề có câu đó.

## Có gì mới trong beta.43 (kênh beta): mục “Chưa có ID”, câu không ID không còn mang ID giả
Gồm PR #165 (so với beta.42). Không đổi schema ngân hàng, UID hay nội dung LaTeX của câu. Đã thử trên bản thử với dữ liệu giả lập; chưa thử với ngân hàng thật. Đây là bản BETA.

**Điều chính cần biết**
- **Mục “Chưa có ID” ở Cây mục lục** (ngay dưới “Tất cả”, có số câu, chia theo lớp): câu nhập không có ID nằm ở đây, không bị xếp vào Lớp 12 hay Dạng nào, không cộng vào số câu của Chương/Bài/Dạng. Thẻ câu ghi “Chưa có ID” thay cho mã giả kiểu `2D1H1-1`.
- **Câu cũ đã nhập không ID** (vd các câu “Nguồn: dán trực tiếp”) tự vào mục này, ở nhóm “Chưa rõ lớp”. Không câu nào bị xoá, LaTeX giữ nguyên.
- **Sửa câu không tự ghi ID**: bấm Lưu câu Chưa có ID không thêm `%[…]`. Muốn gán thì mở Thuộc tính chọn Lớp → Chương → Bài → Dạng; lúc đó câu rời mục và mới được ghi ID.
- **Màn Nhập**: bỏ vị trí mặc định Lớp 12; chỉ còn ô Lớp (mặc định “Chưa rõ lớp”) cho câu không có ID.
- **Gán ID nhờ Claude**: lô xuất đúng lớp chọn khi nhập (chưa rõ lớp thì Claude chọn Dạng ở lớp phù hợp); đề xuất Dạng lớp 10 không còn bị loại vì “khác lớp”.
- “Thêm ID”, “Gán ID tự động”, “Xác nhận Dạng” bỏ qua câu Chưa có ID (tránh ghi ID giả).

**Lời khuyên**
- Bấm mục “Chưa có ID” → “Chọn cả n câu” → “Gán ID nhờ Claude…” để ra đúng lô cần gán.

## Có gì mới trong beta.42 (kênh beta): chuẩn hoá khi nạp file .tex
Gồm bước chuẩn hoá ở màn Nhập liệu (so với beta.41). Không đổi schema ngân hàng, UID hay nội dung LaTeX của câu. Đây là bản BETA, chưa thử với tệp .tex thật của bạn.

**Điều chính cần biết**
- **Chỉ bốc các khối `\begin{ex}…\end{ex}` hoàn chỉnh**, nguyên văn (kể cả ID `%[…]` ở cuối dòng `\begin{ex}` hay dòng ngay sau). Phần mở đầu tệp, `\chapter`… được bỏ qua.
- **Tránh nạp nhầm**: khối bị comment `%` không còn được nhập; khối thiếu `\end{ex}` bị bỏ chứ không gộp nhầm hai câu; `\end{ex}` thừa và khối rỗng bị bỏ.
- **Khung “Chuẩn hoá” báo rõ** tệp nào, dòng nào, vì sao bỏ (kể cả ID đặt trước `\begin{ex}` mà app không đọc). Bỏ BOM, đổi xuống dòng CRLF về LF, cắt khoảng trắng cuối dòng.

**Lời khuyên**
- Nhập thử một tệp, xem khung “Chuẩn hoá”: nếu số câu ít hơn kỳ vọng, sửa tệp nguồn theo dòng được báo rồi mở lại.

## Có gì mới trong beta.41 (kênh beta): sửa câu có ID ở cuối dòng đầu bị xếp nhầm chỗ
Gồm PR #162 (so với beta.40). Không đổi schema ngân hàng, UID hay nội dung LaTeX của câu. Đây là bản BETA.

**Điều chính cần biết**
- **Đọc được ID viết ở cuối dòng đầu**: câu kiểu `\begin{ex} Tìm tập xác định…%[0D3H1-2]` (ID nằm sau chữ đề, cùng dòng `\begin{ex}`) trước đây bị coi là “không có ID” nên vào vị trí mặc định của màn Nhập liệu (vd Lớp 12). Nay HEdu nhận đúng ID và xếp câu vào đúng vị trí.
- **Sửa các câu đã nhập nhầm trước đây**: Ngân hàng hiện dải báo “N câu có ID trong LaTeX khác vị trí đang lưu” kèm nút **“Đưa về đúng vị trí theo ID…”** (có hỏi lại, Hoàn tác được). Vị trí và mức độ được đưa về đúng như ID; nội dung câu không đổi.

**Lời khuyên**
- Sau khi cập nhật, mở Ngân hàng xem dải báo trên và bấm nút để đưa các câu nhập nhầm về đúng chỗ trước khi nhập lô mới.

## Có gì mới trong beta.40 (kênh beta): Gán ID nhờ Claude, chọn nhiều loại câu ở Ngân hàng
Gồm PR #159–#160 (so với beta.39). Không đổi schema ngân hàng, ID6, UID hay LaTeX gốc của câu. Đã thử trên app thử với dữ liệu giả lập; **chưa thử phân loại thật trên ngân hàng thật.** Đây là bản BETA.

**Điều chính cần biết**
- **Gán ID nhờ Claude** (Ngân hàng → “Gán ID nhờ Claude…”): bấm *Xuất lô* (lô lấy từ danh sách đang lọc, lưu thẳng vào thư mục trao đổi `D:\HEdu-gan-id`) → nhắn Claude “làm lô mới nhất” → bấm *Nhập đề xuất mới nhất*. HEdu báo độ đúng trên các câu đối chứng (câu thầy/cô đã xác minh, trộn ngầm ~10%), rồi đưa đề xuất vào hàng đợi **Xác minh**: Claude đồng ý Dạng đang lưu ⇒ “Máy phân loại”; đề xuất Dạng khác ⇒ “Cần xem lại”. Trong hàng đợi bấm **P** để dùng Dạng đề xuất (Y xác nhận, U hoàn tác). **Không câu nào bị đổi Dạng hay ID khi chưa có thầy/cô xác nhận.**
- **Ngân hàng giữ lựa chọn khi đổi bộ lọc**: chọn vài câu Trắc nghiệm, lọc sang Đúng/Sai chọn tiếp, đổi cây mục lục hay gõ tìm vẫn giữ; thanh chọn báo số câu ở bộ lọc khác và có nút “Bỏ câu ngoài bộ lọc”. Chọn xong bấm “Thêm vào đề” là đủ các câu.

**Lời khuyên**
- Trước khi nhờ Claude gán ID, xác minh tay khoảng 100 câu rải đều các chương để HEdu đo được độ đúng.
- Mỗi lô khoảng 200–300 câu (hạn mức sử dụng của gói Claude theo phiên).

## Có gì mới trong beta.39 (kênh beta): đề thi làm lại, kiểm tra trùng đầy đủ, hedu.sty
Gồm PR #151–#158 (so với beta.38). Không đổi schema ngân hàng, ID6, UID hay LaTeX gốc của câu. Đã thử trên app thử với dữ liệu giả lập và TeX Live 2026; **chưa nghiệm thu thủ công trên Windows thật.** Đây là bản BETA.

**Điều chính cần biết**
- **Kiểm tra trùng quét đầy đủ** ở mọi phạm vi (toàn kho, trong phạm vi, đối chiếu cả kho) và khi nhập: so mọi cặp có thể trùng, không còn giới hạn ứng viên. Trên 1.500 câu mẫu, kết quả khớp tuyệt đối với so từng cặp (bản cũ sót một nửa cặp “cùng mẫu”). Hai câu giống hệt chỉ khác hình nay xếp “Có thể trùng” để xem lại. Duyệt theo lô: bản đầu của câu trùng trong lô được duyệt như câu mới.
- **Thư viện đề thi mới**: cây mục lục theo Lớp → Ôn tập theo bài học (Chương → Bài) · Đề kiểm tra (Giữa kỳ 1, Cuối kỳ 1, Giữa kỳ 2, Cuối kỳ 2) · Đề ôn tập · Đề thi thử, cùng Thư mục riêng; lưới thẻ đề có màu theo loại, bấm thẻ mở cửa sổ chi tiết; tạo/nhập đề ngay tại mục đang chọn (tự điền lớp, loại, chương, bài).
- **Ma trận Tạo đề theo từng câu (kiểu TIAD)**: bảng Câu 1…N mỗi phần, chọn Dạng bài và mức độ từng câu, xem số câu trong kho và câu đang chọn; Ngẫu nhiên hoặc Tự chọn; Form THPT 2025 (12/4/6) hoặc Tùy chỉnh; sửa nhiều câu một lần; bảng **Thống kê và đánh giá đề** (tỉ lệ NB–TH / VD–VDC, độ khó 0–10).
- **hedu.sty**: đề tạo mới dùng gói khai báo có phiên bản; cuối mỗi mã đề có dòng **“HẾT”**; gói riêng mà câu hỏi cần được tự nạp (hedu-goithem.tex). Nếu biên dịch vẫn báo thiếu gói, màn Biên tập gợi ý gói và có nút **“Thêm … và biên dịch lại”**.
- **Giao diện**: một màu nút chính, ô chọn/ô nhập đồng bộ, màu mức độ không còn cam/đỏ, nhãn loại câu trung tính; thống kê một dòng; danh sách chọn câu hiện đề đọc được (x⁴, uₙ) thay cho mã LaTeX thô.

**Lưu ý**
- Đề đã lưu trước bản này giữ nguyên khai báo cũ (không có dòng HẾT); đề tạo mới mới dùng hedu.sty.
- Kho rất lớn có nhiều câu gần y hệt nhau thì quét trùng toàn kho có thể mất vài phút; luôn bấm Dừng được.

## Có gì mới trong beta.38 (kênh beta): chuẩn bị nhập hàng loạt
Gồm PR #148–#149 (so với beta.37). Không đổi schema ngân hàng, ID6, UID hay LaTeX gốc của câu. **Chưa thử với tệp thật trên Windows thật.** Đây là bản BETA.

**Điều chính cần biết**
- **Duyệt theo lô nguồn tin cậy** (màn Nhập liệu, bước rà soát): bật ô “Lô từ nguồn đã kiểm” và xác nhận một lần. HEdu chỉ đánh dấu “Đã duyệt” cho câu đủ điều kiện: không trùng hay mâu thuẫn đáp án, mã không lỗi, xem trước dựng chuẩn, đọc chắc đáp án, ID hợp lệ không bất đồng. Câu khác giữ “Chưa kiểm tra”. Câu được duyệt mang nhãn “Duyệt theo lô: <tên lô>” để lọc xem lại hoặc đưa cả lô về “Chưa kiểm tra”.
- **Bảng mã**: tệp UTF-16 đọc được ngay; tệp Windows-1258 hiện chữ mẫu, thầy/cô bấm “Chữ đúng, nhập tệp này” mới nhập; tệp TCVN3/VNI được hướng dẫn chuyển sang UTF-8 bằng Unikey.
- **Tự chia lô**: chọn quá 5.000 câu thì bấm “Chia tự động thành N lô” (không tách tệp); nhập xong lô này bấm “Tiếp lô sau”. Mỗi lô được rà soát lại và có điểm khôi phục riêng.
- **Xem trước** dựng đúng `\centerline`, `multicols`; bỏ qua `\allowdisplaybreaks` (trước đây báo “Chưa hiểu”). Trên 1.500 câu mẫu: lỗi xem trước 30 → 0.

**Lời khuyên khi nhập**
- Lưu bản chụp `.db` trước mỗi đợt; nhập thử lô nhỏ (khoảng 200 câu) trước lô lớn.
- Xử lý hết các câu “Mâu thuẫn đáp án” mà màn Nhập liệu báo.
- Danh sách lô chỉ giữ trong phiên đang mở; tắt app giữa chừng thì chọn lại các tệp chưa nhập.

## Có gì mới trong beta.37 (kênh beta): màn Ngân hàng mới
Gồm PR #145–#146 (so với beta.36). Chỉ đổi giao diện; không đổi dữ liệu ngân hàng, ID6, UID, LaTeX hay trạng thái duyệt/xác minh. **Chưa nghiệm thu thủ công trên Windows thật.** Đây là bản BETA.

**Điều chính cần biết**
- **Cây mục lục kiểu thư mục** bên trái: “Tất cả”, Lớp → Chương → Bài → Dạng, mỗi mục có số câu; ô “Tìm thư mục…” gõ không dấu cũng được; mặc định ẩn mục chưa có câu.
- **Thanh thống kê** trên danh sách: số câu theo mức N/H/V/C và theo loại câu, ô Tổng. Bấm ô để lọc, bấm nhiều ô để chọn nhiều; khi đang lọc, ô Tổng thành “Bỏ lọc ✕”.
- **Nút “Bộ lọc ▾”**: Hình, Duyệt, Dạng (trạng thái xác minh), Nhãn, “Xoá bộ lọc”, “Đặt lại toàn bộ”.
- **Thẻ câu hai cột cao bằng nhau.** Bấm vào câu mở **cửa sổ xem đầy đủ**: đáp án, lời giải, Xem chuẩn TeX, kiểm duyệt, xác minh Dạng/mức độ, chọn câu; **Trước/Sau** (phím ← →) theo cả danh sách đang lọc.
- **Sửa câu ngay trong cửa sổ đó**; còn thay đổi chưa lưu thì HEdu hỏi trước khi rời.
- Phím tắt: `/` vào ô tìm; PageUp/PageDown chuyển trang; Esc đóng cửa sổ.
- Đã bỏ: kiểu xem Danh sách, nút Thẻ/Danh sách, nút ẩn/hiện mục lục, 5 ô lọc ở thanh bên.

**Giới hạn**
- Chưa đo độ mượt khi lọc trên ngân hàng rất lớn (hàng chục nghìn câu) trên máy thật.
- Cửa sổ hẹp dưới 1000px: mục lục mở bằng nút “Mục lục”, thanh thống kê cuộn ngang.

## Có gì mới trong beta.36 (kênh beta): Tạo đề và xuất đề
Gồm PR #134–#143 (so với beta.35). Không đổi schema ngân hàng (3), ID6, UID, LaTeX/TikZ gốc của câu. **Chưa nghiệm thu thủ công trên Windows thật** (chủ dự án quyết định phát hành beta trước; danh sách thử: `claude/tong-nghiem-thu-beta.md`). Đây là bản BETA, không thay bản chính thức.

**Điều chính cần biết**
- **Tạo đề từ Ngân hàng** theo ba bước: *Chọn câu* → *Kết quả* → *Cấu hình & Xuất*.
- **Lưới chọn câu theo Dạng × mức độ (N/H/V/C)**: gõ số câu vào ô, cạnh ô có số câu đang có trong kho; lọc theo lớp, loại câu, tìm Dạng, “Chỉ hiện đã chọn”. Vẫn thêm được dòng theo cả chương/cả lớp; ma trận đã chọn nhóm theo Phần I–IV, có số câu và điểm.
- **Nhiều mã đề**: trộn câu và phương án (mã đầu giữ nguyên), đáp án theo phép hoán vị, bảng đáp án các mã; khóa câu, đổi câu, ngẫu nhiên lại.
- **Mẫu ma trận**: lưu, áp dụng (thay/thêm, hoàn tác), đổi tên, nhân bản, xóa; có trong bản chụp `.db` và sao lưu JSON.
- **Tránh câu đã dùng** (mặc định tắt): theo thư mục, năm học, loại đề hoặc đề chọn riêng; đề trong Thùng rác không tính. Thiếu câu thì báo rõ, chỉ dùng lại khi thầy/cô xác nhận; đề nhập tay không có UID được báo “chưa thể đối chiếu đầy đủ”.
- **Xuất PDF từng mã và gói ZIP**: gói học sinh chỉ có PDF đề (không đáp án, lời giải); gói giáo viên có PDF đề, PDF lời giải (tùy chọn), CSV đáp án từng mã, **Excel đáp án** (trang “Theo mã đề” và “Theo câu”), nguồn LaTeX kèm đủ gói khai báo để biên dịch lại, `manifest.json`. Có nút **“Chỉ xuất Excel đáp án”**.
- **Gói `ex_test` nâng lên 3.3.4** (cùng bản bộ đề MathHub dùng), kèm vá tiêu đề “Lời giải” trong `shared-content.tex`. Hình và PDF đã dịch sẽ được dịch lại một lần.

**Đã kiểm tự động (không thay cho nghiệm thu)**
- Test giao diện và Rust (204), CI Windows; biên dịch thật bằng TeX Live 2026: đề nhiều mã, bản Đề không có chữ lời giải trong PDF, gói ZIP, Excel mở lại đúng.
- App thử riêng (`vn.hedu.app.thu`, dữ liệu giả lập) cho phần tránh câu đã dùng.

**Chưa làm / giới hạn**
- Xuất Word, Excel theo mẫu riêng của TNMaker/AZOTA/OLM/SmartTest, mã QR đáp án, phiếu tô, Excel ma trận kèm đặc tả, trình chiếu, thi online: chưa làm.
- Chưa có nhãn “câu đã sửa sau khi dùng”.
- Hộp xác nhận khi đưa câu chưa duyệt vào đề (OK / Hủy / “Cần sửa”) và việc mở từng PDF học sinh chưa được thử tay trên máy thật.
- **Trước khi nâng cấp:** nên dùng Cài đặt → Lưu trữ SQLite → “Lưu bản chụp .db…”. HEdu cũng tự sao lưu trước khi cập nhật. Bản này thêm tệp phụ lưu mẫu ma trận; chưa thử quay về beta.35 trên dữ liệu có mẫu, nên nếu cần quay lại nguyên trạng hãy khôi phục từ bản chụp `.db` chụp trước khi nâng cấp. Bộ cài beta.35 và beta.34 vẫn còn trên trang Releases.

## Có gì mới trong beta.35 (kênh beta): xác minh ID đáng tin
Gồm PR #128–#132 (so với beta.34; commit trên main `ada2f89`). Không đổi schema ngân hàng (3), cấu trúc ID6, UID, LaTeX/TikZ gốc, cây chương trình, thuật toán dò trùng. **Chưa nghiệm thu máy Windows thật.** Đây là bản BETA, không thay bản chính thức.

**Điều chính cần biết**
- **ID có sẵn trong tệp .tex không còn được tin tuyệt đối.** Khi nhập, HEdu đối chiếu ID với các câu có **Dạng do giáo viên xác minh**: *khớp*, *chưa kiểm chứng* hoặc *bất đồng*. Bất đồng **không chặn cả lô**: câu vào ngân hàng với ID gốc nguyên văn, đánh dấu “cần xem lại” và nằm trong hàng đợi xác minh.
- **Ba trục độc lập:** *Nội dung* (chưa kiểm tra / cần sửa / đã duyệt), *Dạng* (chưa xác minh / máy phân loại / giáo viên xác minh / cần xem lại), *Mức độ* (chưa xác minh / máy đề xuất / giáo viên xác minh). Chỉ thao tác xác nhận của thầy/cô mới tạo “giáo viên xác minh”; máy hoặc AI không bao giờ tự tạo. **“Đã duyệt” nội dung không phải căn cứ xác minh ID.**
- **Câu chưa phân loại** vào vị trí chung nhưng **HEdu không ghi ID giả** vào LaTeX.
- **Hàng đợi xác minh** (Ngân hàng → nút “Hàng đợi xác minh”): xem từng câu và xác nhận bằng phím tắt `Y` xác nhận Dạng · `M` xác nhận mức độ · `N` cần xem lại · `1`–`3` đổi sang Dạng gợi ý · `D` chọn Dạng khác · `U` hoàn tác · `S`/`→` bỏ qua · `←` câu trước · `L` lời giải · `?` bảng phím · `Esc` đóng. Đổi Dạng ghi vị trí và ID mới cùng lúc, **giữ nguyên mức độ gốc**; hoàn tác trả lại đúng vị trí và LaTeX cũ; mọi thay đổi có lịch sử. Duyệt nội dung là ô riêng, không bị các phím này đổi.
- **Sao lưu và khôi phục trạng thái xác minh:** bản chụp `.db`, điểm khôi phục và bản trước cập nhật mang theo đầy đủ (đây là sao lưu **đầy đủ**). File sao lưu JSON thủ công mang theo trạng thái; khôi phục thay ngân hàng và gộp trạng thái (bản mới hơn thắng, bản ghi của câu không còn tồn tại bị bỏ). “Xuất ra JSON” tạo thêm `id-review.json` cạnh `hedu.json`: đó là **JSON trao đổi / quay về bản cũ, KHÔNG phải sao lưu đầy đủ**.
- **Ghi lỗi không tạo xác minh giả:** nếu không ghi được xuống đĩa, câu không hiện là “giáo viên xác minh”.
- **An toàn phát hành:** bước dọn bản cũ giữ 3 bản mới nhất và bản được ghim (beta.34), và dừng nếu không chắc.

**Bảng việc đã làm và chưa làm**
| Việc | Trạng thái |
|---|---|
| Kiểm chứng ID khi nhập (khớp / chưa kiểm chứng / bất đồng), quyết định gắn với kết quả đã xem, kiểm lại trước khi ghi | Đã làm |
| Trạng thái Dạng và mức độ riêng, tệp phụ `id-review`, lịch sử, hết hiệu lực theo nội dung/Dạng/cây | Đã làm |
| Hàng đợi xác minh từng câu có phím tắt và hoàn tác | Đã làm |
| Sao lưu/khôi phục trạng thái (SQLite, JSON sao lưu, JSON trao đổi) có kiểm thử chéo Rust–TypeScript | Đã làm |
| Dọn bản phát hành an toàn, ghim beta.34 | Đã làm |
| Hàng đợi chạy nền cho lô rất lớn (tạm dừng/tiếp tục), nhớ vị trí hàng đợi giữa các phiên, phím tắt tuỳ biến | **Chưa làm** |
| Phân loại nhiều tầng tự động, “sổ tay phân loại” cho AI ngoài, đánh giá độc lập độ chính xác, tự gán theo nhóm | **Chưa làm** |
| Xác nhận AI một lần cho một công việc | **Chưa quyết, chưa làm** (vẫn xin phép từng lượt) |
| Cây chương trình mới (KNTT), ma trận đề, trộn đề, xuất Word | Ngoài phạm vi bản này |

**Giới hạn và lưu ý khi dùng**
- **Ngân hàng hiện có chưa có câu nào làm căn cứ** cho tới khi thầy/cô xác nhận Dạng (hàng đợi xác minh). Vì vậy câu nhập mới ban đầu phần lớn là “chưa kiểm chứng”; đó là chủ ý thận trọng, không phải lỗi.
- Ví dụ HEdu gửi kèm khi hỏi AI vẫn lấy câu có nội dung “Đã duyệt” (chỉ để tham khảo, không phải căn cứ xác minh).
- **Trước khi nâng cấp:** nên dùng Cài đặt → Lưu trữ SQLite → “Lưu bản chụp .db…”. HEdu cũng tự sao lưu trước khi cập nhật.
- **Quay về beta.34:** dữ liệu thêm một tệp phụ (`id-review`) mà beta.34 không hiểu nhưng không xóa; beta.34 mở được ngân hàng, chỉ không hiện/không cập nhật trạng thái xác minh. Nếu cần quay lại nguyên trạng, khôi phục từ bản chụp `.db` hoặc điểm khôi phục chụp trước khi nâng cấp. Bộ cài beta.34 vẫn còn trên trang Releases.
- Kiểm thử giao diện Tauri được điều khiển tự động qua cổng gỡ lỗi (không phải thao tác chuột/phím thủ công); chưa nghiệm thu với ngân hàng thật.

## Có gì mới trong beta.34 (kênh beta): Ngân hàng đề thi LaTeX
Gồm PR #112–#125 (so với beta.33). Chưa nghiệm thu máy Windows thật (checklist: claude/nghiem-thu-de-thi.md).
**Ngân hàng đề thi LaTeX (beta):** mục mới **Đề thi**: nhập đề `.tex`/thư mục dự án vào thư viện của HEdu (tệp gốc không bị sửa), thư mục ảo và bộ lọc, **Biên tập** nhiều tệp (CodeMirror, lưu an toàn, cảnh báo khi tệp đổi ngoài HEdu, bản nháp), **biên dịch PDF** bằng TeX Live (pdfLaTeX/XeLaTeX/LuaLaTeX, huỷ được cả cây tiến trình, giữ PDF tốt gần nhất), **xem PDF** ngay trong app, **PDF Đề và PDF Lời giải riêng** từ cùng một nguồn khi nhận diện chắc `ex_test`, chép câu **nguyên văn** từ Ngân hàng kèm nguồn UID, **Thùng rác đề** và **sao lưu/khôi phục thư viện đề** riêng, chốt đề, xuất/nhập gói. Không đổi cấu trúc dữ liệu ngân hàng câu hỏi (schema 3), ID, UID. Màn Tạo đề (trộn mã) vẫn tạm tắt. Sao lưu của Ngân hàng câu hỏi KHÔNG bao gồm thư viện đề: dùng "Sao lưu thư viện" trong mục Đề thi.

## Có gì mới trong beta.33 (kênh beta): dò trùng nhẹ hơn
Gồm PR #110 (so với beta.32). Không đổi schema (3), ID6, UID, LaTeX gốc, Rust; kết quả dò trùng không đổi (đã đối chiếu giống hệt bản cũ trên 602 câu).
- Chỉ mục dò trùng dùng ít bộ nhớ hơn khoảng 55% (đo 10.000 câu mô phỏng: 10,6 → 4,8 KB/câu), thời gian dựng tương đương. Lợi cho ngân hàng lớn và khi nhập nhiều câu.
- Giới hạn 5.000 câu mỗi lô nhập giữ nguyên cho đến khi đo trên ngân hàng thật.
- Chưa nghiệm thu máy Windows thật (checklist mục G, H, I trong claude/nghiem-thu-beta30.md).

## Có gì mới trong beta.32 (đã phát hành 25/10/2026, kênh beta; commit 68c0b70): nhập nhiều tệp, nhãn nguồn, báo cáo nhập
Gồm PR #104, #105, #107, #108 (so với beta.31). Không đổi schema (3), ID6, UID, LaTeX gốc, thuật toán dò trùng.
- **Nhập nhiều tệp / thư mục** (Nhập liệu → "Chọn nhiều tệp…", "Chọn thư mục…"): quét cả thư mục con, chỉ đọc, bắt buộc UTF-8 (tệp sai bảng mã báo riêng, không làm hỏng cả lô), bảng "Theo tệp", bỏ tick tệp không nhập, lọc câu theo tệp. Mỗi lô tối đa 5.000 câu (tạm, đến khi dò trùng nhẹ hơn).
- **Nhãn nguồn**: câu nhập có nhãn `Nguồn: <tệp>`, `Lô: <tên lô>`, tuỳ chọn `Thư mục: …` và nhãn tự đặt.
- **Báo cáo nhập**: sau khi nhập hiện màn "Kết quả nhập" (tìm thấy / đã nhập / bỏ qua vì trùng / bạn bỏ qua; vị trí theo ID, Dạng đầu, gợi ý, vị trí chung; lỗi xem trước; theo tệp); lưu .csv (Excel đọc được, không có nội dung câu) và .md; **Nhật ký nhập** 20 lần gần nhất ở Cài đặt → Dữ liệu & sao lưu (chỉ ở chế độ SQLite).
- **Ngân hàng**: ô lọc **Nhãn**, "Gắn nhãn…" hàng loạt (Thao tác khác), nút "Xem các câu vừa nhập".
- Chưa nghiệm thu máy Windows thật (checklist mục G, H, I trong claude/nghiem-thu-beta30.md). Dò trùng nhẹ (bỏ giới hạn 5.000 câu/lô), S6, hồ sơ/nhiều nguồn: chưa làm.

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
