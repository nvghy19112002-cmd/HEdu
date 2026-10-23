// Bộ nhãn chuẩn: giáo viên gắn nhãn một mẫu cặp câu, rồi đo bộ dò đúng/sai bao nhiêu trên NGÂN HÀNG THẬT.
// Không tự huấn luyện, không đổi ngưỡng; chỉ đo và báo cáo. Nhãn lưu ở tệp phụ (dupdecisions), không vào dữ liệu ngân hàng.
import type { DupPairHit } from './dupindex';
import type { GoldLabel, GoldRec } from './dupdecisions';
import type { Question } from './types';

export const GOLD_TARGET = 150;
export type GoldKind = 'raw' | 'conflict' | 'same' | 'near' | 'template' | 'insufficient' | 'none';
export interface GoldItem { a: string; b: string; kind: GoldKind }

const lcg = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const key = (x: string, y: string) => (x <= y ? `${x}|${y}` : `${y}|${x}`);
function pick<T>(arr: T[], n: number, rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

/**
 * Lấy mẫu phân tầng: mỗi loại bộ dò báo (chắc trùng, mâu thuẫn, cùng câu, gần trùng, cùng mẫu, chưa đủ bằng chứng) một phần,
 * cộng một nhóm "đối chứng": cặp cùng bài mà bộ dò KHÔNG báo — để biết bộ dò có bỏ sót không.
 * `skip` = các cặp đã gắn nhãn hợp lệ (không hỏi lại).
 */
export function sampleGold(questions: Question[], pairs: DupPairHit[], skip: ReadonlySet<string>, n = GOLD_TARGET, seed = 20261023): GoldItem[] {
  const rnd = lcg(seed);
  const reported = new Set(pairs.map((p) => key(p.a, p.b)));
  const by: Record<string, DupPairHit[]> = {};
  for (const p of pairs) if (!skip.has(key(p.a, p.b))) (by[p.result.kind] ??= []).push(p);
  const quota: [GoldKind, number][] = [['raw', 0.1], ['same', 0.15], ['conflict', 0.1], ['near', 0.25], ['template', 0.15], ['insufficient', 0.05]];
  const out: GoldItem[] = [];
  for (const [k, f] of quota) for (const p of pick(by[k] ?? [], Math.round(n * f), rnd)) out.push({ a: p.a, b: p.b, kind: k });
  // đối chứng: cặp cùng bài, bộ dò không báo
  const lessons = new Map<string, Question[]>();
  for (const q of questions) if (q.lessonId) { const l = lessons.get(q.lessonId) ?? []; l.push(q); lessons.set(q.lessonId, l); }
  const pools = [...lessons.values()].filter((l) => l.length >= 2);
  const want = Math.max(0, n - out.length);
  const ctrl: GoldItem[] = [];
  const seen = new Set(out.map((o) => key(o.a, o.b)));
  for (let tries = 0; ctrl.length < want && tries < want * 40 && pools.length; tries++) {
    const pool = pools[Math.floor(rnd() * pools.length)];
    const i = Math.floor(rnd() * pool.length); let j = Math.floor(rnd() * pool.length); if (i === j) continue;
    const k = key(pool[i].uid, pool[j].uid);
    if (reported.has(k) || skip.has(k) || seen.has(k)) continue;
    seen.add(k); ctrl.push({ a: pool[i].uid, b: pool[j].uid, kind: 'none' });
  }
  const all = [...out, ...ctrl];
  return pick(all, all.length, rnd); // trộn để gắn nhãn không biết loại nào
}

export interface GoldReport {
  total: number; unsure: number;
  matrix: Record<string, Record<GoldLabel, number>>;
  /** Trong các cặp bộ dò xếp "chắc trùng" (giống nguyên mã + cùng câu): tỉ lệ giáo viên cho là trùng thật. */
  sureN: number; sureTrue: number;
  /** Trong nhóm hiển thị mặc định (nguyên mã/mâu thuẫn/cùng câu/gần trùng): tỉ lệ trùng thật, và tỉ lệ "trùng thật hoặc giống nhưng giữ cả hai". */
  viewN: number; viewTrue: number; viewRelated: number;
  /** Số cặp giáo viên cho là trùng thật nhưng bộ dò xếp ngoài nhóm hiển thị mặc định (bỏ sót / bị ẩn). */
  missed: { kind: string; n: number }[]; trueTotal: number; trueInView: number;
  /** Mẫu phân tầng ⇒ con số tổng chỉ để tham khảo; đáng tin nhất là số theo từng loại. */
  caveat: string;
}
const VIEW = new Set(['raw', 'conflict', 'same', 'near']);
export function evaluateGold(recs: GoldRec[]): GoldReport {
  const labels: GoldLabel[] = ['true_dup', 'keep_both', 'different', 'unsure'];
  const matrix: Record<string, Record<GoldLabel, number>> = {};
  for (const r of recs) { const m = (matrix[r.kind] ??= { true_dup: 0, keep_both: 0, different: 0, unsure: 0 }); m[r.label]++; }
  const sum = (kinds: string[], l: GoldLabel[]) => kinds.reduce((t, k) => t + l.reduce((u, x) => u + (matrix[k]?.[x] ?? 0), 0), 0);
  const known: GoldLabel[] = ['true_dup', 'keep_both', 'different'];
  const sureKinds = ['raw', 'same'], viewKinds = [...VIEW];
  const trueByKind = Object.keys(matrix).map((k) => ({ kind: k, n: matrix[k].true_dup })).filter((x) => x.n > 0);
  const trueTotal = trueByKind.reduce((t, x) => t + x.n, 0);
  const trueInView = trueByKind.filter((x) => VIEW.has(x.kind)).reduce((t, x) => t + x.n, 0);
  void labels;
  return {
    total: recs.length, unsure: recs.filter((r) => r.label === 'unsure').length, matrix,
    sureN: sum(sureKinds, known), sureTrue: sum(sureKinds, ['true_dup']),
    viewN: sum(viewKinds, known), viewTrue: sum(viewKinds, ['true_dup']), viewRelated: sum(viewKinds, ['true_dup', 'keep_both']),
    missed: trueByKind.filter((x) => !VIEW.has(x.kind)), trueTotal, trueInView,
    caveat: 'Mẫu được lấy phân tầng theo loại bộ dò báo, nên các tỉ lệ chung chỉ để tham khảo; đáng tin nhất là số đếm theo từng loại. Cặp “Chưa chắc” không tính vào tỉ lệ.',
  };
}
