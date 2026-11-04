// Chia sẻ ngân hàng câu hỏi giữa các thầy cô (thuần, có kiểm thử): xuất một "gói chia sẻ" (.json) và nhập gói của đồng nghiệp bằng cách GỘP.
// Khoá nhận diện câu là uid. Để biết ai đã sửa gì từ lần đồng bộ trước, ta nhớ "bản nền" (băm nội dung lần nhận trước) của từng uid:
//  - nội dung hai bên giống nhau            → bỏ qua
//  - bên bạn còn đúng bản nền, bên kia khác → nhận bản mới (tự động; bản cũ vào Lịch sử)
//  - bên kia còn đúng bản nền, bạn đã sửa   → giữ của bạn
//  - cả hai đã sửa khác nhau                → XUNG ĐỘT, thầy/cô chọn từng câu
//  - uid lạ nhưng nội dung giống một câu đã có (khác uid) → trùng, bỏ qua
import type { Level, Location, QType, Question, Taxonomy } from './types';

export interface SharedQ { uid: string; latex: string; type: QType; level: Level; tags: string[]; review?: Question['review']; updatedAt: number; loc: Location; /** tên lớp/chương/bài/dạng để dò khi cây mục lục khác nhau */ path: string[] }
export interface SharePack { app: 'HEdu'; kind: 'share'; v: 1; from: string; exportedAt: string; questions: SharedQ[] }

export const norm = (s: string): string => s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();
/** Băm FNV-1a 32 bit của nội dung đã chuẩn hoá (đủ để nhận ra "đã đổi", không dùng cho bảo mật). */
export function hashOf(s: string): string {
  let h = 0x811c9dc5;
  const t = norm(s);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36) + ':' + t.length;
}
const squash = (s: string) => norm(s).replace(/\s+/g, ' ');

function pathOf(tax: Taxonomy | null, l: Location): string[] {
  const g = tax?.grades.find((x) => x.grade === l.grade);
  for (const b of g?.branches ?? []) for (const c of b.chapters) if (c.id === l.chapterId) for (const le of c.lessons) if (le.id === l.lessonId) {
    const f = le.forms.find((x) => x.id === l.formId);
    return [g!.name, c.name, le.name, f?.name ?? ''];
  }
  return [];
}

export function buildPack(qs: readonly Question[], tax: Taxonomy | null, from: string): SharePack {
  return {
    app: 'HEdu', kind: 'share', v: 1, from, exportedAt: new Date().toISOString(),
    questions: qs.map((q) => ({ uid: q.uid, latex: q.latex, type: q.type, level: q.level, tags: q.tags, ...(q.review ? { review: q.review } : {}), updatedAt: q.updatedAt, loc: { grade: q.grade, chapterId: q.chapterId, lessonId: q.lessonId, formId: q.formId }, path: pathOf(tax, q) })),
  };
}

export function parsePack(text: string): { pack: SharePack } | { error: string } {
  let o: unknown;
  try { o = JSON.parse(text); } catch { return { error: 'Tệp không phải JSON hợp lệ.' }; }
  const p = o as Partial<SharePack> | null;
  if (!p || p.app !== 'HEdu' || p.kind !== 'share' || !Array.isArray(p.questions)) return { error: 'Đây không phải gói chia sẻ của HEdu (tạo bằng "Chia sẻ ngân hàng").' };
  if (p.v !== 1) return { error: 'Gói do phiên bản HEdu mới hơn tạo ra; hãy cập nhật app.' };
  const qs = p.questions.filter((q): q is SharedQ => !!q && typeof q.uid === 'string' && typeof q.latex === 'string' && !!q.loc && typeof q.loc.grade === 'number');
  return { pack: { ...(p as SharePack), questions: qs.map((q) => ({ ...q, tags: Array.isArray(q.tags) ? q.tags : [], path: Array.isArray(q.path) ? q.path : [], updatedAt: Number(q.updatedAt) || 0 })) } };
}

/** Tìm vị trí trong cây của bạn: theo mã (id) nếu có, không thì theo tên chương/bài/dạng. null = không có chỗ. */
export function locate(tax: Taxonomy | null, q: SharedQ): Location | null {
  if (!tax) return null;
  const g = tax.grades.find((x) => x.grade === q.loc.grade);
  if (!g) return null;
  const chapters = g.branches.flatMap((b) => b.chapters);
  const byId = chapters.find((c) => c.id === q.loc.chapterId)?.lessons.find((l) => l.id === q.loc.lessonId)?.forms.find((f) => f.id === q.loc.formId);
  if (byId) return { grade: g.grade, chapterId: q.loc.chapterId, lessonId: q.loc.lessonId, formId: q.loc.formId };
  const [, cn, ln, fn] = q.path;
  const c = chapters.find((x) => x.name === cn), l = c?.lessons.find((x) => x.name === ln), f = l?.forms.find((x) => x.name === fn);
  return c && l && f ? { grade: g.grade, chapterId: c.id, lessonId: l.id, formId: f.id } : null;
}

export type Verdict = 'new' | 'same' | 'update' | 'keep-mine' | 'conflict' | 'dup' | 'no-place';
export interface PlanRow { uid: string; verdict: Verdict; theirs: SharedQ; mine?: Question; loc?: Location; /** uid của câu đã có nội dung giống (khi dup) */ dupOf?: string }
export const VERDICT_VI: Record<Verdict, string> = {
  new: 'Câu mới', same: 'Giống nhau', update: 'Bản mới của đồng nghiệp', 'keep-mine': 'Bạn đã sửa (giữ của bạn)', conflict: 'Cả hai cùng sửa', dup: 'Trùng nội dung câu đã có', 'no-place': 'Không có chỗ trong cây mục lục của bạn',
};

export function plan(pack: SharePack, local: readonly Question[], tax: Taxonomy | null, base: Readonly<Record<string, string>>): PlanRow[] {
  const byUid = new Map(local.map((q) => [q.uid, q]));
  const bySquash = new Map<string, string>();
  for (const q of local) bySquash.set(squash(q.latex), q.uid);
  return pack.questions.map((t): PlanRow => {
    const mine = byUid.get(t.uid);
    if (mine) {
      const hm = hashOf(mine.latex), ht = hashOf(t.latex);
      if (hm === ht) return { uid: t.uid, verdict: 'same', theirs: t, mine };
      const b = base[t.uid];
      if (b === hm) return { uid: t.uid, verdict: 'update', theirs: t, mine };
      if (b === ht) return { uid: t.uid, verdict: 'keep-mine', theirs: t, mine };
      return { uid: t.uid, verdict: 'conflict', theirs: t, mine };
    }
    const d = bySquash.get(squash(t.latex));
    if (d) return { uid: t.uid, verdict: 'dup', theirs: t, dupOf: d };
    const loc = locate(tax, t);
    return loc ? { uid: t.uid, verdict: 'new', theirs: t, loc } : { uid: t.uid, verdict: 'no-place', theirs: t };
  });
}

export function counts(rows: readonly PlanRow[]): Record<Verdict, number> {
  const c: Record<Verdict, number> = { new: 0, same: 0, update: 0, 'keep-mine': 0, conflict: 0, dup: 0, 'no-place': 0 };
  for (const r of rows) c[r.verdict]++;
  return c;
}

export type Choice = 'theirs' | 'mine' | 'both';

/** Bản nền mới sau khi nhận: ghi nhớ bản của đồng nghiệp đã thấy, để lần sau họ sửa tiếp mới tính là cập nhật. */
export function nextBase(base: Readonly<Record<string, string>>, rows: readonly PlanRow[], chosen: Readonly<Record<string, Choice>>): Record<string, string> {
  const out = { ...base };
  for (const r of rows) {
    if (r.verdict === 'new' || r.verdict === 'update' || r.verdict === 'same' || r.verdict === 'keep-mine') out[r.uid] = hashOf(r.theirs.latex);
    else if (r.verdict === 'conflict' && chosen[r.uid]) out[r.uid] = hashOf(r.theirs.latex);
  }
  return out;
}
