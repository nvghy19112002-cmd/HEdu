// hedu.sty: bộ tệp khai báo, gói riêng tự sinh từ câu hỏi, an toàn với bộ dò chế độ Đề/Lời giải.
import { goiThemTex, heduFiles, HEDU_STY, HEDU_STY_VERSION, KHAIBAOCHUNG_THIN } from './hedusty';
import { KHAIBAOCHUNG_TEX } from './texproject.template';
import { examFiles, makeVariants, type Picked } from './examgen';
import { DEFAULT_INFO } from './examdraft';
import type { Question } from './types';

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
let n = 0;
const q = (latex: string, type: Question['type'] = 'tn'): Question => ({ uid: `u${++n}`, seq: n, latex, type, level: 'NB', tags: [], createdAt: 0, updatedAt: 0, grade: 12, chapterId: '', lessonId: '', formId: '', review: 'approved' });

console.log('hedu.sty');
ok(HEDU_STY.includes(`\\ProvidesPackage{hedu}`) && HEDU_STY.includes(`v${HEDU_STY_VERSION}`), 'có \\ProvidesPackage và số phiên bản');
ok(!/ex_test/.test(HEDU_STY) && !/ex_test/.test(KHAIBAOCHUNG_THIN), 'hedu.sty và khaibaochung mỏng KHÔNG nhắc ex_test (bộ dò chế độ Đề/Lời giải chỉ thấy đúng một dòng, ở hedu-khaibao.tex)');
ok((KHAIBAOCHUNG_TEX.match(/^\\usepackage\[[^\]]*\]\{ex_test\}/gm) ?? []).length === 1, 'hedu-khaibao.tex có đúng một dòng ex_test đang hoạt động');
ok(HEDU_STY.indexOf('\\input{hedu-khaibao.tex}') < HEDU_STY.indexOf('\\IfFileExists{hedu-goithem.tex}'), 'gói riêng nạp SAU khai báo chung');
ok(/\\IfFileExists\{hedu-goithem\.tex\}/.test(HEDU_STY), 'thiếu hedu-goithem.tex vẫn biên dịch được');
ok(/\\providecommand\\hetde/.test(HEDU_STY), 'có lệnh \\hetde');
ok(KHAIBAOCHUNG_THIN.trim().endsWith('\\usepackage{hedu}'), 'khaibaochung.tex chỉ nạp hedu');

console.log('Gói riêng của bộ câu hỏi');
const qs = [q(String.raw`\begin{ex}Đổi $\SI{5}{\metre}$ và \cancel{x}.\choice{\True a}{b}{c}{d}\end{ex}`), q(String.raw`\begin{ex}Hình \begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}\shortans{1}\end{ex}`, 'tln')];
const files = heduFiles(qs, '');
ok(files.map((f) => f.path).join(',') === 'khaibaochung.tex,hedu.sty,hedu-khaibao.tex,hedu-goithem.tex', 'đủ 4 tệp khai báo');
const g = files.find((f) => f.path === 'hedu-goithem.tex')!.text;
ok(g.includes('\\@ifpackageloaded{siunitx}{}{\\usepackage{siunitx}}') && g.includes('{cancel}'), `nhận ra siunitx, cancel từ lệnh trong câu:\n${g}`);
ok(!/\\usepackage\{(?:amsmath|xcolor|graphicx|hedu)\}/.test(g), 'không nạp lại gói nền');
ok(goiThemTex([{ kind: 'package', name: 'x}\\input{evil', file: 'x.sty', bundled: false, from: 'cau-hoi' }]).includes('không cần gói'), 'tên gói lạ (có ký tự đặc biệt) bị bỏ, không chèn mã');
ok(goiThemTex([{ kind: 'tikzlib', name: 'calc', file: 'tikzlibrarycalc.code.tex', bundled: false, from: 'cau-hoi' }, { kind: 'pgfplotslib', name: 'fillbetween', file: 'x', bundled: false, from: 'cau-hoi' }]).match(/usetikzlibrary\{calc\}|usepgfplotslibrary\{fillbetween\}/g)?.length === 2, 'thư viện TikZ / pgfplots');

console.log('Mã đề kết thúc bằng HẾT');
const pk: Picked = { p1: [qs[0]], p2: [], p3: [], p4: [] };
const v = makeVariants(pk, { count: 1, firstCode: 101, shuffleQuestions: false, shuffleOptions: false, seed: 1, keepFirstOriginal: true });
const de = examFiles(DEFAULT_INFO, v, { withKeys: false }).find((f) => f.path === 'de-101.tex')!.text;
ok(/\\ifdefined\\hetde\\hetde\\fi\n\\zlabel\{\\made-lastpage\}/.test(de), 'mã đề in HẾT ngay trước nhãn trang cuối (đề cũ không có \\hetde vẫn biên dịch)');

if (fail) { console.log(`\n${fail} kiểm thử hedusty lỗi`); process.exit(1); }
console.log('hedusty: đạt hết.');
