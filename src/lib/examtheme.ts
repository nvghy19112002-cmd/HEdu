// Kho mẫu in đề thi (theme) + "Thông tin mặc định" (Sở/Phòng, Trường, Tổ, dòng tên giáo viên, năm học). Chọn ở Cài đặt › Đề thi.
// Hai loại mẫu:
//  - "Mặc định HEdu" (kind 'hedu'): bộ khai báo hedu.sty + hedu-khaibao.tex, pdfLaTeX. Tạo đề luôn dùng mẫu này (đề có \documentclass riêng).
//  - 8 mẫu HyMath của chủ dự án (kind 'hymath', hymath.template.ts): dùng khi biên dịch tệp đề CHỈ có dữ liệu (examwrap.ts), XeLaTeX.
// Mẫu chọn ở Cài đặt áp cho tệp dữ liệu; đề có \documentclass giữ nguyên cách in của nó.
import type { ExamInfo } from './examgen';
import { HEDU_STY_VERSION, heduFiles } from './hedusty';
import { HYMATH_CORE, HYMATH_THEMES } from './hymath.template';
import type { Question } from './types';

export interface ExamTheme {
  id: string; name: string; version: string; desc: string;
  kind: 'hedu' | 'hymath';
  /** mẫu HyMath: tên tệp mẫu (\ThemeFile) */
  file?: string;
}

export const HEDU_THEME_ID = 'hedu';
/** mẫu mặc định cho tệp đề chỉ có dữ liệu */
export const DEFAULT_THEME_ID = 'hymath-02-navy-editorial';
export const THEMES: readonly ExamTheme[] = [
  ...HYMATH_THEMES.map((t): ExamTheme => ({
    id: `hymath-${t.file.replace(/^theme-/, '').replace(/\.tex$/, '')}`, name: t.name, version: 'HyMath', kind: 'hymath', file: t.file,
    desc: 'Mẫu HyMath: khung tiêu đề, đầu/chân trang, tiêu đề phần, ô đáp án theo mẫu. Biên dịch bằng XeLaTeX.',
  })),
  { id: HEDU_THEME_ID, name: 'Mặc định HEdu (kiểu cũ)', version: HEDU_STY_VERSION, kind: 'hedu', desc: 'Bộ khai báo cũ của HEdu (hedu.sty), pdfLaTeX. Không có \\TieuDeDeSo.' },
];

export const themeOf = (id: string | null | undefined): ExamTheme => THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
/** Bộ tệp khai báo cho đề do Tạo đề dựng (luôn "Mặc định HEdu"). */
export const themeFiles = (_id: string | null | undefined, qs: readonly Question[], shared: string) => heduFiles(qs, shared);
/** ghi vào hedu-de.json để về sau biết đề dựng bằng mẫu nào */
export const themeStamp = (id: string | null | undefined) => { const t = id === HEDU_THEME_ID ? THEMES.find((x) => x.id === HEDU_THEME_ID)! : themeOf(id); return { id: t.id, ten: t.name, phienBan: t.version }; };

const THEME_KEY = 'hedu.examtheme';
const INFO_KEY = 'hedu.examinfo';

/** Mẫu đã chọn ở Cài đặt (cho tệp đề chỉ có dữ liệu). Bản trước lưu 'hedu' (mẫu duy nhất lúc đó, chưa ai chọn) ⇒ coi như chưa chọn. */
export function loadThemeId(): string {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v && v !== HEDU_THEME_ID ? themeOf(v).id : v === HEDU_THEME_ID && localStorage.getItem(`${THEME_KEY}.chon`) ? HEDU_THEME_ID : DEFAULT_THEME_ID;
  } catch { return DEFAULT_THEME_ID; }
}
export function saveThemeId(id: string) {
  try { localStorage.setItem(THEME_KEY, themeOf(id).id); localStorage.setItem(`${THEME_KEY}.chon`, '1'); } catch { /* không lưu được thì dùng mẫu mặc định */ }
}

/** Thông tin mặc định: in ở đầu đề (Tạo đề) và ở đầu/chân trang của mẫu HyMath. */
export interface DefaultInfo { dept: string; school: string; group: string; /** dòng in ở đầu/chân trang, vd "Giáo viên: Nguyễn Văn A" */ teacher: string; /** năm học dùng khi đề chưa ghi năm học, vd 2026–2027 */ year: string }
export const EMPTY_INFO: DefaultInfo = { dept: '', school: '', group: '', teacher: '', year: '' };
const MAX = 120;

export function parseDefaultInfo(raw: string | null): DefaultInfo {
  try {
    const v = JSON.parse(raw || 'null');
    if (!v || typeof v !== 'object') return EMPTY_INFO;
    const s = (k: keyof DefaultInfo) => (typeof v[k] === 'string' ? (v[k] as string).replace(/\s+/g, ' ').trim().slice(0, MAX) : '');
    return { dept: s('dept'), school: s('school'), group: s('group'), teacher: s('teacher'), year: s('year') };
  } catch { return EMPTY_INFO; }
}
export function loadDefaultInfo(): DefaultInfo {
  try { return parseDefaultInfo(localStorage.getItem(INFO_KEY)); } catch { return EMPTY_INFO; }
}
export function saveDefaultInfo(d: DefaultInfo): DefaultInfo {
  const clean = parseDefaultInfo(JSON.stringify(d));
  try { if (Object.values(clean).some(Boolean)) localStorage.setItem(INFO_KEY, JSON.stringify(clean)); else localStorage.removeItem(INFO_KEY); } catch { /* bỏ qua */ }
  return clean;
}

/** Điền thông tin mặc định vào đề CHƯA có Sở/Trường/Tổ (đề giáo viên đã gõ thì giữ nguyên, không trộn từng ô). */
export function fillInfo(info: ExamInfo, d: DefaultInfo): ExamInfo {
  if (info.dept.trim() || info.school.trim() || info.group.trim()) return info;
  return { ...info, dept: d.dept, school: d.school, group: d.group };
}

/** Bộ tệp lõi + tệp mẫu HyMath (đặt cạnh tệp bọc). */
export function hymathFiles(themeId: string): { path: string; text: string }[] | null {
  const t = themeOf(themeId);
  const ht = t.kind === 'hymath' ? HYMATH_THEMES.find((x) => x.file === t.file) : undefined;
  if (!ht) return null;
  return [...Object.entries(HYMATH_CORE).map(([path, text]) => ({ path, text })), { path: ht.file, text: ht.tex }];
}
