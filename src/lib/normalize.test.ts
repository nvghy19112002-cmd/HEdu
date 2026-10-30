import { normalizeEx, splitExBlocksAt } from './extest';
import { sourceIssues } from './importbatch';
import { readLatexId } from './idsync';
import { getTaxonomy } from './curriculum';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const ex = (n: number) => `\\begin{ex}\n  Câu ${n}: tính $x$.   \n  \\choice{\\True 1}{2}{3}{4}\n\\end{ex}`;

console.log('Chuẩn hoá khi nạp .tex');
{
  const r = normalizeEx(`\\documentclass{book}\n\\begin{document}\n\\chapter{Hàm số}\nĐề kiểm tra 15 phút\n${ex(1)}\n\n${ex(2)}\n\\end{document}\n`);
  ok(r.blocks.length === 2, 'chỉ bốc các khối ex, bỏ phần mở đầu/chương');
  ok(r.issues.some((i) => i.kind === 'ngoai-khoi' && /1 dòng/.test(i.message)), 'báo số dòng ngoài khối bị bỏ');
  ok(!/ +\n/.test(r.blocks[0].text), 'cắt khoảng trắng cuối dòng');
  ok(r.blocks[0].line === 5 && r.blocks[1].line === 10, 'số dòng đúng');
}
{
  const r = normalizeEx(`${ex(1)}\n%${ex(2).split('\n')[0]}\n% Câu cũ\n%\\end{ex}\n${ex(3)}`);
  ok(r.blocks.length === 2 && r.issues.filter((i) => i.kind === 'chu-thich').length === 2, 'khối bị comment % không được nhập, có báo');
}
{
  const r = normalizeEx(`\\begin{ex}\nCâu dở\n${ex(2)}\n${ex(3)}`);
  ok(r.blocks.length === 2 && r.blocks[0].text.includes('Câu 2') && !r.blocks[0].text.includes('Câu dở'), 'thiếu \\end{ex}: bỏ khối dở, không gộp hai câu');
  ok(r.issues.some((i) => i.kind === 'chua-dong' && i.line === 1), 'báo đúng dòng khối dở');
}
{
  const r = normalizeEx(`${ex(1)}\n\\end{ex}\n\\begin{ex}\n\\end{ex}\n\\begin{ex}\n% rỗng\n\\end{ex}\n\\begin{ex}\nđến hết tệp`);
  ok(r.blocks.length === 1, 'giữ khối hợp lệ duy nhất');
  ok(r.issues.map((i) => i.kind).sort().join() === 'chua-dong,khoi-rong,khoi-rong,thua-end', 'báo end thừa, khối rỗng, khối dở cuối tệp');
}
{
  const r = normalizeEx(`\uFEFF${ex(1).replace(/\n/g, '\r\n')}`);
  ok(r.blocks.length === 1 && !r.blocks[0].text.includes('\r') && r.blocks[0].line === 1, 'bỏ BOM, đổi CRLF về LF');
  ok(splitExBlocksAt(ex(1)).length === 1 && normalizeEx('không có gì').issues.length === 0, 'tệp không có khối ex: không báo lỗi giả');
  ok(normalizeEx('% \\begin{ex}\n').blocks.length === 0, 'comment mở đầu không gây lỗi');
}
{
  const s = sourceIssues([{ name: 'a.tex', rel: '', text: `${ex(1)}\n\\end{ex}` }, { name: 'b.tex', rel: '', text: ex(2) }]);
  ok(s.length === 1 && s[0].srcIdx === 0 && s[0].issues.length === 1, 'sourceIssues chỉ liệt kê tệp có cảnh báo');
}
console.log('Lấy đủ khối và giữ nguyên ID');
{
  const body = 'Câu hỏi $\\dfrac{1}{2}$\n\\begin{tabular}{|c|c|}\\hline a & b \\\\ \\hline\\end{tabular}\n\\immini{ x }{\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}}\n\\choice{\\True 1}{2}{3}{4}\n\\loigiai{Đáp án \\% 50}';
  const variants = [
    `\\begin{ex}%[2D1H1-1]\n${body}\n\\end{ex}`,
    `\\begin{ex}\n%[2D1H1-1]\n${body}\n\\end{ex}`,
    `\\begin{ex} Cho hàm số.%[2D1H1-1]\n${body}\n\\end{ex}`,
    `\\begin{ex}%[Đề thi thử][2D1H1-1]\n${body}\n\\end{ex}`,
    `\\begin{ex}\n${body}\n\\end{ex}`,
    `\\begin{ex}%[2D1H1]\n${body}\n\\end{ex}`,
  ];
  const tax = getTaxonomy();
  const sig = (t: string) => JSON.stringify([readLatexId(t, tax).state, readLatexId(t, tax).raw]);
  variants.forEach((v, k) => {
    const crlf = v.replace(/\n/g, '\r\n');
    const r = normalizeEx(`\\chapter{A}\n${v}\n\n${crlf}\n`);
    ok(r.blocks.length === 2, `biến thể ${k + 1}: đủ 2 khối (LF và CRLF)`);
    ok(r.blocks.every((b) => sig(b.text) === sig(v)), `biến thể ${k + 1}: ID đọc ra y như bản gốc (${readLatexId(v, tax).raw ?? 'không ID'})`);
    ok(r.blocks[0].text === v && r.blocks[1].text === v, `biến thể ${k + 1}: nội dung khối nguyên văn`);
  });
  const many = Array.from({ length: 300 }, (_, i) => `\\begin{ex}%[2D1H1-${i + 1}]\nCâu ${i + 1}\n\\end{ex}`).join('\n');
  ok(normalizeEx(many).blocks.length === 300 && normalizeEx(many).issues.length === 0, '300 khối liền nhau: lấy đủ, không cảnh báo');
  const pre = normalizeEx(`%[2D1H1-1]\n${ex(1)}`);
  ok(pre.blocks.length === 1 && pre.issues.some((i) => /NGOÀI khối/.test(i.message)), 'ID đặt trước \\begin{ex}: báo (app không đọc ID này)');
}
if (fail) { console.log(`\n${fail} thất bại`); process.exit(1); }
console.log('\nOK');
