// Phạm vi quét trùng: Khối → Phân môn → Chương → Bài → Dạng, hoặc các câu đang chọn trong Ngân hàng.
// CHỈ ĐỌC. Dùng cây mục lục đang dùng (không đặt cứng tên).
import type { Question, Taxonomy } from './types';
import { indexOf, type TaxIndex } from './taxonomy';

export type ScanMode = 'inside' | 'vsAll';
export interface Scope {
  grades: number[];        // rỗng = mọi khối
  branch: string;          // mã phân môn ('' = tất cả)
  chapterId: string;
  lessonId: string;
  formId: string;
  selection: boolean;      // chỉ các câu đang chọn trong Ngân hàng
}
export const ALL_SCOPE: Scope = { grades: [], branch: '', chapterId: '', lessonId: '', formId: '', selection: false };
export const isAll = (s: Scope) => !s.selection && !s.grades.length && !s.branch && !s.chapterId && !s.lessonId && !s.formId;
/** Khoá nhận diện một phạm vi quét: mọi trường (kể cả kiểu đối chiếu) đều nằm trong MỘT mảng. */
export const scopeKey = (s: Scope, mode: ScanMode) => JSON.stringify([[...s.grades].sort((a, b) => a - b), s.branch, s.chapterId, s.lessonId, s.formId, s.selection, mode]);

/** Số câu đã đổi so với lúc quét: thêm mới, sửa LaTeX, hoặc đã xoá. Mỗi câu chỉ đếm một lần. */
export function changedCount(snap: ReadonlyMap<string, string>, qs: readonly { uid: string; latex: string }[]): number {
  let n = 0;
  const now = new Set<string>();
  for (const q of qs) { now.add(q.uid); if (snap.get(q.uid) !== q.latex) n++; }
  for (const u of snap.keys()) if (!now.has(u)) n++;
  return n;
}

export function inScope(q: Question, s: Scope, ix: TaxIndex, selected?: ReadonlySet<string>): boolean {
  if (s.selection) return !!selected?.has(q.uid);
  if (s.grades.length && !s.grades.includes(q.grade)) return false;
  if (s.formId && q.formId !== s.formId) return false;
  if (s.lessonId && q.lessonId !== s.lessonId) return false;
  if (s.chapterId && q.chapterId !== s.chapterId) return false;
  if (s.branch) { const b = ix.get(q.chapterId)?.branch; if (!b || b.code !== s.branch) return false; }
  return true;
}

export function scopeUids(qs: Question[], s: Scope, tax: Taxonomy, selected?: ReadonlySet<string>): Set<string> {
  const ix = indexOf(tax);
  const out = new Set<string>();
  for (const q of qs) if (inScope(q, s, ix, selected)) out.add(q.uid);
  return out;
}

export interface Opt { value: string; label: string; count: number }
export interface ScopeOptions { grades: Opt[]; branches: Opt[]; chapters: Opt[]; lessons: Opt[]; forms: Opt[] }

/** Danh sách lựa chọn cho từng cấp, đã đếm số câu theo các cấp cha đang chọn. Cấp con chỉ hiện mục thuộc cấp cha. */
export function scopeOptions(tax: Taxonomy, qs: Question[], s: Scope, short: (n: string) => string = (x) => x): ScopeOptions {
  const ix = indexOf(tax);
  const cnt = (f: (q: Question) => boolean) => qs.reduce((n, q) => n + (f(q) ? 1 : 0), 0);
  const upTo = (level: 'grade' | 'branch' | 'chapter' | 'lesson'): Scope => {
    const o = { ...s, selection: false };
    if (level === 'grade') return { ...o, grades: [], branch: '', chapterId: '', lessonId: '', formId: '' };
    if (level === 'branch') return { ...o, branch: '', chapterId: '', lessonId: '', formId: '' };
    if (level === 'chapter') return { ...o, chapterId: '', lessonId: '', formId: '' };
    return { ...o, lessonId: '', formId: '' };
  };
  const grades = tax.grades.map((g) => ({ value: String(g.grade), label: `Khối ${g.grade}`, count: cnt((q) => q.grade === g.grade) }));
  const gsel = tax.grades.filter((g) => !s.grades.length || s.grades.includes(g.grade));
  const brMap = new Map<string, Opt>();
  for (const g of gsel) for (const b of g.branches) {
    const o = brMap.get(b.code) ?? { value: b.code, label: short(b.name), count: 0 };
    o.count += cnt((q) => q.grade === g.grade && ix.get(q.chapterId)?.branch?.id === b.id);
    brMap.set(b.code, o);
  }
  const chapters: Opt[] = [];
  for (const g of gsel) for (const b of g.branches) {
    if (s.branch && b.code !== s.branch) continue;
    for (const c of b.chapters) chapters.push({ value: c.id, label: `${gsel.length > 1 ? `K${g.grade} · ` : ''}${short(c.name)}`, count: cnt((q) => q.chapterId === c.id) });
  }
  const ch = s.chapterId ? ix.get(s.chapterId)?.chapter : undefined;
  const lessons: Opt[] = (ch?.lessons ?? []).map((l) => ({ value: l.id, label: short(l.name), count: cnt((q) => q.lessonId === l.id) }));
  const ls = s.lessonId ? ix.get(s.lessonId)?.lesson : undefined;
  const forms: Opt[] = (ls?.forms ?? []).map((f) => ({ value: f.id, label: short(f.name), count: cnt((q) => q.formId === f.id) }));
  void upTo;
  return { grades, branches: [...brMap.values()], chapters, lessons, forms };
}

/** Đổi một cấp thì các cấp con bị đặt lại, tránh tổ hợp không hợp lệ (vd chọn khối 11 mà còn chương của khối 10). */
export function setLevel(s: Scope, level: 'grade' | 'branch' | 'chapter' | 'lesson' | 'form', value: string | number[]): Scope {
  if (level === 'grade') return { ...s, selection: false, grades: value as number[], branch: '', chapterId: '', lessonId: '', formId: '' };
  if (level === 'branch') return { ...s, selection: false, branch: value as string, chapterId: '', lessonId: '', formId: '' };
  if (level === 'chapter') return { ...s, selection: false, chapterId: value as string, lessonId: '', formId: '' };
  if (level === 'lesson') return { ...s, selection: false, lessonId: value as string, formId: '' };
  return { ...s, selection: false, formId: value as string };
}

export function scopeLabel(tax: Taxonomy, s: Scope, selCount = 0, short: (n: string) => string = (x) => x): string {
  if (s.selection) return `${selCount} câu đang chọn trong Ngân hàng`;
  const ix = indexOf(tax);
  const parts: string[] = [];
  if (s.grades.length) parts.push(s.grades.map((g) => `Khối ${g}`).join(', '));
  if (s.branch) { const name = tax.grades.flatMap((g) => g.branches).find((b) => b.code === s.branch)?.name; parts.push(short(name ?? s.branch)); }
  if (s.chapterId) parts.push(short(ix.get(s.chapterId)?.chapter?.name ?? ''));
  if (s.lessonId) parts.push(short(ix.get(s.lessonId)?.lesson?.name ?? ''));
  if (s.formId) parts.push(short(ix.get(s.formId)?.form?.name ?? ''));
  return parts.length ? parts.join(' › ') : 'Toàn ngân hàng';
}
