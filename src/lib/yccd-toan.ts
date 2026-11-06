// Yêu cầu cần đạt theo Chương trình GDPT 2018 môn Toán (Thông tư 32/2018/TT-BGDĐT) cho từng BÀI của khung chương trình mặc định.
// Khoá = "lớp/phân môn/chương/bài" theo mã trong khung (vd "0/D/1/1" = Lớp 10 · Đại số · Chương 1 · Bài 1). `ten` để soát đúng bài.
// N = Nhận biết · H = Thông hiểu · V = Vận dụng (Vận dụng cao dùng chung V). Dữ liệu chỉ để điền trang "Bản đặc tả" của ma trận đề; thầy cô sửa trong Excel được.
export interface Yccd { ten: string; N: string[]; H: string[]; V: string[] }
export const YCCD_TOAN: Record<string, Yccd> = {
 "0/C/1/1": {
  "ten": "Bài 1. Hệ phương trình bậc nhất 3 ẩn và ứng dụng",
  "N": [
   "Nhận biết được khái niệm nghiệm của hệ phương trình bậc nhất ba ẩn."
  ],
  "H": [
   "Giải được hệ phương trình bậc nhất ba ẩn bằng phương pháp Gauss.",
   "Tìm được nghiệm hệ phương trình bậc nhất ba ẩn bằng máy tính cầm tay."
  ],
  "V": [
   "Vận dụng được cách giải hệ phương trình bậc nhất ba ẩn vào giải quyết một số bài toán Vật lí (tính điện trở, tính cường độ dòng điện trong dòng điện không đổi,...), Hoá học (cân bằng phản ứng,...), Sinh học (bài tập nguyên phân, giảm phân,...).",
   "Vận dụng được cách giải hệ phương trình bậc nhất ba ẩn để giải quyết một số vấn đề thực tiễn cuộc sống (ví dụ: bài toán lập kế hoạch sản xuất, mô hình cân bằng thị trường, phân bố vốn đầu tư,...)."
  ]
 },
 "0/C/2/1": {
  "ten": "Bài 1. Phương pháp quy nạp toán học",
  "N": [
   "Mô tả được các bước chứng minh tính đúng đắn của một mệnh đề toán học bằng phương pháp quy nạp."
  ],
  "H": [
   "Chứng minh được tính đúng đắn của một mệnh đề toán học bằng phương pháp quy nạp toán học."
  ],
  "V": [
   "Vận dụng được phương pháp quy nạp toán học để giải quyết một số vấn đề thực tiễn."
  ]
 },
 "0/D/0/1": {
  "ten": "Bài 1. Không gian mẫu và biến cố",
  "N": [
   "Nhận biết được một số khái niệm về xác suất cổ điển: phép thử ngẫu nhiên; không gian mẫu; biến cố (biến cố là tập con của không gian mẫu); biến cố đối."
  ],
  "H": [
   "Mô tả được không gian mẫu, biến cố trong một số thí nghiệm đơn giản (ví dụ: tung đồng xu hai lần, tung đồng xu ba lần, tung xúc xắc hai lần)."
  ],
  "V": [
   "Vận dụng được các khái niệm không gian mẫu, biến cố để mô tả một số tình huống ngẫu nhiên trong thực tiễn."
  ]
 },
 "0/D/0/2": {
  "ten": "Bài 2. Xác suất của biến cố",
  "N": [
   "Nhận biết được định nghĩa cổ điển của xác suất; nguyên lí xác suất bé."
  ],
  "H": [
   "Mô tả được các tính chất cơ bản của xác suất.",
   "Tính được xác suất của biến cố đối.",
   "Tính được xác suất của biến cố trong một số bài toán đơn giản bằng phương pháp tổ hợp (trường hợp xác suất phân bố đều)."
  ],
  "V": [
   "Tính được xác suất trong một số thí nghiệm lặp bằng cách sử dụng sơ đồ hình cây (ví dụ: tung xúc xắc hai lần, tính xác suất để tổng số chấm xuất hiện trong hai lần tung bằng 7)."
  ]
 },
 "0/D/1/1": {
  "ten": "Bài 1. Mệnh đề",
  "N": [
   "Phát biểu được các mệnh đề toán học, bao gồm: mệnh đề phủ định; mệnh đề đảo; mệnh đề tương đương; mệnh đề có chứa kí hiệu ∀, ∃; điều kiện cần, điều kiện đủ, điều kiện cần và đủ."
  ],
  "H": [
   "Thiết lập được các mệnh đề toán học, bao gồm: mệnh đề phủ định; mệnh đề đảo; mệnh đề tương đương; mệnh đề có chứa kí hiệu ∀, ∃; điều kiện cần, điều kiện đủ, điều kiện cần và đủ.",
   "Xác định được tính đúng/sai của một mệnh đề toán học trong những trường hợp đơn giản."
  ],
  "V": [
   "Vận dụng được các khái niệm về mệnh đề, điều kiện cần, điều kiện đủ để phát biểu và xác định tính đúng/sai của các mệnh đề toán học."
  ]
 },
 "0/D/1/2": {
  "ten": "Bài 2. Tập hợp",
  "N": [
   "Nhận biết được các khái niệm cơ bản về tập hợp (tập con, hai tập hợp bằng nhau, tập rỗng) và biết sử dụng các kí hiệu ⊂, ⊃, ∅."
  ],
  "H": [
   "Xác định được tập hợp (liệt kê các phần tử hoặc chỉ ra tính chất đặc trưng) và quan hệ giữa các tập hợp trong những trường hợp cụ thể."
  ],
  "V": [
   "Vận dụng được các khái niệm về tập hợp, tập con để giải quyết một số bài toán đơn giản."
  ]
 },
 "0/D/1/3": {
  "ten": "Bài 3. Các phép toán tập hợp",
  "N": [
   "Nhận biết được hợp, giao, hiệu của hai tập hợp, phần bù của một tập con."
  ],
  "H": [
   "Thực hiện được phép toán trên các tập hợp (hợp, giao, hiệu của hai tập hợp, phần bù của một tập con) và biết dùng biểu đồ Ven để biểu diễn chúng trong những trường hợp cụ thể."
  ],
  "V": [
   "Giải quyết được một số vấn đề thực tiễn gắn với phép toán trên tập hợp (ví dụ: những bài toán liên quan đến đếm số phần tử của hợp các tập hợp,...)."
  ]
 },
 "0/D/2/1": {
  "ten": "Bài 1. Bất phương trình bậc nhất hai ẩn",
  "N": [
   "Nhận biết được bất phương trình bậc nhất hai ẩn."
  ],
  "H": [
   "Biểu diễn được miền nghiệm của bất phương trình bậc nhất hai ẩn trên mặt phẳng toạ độ."
  ],
  "V": [
   "Vận dụng được kiến thức về bất phương trình bậc nhất hai ẩn vào giải quyết bài toán thực tiễn."
  ]
 },
 "0/D/2/2": {
  "ten": "Bài 2. Hệ bất phương trình bậc nhất hai ẩn",
  "N": [
   "Nhận biết được hệ bất phương trình bậc nhất hai ẩn."
  ],
  "H": [
   "Biểu diễn được miền nghiệm của hệ bất phương trình bậc nhất hai ẩn trên mặt phẳng toạ độ."
  ],
  "V": [
   "Vận dụng được kiến thức về hệ bất phương trình bậc nhất hai ẩn vào giải quyết bài toán thực tiễn (ví dụ: bài toán tìm cực trị của biểu thức F = ax + by trên một miền đa giác,...)."
  ]
 },
 "0/D/3/1": {
  "ten": "Bài 1. Hàm số và đồ thị",
  "N": [
   "Nhận biết được những mô hình thực tế (dạng bảng, biểu đồ, công thức) dẫn đến khái niệm hàm số."
  ],
  "H": [
   "Mô tả được các khái niệm cơ bản về hàm số: định nghĩa hàm số, tập xác định, tập giá trị, hàm số đồng biến, hàm số nghịch biến, đồ thị của hàm số.",
   "Mô tả được các đặc trưng hình học của đồ thị hàm số đồng biến, hàm số nghịch biến."
  ],
  "V": [
   "Vận dụng được kiến thức của hàm số vào giải quyết bài toán thực tiễn (ví dụ: xây dựng hàm số bậc nhất trên những khoảng khác nhau để tính số tiền y (phải trả) theo số phút gọi x đối với một gói cước điện thoại,...)."
  ]
 },
 "0/D/3/2": {
  "ten": "Bài 2. Hàm số bậc hai",
  "N": [
   "Nhận biết được các tính chất cơ bản của Parabola như đỉnh, trục đối xứng.",
   "Nhận biết được các tính chất của hàm số bậc hai thông qua đồ thị."
  ],
  "H": [
   "Thiết lập được bảng giá trị của hàm số bậc hai.",
   "Vẽ được Parabola (parabol) là đồ thị hàm số bậc hai.",
   "Giải thích được các tính chất của hàm số bậc hai thông qua đồ thị."
  ],
  "V": [
   "Vận dụng được kiến thức về hàm số bậc hai và đồ thị vào giải quyết bài toán thực tiễn (ví dụ: xác định độ cao của cầu, cổng có hình dạng Parabola,...)."
  ]
 },
 "0/D/6/1": {
  "ten": "Bài 1. Số gần đúng. Sai số",
  "N": [
   "Hiểu được khái niệm số gần đúng, sai số tuyệt đối."
  ],
  "H": [
   "Xác định được số gần đúng của một số với độ chính xác cho trước.",
   "Xác định được sai số tương đối của số gần đúng.",
   "Xác định được số quy tròn của số gần đúng với độ chính xác cho trước.",
   "Biết sử dụng máy tính cầm tay để tính toán với các số gần đúng."
  ],
  "V": [
   "Vận dụng được kiến thức về số gần đúng, sai số để giải quyết một số bài toán đo đạc, ước lượng trong thực tiễn."
  ]
 },
 "0/D/6/2": {
  "ten": "Bài 2. Mô tả và biểu diễn dữ liệu trên các bảng và biểu đồ",
  "N": [
   "Nhận biết được dữ liệu được mô tả và biểu diễn trên các bảng, biểu đồ."
  ],
  "H": [
   "Phát hiện và lí giải được số liệu không chính xác dựa trên mối liên hệ toán học đơn giản giữa các số liệu đã được biểu diễn trong nhiều ví dụ."
  ],
  "V": [
   "Vận dụng được việc đọc, mô tả và biểu diễn dữ liệu trên các bảng, biểu đồ để giải quyết một số vấn đề thực tiễn."
  ]
 },
 "0/D/6/3": {
  "ten": "Bài 3. Các số đặc trưng đo xu thế trung tâm của mẫu số liệu",
  "N": [
   "Nhận biết được các số đặc trưng đo xu thế trung tâm cho mẫu số liệu không ghép nhóm: số trung bình cộng, trung vị, tứ phân vị, mốt."
  ],
  "H": [
   "Tính được số đặc trưng đo xu thế trung tâm cho mẫu số liệu không ghép nhóm: số trung bình cộng (hay số trung bình), trung vị (median), tứ phân vị (quartiles), mốt (mode).",
   "Giải thích được ý nghĩa và vai trò của các số đặc trưng nói trên của mẫu số liệu trong thực tiễn."
  ],
  "V": [
   "Chỉ ra được những kết luận nhờ ý nghĩa của số đặc trưng nói trên của mẫu số liệu trong trường hợp đơn giản."
  ]
 },
 "0/D/6/4": {
  "ten": "Bài 4. Các số đặc trưng đo mức độ phân tán của mẫu số liệu",
  "N": [
   "Nhận biết được mối liên hệ giữa thống kê với những kiến thức của các môn học trong Chương trình lớp 10 và trong thực tiễn."
  ],
  "H": [
   "Tính được số đặc trưng đo mức độ phân tán cho mẫu số liệu không ghép nhóm: khoảng biến thiên, khoảng tứ phân vị, phương sai, độ lệch chuẩn.",
   "Giải thích được ý nghĩa và vai trò của các số đặc trưng nói trên của mẫu số liệu trong thực tiễn."
  ],
  "V": [
   "Chỉ ra được những kết luận nhờ ý nghĩa của số đặc trưng nói trên của mẫu số liệu trong trường hợp đơn giản."
  ]
 },
 "0/D/7/1": {
  "ten": "Bài 1. Dấu của tam thức bậc 2",
  "N": [
   "Nhận biết được tam thức bậc hai và dấu của tam thức bậc hai thông qua đồ thị của hàm số bậc hai."
  ],
  "H": [
   "Giải thích được định lí về dấu của tam thức bậc hai từ việc quan sát đồ thị của hàm bậc hai."
  ],
  "V": [
   "Vận dụng được định lí về dấu của tam thức bậc hai để giải quyết một số bài toán liên quan."
  ]
 },
 "0/D/7/2": {
  "ten": "Bài 2. Giải bất phương trình bậc 2 một ẩn",
  "N": [
   "Nhận biết được bất phương trình bậc hai một ẩn."
  ],
  "H": [
   "Giải được bất phương trình bậc hai."
  ],
  "V": [
   "Vận dụng được bất phương trình bậc hai một ẩn vào giải quyết bài toán thực tiễn (ví dụ: xác định chiều cao tối đa để xe có thể qua hầm có hình dạng Parabola,...)."
  ]
 },
 "0/D/7/3": {
  "ten": "Bài 3. Phương trình quy về phương trình bậc hai",
  "N": [
   "Nhận biết được phương trình chứa căn thức có dạng √(ax² + bx + c) = √(dx² + ex + f) và √(ax² + bx + c) = dx + e."
  ],
  "H": [
   "Giải được phương trình chứa căn thức có dạng: √(ax² + bx + c) = √(dx² + ex + f); √(ax² + bx + c) = dx + e."
  ],
  "V": [
   "Vận dụng được cách giải phương trình chứa căn thức vào giải quyết một số bài toán thực tiễn."
  ]
 },
 "0/D/8/1": {
  "ten": "Bài 1. Quy tắc cộng-quy tắc nhân",
  "N": [
   "Nhận biết được quy tắc cộng và quy tắc nhân trong các bài toán đếm cơ bản."
  ],
  "H": [
   "Vận dụng được quy tắc cộng và quy tắc nhân trong một số tình huống đơn giản (ví dụ: đếm số khả năng xuất hiện mặt sấp/ngửa khi tung một số đồng xu,...)."
  ],
  "V": [
   "Vận dụng được sơ đồ hình cây trong các bài toán đếm đơn giản các đối tượng trong Toán học, trong các môn học khác cũng như trong thực tiễn (ví dụ: đếm số hợp tử tạo thành trong Sinh học, hoặc đếm số trận đấu trong một giải thể thao,...)."
  ]
 },
 "0/D/8/2": {
  "ten": "Bài 2. Hoán vị. Chỉnh hợp. Tổ hợp",
  "N": [
   "Nhận biết được hoán vị, chỉnh hợp, tổ hợp."
  ],
  "H": [
   "Tính được số các hoán vị, chỉnh hợp, tổ hợp.",
   "Tính được số các hoán vị, chỉnh hợp, tổ hợp bằng máy tính cầm tay."
  ],
  "V": [
   "Vận dụng được hoán vị, chỉnh hợp, tổ hợp vào giải quyết một số bài toán đếm trong thực tiễn."
  ]
 },
 "0/D/8/3": {
  "ten": "Bài 3. Nhị thức Newton",
  "N": [
   "Nhận biết được công thức khai triển nhị thức Newton (a + b)ⁿ với n = 4 hoặc n = 5."
  ],
  "H": [
   "Khai triển được nhị thức Newton (a + b)ⁿ với số mũ thấp (n = 4 hoặc n = 5) bằng cách vận dụng tổ hợp."
  ],
  "V": [
   "Vận dụng được khai triển nhị thức Newton với số mũ thấp để giải quyết một số bài toán (ví dụ: tìm hệ số, tính tổng các hệ số,...)."
  ]
 },
 "0/H/4/1": {
  "ten": "Bài 1. Giá trị lượng giác của góc (0 − 180∘)",
  "N": [
   "Nhận biết được giá trị lượng giác của một góc từ 0° đến 180°."
  ],
  "H": [
   "Tính được giá trị lượng giác (đúng hoặc gần đúng) của một góc từ 0° đến 180° bằng máy tính cầm tay.",
   "Giải thích được hệ thức liên hệ giữa giá trị lượng giác của các góc phụ nhau, bù nhau."
  ],
  "V": [
   "Vận dụng được giá trị lượng giác của góc từ 0° đến 180° và các hệ thức liên hệ để giải một số bài toán."
  ]
 },
 "0/H/4/2": {
  "ten": "Bài 2. Định lý sin và định lý côsin",
  "N": [
   "Nhận biết được định lí côsin, định lí sin, công thức tính diện tích tam giác."
  ],
  "H": [
   "Giải thích được các hệ thức lượng cơ bản trong tam giác: định lí côsin, định lí sin, công thức tính diện tích tam giác."
  ],
  "V": [
   "Vận dụng được các hệ thức lượng trong tam giác để tính cạnh, góc, diện tích của tam giác trong một số bài toán."
  ]
 },
 "0/H/4/3": {
  "ten": "Bài 3. Giải tam giác và ứng dụng thực tế",
  "N": [
   "Nhận biết được các yếu tố cần biết để giải tam giác."
  ],
  "H": [
   "Mô tả được cách giải tam giác."
  ],
  "V": [
   "Vận dụng được cách giải tam giác vào việc giải một số bài toán có nội dung thực tiễn (ví dụ: xác định khoảng cách giữa hai địa điểm khi gặp vật cản, xác định chiều cao của vật khi không thể đo trực tiếp,...)."
  ]
 },
 "0/H/5/1": {
  "ten": "Bài 1. Khái niệm véctơ",
  "N": [
   "Nhận biết được khái niệm vectơ, vectơ bằng nhau, vectơ-không."
  ],
  "H": [
   "Biểu thị được một số đại lượng trong thực tiễn bằng vectơ."
  ],
  "V": [
   "Vận dụng được khái niệm vectơ, hai vectơ bằng nhau để giải một số bài toán hình học đơn giản."
  ]
 },
 "0/H/5/2": {
  "ten": "Bài 2. Tổng và hiệu của hai véctơ",
  "N": [
   "Nhận biết được tổng và hiệu của hai vectơ (quy tắc ba điểm, quy tắc hình bình hành, quy tắc hiệu)."
  ],
  "H": [
   "Thực hiện được các phép toán tổng và hiệu hai vectơ."
  ],
  "V": [
   "Sử dụng được vectơ và các phép toán trên vectơ để giải thích một số hiện tượng có liên quan đến Vật lí và Hoá học (ví dụ: những vấn đề liên quan đến lực, đến chuyển động,...)."
  ]
 },
 "0/H/5/3": {
  "ten": "Bài 3. Tích của một số với véctơ",
  "N": [
   "Nhận biết được định nghĩa và tính chất của tích một số với vectơ."
  ],
  "H": [
   "Thực hiện được phép toán tích của một số với vectơ và mô tả được những tính chất hình học (ba điểm thẳng hàng, trung điểm của đoạn thẳng, trọng tâm của tam giác,...) bằng vectơ."
  ],
  "V": [
   "Vận dụng được kiến thức về vectơ để giải một số bài toán hình học và một số bài toán liên quan đến thực tiễn."
  ]
 },
 "0/H/5/4": {
  "ten": "Bài 4. Tích vô hướng (chưa xét tọa độ)",
  "N": [
   "Nhận biết được định nghĩa tích vô hướng của hai vectơ."
  ],
  "H": [
   "Thực hiện được phép toán tích vô hướng của hai vectơ."
  ],
  "V": [
   "Vận dụng được kiến thức về vectơ để giải một số bài toán liên quan đến thực tiễn (ví dụ: xác định lực tác dụng lên vật,...)."
  ]
 },
 "0/H/9/1": {
  "ten": "Bài 1. Toạ độ của véctơ",
  "N": [
   "Nhận biết được toạ độ của vectơ đối với một hệ trục toạ độ."
  ],
  "H": [
   "Tìm được toạ độ của một vectơ, độ dài của một vectơ khi biết toạ độ hai đầu mút của nó.",
   "Sử dụng được biểu thức toạ độ của các phép toán vectơ trong tính toán."
  ],
  "V": [
   "Vận dụng được kiến thức về toạ độ của vectơ để giải một số bài toán liên quan đến thực tiễn (ví dụ: vị trí của vật trên mặt phẳng toạ độ,...)."
  ]
 },
 "0/H/9/2": {
  "ten": "Bài 2. Tích vô hướng (theo tọa độ)",
  "N": [
   "Nhận biết được biểu thức toạ độ của tích vô hướng hai vectơ."
  ],
  "H": [
   "Sử dụng được biểu thức toạ độ của tích vô hướng để tính độ dài vectơ, góc giữa hai vectơ."
  ],
  "V": [
   "Vận dụng được phương pháp toạ độ vào bài toán giải tam giác."
  ]
 },
 "0/H/9/3": {
  "ten": "Bài 3. Đường thẳng trong mặt phẳng toạ độ",
  "N": [
   "Mô tả được phương trình tổng quát và phương trình tham số của đường thẳng trong mặt phẳng toạ độ.",
   "Nhận biết được hai đường thẳng cắt nhau, song song, trùng nhau, vuông góc với nhau bằng phương pháp toạ độ."
  ],
  "H": [
   "Thiết lập được phương trình của đường thẳng trong mặt phẳng khi biết: một điểm và một vectơ pháp tuyến; một điểm và một vectơ chỉ phương; hai điểm.",
   "Thiết lập được công thức tính góc giữa hai đường thẳng.",
   "Tính được khoảng cách từ một điểm đến một đường thẳng bằng phương pháp toạ độ.",
   "Giải thích được mối liên hệ giữa đồ thị hàm số bậc nhất và đường thẳng trong mặt phẳng toạ độ."
  ],
  "V": [
   "Vận dụng được kiến thức về phương trình đường thẳng để giải một số bài toán có liên quan đến thực tiễn."
  ]
 },
 "0/H/9/4": {
  "ten": "Bài 4. Đường tròn trong mặt phẳng toạ độ",
  "N": [
   "Xác định được tâm và bán kính đường tròn khi biết phương trình của đường tròn."
  ],
  "H": [
   "Thiết lập được phương trình đường tròn khi biết toạ độ tâm và bán kính; biết toạ độ ba điểm mà đường tròn đi qua.",
   "Thiết lập được phương trình tiếp tuyến của đường tròn khi biết toạ độ của tiếp điểm."
  ],
  "V": [
   "Vận dụng được kiến thức về phương trình đường tròn để giải một số bài toán liên quan đến thực tiễn (ví dụ: bài toán về chuyển động tròn trong Vật lí,...)."
  ]
 },
 "0/H/9/5": {
  "ten": "Bài 5. Ba đường conic trong mặt phẳng toạ độ",
  "N": [
   "Nhận biết được ba đường conic bằng hình học.",
   "Nhận biết được phương trình chính tắc của ba đường conic trong mặt phẳng toạ độ."
  ],
  "H": [
   "Xác định được các yếu tố cơ bản (đỉnh, tiêu điểm, tiêu cự, độ dài trục) của ba đường conic khi biết phương trình chính tắc."
  ],
  "V": [
   "Giải quyết được một số vấn đề thực tiễn gắn với ba đường conic (ví dụ: giải thích một số hiện tượng trong Quang học,...)."
  ]
 },
 "1/C/1/1": {
  "ten": "Bài 1. Phép biến hình, phép dời hình và hai hình bằng nhau",
  "N": [
   "Nhận biết được khái niệm phép dời hình."
  ],
  "H": [
   "Xác định được ảnh của điểm, đoạn thẳng, tam giác, đường tròn qua một phép dời hình."
  ],
  "V": [
   "Vận dụng được các phép dời hình trong đồ hoạ và trong một số vấn đề thực tiễn (ví dụ: tạo các hoa văn, hình khối,...)."
  ]
 },
 "1/C/1/2": {
  "ten": "Bài 2. Phép tịnh tiến",
  "N": [
   "Nhận biết được tính chất của phép tịnh tiến."
  ],
  "H": [
   "Xác định được ảnh của điểm, đoạn thẳng, tam giác, đường tròn qua phép tịnh tiến."
  ],
  "V": [
   "Vận dụng được phép tịnh tiến trong đồ hoạ và trong một số vấn đề thực tiễn (ví dụ: tạo các hoa văn, hình khối,...)."
  ]
 },
 "1/C/1/3": {
  "ten": "Bài 3. Phép đối xứng trục",
  "N": [
   "Nhận biết được tính chất của phép đối xứng trục."
  ],
  "H": [
   "Xác định được ảnh của điểm, đoạn thẳng, tam giác, đường tròn qua phép đối xứng trục."
  ],
  "V": [
   "Vận dụng được phép đối xứng trục trong đồ hoạ và trong một số vấn đề thực tiễn (ví dụ: tạo các hoa văn, hình khối,...)."
  ]
 },
 "1/C/1/4": {
  "ten": "Bài 4. Phép đối xứng tâm",
  "N": [
   "Nhận biết được tính chất của phép đối xứng tâm."
  ],
  "H": [
   "Xác định được ảnh của điểm, đoạn thẳng, tam giác, đường tròn qua phép đối xứng tâm."
  ],
  "V": [
   "Vận dụng được phép đối xứng tâm trong đồ hoạ và trong một số vấn đề thực tiễn (ví dụ: tạo các hoa văn, hình khối,...)."
  ]
 },
 "1/C/1/5": {
  "ten": "Bài 5. Phép quay",
  "N": [
   "Nhận biết được tính chất của phép quay."
  ],
  "H": [
   "Xác định được ảnh của điểm, đoạn thẳng, tam giác, đường tròn qua phép quay."
  ],
  "V": [
   "Vận dụng được phép quay trong đồ hoạ và trong một số vấn đề thực tiễn (ví dụ: tạo các hoa văn, hình khối,...)."
  ]
 },
 "1/C/1/6": {
  "ten": "Bài 6. Phép vị tự",
  "N": [
   "Nhận biết được khái niệm phép đồng dạng phối cảnh (phép vị tự).",
   "Nhận biết được tính chất của phép vị tự."
  ],
  "H": [
   "Xác định được ảnh của điểm, đoạn thẳng, tam giác, đường tròn qua phép vị tự."
  ],
  "V": [
   "Vận dụng được phép vị tự trong đồ hoạ và trong một số vấn đề thực tiễn (ví dụ: tạo các hoa văn, hình khối,...)."
  ]
 },
 "1/C/1/7": {
  "ten": "Bài 7. Phép đồng dạng",
  "N": [
   "Nhận biết được khái niệm phép đồng dạng."
  ],
  "H": [
   "Xác định được ảnh của một hình qua phép đồng dạng (hợp thành của phép vị tự và phép dời hình)."
  ],
  "V": [
   "Vận dụng được phép đồng dạng trong đồ hoạ và trong một số vấn đề thực tiễn (ví dụ: tạo các hoa văn, hình khối,...)."
  ]
 },
 "1/C/2/1": {
  "ten": "Bài 1. Đồ thị",
  "N": [
   "Nhận biết được khái niệm đồ thị."
  ],
  "H": [
   "Xác định được các yếu tố của đồ thị (đỉnh, cạnh, bậc của đỉnh) trong một số mô hình xuất phát từ thực tiễn."
  ],
  "V": [
   "Sử dụng được kiến thức về đồ thị để giải quyết một số tình huống liên quan đến thực tiễn."
  ]
 },
 "1/C/2/2": {
  "ten": "Bài 2. Đường đi Euler và Harmilton",
  "N": [
   "Nhận biết được đường đi Euler, đường đi Hamilton từ đồ thị."
  ],
  "H": [
   "Xác định được đường đi Euler, đường đi Hamilton trong một số đồ thị đơn giản."
  ],
  "V": [
   "Sử dụng được kiến thức về đồ thị để giải quyết một số tình huống liên quan đến thực tiễn (ví dụ: xác định đường đi,...)."
  ]
 },
 "1/C/2/3": {
  "ten": "Bài 3. Bài toán tìm đường đi ngắn nhất",
  "N": [
   "Nhận biết được thuật toán về tìm đường đi tối ưu trong những trường hợp đơn giản."
  ],
  "H": [
   "Tìm được đường đi ngắn nhất trong một số đồ thị có trọng số đơn giản."
  ],
  "V": [
   "Sử dụng được kiến thức về đồ thị để giải quyết một số tình huống liên quan đến thực tiễn (ví dụ: xác định đường đi ngắn nhất,...)."
  ]
 },
 "1/C/3/1": {
  "ten": "Bài 1. Hình biểu diễn của một hình, khối",
  "N": [
   "Nhận biết được hình biểu diễn của một hình, khối."
  ],
  "H": [
   "Vẽ được hình biểu diễn của một số hình khối đơn giản."
  ],
  "V": [
   "Vận dụng được hình biểu diễn của hình, khối để mô tả một số vật thể trong thực tiễn."
  ]
 },
 "1/C/3/2": {
  "ten": "Bài 2. Bản vẽ kỹ thuật",
  "N": [
   "Nhận biết được một số nguyên tắc cơ bản của vẽ kĩ thuật."
  ],
  "H": [
   "Đọc được thông tin từ một số bản vẽ kĩ thuật đơn giản."
  ],
  "V": [
   "Vẽ được bản vẽ kĩ thuật đơn giản (gắn với phép chiếu song song và phép chiếu vuông góc)."
  ]
 },
 "1/D/1/1": {
  "ten": "Bài 1. Góc lượng giác",
  "N": [
   "Nhận biết được các khái niệm cơ bản về góc lượng giác: khái niệm góc lượng giác; số đo của góc lượng giác; hệ thức Chasles cho các góc lượng giác; đường tròn lượng giác."
  ],
  "H": [
   "Đổi được số đo của góc lượng giác giữa đơn vị độ và rađian; biểu diễn được góc lượng giác trên đường tròn lượng giác."
  ],
  "V": [
   "Giải quyết được một số vấn đề thực tiễn gắn với góc lượng giác."
  ]
 },
 "1/D/1/2": {
  "ten": "Bài 2. Giá trị lượng giác của một góc lượng giác",
  "N": [
   "Nhận biết được khái niệm giá trị lượng giác của một góc lượng giác."
  ],
  "H": [
   "Mô tả được bảng giá trị lượng giác của một số góc lượng giác thường gặp; hệ thức cơ bản giữa các giá trị lượng giác của một góc lượng giác; quan hệ giữa các giá trị lượng giác của các góc lượng giác có liên quan đặc biệt: bù nhau, phụ nhau, đối nhau, hơn kém nhau π.",
   "Sử dụng được máy tính cầm tay để tính giá trị lượng giác của một góc lượng giác khi biết số đo của góc đó."
  ],
  "V": [
   "Giải quyết được một số vấn đề thực tiễn gắn với giá trị lượng giác của góc lượng giác."
  ]
 },
 "1/D/1/3": {
  "ten": "Bài 3. Các công thức lượng giác",
  "N": [
   "Nhận biết được các công thức lượng giác: công thức cộng; công thức góc nhân đôi; công thức biến đổi tích thành tổng và công thức biến đổi tổng thành tích."
  ],
  "H": [
   "Mô tả được các phép biến đổi lượng giác cơ bản: công thức cộng; công thức góc nhân đôi; công thức biến đổi tích thành tổng và công thức biến đổi tổng thành tích."
  ],
  "V": [
   "Giải quyết được một số vấn đề thực tiễn gắn với các phép biến đổi lượng giác."
  ]
 },
 "1/D/1/4": {
  "ten": "Bài 4. Hàm số lượng giác và đồ thị",
  "N": [
   "Nhận biết được các khái niệm về hàm số chẵn, hàm số lẻ, hàm số tuần hoàn.",
   "Nhận biết được các đặc trưng hình học của đồ thị hàm số chẵn, hàm số lẻ, hàm số tuần hoàn.",
   "Nhận biết được định nghĩa các hàm lượng giác y = sin x, y = cos x, y = tan x, y = cot x thông qua đường tròn lượng giác."
  ],
  "H": [
   "Mô tả được bảng giá trị của bốn hàm số lượng giác đó trên một chu kì.",
   "Vẽ được đồ thị của các hàm số y = sin x, y = cos x, y = tan x, y = cot x.",
   "Giải thích được: tập xác định; tập giá trị; tính chất chẵn, lẻ; tính tuần hoàn; chu kì; khoảng đồng biến, nghịch biến của các hàm số y = sin x, y = cos x, y = tan x, y = cot x dựa vào đồ thị."
  ],
  "V": [
   "Giải quyết được một số vấn đề thực tiễn gắn với hàm số lượng giác (ví dụ: một số bài toán có liên quan đến dao động điều hoà trong Vật lí,...)."
  ]
 },
 "1/D/1/5": {
  "ten": "Bài 5. Phương trình lượng giác cơ bản",
  "N": [
   "Nhận biết được công thức nghiệm của phương trình lượng giác cơ bản: sin x = m; cos x = m; tan x = m; cot x = m bằng cách vận dụng đồ thị hàm số lượng giác tương ứng."
  ],
  "H": [
   "Tính được nghiệm gần đúng của phương trình lượng giác cơ bản bằng máy tính cầm tay.",
   "Giải được phương trình lượng giác ở dạng vận dụng trực tiếp phương trình lượng giác cơ bản (ví dụ: giải phương trình lượng giác dạng sin 2x = sin 3x, sin x = cos 3x)."
  ],
  "V": [
   "Giải quyết được một số vấn đề thực tiễn gắn với phương trình lượng giác (ví dụ: một số bài toán liên quan đến dao động điều hòa trong Vật lí,...)."
  ]
 },
 "1/D/2/1": {
  "ten": "Bài 1. Dãy số",
  "N": [
   "Nhận biết được dãy số hữu hạn, dãy số vô hạn.",
   "Nhận biết được tính chất tăng, giảm, bị chặn của dãy số trong những trường hợp đơn giản."
  ],
  "H": [
   "Thể hiện được cách cho dãy số bằng liệt kê các số hạng; bằng công thức tổng quát; bằng hệ thức truy hồi; bằng cách mô tả."
  ],
  "V": [
   "Vận dụng được kiến thức về dãy số để giải quyết một số bài toán liên quan đến thực tiễn."
  ]
 },
 "1/D/2/2": {
  "ten": "Bài 2. Cấp số cộng",
  "N": [
   "Nhận biết được một dãy số là cấp số cộng."
  ],
  "H": [
   "Giải thích được công thức xác định số hạng tổng quát của cấp số cộng.",
   "Tính được tổng của n số hạng đầu tiên của cấp số cộng."
  ],
  "V": [
   "Giải quyết được một số vấn đề thực tiễn gắn với cấp số cộng để giải một số bài toán liên quan đến thực tiễn (ví dụ: một số vấn đề trong Sinh học, trong Giáo dục dân số,...)."
  ]
 },
 "1/D/2/3": {
  "ten": "Bài 3. Cấp số nhân",
  "N": [
   "Nhận biết được một dãy số là cấp số nhân."
  ],
  "H": [
   "Giải thích được công thức xác định số hạng tổng quát của cấp số nhân.",
   "Tính được tổng của n số hạng đầu tiên của cấp số nhân."
  ],
  "V": [
   "Giải quyết được một số vấn đề thực tiễn gắn với cấp số nhân để giải một số bài toán liên quan đến thực tiễn (ví dụ: một số vấn đề trong Sinh học, trong Giáo dục dân số,...)."
  ]
 },
 "1/D/3/1": {
  "ten": "Bài 1. Giới hạn của dãy số",
  "N": [
   "Nhận biết được khái niệm giới hạn của dãy số."
  ],
  "H": [
   "Giải thích được một số giới hạn cơ bản như: lim 1/nᵏ = 0 (k ∈ ℕ*); lim qⁿ = 0 (|q| < 1); lim c = c với c là hằng số.",
   "Vận dụng được các phép toán giới hạn dãy số để tìm giới hạn của một số dãy số đơn giản (ví dụ: lim (2n + 1)/n; lim √(4n² + 1)/n).",
   "Tính được tổng của một cấp số nhân lùi vô hạn."
  ],
  "V": [
   "Vận dụng được tổng của một cấp số nhân lùi vô hạn để giải quyết một số tình huống thực tiễn giả định hoặc liên quan đến thực tiễn."
  ]
 },
 "1/D/3/2": {
  "ten": "Bài 2. Giới hạn của hàm số",
  "N": [
   "Nhận biết được khái niệm giới hạn hữu hạn của hàm số, giới hạn hữu hạn một phía của hàm số tại một điểm.",
   "Nhận biết được khái niệm giới hạn hữu hạn của hàm số tại vô cực và mô tả được một số giới hạn cơ bản như: lim (x → +∞) c/xᵏ = 0, lim (x → −∞) c/xᵏ = 0 với c là hằng số và k là số nguyên dương.",
   "Nhận biết được khái niệm giới hạn vô cực (một phía) của hàm số tại một điểm và hiểu được một số giới hạn cơ bản như: lim (x → a⁺) 1/(x − a) = +∞; lim (x → a⁻) 1/(x − a) = −∞."
  ],
  "H": [
   "Tính được một số giới hạn hàm số bằng cách vận dụng các phép toán trên giới hạn hàm số."
  ],
  "V": [
   "Giải quyết được một số vấn đề thực tiễn gắn với giới hạn hàm số."
  ]
 },
 "1/D/3/3": {
  "ten": "Bài 3. Hàm số liên tục",
  "N": [
   "Nhận dạng được hàm số liên tục tại một điểm, hoặc trên một khoảng, hoặc trên một đoạn.",
   "Nhận biết được tính liên tục của một số hàm sơ cấp cơ bản (như hàm đa thức, hàm phân thức, hàm căn thức, hàm lượng giác) trên tập xác định của chúng."
  ],
  "H": [
   "Nhận dạng được tính liên tục của tổng, hiệu, tích, thương của hai hàm số liên tục."
  ],
  "V": [
   "Vận dụng được tính liên tục của hàm số để giải quyết một số bài toán (ví dụ: tìm tham số để hàm số liên tục, chứng minh phương trình có nghiệm,...)."
  ]
 },
 "1/D/5/1": {
  "ten": "Bài 1. Số trung bình và mốt của mẫu số liệu ghép nhóm",
  "N": [
   "Nhận biết được mối liên hệ giữa thống kê với những kiến thức của các môn học khác trong Chương trình lớp 11 và trong thực tiễn."
  ],
  "H": [
   "Tính được số trung bình cộng (hay số trung bình), mốt (mode) của mẫu số liệu ghép nhóm.",
   "Hiểu được ý nghĩa và vai trò của các số đặc trưng nói trên của mẫu số liệu trong thực tiễn."
  ],
  "V": [
   "Rút ra được kết luận nhờ ý nghĩa của các số đặc trưng nói trên của mẫu số liệu trong trường hợp đơn giản."
  ]
 },
 "1/D/5/2": {
  "ten": "Bài 2. Trung vị và tứ phân vị của mẫu số liệu ghép nhóm",
  "N": [
   "Nhận biết được mối liên hệ giữa thống kê với những kiến thức của các môn học khác trong Chương trình lớp 11 và trong thực tiễn."
  ],
  "H": [
   "Tính được trung vị (median), tứ phân vị (quartiles) của mẫu số liệu ghép nhóm.",
   "Hiểu được ý nghĩa và vai trò của các số đặc trưng nói trên của mẫu số liệu trong thực tiễn."
  ],
  "V": [
   "Rút ra được kết luận nhờ ý nghĩa của các số đặc trưng nói trên của mẫu số liệu trong trường hợp đơn giản."
  ]
 },
 "1/D/6/1": {
  "ten": "Bài 1. Phép tính luỹ thừa",
  "N": [
   "Nhận biết được khái niệm luỹ thừa với số mũ nguyên của một số thực khác 0; luỹ thừa với số mũ hữu tỉ và luỹ thừa với số mũ thực của một số thực dương."
  ],
  "H": [
   "Giải thích được các tính chất của phép tính luỹ thừa với số mũ nguyên, luỹ thừa với số mũ hữu tỉ và luỹ thừa với số mũ thực.",
   "Sử dụng được tính chất của phép tính luỹ thừa trong tính toán các biểu thức số và rút gọn các biểu thức chứa biến (tính viết và tính nhẩm, tính nhanh một cách hợp lí).",
   "Tính được giá trị biểu thức số có chứa phép tính luỹ thừa bằng sử dụng máy tính cầm tay."
  ],
  "V": [
   "Giải quyết được một số vấn đề có liên quan đến môn học khác hoặc có liên quan đến thực tiễn gắn với phép tính luỹ thừa (ví dụ: bài toán về lãi suất, sự tăng trưởng,...)."
  ]
 },
 "1/D/6/2": {
  "ten": "Bài 2. Phép tính lôgarít",
  "N": [
   "Nhận biết được khái niệm lôgarit cơ số a (a > 0, a ≠ 1) của một số thực dương."
  ],
  "H": [
   "Giải thích được các tính chất của phép tính lôgarit nhờ sử dụng định nghĩa hoặc các tính chất đã biết trước đó.",
   "Sử dụng được tính chất của phép tính lôgarit trong tính toán các biểu thức số và rút gọn các biểu thức chứa biến (tính viết và tính nhẩm, tính nhanh một cách hợp lí).",
   "Tính được giá trị (đúng hoặc gần đúng) của lôgarit bằng cách sử dụng máy tính cầm tay."
  ],
  "V": [
   "Giải quyết được một số vấn đề có liên quan đến môn học khác hoặc có liên quan đến thực tiễn gắn với phép tính lôgarit (ví dụ: bài toán liên quan đến độ pH trong Hoá học,...)."
  ]
 },
 "1/D/6/3": {
  "ten": "Bài 3. Hàm số mũ. Hàm số lôgarít",
  "N": [
   "Nhận biết được hàm số mũ và hàm số lôgarit. Nêu được một số ví dụ thực tế về hàm số mũ, hàm số lôgarit.",
   "Nhận dạng được đồ thị của các hàm số mũ, hàm số lôgarit."
  ],
  "H": [
   "Giải thích được các tính chất của hàm số mũ, hàm số lôgarit thông qua đồ thị của chúng."
  ],
  "V": [
   "Giải quyết được một số vấn đề có liên quan đến môn học khác hoặc có liên quan đến thực tiễn gắn với hàm số mũ và hàm số lôgarit (ví dụ: lãi suất, sự tăng trưởng,...)."
  ]
 },
 "1/D/6/4": {
  "ten": "Bài 4. Phương trình, bất phương trình mũ và lôgarít",
  "N": [
   "Nhận biết được phương trình, bất phương trình mũ và lôgarit ở dạng đơn giản."
  ],
  "H": [
   "Giải được phương trình, bất phương trình mũ, lôgarit ở dạng đơn giản (ví dụ: 2ˣ⁺¹ = 1/4; 2ˣ⁺¹ = 2³ˣ⁺⁵; log₂(x + 1) = 3; log₃(x + 1) = log₃(x² − 1))."
  ],
  "V": [
   "Giải quyết được một số vấn đề có liên quan đến môn học khác hoặc có liên quan đến thực tiễn gắn với phương trình, bất phương trình mũ và lôgarit (ví dụ: bài toán liên quan đến độ pH, độ rung chấn,...)."
  ]
 },
 "1/D/7/1": {
  "ten": "Bài 1. Đạo hàm",
  "N": [
   "Nhận biết được một số bài toán dẫn đến khái niệm đạo hàm như: xác định vận tốc tức thời của một vật chuyển động không đều, xác định tốc độ thay đổi của nhiệt độ.",
   "Nhận biết được định nghĩa đạo hàm.",
   "Nhận biết được ý nghĩa hình học của đạo hàm.",
   "Nhận biết được số e thông qua bài toán mô hình hoá lãi suất ngân hàng."
  ],
  "H": [
   "Tính được đạo hàm của một số hàm đơn giản bằng định nghĩa.",
   "Thiết lập được phương trình tiếp tuyến của đồ thị hàm số tại một điểm thuộc đồ thị."
  ],
  "V": [
   "Vận dụng được ý nghĩa hình học, ý nghĩa vật lí của đạo hàm để giải quyết một số bài toán liên quan đến thực tiễn."
  ]
 },
 "1/D/7/2": {
  "ten": "Bài 2. Các quy tắc đạo hàm",
  "N": [
   "Nhận biết được các công thức tính đạo hàm của một số hàm số sơ cấp cơ bản."
  ],
  "H": [
   "Tính được đạo hàm của một số hàm số sơ cấp cơ bản (như hàm đa thức, hàm căn thức đơn giản, hàm số lượng giác, hàm số mũ, hàm số lôgarit).",
   "Sử dụng được các công thức tính đạo hàm của tổng, hiệu, tích, thương của các hàm số và đạo hàm của hàm hợp."
  ],
  "V": [
   "Giải quyết được một số vấn đề có liên quan đến môn học khác hoặc có liên quan đến thực tiễn gắn với đạo hàm (ví dụ: xác định vận tốc tức thời của một vật chuyển động không đều,...)."
  ]
 },
 "1/D/7/3": {
  "ten": "Bài 3. Đạo hàm cấp hai",
  "N": [
   "Nhận biết được khái niệm đạo hàm cấp hai của một hàm số."
  ],
  "H": [
   "Tính được đạo hàm cấp hai của một số hàm số đơn giản."
  ],
  "V": [
   "Giải quyết được một số vấn đề có liên quan đến môn học khác hoặc có liên quan đến thực tiễn gắn với đạo hàm cấp hai (ví dụ: xác định gia tốc từ đồ thị vận tốc theo thời gian của một chuyển động không đều,...)."
  ]
 },
 "1/D/9/1": {
  "ten": "Bài 1. Biến cố giao và quy tắc nhân xác suất",
  "N": [
   "Nhận biết được một số khái niệm về xác suất cổ điển: giao các biến cố; biến cố độc lập."
  ],
  "H": [
   "Tính được xác suất của biến cố giao bằng cách sử dụng công thức nhân (cho trường hợp biến cố độc lập)."
  ],
  "V": [
   "Tính được xác suất trong một số bài toán đơn giản bằng cách sử dụng sơ đồ hình cây."
  ]
 },
 "1/D/9/2": {
  "ten": "Bài 2. Biến cố hợp và quy tắc cộng xác suất",
  "N": [
   "Nhận biết được một số khái niệm về xác suất cổ điển: hợp các biến cố."
  ],
  "H": [
   "Tính được xác suất của biến cố hợp bằng cách sử dụng công thức cộng."
  ],
  "V": [
   "Tính được xác suất của biến cố trong một số bài toán đơn giản bằng phương pháp tổ hợp."
  ]
 },
 "1/H/4/1": {
  "ten": "Bài 1. Điểm, đường thẳng và mặt phẳng",
  "N": [
   "Nhận biết được các quan hệ liên thuộc cơ bản giữa điểm, đường thẳng, mặt phẳng trong không gian.",
   "Mô tả được ba cách xác định mặt phẳng (qua ba điểm không thẳng hàng; qua một đường thẳng và một điểm không thuộc đường thẳng đó; qua hai đường thẳng cắt nhau).",
   "Nhận biết được hình chóp, hình tứ diện."
  ],
  "H": [
   "Xác định được giao tuyến của hai mặt phẳng; giao điểm của đường thẳng và mặt phẳng."
  ],
  "V": [
   "Vận dụng được các tính chất về giao tuyến của hai mặt phẳng; giao điểm của đường thẳng và mặt phẳng vào giải bài tập.",
   "Vận dụng được kiến thức về đường thẳng, mặt phẳng trong không gian để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/4/2": {
  "ten": "Bài 2. Hai đường thẳng song song",
  "N": [
   "Nhận biết được vị trí tương đối của hai đường thẳng trong không gian: hai đường thẳng trùng nhau, song song, cắt nhau, chéo nhau trong không gian."
  ],
  "H": [
   "Giải thích được tính chất cơ bản về hai đường thẳng song song trong không gian."
  ],
  "V": [
   "Vận dụng được kiến thức về hai đường thẳng song song để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/4/3": {
  "ten": "Bài 3. Đường thẳng và mặt phẳng song song",
  "N": [
   "Nhận biết được đường thẳng song song với mặt phẳng."
  ],
  "H": [
   "Giải thích được điều kiện để đường thẳng song song với mặt phẳng.",
   "Giải thích được tính chất cơ bản về đường thẳng song song với mặt phẳng."
  ],
  "V": [
   "Vận dụng được kiến thức về đường thẳng song song với mặt phẳng để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/4/4": {
  "ten": "Bài 4. Hai mặt phẳng song song",
  "N": [
   "Nhận biết được hai mặt phẳng song song trong không gian."
  ],
  "H": [
   "Giải thích được điều kiện để hai mặt phẳng song song.",
   "Giải thích được tính chất cơ bản về hai mặt phẳng song song.",
   "Giải thích được định lí Thalès trong không gian."
  ],
  "V": [
   "Vận dụng được kiến thức về quan hệ song song để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/4/5": {
  "ten": "Bài 5. Hình lăng trụ và hình hộp (xiên)",
  "N": [
   "Nhận biết được hình lăng trụ và hình hộp."
  ],
  "H": [
   "Giải thích được tính chất cơ bản của lăng trụ và hình hộp."
  ],
  "V": [
   "Vận dụng được kiến thức về quan hệ song song để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/4/6": {
  "ten": "Bài 6. Phép chiếu song song",
  "N": [
   "Nhận biết được khái niệm và các tính chất cơ bản về phép chiếu song song."
  ],
  "H": [
   "Xác định được ảnh của một điểm, một đoạn thẳng, một tam giác, một đường tròn qua một phép chiếu song song.",
   "Vẽ được hình biểu diễn của một số hình khối đơn giản."
  ],
  "V": [
   "Sử dụng được kiến thức về phép chiếu song song để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/8/1": {
  "ten": "Bài 1. Hai đường thẳng vuông góc",
  "N": [
   "Nhận biết được khái niệm góc giữa hai đường thẳng trong không gian.",
   "Nhận biết được hai đường thẳng vuông góc trong không gian."
  ],
  "H": [
   "Chứng minh được hai đường thẳng vuông góc trong không gian trong một số trường hợp đơn giản."
  ],
  "V": [
   "Sử dụng được kiến thức về hai đường thẳng vuông góc để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/8/2": {
  "ten": "Bài 2. Đường thẳng vuông góc với mặt phẳng",
  "N": [
   "Nhận biết được đường thẳng vuông góc với mặt phẳng."
  ],
  "H": [
   "Xác định được điều kiện để đường thẳng vuông góc với mặt phẳng.",
   "Giải thích được định lí ba đường vuông góc.",
   "Giải thích được mối liên hệ giữa tính song song và tính vuông góc của đường thẳng và mặt phẳng."
  ],
  "V": [
   "Vận dụng được kiến thức về đường thẳng vuông góc với mặt phẳng để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/8/3": {
  "ten": "Bài 3. Phép chiếu vuông góc",
  "N": [
   "Nhận biết được khái niệm phép chiếu vuông góc."
  ],
  "H": [
   "Xác định được hình chiếu vuông góc của một điểm, một đường thẳng, một tam giác."
  ],
  "V": [
   "Vận dụng được kiến thức về phép chiếu vuông góc để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/8/4": {
  "ten": "Bài 4. Hai mặt phẳng vuông góc",
  "N": [
   "Nhận biết được hai mặt phẳng vuông góc trong không gian."
  ],
  "H": [
   "Xác định được điều kiện để hai mặt phẳng vuông góc.",
   "Giải thích được tính chất cơ bản về hai mặt phẳng vuông góc."
  ],
  "V": [
   "Vận dụng được kiến thức về hai mặt phẳng vuông góc để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/8/5": {
  "ten": "Bài 5. Khoảng cách",
  "N": [
   "Nhận biết được đường vuông góc chung của hai đường thẳng chéo nhau."
  ],
  "H": [
   "Xác định được khoảng cách từ một điểm đến một đường thẳng; khoảng cách từ một điểm đến một mặt phẳng; khoảng cách giữa hai đường thẳng song song; khoảng cách giữa đường thẳng và mặt phẳng song song; khoảng cách giữa hai mặt phẳng song song trong những trường hợp đơn giản.",
   "Tính được khoảng cách giữa hai đường thẳng chéo nhau trong những trường hợp đơn giản (ví dụ: có một đường thẳng vuông góc với mặt phẳng chứa đường thẳng còn lại)."
  ],
  "V": [
   "Sử dụng được kiến thức về khoảng cách trong không gian để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/8/6": {
  "ten": "Bài 6. Góc giữa đường thẳng và mặt phẳng. Góc nhị diện",
  "N": [
   "Nhận biết được khái niệm góc giữa đường thẳng và mặt phẳng.",
   "Nhận biết được khái niệm góc nhị diện, góc phẳng nhị diện."
  ],
  "H": [
   "Xác định và tính được góc giữa đường thẳng và mặt phẳng trong những trường hợp đơn giản (ví dụ: đã biết hình chiếu vuông góc của đường thẳng lên mặt phẳng).",
   "Xác định và tính được số đo góc nhị diện, góc phẳng nhị diện trong những trường hợp đơn giản (ví dụ: nhận biết được mặt phẳng vuông góc với cạnh nhị diện)."
  ],
  "V": [
   "Sử dụng được kiến thức về góc giữa đường thẳng và mặt phẳng, góc nhị diện để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "1/H/8/7": {
  "ten": "Bài 7. Hình lăng trụ đứng. Hình chóp đều. Thể tích",
  "N": [
   "Nhận biết được công thức tính thể tích của hình chóp, hình lăng trụ, hình hộp.",
   "Nhận biết được hình chóp cụt đều."
  ],
  "H": [
   "Giải thích được tính chất cơ bản của hình lăng trụ đứng, lăng trụ đều, hình hộp đứng, hình hộp chữ nhật, hình lập phương, hình chóp đều.",
   "Tính được thể tích của hình chóp, hình lăng trụ, hình hộp trong những trường hợp đơn giản (ví dụ: nhận biết được đường cao và diện tích mặt đáy của hình chóp).",
   "Tính được thể tích khối chóp cụt đều."
  ],
  "V": [
   "Vận dụng được kiến thức về hình chóp cụt đều để mô tả một số hình ảnh trong thực tiễn."
  ]
 },
 "2/D/1/1": {
  "ten": "Bài 1. Sự đồng biến và nghịch biến của hàm số",
  "N": [
   "Nhận biết được tính đồng biến, nghịch biến của một hàm số trên một khoảng dựa vào dấu của đạo hàm cấp một của nó.",
   "Nhận biết được tính đơn điệu của hàm số thông qua bảng biến thiên hoặc thông qua hình ảnh hình học của đồ thị hàm số."
  ],
  "H": [
   "Thể hiện được tính đồng biến, nghịch biến của hàm số trong bảng biến thiên."
  ],
  "V": [
   "Vận dụng được tính đơn điệu của hàm số để giải quyết một số vấn đề liên quan đến thực tiễn."
  ]
 },
 "2/D/1/2": {
  "ten": "Bài 2. Cực trị của hàm số",
  "N": [
   "Nhận biết được điểm cực trị, giá trị cực trị của hàm số thông qua bảng biến thiên hoặc thông qua hình ảnh hình học của đồ thị hàm số."
  ],
  "H": [
   "Xác định được điểm cực trị, giá trị cực trị của hàm số bằng đạo hàm trong những trường hợp đơn giản."
  ],
  "V": [
   "Vận dụng được đạo hàm và khảo sát hàm số để giải quyết một số vấn đề liên quan đến thực tiễn."
  ]
 },
 "2/D/1/3": {
  "ten": "Bài 3. Giá trị lớn nhất và giá trị nhỏ nhất của hàm số",
  "N": [
   "Nhận biết được giá trị lớn nhất, giá trị nhỏ nhất của hàm số trên một tập xác định cho trước."
  ],
  "H": [
   "Xác định được giá trị lớn nhất, giá trị nhỏ nhất của hàm số bằng đạo hàm trong những trường hợp đơn giản."
  ],
  "V": [
   "Vận dụng được đạo hàm và khảo sát hàm số để giải quyết một số vấn đề liên quan đến thực tiễn."
  ]
 },
 "2/D/1/4": {
  "ten": "Bài 4. Đường tiệm cận",
  "N": [
   "Nhận biết được hình ảnh hình học của đường tiệm cận ngang, đường tiệm cận đứng, đường tiệm cận xiên của đồ thị hàm số."
  ],
  "H": [
   "Xác định được đường tiệm cận ngang, đường tiệm cận đứng, đường tiệm cận xiên của đồ thị hàm số."
  ],
  "V": [
   "Vận dụng được đường tiệm cận của đồ thị hàm số để giải quyết một số vấn đề liên quan đến thực tiễn."
  ]
 },
 "2/D/1/5": {
  "ten": "Bài 5. Khảo sát sự biến thiên và vẽ đồ thị hàm số",
  "N": [
   "Mô tả được sơ đồ tổng quát để khảo sát hàm số (tìm tập xác định, xét chiều biến thiên, tìm cực trị, tìm tiệm cận, lập bảng biến thiên, vẽ đồ thị).",
   "Nhận biết được tính đối xứng (trục đối xứng, tâm đối xứng) của đồ thị các hàm số."
  ],
  "H": [
   "Khảo sát được tập xác định, chiều biến thiên, cực trị, tiệm cận, bảng biến thiên và vẽ đồ thị của các hàm số: y = ax³ + bx² + cx + d (a ≠ 0); y = (ax + b)/(cx + d) (c ≠ 0, ad − bc ≠ 0); y = (ax² + bx + c)/(mx + n) (a ≠ 0, m ≠ 0 và đa thức tử không chia hết cho đa thức mẫu)."
  ],
  "V": [
   "Vận dụng được đạo hàm và khảo sát hàm số để giải quyết một số vấn đề liên quan đến thực tiễn."
  ]
 },
 "2/D/3/1": {
  "ten": "Bài 1. Khoảng biến thiên, khoảng tứ phân vị của mẫu số liệu ghép nhóm",
  "N": [
   "Nhận biết được mối liên hệ giữa thống kê với những kiến thức của các môn học khác trong Chương trình lớp 12 và trong thực tiễn."
  ],
  "H": [
   "Tính được khoảng biến thiên, khoảng tứ phân vị của mẫu số liệu ghép nhóm.",
   "Giải thích được ý nghĩa và vai trò của các số đặc trưng nói trên của mẫu số liệu trong thực tiễn."
  ],
  "V": [
   "Chỉ ra được những kết luận nhờ ý nghĩa của các số đặc trưng nói trên của mẫu số liệu trong trường hợp đơn giản."
  ]
 },
 "2/D/3/2": {
  "ten": "Bài 2. Phương sai, độ lệch chuẩn của mẫu số liệu ghép nhóm",
  "N": [
   "Nhận biết được mối liên hệ giữa thống kê với những kiến thức của các môn học khác trong Chương trình lớp 12 và trong thực tiễn."
  ],
  "H": [
   "Tính được phương sai, độ lệch chuẩn của mẫu số liệu ghép nhóm.",
   "Giải thích được ý nghĩa và vai trò của các số đặc trưng nói trên của mẫu số liệu trong thực tiễn."
  ],
  "V": [
   "Chỉ ra được những kết luận nhờ ý nghĩa của các số đặc trưng nói trên của mẫu số liệu trong trường hợp đơn giản."
  ]
 },
 "2/D/4/1": {
  "ten": "Bài 1. Nguyên hàm",
  "N": [
   "Nhận biết được khái niệm nguyên hàm của một hàm số."
  ],
  "H": [
   "Giải thích được tính chất cơ bản của nguyên hàm.",
   "Xác định được nguyên hàm của một số hàm số sơ cấp như: y = x^α (α ≠ −1); y = 1/x; y = sin x; y = cos x; y = 1/cos²x; y = 1/sin²x; y = aˣ (a > 0, a ≠ 1); y = eˣ.",
   "Tính được nguyên hàm trong những trường hợp đơn giản."
  ],
  "V": [
   "Vận dụng được nguyên hàm để giải một số bài toán có liên quan đến thực tiễn."
  ]
 },
 "2/D/4/2": {
  "ten": "Bài 2. Tích phân",
  "N": [
   "Nhận biết được định nghĩa và các tính chất của tích phân."
  ],
  "H": [
   "Tính được tích phân trong những trường hợp đơn giản."
  ],
  "V": [
   "Vận dụng được tích phân để giải một số bài toán có liên quan đến thực tiễn."
  ]
 },
 "2/D/4/3": {
  "ten": "Bài 3. Ứng dụng thực tế và hình học của tích phân",
  "N": [
   "Nhận biết được công thức tính diện tích hình phẳng, thể tích khối tròn xoay bằng tích phân."
  ],
  "H": [
   "Sử dụng được tích phân để tính diện tích của một số hình phẳng, thể tích của một số hình khối."
  ],
  "V": [
   "Vận dụng được tích phân để giải một số bài toán có liên quan đến thực tiễn."
  ]
 },
 "2/D/6/1": {
  "ten": "Bài 1. Xác suất có điều kiện",
  "N": [
   "Nhận biết được khái niệm về xác suất có điều kiện."
  ],
  "H": [
   "Giải thích được ý nghĩa của xác suất có điều kiện trong những tình huống thực tiễn quen thuộc."
  ],
  "V": [
   "Sử dụng được sơ đồ hình cây để tính xác suất có điều kiện trong một số bài toán thực tiễn liên quan tới thống kê."
  ]
 },
 "2/D/6/2": {
  "ten": "Bài 2. Công thức xác suất toàn phần. Công thức Bayes",
  "N": [
   "Mô tả được công thức xác suất toàn phần, công thức Bayes thông qua bảng dữ liệu thống kê 2×2 và sơ đồ hình cây."
  ],
  "H": [
   "Sử dụng được công thức Bayes để tính xác suất có điều kiện."
  ],
  "V": [
   "Vận dụng được công thức Bayes vào một số bài toán thực tiễn.",
   "Sử dụng được sơ đồ hình cây để tính xác suất có điều kiện trong một số bài toán thực tiễn liên quan tới thống kê."
  ]
 },
 "2/H/2/1": {
  "ten": "Bài 1. Véc-tơ và các phép toán véc-tơ trong không gian (chưa toạ độ hoá)",
  "N": [
   "Nhận biết được vectơ và các phép toán vectơ trong không gian (tổng và hiệu của hai vectơ, tích của một số với một vectơ, tích vô hướng của hai vectơ)."
  ],
  "H": [
   "Thực hiện được các phép toán vectơ trong không gian (tổng và hiệu của hai vectơ, tích của một số với một vectơ, tích vô hướng của hai vectơ)."
  ],
  "V": [
   "Vận dụng được vectơ và các phép toán vectơ trong không gian để giải một số bài toán có liên quan đến thực tiễn."
  ]
 },
 "2/H/2/2": {
  "ten": "Bài 2. Toạ độ của véc-tơ và các công thức",
  "N": [
   "Nhận biết được toạ độ của một vectơ đối với hệ trục toạ độ."
  ],
  "H": [
   "Xác định được độ dài của một vectơ khi biết toạ độ hai đầu mút của nó.",
   "Xác định được biểu thức toạ độ của các phép toán vectơ."
  ],
  "V": [
   "Vận dụng được toạ độ của vectơ để giải một số bài toán có liên quan đến thực tiễn."
  ]
 },
 "2/H/5/1": {
  "ten": "Bài 1. Phương trình mặt phẳng",
  "N": [
   "Nhận biết được phương trình tổng quát của mặt phẳng."
  ],
  "H": [
   "Thiết lập được phương trình tổng quát của mặt phẳng trong hệ trục toạ độ Oxyz theo một trong ba cách cơ bản: qua một điểm và biết vectơ pháp tuyến; qua một điểm và biết cặp vectơ chỉ phương (suy ra vectơ pháp tuyến nhờ vào việc tìm vectơ vuông góc với cặp vectơ chỉ phương); qua ba điểm không thẳng hàng.",
   "Thiết lập được điều kiện để hai mặt phẳng song song, vuông góc với nhau.",
   "Tính được khoảng cách từ một điểm đến một mặt phẳng bằng phương pháp toạ độ."
  ],
  "V": [
   "Vận dụng được kiến thức về phương trình mặt phẳng để giải một số bài toán liên quan đến thực tiễn."
  ]
 },
 "2/H/5/2": {
  "ten": "Bài 2. Phương trình đường thẳng trong không gian",
  "N": [
   "Nhận biết được phương trình chính tắc, phương trình tham số, vectơ chỉ phương của đường thẳng trong không gian."
  ],
  "H": [
   "Thiết lập được phương trình của đường thẳng trong hệ trục toạ độ theo một trong hai cách cơ bản: qua một điểm và biết một vectơ chỉ phương, qua hai điểm.",
   "Xác định được điều kiện để hai đường thẳng chéo nhau, cắt nhau, song song hoặc vuông góc với nhau.",
   "Thiết lập được công thức tính góc giữa hai đường thẳng, giữa đường thẳng và mặt phẳng, giữa hai mặt phẳng."
  ],
  "V": [
   "Vận dụng được kiến thức về phương trình đường thẳng trong không gian để giải một số bài toán liên quan đến thực tiễn."
  ]
 },
 "2/H/5/3": {
  "ten": "Bài 3. Phương trình mặt cầu trong không gian",
  "N": [
   "Nhận biết được phương trình mặt cầu."
  ],
  "H": [
   "Xác định được tâm, bán kính của mặt cầu khi biết phương trình của nó.",
   "Thiết lập được phương trình của mặt cầu khi biết tâm và bán kính."
  ],
  "V": [
   "Vận dụng được kiến thức về phương trình mặt cầu để giải một số bài toán liên quan đến thực tiễn."
  ]
 }
};
