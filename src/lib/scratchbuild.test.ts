// Kiểm thử ghép tệp biên dịch bàn nháp và ánh xạ lỗi về câu (scratchbuild.ts). Câu tự viết, không dùng câu thật.
import { errorReport, scratchFiles, whereLabel, whereOf } from './scratchbuild';
import type { Diag } from './examcompile';
import { scanScratch } from './texscratch';

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✗ ' + msg); }
}
const D = (o: Partial<Diag>): Diag => ({ severity: 'error', file: null, line: null, inProject: true, message: 'lỗi', context: [], ...o });

const content = '% đầu\r\n\\begin{ex}\n\tCâu một $\\vv{AB}$\n\\end{ex}\n\n\\begin{ex}\n Câu hai \\usepackage{tkz-tab}\n\\end{ex}';

console.log('Ghép tệp');
const fs = scratchFiles(content, '\\usepackage{tikz}', ['mhchem', 'x;y']);
const by = new Map(fs.map((f) => [f.path, f.text]));
ok([...by.keys()].join() === 'main.tex,khaibaochung.tex,hedu.sty,hedu-khaibao.tex,hedu-goithem.tex,content.tex', 'đúng 6 tệp, tên cố định');
ok(by.get('content.tex') === content, 'content.tex là NGUYÊN VĂN nội dung khung soạn (kể cả CRLF, tab)');
ok(/\\input\{khaibaochung\}/.test(by.get('main.tex')!) && /\\input\{content\}/.test(by.get('main.tex')!) && !by.get('main.tex')!.includes(content), 'main.tex chỉ nạp khai báo + \\input{content}, không chép nội dung');
ok(/tkz-tab/.test(by.get('hedu-goithem.tex')!) && /mhchem/.test(by.get('hedu-goithem.tex')!) && !/x;y/.test(by.get('hedu-goithem.tex')!), 'gói riêng từ nội dung + gói giáo viên bấm thêm; tên gói lạ bị bỏ');

console.log('Ánh xạ lỗi');
const scan = scanScratch(content);
const w1 = whereOf(D({ file: 'content.tex', line: 3 }), scan);
ok(w1.kind === 'noi-dung' && w1.line === 3 && w1.block === 1 && whereLabel(w1) === 'Câu 1 · dòng 3', 'content.tex:3 ⇒ Câu 1, dòng 3 (không cộng/trừ)');
const w2 = whereOf(D({ file: './content.tex', line: 1 }), scan);
ok(w2.kind === 'noi-dung' && w2.block === null, 'dòng ngoài các khối ⇒ chỉ báo dòng, không gán bừa câu');
ok(whereOf(D({ file: 'hedu-khaibao.tex', line: 40 }), scan).kind === 'khai-bao', 'lỗi ở khai báo ⇒ báo riêng, không nhảy vào nội dung');
ok(whereOf(D({}), scan).kind === 'khong-ro', 'không có tệp/dòng ⇒ không rõ vị trí');

console.log('Báo lỗi để gửi Claude');
const rep = errorReport([D({ file: 'content.tex', line: 3, message: 'Undefined control sequence.' }), D({ severity: 'warning', file: 'content.tex', line: 7 })], scan, content);
ok(rep.includes('Câu 1 · dòng 3: Undefined control sequence.') && rep.includes('> 3 |') && !rep.includes('dòng 7'), 'có vị trí, đoạn mã quanh lỗi; bỏ cảnh báo');
ok(!/[A-Z]:[\\/]|AppData|Users/.test(rep), 'không chứa đường dẫn trên máy');

if (failed) { console.log(`scratchbuild.test: ${failed} lỗi`); process.exit(1); }
console.log('scratchbuild.test: OK');
