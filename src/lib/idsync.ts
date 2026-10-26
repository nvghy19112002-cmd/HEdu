// ID6 theo CÂY CHƯƠNG TRÌNH: đọc mã chặt (không đoán), tạo mã chặt, và trạng thái đồng bộ giữa ID trong LaTeX với vị trí/mức độ đã lưu.
//   - Mã thiếu Dạng (vd 2D1H1) KHÔNG được hiểu là Dạng đầu tiên: trả 'thieu-dang' để giáo viên chọn.
//   - Hai nút anh em trùng mã ⇒ một ID6 chỉ tới hai Dạng: 'ma-trung', không đọc, không tạo mã đó.
//   - Tạo mã chỉ khi đủ đường dẫn Lớp → Phân môn → Chương → Bài → Dạng đúng trong cây (taxpath.checkLocation), không lấy mặc định "1".
// Đọc/ghi chữ trong LaTeX nằm ở idtex.ts; file này chỉ nói mã nào đúng.
import { readHead, sameCode, writeHeadId, type HeadRead, type WriteResult } from './idtex';
import { indexOf, type TaxIndex } from './taxonomy';
import { checkLocation, type PathProblem } from './taxpath';
import type { Level, Location, Question, Taxonomy } from './types';

/** Chữ mức độ trong ID6: N nhận biết, H thông hiểu, V vận dụng, C vận dụng cao. */
export const LEVEL_LETTER: Record<Level, string> = { NB: 'N', TH: 'H', VD: 'V', VDC: 'C' };

export type CodeProblem = 'sai-cu-phap' | 'thieu-dang' | 'khong-con' | 'ma-trung';

export const CODE_PROBLEM_LABEL: Record<CodeProblem, string> = {
  'sai-cu-phap': 'Mã sai cấu trúc',
  'thieu-dang': 'Mã thiếu Dạng',
  'khong-con': 'Mã không còn trong cây',
  'ma-trung': 'Cây có mã trùng — mã chỉ tới nhiều Dạng',
};

export type Resolved = { ok: true; loc: Location; level: Level; code: string } | { ok: false; problem: CodeProblem; level?: Level };

interface CodeIndex {
  ix: TaxIndex;
  /** khoá "LBC L-D" (hoa) → các formId mang mã đó (>1 = mã trùng) */
  forms: Map<string, string[]>;
  /** khoá tới Bài → các lessonId (để phân biệt "thiếu Dạng" với "không còn") */
  lessons: Map<string, string[]>;
}

const cache = new WeakMap<Taxonomy, CodeIndex>();
const up = (s: string) => s.toUpperCase();
const push = (m: Map<string, string[]>, k: string, v: string) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

function codeIndex(tax: Taxonomy): CodeIndex {
  const hit = cache.get(tax);
  if (hit) return hit;
  const ci: CodeIndex = { ix: indexOf(tax), forms: new Map(), lessons: new Map() };
  for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) for (const l of c.lessons) {
    const lk = up(g.code + b.code + c.code + l.code);
    push(ci.lessons, lk, l.id);
    for (const f of l.forms) push(ci.forms, `${lk}-${up(f.code)}`, f.id);
  }
  cache.set(tax, ci);
  return ci;
}

const CODE_RE = /^([0-9A-Za-z])([0-9A-Za-z])([0-9A-Za-z])([A-Za-z])([0-9A-Za-z])(?:-([0-9A-Za-z]))?$/;
const levelOf = (ch: string): Level | undefined => (Object.keys(LEVEL_LETTER) as Level[]).find((k) => LEVEL_LETTER[k] === up(ch));

/** Đọc chặt một mã ID6 theo cây. Không có giá trị mặc định nào. */
export function resolveCode(code: string, tax: Taxonomy): Resolved {
  const m = CODE_RE.exec(code.trim());
  if (!m) return { ok: false, problem: 'sai-cu-phap' };
  const [, gc, bc, cc, lv, lc, fc] = m;
  const level = levelOf(lv);
  if (!level) return { ok: false, problem: 'sai-cu-phap' };
  const ci = codeIndex(tax);
  const lk = up(gc + bc + cc + lc);
  if (!fc) {
    const ls = ci.lessons.get(lk);
    return { ok: false, problem: !ls ? 'khong-con' : ls.length > 1 ? 'ma-trung' : 'thieu-dang', level };
  }
  const fs = ci.forms.get(`${lk}-${up(fc)}`);
  if (!fs) return { ok: false, problem: 'khong-con', level };
  if (fs.length > 1) return { ok: false, problem: 'ma-trung', level };
  const p = ci.ix.get(fs[0])!;
  return { ok: true, level, code: `${up(gc + bc + cc)}${LEVEL_LETTER[level]}${up(lc)}-${up(fc)}`, loc: { grade: p.grade.grade, chapterId: p.chapter!.id, lessonId: p.lesson!.id, formId: fs[0] } };
}

export type StrictCode = { ok: true; code: string } | { ok: false; problem: PathProblem | 'ma-trung' };

/** ID6 của một vị trí + mức độ — chỉ khi vị trí đúng đủ đường dẫn và mã không chỉ tới Dạng khác. */
export function strictCode(loc: Location, level: Level, tax: Taxonomy): StrictCode {
  const ci = codeIndex(tax);
  const chk = checkLocation(ci.ix, loc);
  if (!chk.ok) return chk;
  const p = chk.place;
  const key = up(p.grade.code + p.branch!.code + p.chapter!.code + p.lesson!.code) + '-' + up(p.form!.code);
  if ((ci.forms.get(key)?.length ?? 0) !== 1) return { ok: false, problem: 'ma-trung' };
  return { ok: true, code: `${up(p.grade.code + p.branch!.code + p.chapter!.code)}${LEVEL_LETTER[level]}${up(p.lesson!.code)}-${up(p.form!.code)}` };
}

// ---------- ID trong LaTeX ----------

export type LatexIdState = 'hop-le' | 'khong-co' | 'nhieu-id' | 'khong-phai-ex' | CodeProblem;

export const LATEX_ID_LABEL: Record<LatexIdState, string> = {
  'hop-le': 'ID hợp lệ',
  'khong-co': 'Chưa có ID',
  'nhieu-id': 'Có nhiều ID mâu thuẫn',
  'khong-phai-ex': 'Không phải khối \\begin{ex}',
  ...CODE_PROBLEM_LABEL,
};

export interface LatexId {
  state: LatexIdState;
  head: HeadRead;
  /** mã thô trong LaTeX (ứng viên đầu tiên), null nếu không có */
  raw: string | null;
  /** khi hợp lệ: vị trí + mức độ đọc từ mã */
  resolved: Extract<Resolved, { ok: true }> | null;
  /** mức độ đọc được (kể cả khi mã thiếu Dạng) */
  level?: Level;
}

/** Đọc ID chính của câu và kiểm theo cây. Nhiều ID giống nhau (lặp) vẫn là 'nhieu-id': giáo viên dọn, HEdu không tự xoá. */
export function readLatexId(latex: string, tax: Taxonomy): LatexId {
  const head = readHead(latex);
  const raw = head.ids[0]?.code ?? null;
  const base = { head, raw, resolved: null };
  if (head.beginEnd < 0) return { ...base, state: 'khong-phai-ex' };
  if (head.ids.length === 0) return { ...base, state: 'khong-co' };
  if (head.ids.length > 1) return { ...base, state: 'nhieu-id' };
  const r = resolveCode(raw!, tax);
  if (r.ok) return { ...base, state: 'hop-le', resolved: r, level: r.level };
  return { ...base, state: r.problem, level: r.level };
}

// ---------- đồng bộ LaTeX ↔ vị trí/mức độ ----------

export type SyncState =
  /** ID trong LaTeX hợp lệ và đúng bằng mã tính từ vị trí/mức độ */
  | 'khop'
  /** vị trí đúng nhưng LaTeX chưa có ID (dữ liệu cũ) — đồng bộ được bằng cách THÊM */
  | 'chua-co-id'
  /** ID trong LaTeX hợp lệ nhưng khác mã theo vị trí — giáo viên chọn bên nào đúng */
  | 'lech'
  /** ID trong LaTeX lỗi (thiếu Dạng, sai, không còn, nhiều ID…) — cần giáo viên sửa */
  | 'id-loi'
  /** vị trí/mức độ đã lưu không ra được mã hợp lệ (sai đường dẫn, mã trùng) */
  | 'vi-tri-loi';

export const SYNC_LABEL: Record<SyncState, string> = {
  khop: 'ID khớp vị trí',
  'chua-co-id': 'LaTeX chưa có ID',
  lech: 'ID trong LaTeX khác vị trí',
  'id-loi': 'ID trong LaTeX bị lỗi',
  'vi-tri-loi': 'Vị trí không ra được ID',
};

export interface IdStatus {
  latex: LatexId;
  meta: StrictCode;
  state: SyncState;
}

type Placed = Pick<Question, 'latex' | 'level'> & Location;

export function idStatus(q: Placed, tax: Taxonomy): IdStatus {
  const latex = readLatexId(q.latex, tax);
  const meta = strictCode(q, q.level, tax);
  const state: SyncState = !meta.ok ? 'vi-tri-loi'
    : latex.state === 'khong-co' ? 'chua-co-id'
    : latex.state === 'hop-le' ? (sameCode(latex.resolved!.code, meta.code) ? 'khop' : 'lech')
    : 'id-loi';
  return { latex, meta, state };
}

/**
 * Đặt vị trí/mức độ MỚI do giáo viên xác nhận cho câu, kèm ID trong LaTeX — cả hai, hoặc không gì cả.
 * `replace`: giáo viên đã thấy ID cũ → ID mới và đồng ý thay (Gán ID, đổi vị trí). Không có thì chỉ thêm khi chưa có ID.
 * Trả null khi không thể giữ nhất quán (vị trí mới không ra mã, LaTeX có nhiều ID, cần xác nhận thay…): KHÔNG được ghi nửa vời.
 */
export function placeWithId(latex: string, loc: Location, level: Level, tax: Taxonomy, replace: boolean): { latex: string; code: string; write: WriteResult } | { problem: string } {
  const sc = strictCode(loc, level, tax);
  if (!sc.ok) return { problem: sc.problem };
  const w = writeHeadId(latex, sc.code, replace ? 'thay' : 'them');
  if (w.action === 'bo-qua') return { problem: w.reason };
  return { latex: w.latex, code: sc.code, write: w };
}

// ---------- mã anh em trùng trong cây ----------

export interface CodeClash { kind: 'grade' | 'branch' | 'chapter' | 'lesson' | 'form'; parentName: string; code: string; names: string[] }

/** Các nhóm nút anh em cùng mã (không phân biệt hoa/thường) — mỗi nhóm làm ID6 của câu trong đó mơ hồ. */
export function codeClashes(tax: Taxonomy): CodeClash[] {
  const out: CodeClash[] = [];
  const check = (kind: CodeClash['kind'], parentName: string, nodes: readonly { code: string; name: string }[]) => {
    const by = new Map<string, string[]>();
    for (const n of nodes) push(by, up(n.code), n.name);
    for (const [code, names] of by) if (names.length > 1) out.push({ kind, parentName, code, names });
  };
  check('grade', tax.name, tax.grades);
  for (const g of tax.grades) {
    check('branch', g.name, g.branches);
    for (const b of g.branches) {
      check('chapter', b.name, b.chapters);
      for (const c of b.chapters) {
        check('lesson', c.name, c.lessons);
        for (const l of c.lessons) check('form', l.name, l.forms);
      }
    }
  }
  return out;
}

/**
 * Câu mà ID6 sẽ ĐỔI nếu cây đổi từ `before` sang `after` (đổi mã, chuyển nút…). Đổi tên không làm đổi ID ⇒ không liệt kê.
 * Dùng trước khi lưu cây để báo giáo viên: ID trong LaTeX của các câu này sẽ lệch tới khi đồng bộ.
 */
export function affectedByTaxChange(qs: readonly Placed[], before: Taxonomy, after: Taxonomy): number {
  let n = 0;
  for (const q of qs) {
    const a = strictCode(q, q.level, before);
    const b = strictCode(q, q.level, after);
    if (a.ok !== b.ok || (a.ok && b.ok && a.code !== b.code)) n++;
  }
  return n;
}

/**
 * Mã LaTeX của câu khi XUẤT ra ngoài (bản chép, ngân hàng không đổi): câu cũ chưa có ID được thêm ID theo vị trí đã lưu;
 * mọi câu khác xuất nguyên văn (ID khớp thì đã có sẵn; ID lệch/lỗi thì giữ để giáo viên thấy và sửa, không tự chọn bên nào).
 */
export function latexForExport(q: Placed, tax: Taxonomy): string {
  const st = idStatus(q, tax);
  if (st.state !== 'chua-co-id' || !st.meta.ok) return q.latex;
  return writeHeadId(q.latex, st.meta.code, 'them').latex;
}
