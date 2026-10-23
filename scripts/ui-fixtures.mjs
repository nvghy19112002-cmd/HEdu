// Dữ liệu GIẢ LẬP để chụp ảnh giao diện (PR-0 của UPDATE V3).
// Không phải dữ liệu thật của giáo viên; sinh ra xác định (cùng seed → cùng kết quả) nên ảnh trước/sau so được.
// Có đủ loại câu, hình TikZ, bảng, \immini, công thức dài, và vài cặp trùng để màn Kiểm tra trùng có kết quả.

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

const stems = [
  (a, b) => `Cho hàm số $y=x^3-${a}x+${b}$. Hàm số đã cho đồng biến trên khoảng nào dưới đây?`,
  (a, b) => `Tìm giá trị lớn nhất của hàm số $y=-x^2+${a}x+${b}$ trên tập số thực.`,
  (a, b) => `Có bao nhiêu cách chọn $${a}$ bạn từ một nhóm $${a + b}$ bạn để làm trực nhật?`,
  (a, b) => `Tính tích phân $\\displaystyle\\int_0^${a} (${b}x+1)\\,dx$.`,
  (a, b) => `Trong không gian $Oxyz$, cho điểm $A(${a};${b};1)$. Tính độ dài đoạn thẳng $OA$.`,
  (a, b) => `Giải phương trình $\\log_2(x+${a})=${b}$ trên tập số thực và cho biết số nghiệm.`,
];
const fmt = (n) => String(n);

function buildOne(i, rnd, loc) {
  const a = 2 + Math.floor(rnd() * 8), b = 1 + Math.floor(rnd() * 9);
  const stem = stems[i % stems.length](a, b);
  const kind = i % 10;
  const choices = [a, a + 1, b + 2, a + b].map((v) => `$${fmt(v)}$`);
  const lg = `\\loigiai{\n    Ta có $y'=3x^2-${a}$. Chọn đáp án đúng theo bảng xét dấu đạo hàm.\n  }`;
  let latex, type, level;
  if (kind <= 4) { // trắc nghiệm
    type = 'tn';
    level = ['NB', 'TH', 'VD', 'VDC'][i % 4];
    latex = `\\begin{ex}\n  ${stem}\n  \\choice\n  {\\True ${choices[0]}}\n  {${choices[1]}}\n  {${choices[2]}}\n  {${choices[3]}}\n  ${lg}\n\\end{ex}`;
  } else if (kind === 5) { // đúng/sai
    type = 'ds'; level = 'TH';
    latex = `\\begin{ex}\n  Cho hàm số $y=\\dfrac{x+${a}}{x-${b}}$. Xét tính đúng sai của các mệnh đề sau:\n  \\choiceTF\n  {\\True Tập xác định là $\\mathbb{R}\\setminus\\{${b}\\}$.}\n  {Hàm số đồng biến trên từng khoảng xác định.}\n  {\\True Tiệm cận đứng là $x=${b}$.}\n  {Tiệm cận ngang là $y=-1$.}\n  ${lg}\n\\end{ex}`;
  } else if (kind === 6) { // trả lời ngắn
    type = 'tln'; level = 'VD';
    latex = `\\begin{ex}\n  ${stem}\n  \\shortans{${a + b}}\n  ${lg}\n\\end{ex}`;
  } else if (kind === 7) { // có hình TikZ + \immini
    type = 'tn'; level = 'TH';
    latex = `\\begin{ex}\n  \\immini{\n    Cho hàm số $y=f(x)$ có đồ thị như hình vẽ. Số điểm cực trị của hàm số là\n    \\choice\n    {\\True $${a % 4 + 1}$}\n    {$${a % 4 + 2}$}\n    {$${a % 4 + 3}$}\n    {$0$}\n  }{\n    \\begin{tikzpicture}[scale=0.7]\n      \\draw[->] (-3,0)--(3,0) node[right]{$x$};\n      \\draw[->] (0,-2)--(0,3) node[above]{$y$};\n      \\draw[smooth,samples=60,domain=-2.4:2.4] plot (\\x,{0.2*\\x*\\x*\\x-0.9*\\x});\n    \\end{tikzpicture}\n  }\n  ${lg}\n\\end{ex}`;
  } else if (kind === 8) { // bảng
    type = 'tn'; level = 'NB';
    latex = `\\begin{ex}\n  Bảng sau cho biết điểm kiểm tra của một nhóm học sinh.\n  \\begin{center}\n    \\begin{tabular}{|c|c|c|c|c|}\n      \\hline Điểm & $5$ & $6$ & $7$ & $8$ \\\\\n      \\hline Số học sinh & ${a} & ${b} & ${a + b} & ${a * 2} \\\\\n      \\hline\n    \\end{tabular}\n  \\end{center}\n  Số học sinh có điểm không dưới $7$ là\n  \\choice\n  {\\True $${a + b + a * 2}$}\n  {$${a + b}$}\n  {$${a * 2}$}\n  {$${a}$}\n\\end{ex}`;
  } else { // công thức dài
    type = 'tln'; level = 'VDC';
    latex = `\\begin{ex}\n  Cho dãy số $(u_n)$ xác định bởi $u_1=${a}$, $u_{n+1}=\\dfrac{u_n^2+${b}u_n+${a * b}}{u_n+${b + 1}}+\\sqrt{\\dfrac{n^2+${a}n+${b}}{n^2+${b}n+${a}}}$ với mọi $n\\ge 1$. Tính $\\lim\\limits_{n\\to+\\infty}\\dfrac{u_n}{n}$.\n  \\shortans{${a}}\n\\end{ex}`;
  }
  const review = i % 7 === 0 ? 'approved' : i % 11 === 0 ? 'needs_fix' : undefined;
  return {
    uid: `ux${String(i + 1).padStart(5, '0')}`, seq: i + 1, latex, type, level, tags: [],
    createdAt: 1700000000000 + i, updatedAt: 1700000000000 + i,
    grade: loc.grade, chapterId: loc.chapterId, lessonId: loc.lessonId, formId: loc.formId,
    ...(review ? { review } : {}),
  };
}

/**
 * @param {{count?: number, seed?: number, locations: {grade:number,chapterId:string,lessonId:string,formId:string}[]}} o
 * `locations` lấy từ khung chương trình mặc định (để cây Chương → Bài có số đếm thật).
 */
export function makeBank({ count = 300, seed = 7, locations }) {
  if (!locations?.length) throw new Error('Cần danh sách vị trí (locations).');
  const rnd = lcg(seed);
  const qs = [];
  for (let i = 0; i < count; i++) qs.push(buildOne(i, rnd, locations[Math.floor(rnd() * locations.length)]));
  // cặp trùng cố ý: cứ 40 câu có 1 bản sao (khác khoảng trắng) để Kiểm tra trùng có kết quả
  for (let i = 5; i < count; i += 40) {
    const j = qs.length;
    const src = qs[i];
    qs.push({ ...src, uid: `ux${String(j + 1).padStart(5, '0')}`, seq: j + 1, latex: src.latex.replace('\n  ', '\n    ') });
  }
  return { schema: 3, questions: qs, nextSeq: qs.length + 1, taxonomy: null };
}
