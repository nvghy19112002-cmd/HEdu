// Gợi ý vị trí (Chương › Bài › Dạng) cho câu hỏi dựa trên ngân hàng — chạy hoàn toàn trên máy, KHÔNG gọi mạng.
// Chỉ là GỢI Ý: không ghi gì vào ngân hàng; mức độ chỉ để tham khảo (giáo viên tick riêng mới đổi).
//
// Hai nguồn bằng chứng (thuật toán và ngưỡng lấy từ đo GĐ0 trên 313 câu thật, kiểm định chéo 5 phần theo họ):
//   1. Từ khoá (TF-IDF): so câu với "tâm" từ khoá của từng Dạng cùng lớp — đoán Dạng top-1 tốt nhất (≈75%, top-3 ≈90%).
//   2. Câu giống (DupIndex): mỗi họ câu gần trùng/cùng mẫu chỉ được MỘT phiếu — dùng làm dẫn chứng và để xếp nhãn "cao".
// Nhãn tin cậy là nhãn hiển thị, KHÔNG phải xác suất. Điểm dò trùng cũng không phải xác suất đúng Dạng.
import { comparePair, fingerprint, type DupKind, type Fingerprint } from './dup2';
import { DupIndex } from './dupindex';
import { indexOf, type TaxIndex } from './taxonomy';
import { checkLocation, locationOfForm, taxRevision } from './taxpath';
import type { Level, Location, Question, Taxonomy } from './types';

export type SuggestConfidence = 'cao' | 'vua' | 'thap' | 'khong';

export const CONFIDENCE_LABEL: Record<SuggestConfidence, string> = {
  cao: 'Tin cậy cao', vua: 'Tin cậy vừa', thap: 'Tin cậy thấp', khong: 'Không đủ căn cứ',
};

/** Ngưỡng đo được ở GĐ0 (nhãn "cao": đúng 95–98%, phủ 13–15% trên kho thử). Đổi ngưỡng ⇒ đo lại. */
export const SUGGEST_THRESHOLDS = { knnTopK: 25, highMinFamilies: 2, highMinShare: 0.8, highMinScore: 0.3, fewSamples: 5 } as const;

/** Các loại cặp coi là cùng một "họ" (gần trùng / cùng mẫu): cả họ chỉ được một phiếu. */
const FAMILY_KINDS: ReadonlySet<DupKind> = new Set<DupKind>(['raw', 'same', 'near', 'template', 'conflict']);

export interface SuggestInput {
  /** khoá ổn định trong phiên: uid với câu đã lưu, id bản nháp với câu đang nhập */
  key: string;
  latex: string;
  /** lớp đích — gợi ý không bao giờ ra ngoài lớp này */
  grade: number;
  /** uid của chính câu này trong ngân hàng (nếu có) để không tự bỏ phiếu cho vị trí hiện tại */
  excludeUid?: string;
}

export interface SuggestOption { formId: string; location: Location }

export interface SuggestEvidence { uid: string; formId: string; score: number; kind: DupKind }

export interface Suggestion {
  key: string;
  best: SuggestOption | null;
  /** tối đa 2 phương án khác, đã kiểm đường dẫn cây */
  alternatives: SuggestOption[];
  confidence: SuggestConfidence;
  /** mức độ gợi ý — CHỈ THAM KHẢO */
  levelHint: Level | null;
  /** tối đa 5 câu mẫu dẫn chứng (mỗi họ một câu), điểm cao trước */
  evidence: SuggestEvidence[];
  notes: string[];
  /** dấu phiên bản cây lúc gợi ý: khác lúc áp dụng ⇒ gợi ý đã cũ */
  taxRev: string;
}

function tokens(latex: string): string[] {
  const s = latex.replace(/(^|[^\\])%.*$/gm, '$1').toLowerCase();
  const out: string[] = [];
  for (const m of s.matchAll(/\\[a-z]+|[\p{L}]{2,}/gu)) out.push(m[0]);
  return out;
}

function counts(xs: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

export class IdSuggester {
  private readonly ix: TaxIndex;
  readonly taxRev: string;
  private readonly refs = new Map<string, Question>();
  private readonly dup = new DupIndex();
  private readonly df = new Map<string, number>();
  /** tổng vectơ từ khoá (chưa chuẩn hoá) của mỗi Dạng, theo lớp */
  private readonly sums = new Map<number, Map<string, Map<string, number>>>();
  private readonly normSq = new Map<string, number>();
  private readonly support = new Map<string, number>();

  /** `questions`: ngân hàng hiện tại. Câu có vị trí sai đường dẫn cây KHÔNG được dùng làm mẫu. */
  constructor(tax: Taxonomy, questions: readonly Question[]) {
    this.ix = indexOf(tax);
    this.taxRev = taxRevision(tax);
    for (const q of questions) if (checkLocation(this.ix, q).ok) this.refs.set(q.uid, q);
    for (const q of this.refs.values()) {
      this.dup.upsert(q.uid, q.latex);
      for (const t of counts(tokens(q.latex)).keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.support.set(q.formId, (this.support.get(q.formId) ?? 0) + 1);
    }
    for (const q of this.refs.values()) {
      const byForm = this.sums.get(q.grade) ?? new Map<string, Map<string, number>>();
      this.sums.set(q.grade, byForm);
      const sum = byForm.get(q.formId) ?? new Map<string, number>();
      byForm.set(q.formId, sum);
      for (const [t, w] of this.vec(q.latex)) sum.set(t, (sum.get(t) ?? 0) + w);
    }
    for (const byForm of this.sums.values()) for (const [f, sum] of byForm) { let n = 0; for (const w of sum.values()) n += w * w; this.normSq.set(f, n); }
  }

  /** Số câu mẫu hợp lệ đang dùng. */
  get size(): number { return this.refs.size; }

  private idf(t: string): number { return Math.log((this.refs.size + 1) / ((this.df.get(t) ?? 0) + 1)) + 1; }

  private vec(latex: string): Map<string, number> {
    const v = new Map<string, number>();
    let n = 0;
    for (const [t, c] of counts(tokens(latex))) { const w = (1 + Math.log(c)) * this.idf(t); v.set(t, w); n += w * w; }
    n = Math.sqrt(n) || 1;
    for (const [t, w] of v) v.set(t, w / n);
    return v;
  }

  /** Xếp Dạng cùng lớp theo độ gần từ khoá; trừ đóng góp của chính câu `self` khỏi tâm Dạng của nó. */
  private byKeywords(latex: string, grade: number, self?: Question): { formId: string; s: number }[] {
    const byForm = this.sums.get(grade);
    if (!byForm) return [];
    const v = this.vec(latex);
    const sv = self && self.grade === grade ? this.vec(self.latex) : null;
    const out: { formId: string; s: number }[] = [];
    for (const [f, sum] of byForm) {
      let dot = 0;
      for (const [t, w] of v) dot += w * (sum.get(t) ?? 0);
      let nSq = this.normSq.get(f) ?? 0;
      if (sv && self!.formId === f) {
        let sumSelf = 0, vSelf = 0;
        for (const [t, w] of sv) { sumSelf += w * (sum.get(t) ?? 0); vSelf += w * (v.get(t) ?? 0); }
        dot -= vSelf;
        nSq += -2 * sumSelf + 1;
        if (nSq < 1e-9) continue; // Dạng chỉ có đúng câu này
      }
      const s = dot / Math.sqrt(nSq);
      if (s > 0) out.push({ formId: f, s });
    }
    return out.sort((a, b) => b.s - a.s || (a.formId < b.formId ? -1 : 1));
  }

  /** Câu giống trong ngân hàng, gom theo họ (một phiếu/họ), chỉ cùng lớp. */
  private byNeighbours(fp: Fingerprint, grade: number, excludeUid?: string) {
    const hits = this.dup.relatedFp(fp, { topK: SUGGEST_THRESHOLDS.knnTopK, exclude: excludeUid })
      .filter((h) => this.refs.get(h.uid)?.grade === grade)
      .sort((a, b) => b.result.score - a.result.score || (a.uid < b.uid ? -1 : 1));
    // họ: hai ứng viên gần trùng/cùng mẫu với nhau thì chung họ (hợp nhất bắc cầu)
    const parent = hits.map((_, i) => i);
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
      const a = this.dup.get(hits[i].uid), b = this.dup.get(hits[j].uid);
      if (a && b && FAMILY_KINDS.has(comparePair(a, b).kind)) { const x = find(i), y = find(j); if (x !== y) parent[y] = x; }
    }
    const famBest = new Map<number, SuggestEvidence>();
    hits.forEach((h, i) => { const r = find(i); if (!famBest.has(r)) famBest.set(r, { uid: h.uid, formId: this.refs.get(h.uid)!.formId, score: h.result.score, kind: h.result.kind }); });
    const fams = [...famBest.values()];
    const vote = new Map<string, { v: number; fams: number }>();
    const lv = new Map<Level, number>();
    for (const e of fams) {
      const x = vote.get(e.formId) ?? { v: 0, fams: 0 }; x.v += e.score; x.fams++; vote.set(e.formId, x);
      const lvl = this.refs.get(e.uid)!.level; lv.set(lvl, (lv.get(lvl) ?? 0) + e.score);
    }
    const ranked = [...vote.entries()].map(([formId, x]) => ({ formId, ...x })).sort((a, b) => b.v - a.v || (a.formId < b.formId ? -1 : 1));
    const total = ranked.reduce((s, x) => s + x.v, 0);
    const levelHint = [...lv.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { fams, ranked, share: ranked.length && total > 0 ? ranked[0].v / total : 0, levelHint };
  }

  private option(formId: string, grade: number): SuggestOption | null {
    const loc = locationOfForm(this.ix, formId);
    return loc && checkLocation(this.ix, loc, grade).ok ? { formId, location: loc } : null;
  }

  suggest(input: SuggestInput): Suggestion {
    const T = SUGGEST_THRESHOLDS;
    const self = input.excludeUid ? this.refs.get(input.excludeUid) : undefined;
    const kw = this.byKeywords(input.latex, input.grade, self);
    const nb = this.byNeighbours(fingerprint(input.latex), input.grade, input.excludeUid);
    const notes: string[] = [];

    const top = nb.ranked[0];
    const bestScore = nb.fams.reduce((m, e) => Math.max(m, e.score), 0);
    const high = !!top && top.fams >= T.highMinFamilies && nb.share >= T.highMinShare && bestScore >= T.highMinScore;
    let bestId: string | null;
    let confidence: SuggestConfidence;
    if (high) { bestId = top.formId; confidence = 'cao'; }
    else if (kw.length) { bestId = kw[0].formId; confidence = top?.formId === bestId ? 'vua' : 'thap'; }
    else if (top) { bestId = top.formId; confidence = 'thap'; }
    else { bestId = null; confidence = 'khong'; }

    let best = bestId ? this.option(bestId, input.grade) : null;
    if (bestId && !best) { notes.push('Dạng gợi ý không còn đúng đường dẫn trong cây — bỏ.'); confidence = 'khong'; }
    const alternatives: SuggestOption[] = [];
    for (const f of [...kw.map((x) => x.formId), ...nb.ranked.map((x) => x.formId)]) {
      if (alternatives.length >= 2) break;
      if (f === best?.formId || alternatives.some((a) => a.formId === f)) continue;
      const o = this.option(f, input.grade);
      if (o) alternatives.push(o);
    }
    if (!best) {
      if (!this.sums.has(input.grade)) notes.push('Ngân hàng chưa có câu mẫu nào ở lớp này.');
      else notes.push('Không tìm thấy câu mẫu đủ gần — cần thầy/cô chọn vị trí.');
      best = null;
    } else {
      const n = (this.support.get(best.formId) ?? 0) - (self?.formId === best.formId ? 1 : 0);
      if (n < T.fewSamples) notes.push(`Dạng này mới có ${n} câu mẫu — nên kiểm tra kỹ.`);
    }
    return {
      key: input.key, best, alternatives, confidence,
      levelHint: nb.levelHint,
      evidence: [...nb.fams].sort((a, b) => b.score - a.score).slice(0, 5),
      notes, taxRev: this.taxRev,
    };
  }
}
