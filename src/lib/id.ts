// Gán ID tự động theo vị trí trong khung chương trình.
// Định dạng tạm theo quy ước ID6 quen thuộc trong cộng đồng ex_test:
//   [Lớp][Phân môn][Chương][Mức độ][Bài]-[Dạng]   ví dụ 2D1B1-1
//   Lớp: 10→0, 11→1, 12→2 (lớp 6–9 dùng chính số lớp)
//   Phân môn: D (Đại số, Giải tích, Thống kê – Xác suất), H (Hình học)
//   Mức độ: Y nhận biết, B thông hiểu, K vận dụng, G vận dụng cao
// Quy ước này còn chờ giáo viên chốt; đổi ở đúng một chỗ là hàm questionCode.
import { CURRICULUM, findChapter, findLesson, findForm } from './curriculum';
import type { Level, Location } from './types';

export const LEVEL_LETTER: Record<Level, string> = { NB: 'Y', TH: 'B', VD: 'K', VDC: 'G' };

export function gradeDigit(grade: number): string {
  return grade >= 10 ? String(grade - 10) : String(grade);
}

export function questionCode(loc: Location, level: Level): string {
  const ch = findChapter(loc.chapterId);
  const ls = findLesson(loc.lessonId)?.lesson;
  const fm = findForm(loc.lessonId, loc.formId);
  if (!ch || !ls) return '—';
  return `${gradeDigit(loc.grade)}${ch.mon}${ch.no}${LEVEL_LETTER[level]}${ls.no}-${fm?.no ?? 1}`;
}

/** Đọc ngược ID (vd. 2D1B1-1) ra vị trí và mức độ; dùng khi nhập câu có sẵn ID */
export function parseCode(code: string): { loc: Location; level: Level } | null {
  const m = /^([0-9])([DH])(\d+)([YBKG])(\d+)(?:-(\d+))?$/.exec(code.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const grade = d <= 2 ? d + 10 : d;
  const level = (Object.keys(LEVEL_LETTER) as Level[]).find((k) => LEVEL_LETTER[k] === m[4])!;
  const g = CURRICULUM.find((x) => x.grade === grade);
  const ch = g?.chapters.find((c) => c.no === Number(m[3]));
  const ls = ch?.lessons.find((l) => l.no === Number(m[5]));
  if (!g || !ch || !ls) return null;
  const fm = ls.forms.find((f) => f.no === Number(m[6] ?? 1)) ?? ls.forms[0];
  return { loc: { grade, chapterId: ch.id, lessonId: ls.id, formId: fm.id }, level };
}

export function seqLabel(seq: number): string {
  return '#' + String(seq).padStart(4, '0');
}
