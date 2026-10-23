## Đang chờ phát hành (V5, chưa có số bản): Mục lục & Bộ lọc luôn là ô chọn
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
