// Kiểm thử xem trước LaTeX (Issue #9). Toàn bộ ví dụ là câu tự viết, KHÔNG dùng câu hỏi thật.
import { buildExTest, parseExTest } from './extest';
import { checkQuestion } from './check';
import { previewProblems, renderPartsEx, renderLatexText, type Part } from './render';
import { barePathProblems, sourceProblems } from './srcdiag';

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✗ ' + msg); }
}

const FIG = (n: number) => `\\begin{tikzpicture}[scale=.6]\n  \\draw (0,0)--(${n},0);\n\\end{tikzpicture}`;
const figs = (parts: Part[]) => parts.filter((p) => p.kind === 'figure').length;
const text = (parts: Part[]) => parts.filter((p) => p.kind === 'html').map((p) => (p as { html: string }).html).join('').replace(/<[^>]+>/g, ' ');
const all = (p: ReturnType<typeof parseExTest>) => [p.stem, p.figure ?? '', ...p.options.map((o) => o.text), p.solution ?? '', p.tail];
const countFigs = (p: ReturnType<typeof parseExTest>) => all(p).reduce((n, s) => n + renderPartsEx(s).figures, 0);

console.log('\\immini: hình ở nhóm thứ hai');
{
  // Giữa hai nhóm có xuống dòng và thụt lề — cách viết rất phổ biến.
  const p = parseExTest(`\\begin{ex}\n  \\immini{Đề bài $x$.\n    \\choice{\\True A}{B}{C}{D}}\n  {${FIG(2)}}\n  \\loigiai{ok}\n\\end{ex}`);
  ok(p.figure?.includes('\\draw (0,0)--(2,0)'), 'lấy được hình dù hai nhóm cách nhau bởi xuống dòng');
  ok(p.layout === 'immini' && p.options.length === 4, 'giữ bố cục hai cột và đủ 4 phương án');
  ok(countFigs(p) === 1, 'hình được hiện đúng 1 lần');
}
{
  const p = parseExTest(`\\begin{ex}\n  \\immini[thm]{Đề}{${FIG(1)}}\n  \\loigiai{\\immini{Giải bước 1}{${FIG(3)}}\\noindent Vậy xong.}\n\\end{ex}`);
  ok((p.figure?.match(/tikzpicture/g) ?? []).length === 2 && !p.figure?.includes('(3,0)'), 'hình trong lời giải KHÔNG bị kéo lên làm hình của đề');
  const sol = renderPartsEx(p.solution ?? '');
  ok(sol.figures === 1, 'hình trong lời giải vẫn hiện trong lời giải');
  ok(sol.parts.some((x) => x.kind === 'open' && x.cls.includes('tx-immini')), 'lời giải bày hai cột tại chỗ');
  ok(!/immini|noindent/.test(text(sol.parts)), 'không lộ \\immini, \\noindent');
}

console.log('Hình đặt sau \\choice (đứng giữa phương án và \\loigiai)');
{
  const src = `\\begin{ex}\n  Đề.\n  \\choice{\\True A}{B}{C}{D}\n  \\begin{center}\n${FIG(4)}\n  \\end{center}\n  \\loigiai{ok}\n\\end{ex}`;
  const p = parseExTest(src);
  ok(p.tail.includes('tikzpicture') && countFigs(p) === 1, 'hình đứng sau phương án không bị mất');
  ok(buildExTest(p).includes('\\draw (0,0)--(4,0)'), 'dựng lại câu vẫn còn hình đó (trộn đề không làm mất)');
}

console.log('\\resizebox, \\hspace, nhiều hình');
{
  const p = parseExTest(`\\begin{ex}\n  Đề.\n  \\begin{center}\n    \\resizebox{!}{6cm}{\n      \\newcommand{\\chuthich}[2][]{\\begin{tikzpicture}\\fill[#1] (0,0) rectangle (1,1); \\node {#2};\\end{tikzpicture}}\n      ${FIG(5)}}\n  \\end{center}\n  \\shortans{1}\n\\end{ex}`);
  const r = renderPartsEx(p.stem);
  const fig = r.parts.find((x) => x.kind === 'figure') as Extract<Part, { kind: 'figure' }> | undefined;
  ok(r.figures === 1 && fig?.size?.h === '6cm', 'hình trong \\resizebox hiện đúng, nhớ chiều cao 6cm');
  ok(!/[{}]|resizebox/.test(text(r.parts)), 'không lọt \\resizebox hay dấu { }');
  ok(/\\newcommand\{\\chuthich\}/.test(p.defs) && p.defs.includes('#2'), '\\newcommand có tham số đi cùng hình (không rơi mất #1, #2)');
  ok(!/newcommand/.test(p.stem), 'đề bài không dính \\newcommand');
}
{
  const body = [FIG(1), '\\hspace*{3cm}', FIG(2), '\\\\', FIG(3), '\\hspace{3cm}', FIG(4)].join('\n');
  const p = parseExTest(`\\begin{ex}\n  Chọn hình.\n  \\begin{center}\n${body}\n  \\end{center}\n  \\choice{\\True A}{B}{C}{D}\n\\end{ex}`);
  const r = renderPartsEx(p.stem);
  ok(r.figures === 4, '4 hình trong một khối center đều hiện');
  ok(!/hspace/.test(text(r.parts)) && r.unsupported.length === 0, 'không lọt \\hspace, không có lệnh lạ');
  ok(r.parts.some((x) => x.kind === 'html' && x.html.includes('tx-hs')), '\\hspace thành khoảng trống thật');
}

console.log('Hình cần lệnh chuẩn bị ngoài tikzpicture (tikz-3dplot)');
{
  const p = parseExTest(`\\begin{ex}\n  \\def\\dan{\\path (0,0) -- (1,1);}\n  \\tdplotsetmaincoords{70}{110}\n  Cho hình chóp.\n  \\begin{center}\n    \\begin{tikzpicture}[tdplot_main_coords]\\dan\\end{tikzpicture}\n  \\end{center}\n  \\choice{\\True A}{B}{C}{D}\n\\end{ex}`);
  ok(p.defs.includes('\\def\\dan') && p.defs.includes('\\tdplotsetmaincoords{70}{110}'), '\\def và \\tdplotsetmaincoords đi cùng hình');
  ok(!/tdplotset|\\def/.test(p.stem), 'chữ của đề không dính các lệnh đó');
}

console.log('Chữ, danh sách, bảng');
{
  const r = renderPartsEx('\\textbf{\\underline{Cách 1.}} {\\bf TH 1:} Gọi \\lq\\lq A\\rq\\rq \\quad xong\\break dòng mới\\\\ cuối. \\emph{nhấn} \\textit{\\textbf{đậm nghiêng}}');
  const h = r.parts.map((x) => (x as { html?: string }).html ?? '').join('');
  ok(r.unsupported.length === 0, 'các lệnh định dạng thường gặp đều hiểu');
  ok(/<b><u>Cách 1\.<\/u><\/b>/.test(h), '\\textbf lồng \\underline');
  ok(/<b>TH 1:<\/b>/.test(h), '{\\bf …} tác dụng trong nhóm');
  ok(h.includes('\u201C') && h.includes('\u201D'), '\\lq\\lq … \\rq\\rq thành dấu nháy kép');
  ok(!/[{}]|\\[a-z]/.test(h.replace(/<[^>]+>/g, '')), 'không lọt { } hay \\lệnh');
}
{
  const r = renderPartsEx('Xét:\n\\begin{itemchoice}\n \\itemch Ý một $x$\n \\itemch Ý hai\n\\end{itemchoice}\n\\begin{itemize}\\item Một \\item Hai\\end{itemize}\n\\begin{enumerate}[1)]\\item A\\item B\\end{enumerate}');
  const h = r.parts.map((x) => (x as { html?: string }).html ?? '').join('');
  ok(r.unsupported.length === 0 && /a\)/.test(h) && /b\)/.test(h) && /1\)/.test(h) && /2\)/.test(h), 'itemchoice → a) b); enumerate[1)] → 1) 2); itemize');
  const t = renderPartsEx(`\\begin{tabular}{|c|c|}\\hline x & y \\\\ \\hline ${FIG(1)} & ${FIG(2)} \\\\ \\hline \\end{tabular}`);
  ok(t.figures === 2 && t.unsupported.length === 0, 'hình nằm trong ô của bảng vẫn hiện (2/2)');
  const tb = renderPartsEx('\\begin{tabular}{|c|c|c|}\\hline a & b & c \\\\ \\hline & & d \\\\ \\hline \\end{tabular}');
  const tbHtml = tb.parts.map((x) => (x as { html?: string; cls?: string }).html ?? (x as { cls?: string }).cls ?? '').join('|');
  const ruleCells = (tbHtml.match(/tx-tr rule/g) ?? []).length;
  ok(ruleCells === 1, '\\hline cuối bảng tạo đúng 1 dòng kẻ cuối');
  const idx = tb.parts.findIndex((x) => /tx-tr rule/.test(JSON.stringify(x)));
  let cells = 0;
  for (let i = idx + 1; i < tb.parts.length; i++) { const s = JSON.stringify(tb.parts[i]); if (/tx-td/.test(s)) cells++; else if (/close/.test(s) && cells >= 3) break; }
  ok(cells >= 3, `dòng kẻ cuối phủ đủ ${cells}/3 cột (không chỉ cột đầu)`);
  const m = renderPartsEx('\\begin{align*} a &= b \\\\ c &= d \\end{align*} và \\begin{eqnarray*} x &=& 1 \\end{eqnarray*}');
  ok(m.unsupported.length === 0 && (m.parts.map((x) => (x as { html?: string }).html ?? '').join('').match(/katex/g) ?? []).length > 0, 'align*, eqnarray* ngoài $…$ dựng bằng công thức');
}

console.log('Không im lặng nuốt: lệnh lạ phải lộ ra');
{
  const p = parseExTest('\\begin{ex}\n  Đề \\lenhla{x} và $a$.\n  \\choice{\\True A}{B}{C}{D}\n\\end{ex}');
  const r = renderPartsEx(p.stem);
  ok(r.unsupported.includes('\\lenhla'), 'lệnh chưa hiểu được ghi lại');
  ok(renderLatexText(p.stem).includes('tx-unk'), 'và hiện ra trong xem trước');
  ok(previewProblems(p).length > 0, 'previewProblems báo “chưa dựng chuẩn”');
  ok(checkQuestion(p, 'raw').some((i) => i.level === 'canh' && /chưa dựng chuẩn/.test(i.message)), 'danh sách kiểm tra nhập liệu cảnh báo (không báo lỗi cứng)');
}

console.log('Báo lỗi mã nguồn có vị trí (không tự sửa)');
{
  const raw = '\\begin{ex}\n  Đề {chưa đóng\n  \\choice{\\True A}{B}{C}{D}\n\\end{ex}';
  const sp = sourceProblems(raw);
  ok(sp.length === 1 && sp[0].line === 2 && /\{/.test(sp[0].message), `ngoặc { không đóng báo đúng dòng 2 (cột ${sp[0]?.col})`);
  ok(sourceProblems(raw, 100)[0].line === 102, 'cộng số dòng của file lớn');
  ok(sourceProblems('\\begin{ex}\n \\begin{center}\n x\n\\end{ex}').some((s) => /center/.test(s.message)), '\\begin{center} thiếu \\end báo kèm dòng');
  ok(sourceProblems('\\begin{ex}%[0D2N1-2]\\immini{\n  Đề {a}\n\\end{ex}').length === 0, '“{” nằm sau %[ID] là chú thích, không bị đếm');
  const p = parseExTest('\\begin{ex}%[0D2N1-2]\\immini{\n  Đề\n  \\choice{\\True A}{B}{C}{D}\n\\end{ex}');
  ok(checkQuestion(p, '\\begin{ex}%[0D2N1-2]\\immini{\n  Đề\n  \\choice{\\True A}{B}{C}{D}\n\\end{ex}').some((i) => i.level === 'canh' && /%\[ID\]/.test(i.message)), 'nhắc: mã sau %[ID] cùng dòng bị TeX coi là chú thích');
}

console.log('Bảo toàn mã gốc của hình');
{
  const code = '\\begin{tikzpicture}\n  \\IntervalLR{a}{1}{b}{2}\n  \\tkzTabInit{x}{y}\n\\end{tikzpicture}';
  const p = parseExTest(`\\begin{ex}\n  Đề\n  \\begin{center}\n${code}\n  \\end{center}\n  \\choice{\\True A}{B}{C}{D}\n\\end{ex}`);
  const f = renderPartsEx(p.stem).parts.find((x) => x.kind === 'figure') as Extract<Part, { kind: 'figure' }>;
  ok(f.code === code, 'mã tikzpicture đưa sang trình dịch giữ nguyên từng ký tự');
  ok(previewProblems(p).length === 0, 'câu bình thường: không có cảnh báo “chưa dựng chuẩn”');
}

if (failed) { console.log(`\n${failed} kiểm thử xem trước lỗi`); process.exit(1); }
console.log('\nXem trước: đạt hết.');

console.log('Đường vẽ thiếu \\draw (TeX không vẽ gì)');
{
  const bad = '\\begin{ex}\n \\begin{tikzpicture}\n  \\def\\xmin{-1};\n  (\\xmin,0)--(4,0);\n  \\draw (0,0)--(1,1);\n \\end{tikzpicture}\n\\end{ex}';
  const r = barePathProblems(bad);
  ok(r.length === 1 && r[0].line === 4, `báo đúng dòng ${r[0]?.line} cho (\\xmin,0)--(4,0);`);
  const good = '\\begin{tikzpicture}\n \\draw (0,0)--(1,1);\n \\node at (0,0) {$(a,b)$};\n \\foreach \\x in {1,2} { \\draw (\\x,0)--(\\x,1); }\n \\path (0,0) edge (1,1);\n\\end{tikzpicture}';
  ok(barePathProblems(good).length === 0, 'mã đúng không bị báo nhầm');
  ok(barePathProblems('\\begin{tikzpicture}\n \\draw (0,0)\n (1,1)--(2,2);\n\\end{tikzpicture}').length === 0, 'đường vẽ nhiều dòng không bị báo nhầm');
}
