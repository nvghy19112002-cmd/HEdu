import { DEFAULT_INFO } from './examdraft';
import { ACTIVE_THEMES, DEFAULT_THEME_ID, EMPTY_INFO, fillInfo, HEDU_THEME_ID, hymathFiles, parseDefaultInfo, themeFiles, themeOf, themeStamp, THEMES } from './examtheme';
import { HEDU_STY_VERSION, heduFiles } from './hedusty';
import { HYMATH_CORE, HYMATH_THEMES } from './hymath.template';
import type { Question } from './types';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

const qs = [{ latex: '\\begin{ex}\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\\end{ex}' }, { latex: '\\begin{ex}\\begin{tikzpicture}\\tkzTabInit{x}{}\\end{tikzpicture}\\end{ex}' }] as unknown as Question[];
t('Tạo đề: bộ tệp khai báo ĐÚNG TỪNG BYTE như cũ (bản in không đổi), mẫu nào cũng vậy', JSON.stringify(themeFiles(DEFAULT_THEME_ID, qs, '')) === JSON.stringify(heduFiles(qs, '')) && JSON.stringify(themeFiles(HEDU_THEME_ID, qs, '')) === JSON.stringify(heduFiles(qs, '')));
t('mẫu lạ / chưa chọn ⇒ mẫu mặc định (HyMath Navy Editorial)', themeOf('khong-co').id === DEFAULT_THEME_ID && themeOf(null).id === DEFAULT_THEME_ID && themeOf(DEFAULT_THEME_ID).kind === 'hymath');
t('id mẫu không trùng; đủ 9 mẫu HyMath + mẫu HEdu', new Set(THEMES.map((x) => x.id)).size === THEMES.length && THEMES.filter((x) => x.kind === 'hymath').length === 9 && THEMES.some((x) => x.id === HEDU_THEME_ID));
t('dấu mẫu của Tạo đề ghi mẫu HEdu + phiên bản', JSON.stringify(themeStamp(HEDU_THEME_ID)) === JSON.stringify({ id: HEDU_THEME_ID, ten: 'Mặc định HEdu (kiểu cũ)', phienBan: HEDU_STY_VERSION }));
const hf = hymathFiles(DEFAULT_THEME_ID);
t('mẫu HyMath: lõi (caidat, core, adapter, hộp giải đáp) + tệp mẫu', !!hf && hf.length === Object.keys(HYMATH_CORE).length + 1 && hf.some((f) => f.path === 'theme-13-sky-panel.tex'));
t('mẫu Sky Panel có trong kho và là mẫu mặc định', THEMES.some((x) => x.id === 'hymath-13-sky-panel' && x.name === 'Sky Panel') && DEFAULT_THEME_ID === 'hymath-13-sky-panel');
t('mẫu HEdu không có bộ tệp HyMath', hymathFiles(HEDU_THEME_ID) === null);
t('lõi HyMath: không còn đường dẫn Caidat/, Themes/, fonts/ trong mã (chỉ chú thích)', [...Object.values(HYMATH_CORE), ...HYMATH_THEMES.map((x) => x.tex)].every((x) => !/^[^%\n]*(Caidat\/|Themes\/|fonts\/)/m.test(x)));
t('lõi HyMath có \\TieuDeDeSo, \\TieuDeDeThi và nối vào khung tiêu đề của mẫu', /\\newcommand\{\\TieuDeDeSo\}/.test(HYMATH_CORE['hymath-caidat.tex']) && /\\renewcommand\{\\TieuDeDeSo\}/.test(HYMATH_CORE['hymath-adapter.tex']));
t('mẫu nào cũng định nghĩa khung tiêu đề, tiêu đề phần, đầu/chân trang', HYMATH_THEMES.every((x) => /\\(?:re)?newcommand\{?\\HyThemeTitle/.test(x.tex) && /HyThemePart/.test(x.tex) && /HyThemePageStyle/.test(x.tex)));

const d = { dept: 'SỞ GD&ĐT TP.HCM', school: 'THPT Tây Thạnh', group: 'Tổ Toán', teacher: 'GVBS: Nguyễn Văn A', year: '2026–2027' };
t('đề chưa có Sở/Trường/Tổ ⇒ điền mặc định, giữ tiêu đề/thời gian', (() => { const r = fillInfo(DEFAULT_INFO, d); return r.school === d.school && r.dept === d.dept && r.group === d.group && r.title === DEFAULT_INFO.title && r.minutes === DEFAULT_INFO.minutes; })());
t('đề đã gõ một ô ⇒ giữ nguyên, không trộn', fillInfo({ ...DEFAULT_INFO, school: 'Trường A' }, d).dept === '' && fillInfo({ ...DEFAULT_INFO, school: 'Trường A' }, d).school === 'Trường A');
t('chưa đặt mặc định ⇒ không đổi gì', JSON.stringify(fillInfo(DEFAULT_INFO, EMPTY_INFO)) === JSON.stringify(DEFAULT_INFO));
t('đọc: gọn khoảng trắng, cắt 120 ký tự; có tên giáo viên, năm học', (() => { const r = parseDefaultInfo(JSON.stringify({ dept: '  SỞ   GD ', school: 'x'.repeat(300), group: 5, teacher: ' GV:  A ', year: '2026–2027' })); return r.dept === 'SỞ GD' && r.school.length === 120 && r.group === '' && r.teacher === 'GV: A' && r.year === '2026–2027'; })());
t('đọc: hỏng / chưa có ⇒ rỗng; bản cũ chưa có teacher/year vẫn đọc được', JSON.stringify(parseDefaultInfo('{hỏng')) === JSON.stringify(EMPTY_INFO) && parseDefaultInfo(JSON.stringify({ school: 'A' })).teacher === '');

t('chỉ cho dùng mẫu Sky Panel (09/11/2026); kho vẫn giữ các mẫu khác cho nút chọn mẫu sau này', ACTIVE_THEMES.length === 1 && ACTIVE_THEMES[0].id === 'hymath-13-sky-panel');
if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
