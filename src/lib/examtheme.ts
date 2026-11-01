// Kho mẫu in đề thi (theme) + "Thông tin mặc định" (Sở/Phòng, Trường, Tổ) tự điền vào đề mới. Chọn ở Cài đặt › Đề thi.
// Hiện có MỘT mẫu: "Mặc định HEdu" = đúng bộ tệp khai báo đang dùng (hedu.sty + hedu-khaibao.tex…), bản in không đổi.
// Mẫu dùng cho đề TẠO MỚI; đề đã có trong Thư viện giữ nguyên tệp của nó. Tạo đề ghi tên + phiên bản mẫu vào hedu-de.json (`mauIn`).
import type { ExamInfo } from './examgen';
import { HEDU_STY_VERSION, heduFiles } from './hedusty';
import type { Question } from './types';

export interface ExamTheme {
  id: string; name: string; version: string; desc: string;
  /** bộ tệp khai báo đặt vào đề (cùng thư mục với main.tex) */
  files(qs: readonly Question[], sharedContent: string): { path: string; text: string }[];
}

export const DEFAULT_THEME_ID = 'hedu';
export const THEMES: readonly ExamTheme[] = [
  { id: DEFAULT_THEME_ID, name: 'Mặc định HEdu', version: HEDU_STY_VERSION, desc: 'Bộ khai báo đề thi đang dùng (hedu.sty): khổ A4, đầu đề Sở/Trường/Tổ và tên kì thi, đánh số trang. Bản in giống từ trước tới nay.', files: heduFiles },
];

export const themeOf = (id: string | null | undefined): ExamTheme => THEMES.find((t) => t.id === id) ?? THEMES[0];
export const themeFiles = (id: string | null | undefined, qs: readonly Question[], shared: string) => themeOf(id).files(qs, shared);
/** ghi vào hedu-de.json để về sau biết đề dựng bằng mẫu nào */
export const themeStamp = (id: string | null | undefined) => { const t = themeOf(id); return { id: t.id, ten: t.name, phienBan: t.version }; };

const THEME_KEY = 'hedu.examtheme';
const INFO_KEY = 'hedu.examinfo';

export function loadThemeId(): string {
  try { return themeOf(localStorage.getItem(THEME_KEY)).id; } catch { return DEFAULT_THEME_ID; }
}
export function saveThemeId(id: string) {
  try { localStorage.setItem(THEME_KEY, themeOf(id).id); } catch { /* không lưu được thì dùng mẫu mặc định */ }
}

/** Thông tin mặc định in ở đầu đề. */
export interface DefaultInfo { dept: string; school: string; group: string }
export const EMPTY_INFO: DefaultInfo = { dept: '', school: '', group: '' };
const MAX = 120;

export function parseDefaultInfo(raw: string | null): DefaultInfo {
  try {
    const v = JSON.parse(raw || 'null');
    if (!v || typeof v !== 'object') return EMPTY_INFO;
    const s = (k: keyof DefaultInfo) => (typeof v[k] === 'string' ? (v[k] as string).replace(/\s+/g, ' ').trim().slice(0, MAX) : '');
    return { dept: s('dept'), school: s('school'), group: s('group') };
  } catch { return EMPTY_INFO; }
}
export function loadDefaultInfo(): DefaultInfo {
  try { return parseDefaultInfo(localStorage.getItem(INFO_KEY)); } catch { return EMPTY_INFO; }
}
export function saveDefaultInfo(d: DefaultInfo): DefaultInfo {
  const clean = parseDefaultInfo(JSON.stringify(d));
  try { if (clean.dept || clean.school || clean.group) localStorage.setItem(INFO_KEY, JSON.stringify(clean)); else localStorage.removeItem(INFO_KEY); } catch { /* bỏ qua */ }
  return clean;
}

/** Điền thông tin mặc định vào đề CHƯA có Sở/Trường/Tổ (đề giáo viên đã gõ thì giữ nguyên, không trộn từng ô). */
export function fillInfo(info: ExamInfo, d: DefaultInfo): ExamInfo {
  if (info.dept.trim() || info.school.trim() || info.group.trim()) return info;
  return { ...info, dept: d.dept, school: d.school, group: d.group };
}
