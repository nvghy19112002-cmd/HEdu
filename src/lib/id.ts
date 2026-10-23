// Gán ID tự động theo vị trí trong cây mục lục.
//   [Lớp][Phân môn][Chương][Mức độ][Bài]-[Dạng]   ví dụ 2D1H1-1
//   Lớp: 10→0, 11→1, 12→2 · Phân môn: D, H, C… · Mức độ: N nhận biết, H thông hiểu,
//   V vận dụng, C vận dụng cao.
// Mã của từng cấp lấy từ cây mục lục, nên đổi cây là đổi mã — không phải sửa code.
import { getTaxonomy, place } from './curriculum';
import { gradeCode } from './taxonomy';
import type { Level, Location } from './types';

export const LEVEL_LETTER: Record<Level, string> = { NB: 'N', TH: 'H', VD: 'V', VDC: 'C' };

export function gradeDigit(grade: number): string {
  return gradeCode(grade);
}

export function questionCode(loc: Location, level: Level): string {
  const p = place(loc.formId) ?? place(loc.lessonId) ?? place(loc.chapterId);
  if (!p || !p.branch || !p.chapter) return '—';
  const lesson = p.lesson?.code ?? '1';
  const form = p.form?.code ?? '1';
  return `${p.grade.code}${p.branch.code}${p.chapter.code}${LEVEL_LETTER[level]}${lesson}-${form}`;
}

const CODE_RE = /^([0-9A-Za-z])([0-9A-Za-z])([0-9A-Za-z])([NHVC])([0-9A-Za-z])(?:-([0-9A-Za-z]))?$/;

/** Đọc ngược ID (vd. 2D1H1-1) ra vị trí và mức độ; dùng khi nhập câu đã có sẵn ID. */
export function parseCode(code: string): { loc: Location; level: Level } | null {
  const m = CODE_RE.exec(code.trim());
  if (!m) return null;
  const [, gc, bc, cc, lv, lc, fc] = m;
  const up = (s: string) => s.toUpperCase();
  const level = (Object.keys(LEVEL_LETTER) as Level[]).find((k) => LEVEL_LETTER[k] === up(lv));
  if (!level) return null;
  const g = getTaxonomy().grades.find((x) => up(x.code) === up(gc));
  const b = g?.branches.find((x) => up(x.code) === up(bc));
  const ch = b?.chapters.find((x) => up(x.code) === up(cc));
  const ls = ch?.lessons.find((x) => up(x.code) === up(lc));
  if (!g || !ch || !ls) return null;
  // Có ghi mã Dạng mà Dạng đó không có trong cây ⇒ ID không hợp lệ (trước đây lặng lẽ xếp vào Dạng đầu tiên của Bài).
  // Không ghi mã Dạng (vd 2D1H1) ⇒ vẫn hiểu là Dạng đầu tiên như cũ.
  const fm = fc ? ls.forms.find((f) => up(f.code) === up(fc)) : ls.forms[0];
  if (fc && !fm) return null;
  return { loc: { grade: g.grade, chapterId: ch.id, lessonId: ls.id, formId: fm?.id ?? '' }, level };
}

export function seqLabel(seq: number): string {
  return '#' + String(seq).padStart(4, '0');
}
