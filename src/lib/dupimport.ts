// Rà soát trùng trước khi nhập: câu mới ↔ ngân hàng VÀ câu mới ↔ câu mới trong cùng lô.
// CHỈ ĐỌC. Không đưa bản nháp vào ngân hàng; dùng chung bộ lõi dup2 + DupIndex với màn Kiểm tra trùng.
import { getSharedIndex, type DupIndex, type QLike } from './dupindex';
import { candidatePairs, Slicer } from './dupjoin';
import { comparePair, fingerprint, DUP_KIND_RANK, type DupKind, type Fingerprint, type PairResult } from './dup2';

export interface DraftIn { id: string; latex: string }
export interface DraftHit {
  with: 'bank' | 'batch';
  /** uid câu trong kho, hoặc id nháp trong lô */
  other: string;
  kind: DupKind;
  result: PairResult;
}
export interface DraftAnalysis {
  id: string;
  hits: DraftHit[];                 // nặng nhất lên đầu, tối đa MAX_HITS
  /** Nặng nhất trong các nghi vấn (bỏ 'unrelated'); null = không thấy câu nào giống */
  worst: DupKind | null;
  /** Chính câu này chưa đọc đủ (lỗi cú pháp/thiếu thành phần) */
  unreadable: boolean;
}
export type Decision = 'import' | 'skip' | 'hold';
export const MAX_HITS = 12;

/** Thứ tự nghiêm trọng khi nhập: mâu thuẫn > giống nguyên mã > cùng câu > gần trùng > chưa đủ bằng chứng > cùng mẫu. */
export const IMPORT_RANK: Record<DupKind, number> = { conflict: 0, raw: 1, same: 2, near: 3, insufficient: 4, template: 5, unrelated: 6 };
const KEEP: DupKind[] = ['conflict', 'raw', 'same', 'near', 'insufficient', 'template'];
export const BLOCKING: DupKind[] = ['conflict', 'raw', 'same', 'near'];
const cmp = (a: DraftHit, b: DraftHit) => IMPORT_RANK[a.kind] - IMPORT_RANK[b.kind] || b.result.score - a.result.score || (a.other < b.other ? -1 : a.other > b.other ? 1 : 0);

export interface AnalyzeOptions {
  index?: DupIndex;
  batch?: number;
  signal?: { aborted: boolean };
  onProgress?: (done: number, total: number, phase: 'bank' | 'draft') => void;
}
export interface AnalyzeResult { rows: (DraftAnalysis | undefined)[]; complete: boolean }

/**
 * Phân tích cả lô bằng phép nối ĐẦY ĐỦ (dupjoin.ts): mọi câu mới được so với MỌI câu trong kho và trong lô có thể trùng —
 * không giới hạn ứng viên. Chưa xong (huỷ giữa chừng) ⇒ complete=false và các dòng chưa xử lý là undefined — KHÔNG được coi là "không trùng".
 */
/**
 * Kết quả lần rà gần nhất, để lần sau (giáo viên sửa vài câu trong lô) chỉ so lại các câu ĐÃ ĐỔI thay vì cả lô × cả kho.
 * Chỉ dùng lại khi cùng kho (cùng mảng), cùng chỉ mục, cùng danh sách id nháp; khác thì rà lại từ đầu.
 */
interface Memo { bank: readonly QLike[]; idx: DupIndex; ids: string[]; latex: string[]; fps: Fingerprint[]; hits: DraftHit[][]; trimmed: boolean[] }
let memo: Memo | null = null;

export async function analyzeDrafts(drafts: DraftIn[], bank: QLike[], opt: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const idx = opt.index ?? getSharedIndex();
  const rows: (DraftAnalysis | undefined)[] = new Array(drafts.length).fill(undefined);
  if (!(await idx.sync(bank, { signal: opt.signal, onProgress: (d, t) => opt.onProgress?.(d, t, 'bank') }))) return { rows, complete: false };

  // phía B = kho + lô; phía A = lô (hoặc chỉ các câu vừa đổi khi dùng lại lần rà trước). Bản nháp KHÔNG được đưa vào chỉ mục dùng chung.
  const nb = bank.length, n = nb + drafts.length;
  const m = memo;
  let reuse = !!m && m.bank === bank && m.idx === idx && m.ids.length === drafts.length && drafts.every((d, i) => d.id === m.ids[i]);
  const changed = drafts.map((d, i) => !reuse || d.latex !== m!.latex[i]);
  const changedIds = new Set(drafts.filter((_, i) => changed[i]).map((d) => d.id));
  // danh sách cũ đã bị cắt bớt mà nay mất phần tử (do câu đổi) thì không còn chắc đủ: rà lại từ đầu
  let start: DraftHit[][] = [];
  if (reuse) {
    start = m!.hits.map((l, i) => (changed[i] ? [] : l.filter((h) => !(h.with === 'batch' && changedIds.has(h.other)))));
    if (start.some((l, i) => !changed[i] && m!.trimmed[i] && l.length < m!.hits[i].length)) reuse = false;
  }
  if (!reuse) { start = drafts.map(() => []); changed.fill(true); }

  const fps: Fingerprint[] = bank.map((q) => idx.get(q.uid)!);
  const sl = new Slicer(opt.signal);
  for (let i = 0; i < drafts.length; i++) {
    fps.push(changed[i] ? fingerprint(drafts[i].latex) : m!.fps[i]);
    if ((i & 63) === 0 && !(await sl.step())) return { rows, complete: false };
  }
  const inA = new Uint8Array(n);
  for (let i = 0; i < drafts.length; i++) if (changed[i]) inA[nb + i] = 1;
  const SCALE = 1000;
  const hits: DraftHit[][] = start;
  const trimmed: boolean[] = reuse ? m!.trimmed.map((t, i) => !changed[i] && t) : drafts.map(() => false);
  if (inA.includes(1)) {
    const cand = await candidatePairs(fps, inA, { signal: opt.signal, onProgress: (f) => opt.onProgress?.(Math.round(f * SCALE * 0.8), SCALE, 'draft') });
    if (!cand) return { rows, complete: false };
    const add = (d: number, h: DraftHit) => { const l = hits[d]; l.push(h); if (l.length >= 4 * MAX_HITS) { l.sort(cmp); l.length = MAX_HITS; trimmed[d] = true; } };
    for (let k = 0; k < cand.length; k++) {
      if ((k & 1023) === 0) { opt.onProgress?.(Math.round(SCALE * (0.8 + (0.2 * k) / cand.length)), SCALE, 'draft'); if (!(await sl.step())) return { rows, complete: false }; }
      const i = Math.floor(cand[k] / n), j = cand[k] - i * n; // i < j, j luôn là bản nháp
      const r = comparePair(fps[i], fps[j]);
      if (!KEEP.includes(r.kind)) continue;
      const dj = j - nb;
      if (i < nb) add(dj, { with: 'bank', other: bank[i].uid, kind: r.kind, result: r });
      else { const di = i - nb; add(di, { with: 'batch', other: drafts[dj].id, kind: r.kind, result: r }); add(dj, { with: 'batch', other: drafts[di].id, kind: r.kind, result: r }); }
    }
  }
  drafts.forEach((d, i) => {
    const h = hits[i].sort(cmp);
    rows[i] = { id: d.id, hits: h.slice(0, MAX_HITS), worst: h[0]?.kind ?? null, unreadable: !fps[nb + i].complete };
  });
  memo = { bank, idx, ids: drafts.map((d) => d.id), latex: drafts.map((d) => d.latex), fps: fps.slice(nb), hits, trimmed };
  opt.onProgress?.(SCALE, SCALE, 'draft');
  return { rows, complete: true };
}

/** Bỏ kết quả rà đã nhớ (dùng trong test). */
export const resetAnalyzeMemo = () => { memo = null; };

/**
 * Quyết định mặc định cho từng câu (giáo viên đổi được):
 *  - không giống câu nào / chỉ "cùng mẫu khác dữ kiện" ⇒ nhập;
 *  - giống nguyên mã / cùng câu với KHO, hoặc với một câu ĐỨNG TRƯỚC trong lô ⇒ bỏ qua (có hiển thị rõ lý do);
 *  - mâu thuẫn đáp án, gần trùng ⇒ CHƯA QUYẾT ĐỊNH (bắt buộc giáo viên chọn).
 */
export function defaultDecisions(drafts: DraftIn[], rows: (DraftAnalysis | undefined)[]): Record<string, Decision> {
  const order = new Map(drafts.map((d, i) => [d.id, i] as const));
  const out: Record<string, Decision> = {};
  drafts.forEach((d, i) => {
    const a = rows[i];
    if (!a) { out[d.id] = 'hold'; return; }
    const earlier = (h: DraftHit) => h.with === 'bank' || (order.get(h.other) ?? 0) < i;
    const sure = a.hits.some((h) => (h.kind === 'raw' || h.kind === 'same') && earlier(h));
    const conflict = a.hits.some((h) => h.kind === 'conflict');
    const near = a.hits.some((h) => h.kind === 'near');
    out[d.id] = conflict ? 'hold' : sure ? 'skip' : near ? 'hold' : 'import';
  });
  return out;
}

/**
 * Các nghi vấn dùng khi xét "Duyệt theo lô": bỏ các bản sao y hệt (raw/same) ĐỨNG SAU trong cùng lô — bản sau mặc định bị bỏ qua,
 * nên bản đầu tiên coi như câu mới. Trả về null nếu danh sách bị cắt (MAX_HITS) mà lại vừa bỏ bớt: khi đó không chắc phần bị cắt
 * không có nghi vấn khác ⇒ không duyệt.
 */
export function hitsForTrust(a: DraftAnalysis, i: number, orderOf: (draftId: string) => number): DraftHit[] | null {
  const kept = a.hits.filter((h) => !(h.with === 'batch' && (h.kind === 'raw' || h.kind === 'same') && orderOf(h.other) > i));
  if (kept.length < a.hits.length && a.hits.length >= MAX_HITS) return null;
  return kept;
}

/** Dấu hiệu "kho có thêm câu trùng" dùng để phát hiện kho đã đổi giữa lúc rà soát và lúc bấm Nhập. */
export function bankHitSignature(rows: (DraftAnalysis | undefined)[]): string {
  const s: string[] = [];
  for (const a of rows) if (a) for (const h of a.hits) if (h.with === 'bank' && BLOCKING.includes(h.kind)) s.push(`${a.id}>${h.other}:${h.kind}`);
  return s.sort().join(',');
}

export interface ImportSummary { total: number; importN: number; skipN: number; holdN: number; keptSuspect: number; keptPairs: number }
export function summarize(drafts: DraftIn[], rows: (DraftAnalysis | undefined)[], dec: Record<string, Decision>): ImportSummary {
  let importN = 0, skipN = 0, holdN = 0, keptSuspect = 0;
  drafts.forEach((d, i) => {
    const x = dec[d.id] ?? 'hold';
    // nghi trùng còn hiệu lực: với kho, hoặc với câu trong lô CŨNG được nhập (bản sao bị bỏ qua thì bản đầu không còn trùng)
    const live = (h: DraftHit) => BLOCKING.includes(h.kind) && (h.with === 'bank' || (dec[h.other] ?? 'hold') === 'import');
    if (x === 'import') { importN++; if (rows[i]?.hits.some(live)) keptSuspect++; } else if (x === 'skip') skipN++; else holdN++;
  });
  // cặp trong lô mà cả hai đều được nhập
  let keptPairs = 0;
  const imp = new Set(drafts.filter((d) => dec[d.id] === 'import').map((d) => d.id));
  drafts.forEach((d, i) => { if (!imp.has(d.id)) return; for (const h of rows[i]?.hits ?? []) if (h.with === 'batch' && BLOCKING.includes(h.kind) && imp.has(h.other) && h.other > d.id) keptPairs++; });
  return { total: drafts.length, importN, skipN, holdN, keptSuspect, keptPairs };
}

export const rankOf = (k: DupKind | null): number => (k ? DUP_KIND_RANK[k] : 99);
