// Rà soát trùng trước khi nhập: câu mới ↔ ngân hàng VÀ câu mới ↔ câu mới trong cùng lô.
// CHỈ ĐỌC. Không đưa bản nháp vào ngân hàng; dùng chung bộ lõi dup2 + DupIndex với màn Kiểm tra trùng.
import { DupIndex, getSharedIndex, type QLike } from './dupindex';
import { fingerprint, DUP_KIND_RANK, type DupKind, type PairResult } from './dup2';

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

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Phân tích cả lô. Chưa xong (huỷ giữa chừng) ⇒ complete=false và các dòng chưa xử lý là undefined — KHÔNG được coi là "không trùng". */
export async function analyzeDrafts(drafts: DraftIn[], bank: QLike[], opt: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const batch = opt.batch ?? 25;
  const idx = opt.index ?? getSharedIndex();
  const rows: (DraftAnalysis | undefined)[] = new Array(drafts.length).fill(undefined);
  if (!(await idx.sync(bank, { signal: opt.signal, onProgress: (d, t) => opt.onProgress?.(d, t, 'bank') }))) return { rows, complete: false };

  // chỉ mục tạm riêng cho cặp mới↔mới (không lẫn vào kho)
  const mine = new DupIndex();
  for (const d of drafts) mine.upsert(d.id, d.latex);

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const f = fingerprint(d.latex);
    const hits: DraftHit[] = [];
    for (const h of idx.relatedFp(f)) if (KEEP.includes(h.result.kind)) hits.push({ with: 'bank', other: h.uid, kind: h.result.kind, result: h.result });
    for (const h of mine.relatedFp(f, { exclude: d.id })) if (KEEP.includes(h.result.kind)) hits.push({ with: 'batch', other: h.uid, kind: h.result.kind, result: h.result });
    hits.sort(cmp);
    rows[i] = { id: d.id, hits: hits.slice(0, MAX_HITS), worst: hits[0]?.kind ?? null, unreadable: !f.complete };
    if ((i + 1) % batch === 0) {
      opt.onProgress?.(i + 1, drafts.length, 'draft');
      await tick();
      if (opt.signal?.aborted) return { rows, complete: false };
    }
  }
  opt.onProgress?.(drafts.length, drafts.length, 'draft');
  return { rows, complete: true };
}

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
    if (x === 'import') { importN++; if (rows[i]?.hits.some((h) => BLOCKING.includes(h.kind))) keptSuspect++; } else if (x === 'skip') skipN++; else holdN++;
  });
  // cặp trong lô mà cả hai đều được nhập
  let keptPairs = 0;
  const imp = new Set(drafts.filter((d) => dec[d.id] === 'import').map((d) => d.id));
  drafts.forEach((d, i) => { if (!imp.has(d.id)) return; for (const h of rows[i]?.hits ?? []) if (h.with === 'batch' && BLOCKING.includes(h.kind) && imp.has(h.other) && h.other > d.id) keptPairs++; });
  return { total: drafts.length, importN, skipN, holdN, keptSuspect, keptPairs };
}

export const rankOf = (k: DupKind | null): number => (k ? DUP_KIND_RANK[k] : 99);
