import { cheDo, inputName, needsXeLaTeX, pdfCore, PDF_CORE_HEAD, texText, WRAP_MAIN, wrapFiles } from './examwrap';
import { HEDU_THEME_ID, hymathFiles, THEMES } from './examtheme';
import { heduFiles } from './hedusty';
import { MAIN_HEAD } from './examgen';
import type { Question } from './types';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

const DATA = '\\TieuDeDeSo{TRƯỜNG A}{ĐỀ GK1}{Toán 10}{90 phút}{01}\n\\begin{ex}\nCho $\\triangle ABC$.\n\\choice{a}{\\True b}{c}{d}\n\\end{ex}\n';
const w = wrapFiles('de/toan10_gk1.tex', DATA, 'hymath-02-navy-editorial', 'de-in', { schoolYear: '2026–2027', teacher: 'GV: Hy & cộng sự' });
const main = w?.files[0].text ?? '';
t('HyMath: tệp bọc + lõi + tệp mẫu; pdfLaTeX; tự đặt chế độ', !!w && w.files[0].path === WRAP_MAIN && w.engine === 'pdflatex' && w.modes && w.files.some((f) => f.path === 'theme-02-navy-editorial.tex') && w.files.some((f) => f.path === 'hymath-caidat.tex'));
t('HyMath: \\input đúng tên tệp dữ liệu, đúng mẫu, đúng chế độ', main.includes('\\input{toan10_gk1}') && main.includes('\\def\\ThemeFile{theme-02-navy-editorial.tex}') && main.includes('\\def\\CheDo{in}'));
t('HyMath: năm học, tên giáo viên vào lệnh, ký tự đặc biệt được thoát', main.includes('\\newcommand{\\SchoolYear}{2026–2027}') && main.includes('\\newcommand{\\TeacherName}{GV: Hy \\& cộng sự}'));
t('chế độ: Đề → mau, Đề in → in, Lời giải → loigiai, nguyên văn → mau', cheDo('de') === 'mau' && cheDo('de-in') === 'in' && cheDo('loigiai') === 'loigiai' && cheDo('nguyen-van') === 'mau');
t('thoát chữ: bỏ \\ và xuống dòng, thoát # $ % & _ { }', texText('a\\b\n#$%&_{}') === 'a b \\#\\$\\%\\&\\_\\{\\}');
t('không quá 8 tệp (giới hạn phía Rust)', !!w && w.files.length <= 8);

const old = wrapFiles('de/toan10_gk1.tex', DATA, HEDU_THEME_ID);
t('mẫu HEdu kiểu cũ: phần đầu như Tạo đề, bộ khai báo heduFiles, pdfLaTeX', !!old && !old.modes && old.engine === null && old.files[0].text === `${MAIN_HEAD}\n\\input{toan10_gk1}\n\\end{document}\n` && JSON.stringify(old.files.slice(1)) === JSON.stringify(heduFiles([{ latex: DATA }] as unknown as Question[], '')));
t('tệp đã có \\documentclass ⇒ không bọc', wrapFiles('main.tex', '\\documentclass{book}\n\\begin{document}x\\end{document}', 'hymath-02-navy-editorial') === null);
t('\\documentclass bị chú thích vẫn là tệp dữ liệu', wrapFiles('a.tex', '%\\documentclass{book}\n\\begin{ex}x\\end{ex}', 'hymath-02-navy-editorial') !== null);
t('tên tệp có khoảng trắng / ký tự TeX ⇒ không bọc', wrapFiles('de thi.tex', DATA, 'hymath-02-navy-editorial') === null && inputName('a%b.tex') === null && inputName('x{y}.tex') === null);
t('tên tiếng Việt, gạch nối, dấu chấm được', inputName('đề-thi_11.v2.tex') === 'đề-thi_11.v2');
t('mẫu lạ ⇒ dùng mẫu mặc định', JSON.stringify(wrapFiles('a.tex', DATA, 'khong-co')) === JSON.stringify(wrapFiles('a.tex', DATA, 'hymath-13-sky-panel')));

// ---- dịch bằng pdfLaTeX (nhanh) thay XeLaTeX ----
const core = (ws: ReturnType<typeof wrapFiles>) => ws?.files.find((f) => f.path === 'hymath-core.tex')?.text ?? '';
const xe = wrapFiles('de/toan10_gk1.tex', DATA, 'hymath-02-navy-editorial', 'de', undefined, 'xelatex');
t('XeLaTeX vẫn chọn được: lõi gốc nguyên văn', !!xe && xe.engine === 'xelatex' && core(xe) === hymathFiles('hymath-02-navy-editorial')!.find((f) => f.path === 'hymath-core.tex')!.text);
const pdfw = wrapFiles('de/toan10_gk1.tex', DATA, 'hymath-02-navy-editorial');
t('pdfLaTeX: lõi bỏ fontspec/unicode-math, nạp vietnam + tgtermes + tgheros + newtxmath', !/fontspec|unicode-math/.test(core(pdfw).replace(/^%.*$/gm, '')) && core(pdfw).includes(PDF_CORE_HEAD) && /\\usepackage\{ex_test\}/.test(core(pdfw)));
t('pdfLaTeX: chỉ lõi đổi, tệp bọc + mẫu + tệp khác giữ nguyên', !!pdfw && !!xe && pdfw.files.length === xe.files.length && pdfw.files.every((f, i) => f.path === xe.files[i].path && (f.path === 'hymath-core.tex' || f.text === xe.files[i].text)));
t('pdfLaTeX: phần sau khối phông của lõi giữ nguyên từng ký tự', core(pdfw).endsWith(core(xe).slice(core(xe).indexOf('\\usepackage{ex_test}'))));
t('mọi mẫu HyMath đổi được sang pdfLaTeX', THEMES.filter((x) => x.kind === 'hymath').every((x) => wrapFiles('a.tex', DATA, x.id)?.engine === 'pdflatex'));
t('lõi lạ (gói khác / thứ tự khác / thiếu ex_test) ⇒ không đổi', pdfCore('\\usepackage{fontspec}\n\\usepackage{polyglossia}\n\\usepackage{ex_test}') === null && pdfCore('\\usepackage{ex_test}\n\\usepackage{fontspec}') === null && pdfCore('abc') === null);
t('lỗi do ký tự / gói cần XeLaTeX ⇒ dịch lại bằng XeLaTeX', needsXeLaTeX('! LaTeX Error: Unicode character ★ (U+2605)\n               not set up for use with LaTeX.') && needsXeLaTeX('! Package fontspec Error: The fontspec package requires either XeTeX or LuaTeX.') && needsXeLaTeX('! LaTeX Error: Command \\textohm unavailable in encoding T5.'));
t('lỗi thường của đề (lệnh chưa định nghĩa) ⇒ không dịch lại', !needsXeLaTeX('! Undefined control sequence.\nl.12 \\lenhla') && !needsXeLaTeX(''));
t('kiểu cũ không đổi trình dịch', wrapFiles('a.tex', DATA, HEDU_THEME_ID)?.engine === null);

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
