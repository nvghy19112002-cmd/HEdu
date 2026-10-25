import { compareLatex, DUP_KIND_LABEL, fingerprint, comparePair } from './dup2';
import { DUP_PAIRS, type DupKind } from './dupfixtures';

let failed = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };

console.log('Bộ so sánh dup2 trên bộ cặp thử khó (' + DUP_PAIRS.length + ' cặp)');
const kinds: DupKind[] = ['raw', 'same', 'conflict', 'near', 'template', 'unrelated', 'insufficient'];
const conf: Record<string, Record<string, number>> = {};
for (const k of kinds) { conf[k] = {}; for (const j of kinds) conf[k][j] = 0; }
for (const p of DUP_PAIRS) {
  const r = compareLatex(p.a, p.b);
  conf[p.expect][r.kind]++;
  const sym = compareLatex(p.b, p.a);
  ok(r.kind === p.expect, `${p.id}: ${p.note} → ${DUP_KIND_LABEL[r.kind]}${r.kind !== p.expect ? ` (mong đợi ${DUP_KIND_LABEL[p.expect]}; cờ: ${r.flags.join(', ')}; text=${r.text.toFixed(2)} math=${r.math.toFixed(2)})` : ''}`);
  ok(sym.kind === r.kind, `${p.id}: đối xứng (đảo hai câu cho cùng nhãn)`);
}

console.log('Chỉ số trên BỘ THỬ (không phải độ chính xác thực tế trên ngân hàng)');
const isSure = (k: DupKind) => k === 'raw' || k === 'same';
const falseExact = DUP_PAIRS.filter((p) => isSure(compareLatex(p.a, p.b).kind) && !isSure(p.expect)).length;
ok(falseExact === 0, `“trùng chắc chắn” sai: ${falseExact} trên bộ thử khó`);
const rel = (k: DupKind) => k === 'raw' || k === 'same' || k === 'near' || k === 'conflict';
let tp = 0, fp = 0, fn = 0;
for (const p of DUP_PAIRS) { const g = rel(compareLatex(p.a, p.b).kind), e = rel(p.expect); if (g && e) tp++; else if (g) fp++; else if (e) fn++; }
console.log(`  ℹ nhóm “liên quan” (raw/same/near/conflict): đúng ${tp}, báo nhầm ${fp}, bỏ sót ${fn} → precision ${(tp / Math.max(1, tp + fp)).toFixed(2)}, recall ${(tp / Math.max(1, tp + fn)).toFixed(2)}  [chỉ trên bộ thử]`);
console.log('  ℹ ma trận nhầm (hàng = mong đợi, cột = bộ dò):');
console.log('    ' + ''.padEnd(13) + kinds.map((k) => k.slice(0, 5).padStart(6)).join(''));
for (const k of kinds) console.log('    ' + k.padEnd(13) + kinds.map((j) => String(conf[k][j]).padStart(6)).join(''));

console.log('Hồi quy theo tài liệu thiết kế (mục 8.3)');
const ex = (b: string) => `\\begin{ex}\n${b}\n\\end{ex}`;
const cmp = (a: string, b: string) => compareLatex(ex(a), ex(b)).kind;
ok(cmp('Tính $\\frac{1}{23}$?\n\\choice{\\True $1$}{$2$}{$3$}{$4$}', 'Tính $\\frac{12}{3}$?\n\\choice{\\True $1$}{$2$}{$3$}{$4$}') !== 'same', '1. \\frac{1}{23} và \\frac{12}{3}: không “cùng câu”');
ok(cmp('Tìm $x$.\n\\choice{\\True $1$}{$2$}{$3$}{$4$}', 'Tìm $x$.\n\\choice{$1$}{\\True $2$}{$3$}{$4$}') === 'conflict', '2. \\True đổi chỗ: mâu thuẫn đáp án');
ok(cmp('Cho $x>0$. Tìm $x$.\\shortans{1}', 'Cho $x<0$. Tìm $x$.\\shortans{1}') === 'template', '4. x>0 và x<0: không trùng chắc');
ok(cmp('Tính $f(2)$ của hàm số đã cho.\\shortans{1}', 'Tính $f\'(2)$ của hàm số đã cho.\\shortans{1}') === 'template', '5. f(x) và f\'(x): không trùng chắc');
{
  const a = ex('Đạo hàm?\n\\choice{\\True $1$}{$2$}{$3$}{$4$}'), b = ex('Đạo hàm?\n\\choice{$2$}{\\True $1$}{$4$}{$3$}');
  ok(compareLatex(a, b).kind === 'same', '6. đảo phương án và đáp án đi theo → cùng câu');
}
ok(cmp('Cho hàm số $y=2x+1$. Tìm giá trị tại $x=1$.\\shortans{3}', 'Cho hàm số $y=3x+1$. Tìm giá trị tại $x=1$.\\shortans{4}') === 'template', '7. đổi hệ số: biến thể, không trùng');
{
  const t = 'Cho hàm số $y=x^2$ trên $\\mathbb{R}$. Mệnh đề nào đúng về hàm số?';
  const kinds4 = [ex(`${t}\n\\choice{\\True $1$}{$2$}{$3$}{$4$}`), ex(`${t}\n\\choiceTF{\\True $1$}{$2$}{$3$}{$4$}`), ex(`${t}\n\\shortans{1}`), ex(t)];
  let allNotSure = true;
  for (let i = 0; i < kinds4.length; i++) for (let j = i + 1; j < kinds4.length; j++) if (['raw', 'same'].includes(compareLatex(kinds4[i], kinds4[j]).kind)) allNotSure = false;
  ok(allNotSure, '8. bốn loại câu cùng đề chữ không bị coi là cùng câu');
}
{
  const a = '\\begin{ex}%[2D1H1-1]\nTìm $x$ biết $2x=4$.\\shortans{2}\n\\end{ex}', b = '\\begin{ex}%[1H3B5-2]\nTìm $x$ biết $2x=4$.\\shortans{2}\n\\end{ex}';
  ok(compareLatex(a, b).kind === 'same', '9. khác lớp/chương/ID nhưng cùng nội dung: vẫn phát hiện');
}
{
  const f1 = '\\fill (0,0) circle (1);', f2 = '\\fill (0,0) circle (2);';
  const im = (f: string) => ex(`\\immini{Tính diện tích hình tròn.\\choice{\\True $1$}{$2$}{$3$}{$4$}}{\\begin{tikzpicture}${f}\\end{tikzpicture}}`);
  const after = (f: string) => ex(`Tính diện tích hình tròn.\\choice{\\True $1$}{$2$}{$3$}{$4$}\n\\begin{tikzpicture}${f}\\end{tikzpicture}`);
  const inSol = (f: string) => ex(`Tính diện tích.\\shortans{1}\\loigiai{Ta có \\begin{tikzpicture}${f}\\end{tikzpicture} nên bằng 1.}`);
  const withDef = (d: string) => `\\begin{ex}\n\\def\\r{${d}}\nTính diện tích hình tròn.\\choice{\\True $1$}{$2$}{$3$}{$4$}\n\\end{ex}`;
  ok(compareLatex(im(f1), im(f2)).kind === 'template', '10a. hình trong \\immini được so');
  ok(compareLatex(after(f1), after(f2)).kind === 'template', '10b. hình sau \\choice được so');
  ok(compareLatex(withDef('1'), withDef('2')).kind !== 'same', '10c. \\def phụ thuộc không bị bỏ qua');
  ok(compareLatex(inSol(f1), inSol(f2)).kind === 'same', '10d. hình chỉ nằm trong lời giải không làm đổi nhãn đề');
}
ok(compareLatex('\\begin{ex}\nCho $x>1. Tìm x.\\shortans{2}\n\\end{ex}', '\\begin{ex}\nCho $x>1$. Tìm x.\\shortans{2}\n\\end{ex}').kind === 'insufficient', '11. câu lỗi cú pháp: chưa đủ bằng chứng, không kết luận');
{
  const a = fingerprint(ex('Tìm $x$.\\shortans{2}')), b = fingerprint(ex('Tìm $x$.\\shortans{2}  '));
  const r1 = comparePair(a, b), r2 = comparePair(a, b);
  ok(r1.kind === r2.kind && r1.score === r2.score, '14. chạy lại cho cùng kết quả');
}
ok(DUP_PAIRS.every((p) => !(['raw', 'same'].includes(compareLatex(p.a, p.b).kind) && /\\True/.test(p.a) !== /\\True/.test(p.b))), '15. không tự sửa \\True: so sánh không ghi gì (chỉ đọc)');


console.log('Không được làm mất chữ của đề khi bỏ tên môi trường / màu');
{
  const t = (c: string) => `\\begin{ex}\n${c}\n\\shortans{1}\n\\end{ex}`;
  ok(compareLatex(t('Tính \\textcolor{red}{giá trị lớn nhất} của $x$.'), t('Tính \\textcolor{red}{giá trị nhỏ nhất} của $x$.')).kind !== 'same', 'chữ trong \\textcolor vẫn được so (lớn nhất ≠ nhỏ nhất)');
  ok(compareLatex(t('\\begin{center}Tìm giá trị lớn nhất\\end{center}'), t('\\begin{center}Tìm giá trị nhỏ nhất\\end{center}')).kind !== 'same', 'chữ trong môi trường center vẫn được so');
  ok(compareLatex(t('\\begin{enumerate}[a)]\\item Tính $1+1$\\end{enumerate}'), t('\\begin{enumerate}[1)]\\item Tính $1+1$\\end{enumerate}')).kind === 'same', 'nhãn danh sách [a)] ≠ nội dung');
}

console.log('Dấu vân nhẹ (mã số thay chuỗi)');
{
  const BS = String.fromCharCode(92);
  const q = `${BS}begin{ex}Tính $x^2+x+1$ tại điểm, tính giá trị lớn nhất, tính giá trị lớn nhất.${BS}choice{${BS}True 1}{2}{3}{4}${BS}end{ex}`;
  const f = fingerprint(q);
  const sortedUnique = (a: Int32Array) => a.every((x, i) => i === 0 || a[i - 1] < x);
  ok(f.words instanceof Int32Array && f.mathGrams instanceof Int32Array && f.loose instanceof Int32Array, 'ba tập từ/công thức/nguồn thô là mảng mã số');
  ok(sortedUnique(f.words) && sortedUnique(f.mathGrams) && sortedUnique(f.loose) && f.words.length > 0, 'đã sắp và không trùng (từ lặp chỉ tính một lần)');
  const other = `${BS}begin{ex}Khác hẳn về nội dung.${BS}choice{${BS}True 5}{6}{7}{8}${BS}end{ex}`;
  ok(comparePair(f, fingerprint(q)).score === 1 && comparePair(f, fingerprint(other)).score < 1, 'giống hệt ⇒ điểm 1; khác ⇒ dưới 1');
}

if (failed) { console.log(`\n${failed} kiểm thử dup2 lỗi`); process.exit(1); }
console.log('dup2: đạt hết.');
