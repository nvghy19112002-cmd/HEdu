// Gợi ý gói khi biên dịch báo thiếu, thêm vào hedu-goithem.tex.
import { addToGoiThem, missingPackages } from './missingpkg';
import { goiThemTex } from './hedusty';
import type { Diag } from './examcompile';

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const d = (message: string, context: string[] = []): Diag => ({ severity: 'error', file: 'de-101.tex', line: 3, inProject: true, message, context });

console.log('Gợi ý gói khi biên dịch báo thiếu');
const h = missingPackages([d('Undefined control sequence.', ['l.955 Thử gói riêng: \\SI', '{5}{\\metre}.']), d('Undefined control sequence.', ['l.12 a \\foo'])]);
ok(h.length === 1 && h[0].pkg === 'siunitx' && h[0].installed && h[0].why.includes('\\SI'), `\\SI ⇒ siunitx; lệnh lạ \\foo không đoán bừa: ${JSON.stringify(h)}`);
const raw = "./de-101.tex:7: LaTeX Error: Environment tikzcd undefined.\n./main.tex:2: LaTeX Error: File `tkz-xyz.sty' not found.\n";
const h2 = missingPackages([], raw);
ok(h2.some((x) => x.pkg === 'tikz-cd' && x.installed) && h2.some((x) => x.pkg === 'tkz-xyz' && !x.installed), 'môi trường lạ ⇒ gói; tệp .sty không có ⇒ báo chưa cài');
ok(missingPackages([d('Undefined control sequence.', ['l.3 \\cancel{x} và \\SI'])]).map((x) => x.pkg).join() === 'siunitx', 'lấy lệnh CUỐI dòng l.<số> (lệnh gây lỗi)');

console.log('Thêm vào hedu-goithem.tex');
const base = goiThemTex([]);
const r = addToGoiThem(base, ['siunitx', 'cancel']);
ok(r.added.join() === 'siunitx,cancel' && r.text.indexOf('{siunitx}') < r.text.lastIndexOf('\\makeatother'), 'chèn trước \\makeatother');
ok(addToGoiThem(r.text, ['siunitx']).added.length === 0, 'gói đã có thì không thêm lặp');
const fresh = addToGoiThem(null, ['mhchem']);
ok(/\\makeatletter[\s\S]*\{mhchem\}[\s\S]*\\makeatother/.test(fresh.text), 'tệp chưa có ⇒ tạo mới đúng khung');
ok(addToGoiThem(base, ['x}\\input{evil']).added.length === 0, 'tên gói lạ bị bỏ');
if (fail) { console.log(`\n${fail} kiểm thử missingpkg lỗi`); process.exit(1); }
console.log('missingpkg: đạt hết.');
