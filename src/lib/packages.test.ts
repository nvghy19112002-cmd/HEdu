// Kiểm thử đọc khai báo gói (Issue #1, P1). Chạy bằng: npm test
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { collectRows, evidenceOf, extractDecls, fileOf, maskNonCode, outsideEx } from './packages';
import { splitExBlocks } from './extest';
import { classifyTexLog } from './texcheck';

let failed = 0;
const ok = (c: unknown, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };
const names = (s: string) => extractDecls(s).map((d) => `${d.kind}:${d.name}`).join(' ');
console.log('Khai báo gói');

ok(names('\\usepackage{amsmath,amssymb}') === 'package:amsmath package:amssymb', 'nhiều gói trong một dòng');
ok(names('\\usepackage[utf8]{inputenc}') === 'package:inputenc' && extractDecls('\\usepackage[utf8]{inputenc}')[0].options === 'utf8', 'có tuỳ chọn');
ok(names('\\usepackage{tikz,\n  tikz-3dplot}') === 'package:tikz package:tikz-3dplot', 'gói xuống dòng');
ok(names('\\RequirePackage{xcolor}') === 'package:xcolor', 'RequirePackage');
ok(names('\\documentclass[12pt]{article}') === 'class:article', 'lớp tài liệu');
ok(names('\\usetikzlibrary{calc,arrows.meta}') === 'tikzlib:calc tikzlib:arrows.meta', 'thư viện tikz');
ok(names('\\usepgfplotslibrary{groupplots}') === 'pgfplotslib:groupplots', 'thư viện pgfplots');
ok(names('% \\usepackage{khongco}\n\\usepackage{co}') === 'package:co', 'bỏ dòng chú thích');
ok(names('\\usepackage{co} % \\usepackage{khongco}') === 'package:co', 'bỏ chú thích cuối dòng');
ok(names('50\\% \\usepackage{co}') === 'package:co', '\\% không phải chú thích');
ok(names('\\begin{verbatim}\n\\usepackage{vd}\n\\end{verbatim}') === '', 'bỏ verbatim');
ok(names('\\verb|\\usepackage{vd}|') === '', 'bỏ \\verb');
ok(names('\\usepackage{a}\\usepackage{a}') === 'package:a', 'không lặp');
ok(names('\\input{hinh/h1}') === 'input:hinh/h1' && extractDecls('\\input{hinh/h1}')[0].file === 'hinh/h1.tex', '\\input thêm .tex');
ok(names('\\input{\\jobname.aux}') === '', 'không đoán \\input là macro');
ok(maskNonCode('a%b\nc').length === 'a%b\nc'.length, 'che mà vẫn giữ độ dài');

console.log('Tên tệp');
ok(fileOf('package', 'tikz-3dplot') === 'tikz-3dplot.sty', 'gói → .sty');
ok(fileOf('tikzlib', 'calc') === 'tikzlibrarycalc.code.tex', 'tikzlibrary…code.tex');
ok(fileOf('pgfplotslib', 'groupplots') === 'pgfplotslibrarygroupplots.code.tex', 'pgfplotslibrary…code.tex');
ok(fileOf('class', 'article') === 'article.cls', 'lớp → .cls');

console.log('Phần ngoài \\begin{ex}');
const doc = '\\documentclass{article}\n\\usepackage{tikz-3dplot}\n\\begin{ex}\n\\usepackage{trongcau}\n\\end{ex}\n\\usepackage{giua}\n\\begin{ex}\nb\n\\end{ex}';
ok(names(outsideEx(doc)) === 'class:article package:tikz-3dplot package:giua', 'khai báo đầu file và giữa các câu còn nguyên');
ok(splitExBlocks(doc).length === 2, 'vẫn tách đúng 2 câu');

console.log('Bằng chứng lệnh');
const ev = (s: string) => evidenceOf(s).map((e) => e.pkg).join(' ');
ok(ev('\\tkzTabInit{x}{y}') === 'tkz-tab', 'tkzTab');
ok(ev('\\tdplotsetmaincoords{70}{110}') === 'tikz-3dplot', 'tdplot');
ok(ev('\\begin{axis}[x]\\addplot{x};\\end{axis}') === 'pgfplots', 'axis');
ok(ev('\\tkzDefPoint(0,0){A}') === 'tkz-euclide', 'tkz-euclide');
ok(ev('% \\tkzTabInit') === '', 'lệnh trong chú thích không tính');
ok(ev('\\newcommand{\\foo}{x}\\foo') === '', 'lệnh lạ thì không đoán');

console.log('Bảng tổng hợp');
const hedu = '\\usepackage{tikz,tikz-3dplot}\n\\usepackage{tkz-tab}';
const blocks = ['\\begin{ex}\\tkzTabInit{x}\\end{ex}', '\\begin{ex}\\begin{tikzpicture}\\end{tikzpicture}\\end{ex}', '\\begin{ex}\\begin{axis}\\end{axis}\\end{ex}', '\\begin{ex}\\resizebox{3cm}{!}{x}\\end{ex}'];
const rows = collectRows('\\usepackage{amsmath}\n' + blocks.join('\n'), blocks, hedu);
const row = (k: string) => rows.find((r) => r.key === k);
ok(row('package:amsmath')?.declared === 'file', 'gói khai báo trong file');
ok(row('package:tkz-tab')?.declared === 'hedu' && row('package:tkz-tab')?.questions.join() === '0', 'HEdu đã nạp, 1 câu dùng');
ok(row('package:pgfplots')?.declared === 'khong' && row('package:pgfplots')?.questions.join() === '2', 'dùng axis mà chưa ai khai báo → "khong"');
ok(row('package:graphicx')?.declared === 'hedu', 'tikz kéo theo graphicx');

console.log('Phân loại lỗi log TeX');
const kind = (m: string) => classifyTexLog(m, '').kind;
ok(kind("LaTeX Error: File `tikz-3dplot.sty' not found.") === 'thieu-goi', 'thiếu .sty');
ok(classifyTexLog("! LaTeX Error: File `tikz-3dplot.sty' not found.", '').file === 'tikz-3dplot.sty', 'lấy đúng tên tệp');
ok(kind("! LaTeX Error: File `hinh1.png' not found.") === 'thieu-tep', 'thiếu hình ngoài ≠ thiếu gói');
ok(kind('! Package xcolor Error: Option clash for package xcolor.') === 'xung-dot', 'xung đột tuỳ chọn');
ok(kind('! Undefined control sequence.') === 'cu-phap', 'lỗi mã');
ok(kind('! fontspec Error: The fontspec package requires either XeTeX or LuaTeX. error') === 'engine', 'cần engine khác');
ok(kind('chuyện gì đó') === 'khac', 'không rõ thì không đoán');

const DIR = 'data/test';
if (existsSync(DIR) && readdirSync(DIR).some((f) => f.endsWith('.tex'))) {
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.tex'))) {
    const src = readFileSync(`${DIR}/${f}`, 'utf8');
    const bl = splitExBlocks(src);
    console.log(`Dữ liệu thật · ${f} · ${bl.length} câu`);
    const rs = collectRows(src, bl, hedu);
    ok(bl.length > 0 && rs.length > 0, `tổng hợp được ${rs.length} dòng: ${rs.map((r) => r.name + '×' + r.questions.length).join(', ')}`);
  }
}
if (failed) { console.error(`\n${failed} kiểm thử hỏng`); process.exit(1); }
console.log('\nGói LaTeX: đạt hết.');
