import { DEFAULT_INFO } from './examdraft';
import { DEFAULT_THEME_ID, EMPTY_INFO, fillInfo, parseDefaultInfo, themeFiles, themeOf, themeStamp, THEMES } from './examtheme';
import { HEDU_STY_VERSION, heduFiles } from './hedusty';
import type { Question } from './types';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

const qs = [{ latex: '\\begin{ex}\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\\end{ex}' }, { latex: '\\begin{ex}\\begin{tikzpicture}\\tkzTabInit{x}{}\\end{tikzpicture}\\end{ex}' }] as unknown as Question[];
t('mẫu mặc định ra ĐÚNG TỪNG BYTE bộ tệp đang dùng (bản in không đổi)', JSON.stringify(themeFiles(DEFAULT_THEME_ID, qs, '')) === JSON.stringify(heduFiles(qs, '')));
t('mẫu lạ / chưa chọn ⇒ dùng mẫu mặc định', themeOf('khong-co').id === DEFAULT_THEME_ID && themeOf(null).id === DEFAULT_THEME_ID);
t('id mẫu không trùng', new Set(THEMES.map((x) => x.id)).size === THEMES.length);
t('dấu mẫu ghi tên + phiên bản', JSON.stringify(themeStamp(null)) === JSON.stringify({ id: DEFAULT_THEME_ID, ten: 'Mặc định HEdu', phienBan: HEDU_STY_VERSION }));

const d = { dept: 'SỞ GD&ĐT TP.HCM', school: 'THPT Tây Thạnh', group: 'Tổ Toán' };
t('đề chưa có Sở/Trường/Tổ ⇒ điền mặc định, giữ tiêu đề/thời gian', (() => { const r = fillInfo(DEFAULT_INFO, d); return r.school === d.school && r.dept === d.dept && r.group === d.group && r.title === DEFAULT_INFO.title && r.minutes === DEFAULT_INFO.minutes; })());
t('đề đã gõ một ô ⇒ giữ nguyên, không trộn', fillInfo({ ...DEFAULT_INFO, school: 'Trường A' }, d).dept === '' && fillInfo({ ...DEFAULT_INFO, school: 'Trường A' }, d).school === 'Trường A');
t('chưa đặt mặc định ⇒ không đổi gì', JSON.stringify(fillInfo(DEFAULT_INFO, EMPTY_INFO)) === JSON.stringify(DEFAULT_INFO));
t('đọc: gọn khoảng trắng, cắt 120 ký tự', (() => { const r = parseDefaultInfo(JSON.stringify({ dept: '  SỞ   GD ', school: 'x'.repeat(300), group: 5 })); return r.dept === 'SỞ GD' && r.school.length === 120 && r.group === ''; })());
t('đọc: hỏng / chưa có ⇒ rỗng', JSON.stringify(parseDefaultInfo('{hỏng')) === JSON.stringify(EMPTY_INFO) && JSON.stringify(parseDefaultInfo(null)) === JSON.stringify(EMPTY_INFO));

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
