// Quét toàn Ngân hàng tìm cặp nghi trùng. CHỈ ĐỌC: không sửa câu, không ghi dữ liệu.
// Không so mọi cặp: mỗi câu chỉ được so với "ứng viên" lấy từ
//  (1) nhóm cùng nội dung (cùng loại + đề + phương án + hình) và nhóm cùng mã nguồn;
//  (2) chỉ mục đảo trên các từ/cụm công thức hiếm, lấy top-K theo số mục chung.
import { comparePair, DUP_KIND_RANK, fingerprint, tokenText, type DupKind, type Fingerprint, type PairResult } from './dup2';

export interface QLike { uid: string; latex: string }
export interface DupPairHit { a: string; b: string; result: PairResult }

export interface ScanOptions {
  /** số câu xử lý mỗi lượt trước khi nhường giao diện */
  batch?: number;
  /** số ứng viên tối đa cho mỗi câu (ngoài nhóm cùng nội dung) */
  topK?: number;
  /** số từ hiếm nhất của mỗi câu dùng để tra chỉ mục */
  probe?: number;
  minShared?: number;
  onProgress?: (done: number, total: number, phase: 'index' | 'scan') => void;
  signal?: { aborted: boolean };
  /** Chỉ quét các câu này làm "phía A". Bỏ trống = cả ngân hàng. */
  scope?: ReadonlySet<string>;
  /** true: phía B là toàn ngân hàng (đối chiếu phạm vi với kho). false/bỏ trống: phía B cũng nằm trong phạm vi. */
  vsAll?: boolean;
  /** mặc định: ẩn 'unrelated'; thêm 'insufficient' nếu muốn */
  keep?: (k: DupKind) => boolean;
}
export interface ScanStats { sideA: number; sideB: number; questions: number; comparisons: number; candidatesCapped: number; ms: number; aborted: boolean }
export interface ScanResult { pairs: DupPairHit[]; stats: ScanStats }

/** số ứng viên tối đa lấy từ nhóm cùng dữ kiện cho mỗi câu (bảo vệ khi nhiều câu trùng dữ kiện) */
const FACTS_CAP = 40;
const yieldUi = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export class DupIndex {
  private order: string[] = [];
  private pos = new Map<string, number>();
  private fps = new Map<string, Fingerprint>();
  private latexOf = new Map<string, string>();
  private raw = new Map<string, Set<string>>();
  private content = new Map<string, Set<string>>();
  private facts = new Map<string, Set<string>>();
  private post = new Map<number, Set<string>>();

  /** chỉ dùng trong kiểm thử: ép ngưỡng loại từ phổ biến thấp để tái hiện ngân hàng rất lớn trên bộ nhỏ */
  dfCapOverride?: number;
  get size(): number { return this.fps.size; }
  get(uid: string): Fingerprint | undefined { return this.fps.get(uid); }

  /** Mã token của câu (có thể lặp giữa words và loose khi câu chưa đọc đủ — giữ đúng như trước). */
  private tokens(f: Fingerprint): number[] {
    const t: number[] = [];
    for (const w of f.words) t.push(w);
    for (const g of f.mathGrams) t.push(g);
    if (!f.complete) for (const w of f.loose) t.push(w);
    return t;
  }
  private link<T>(m: Map<T, Set<string>>, k: T, uid: string, add: boolean) {
    let s = m.get(k);
    if (add) { if (!s) m.set(k, (s = new Set())); s.add(uid); }
    else if (s) { s.delete(uid); if (!s.size) m.delete(k); }
  }
  private attach(uid: string, f: Fingerprint, add: boolean) {
    this.link(this.raw, f.rawKey, uid, add);
    this.link(this.content, f.contentKey, uid, add);
    if (f.factsKey) this.link(this.facts, f.factsKey, uid, add);
    for (const t of this.tokens(f)) this.link(this.post, t, uid, add);
  }

  /** Thêm hoặc cập nhật một câu. Không đổi nếu mã nguồn không đổi. */
  upsert(uid: string, latex: string): void {
    const old = this.fps.get(uid);
    if (old && this.latexOf.get(uid) === latex) return;
    if (old) this.attach(uid, old, false);
    else { this.pos.set(uid, this.order.length); this.order.push(uid); }
    const f = fingerprint(latex);
    this.fps.set(uid, f); this.latexOf.set(uid, latex);
    this.attach(uid, f, true);
  }
  remove(uid: string): void {
    const old = this.fps.get(uid);
    if (!old) return;
    this.attach(uid, old, false);
    this.fps.delete(uid); this.latexOf.delete(uid);
    this.pos.delete(uid); // vị trí trong `order` để lại ô trống (bỏ qua khi duyệt)
  }

  /** Ứng viên cho một câu: nhóm cùng nội dung + top-K theo số mục hiếm chung. */
  candidates(uid: string, f: Fingerprint, topK = 30, probe = 16, minShared = 2): { ids: string[]; capped: boolean } {
    const out = new Set<string>();
    for (const u of this.raw.get(f.rawKey) ?? []) if (u !== uid) out.add(u);
    for (const u of this.content.get(f.contentKey) ?? []) if (u !== uid) out.add(u);
    // cùng dữ kiện (phương án + số + dấu + hình) nhưng lời dẫn khác: tra chính xác, không phụ thuộc từ khoá phổ biến
    let capped = false;
    if (f.factsKey) {
      let n = 0;
      for (const u of this.facts.get(f.factsKey) ?? []) { if (u === uid) continue; if (++n > FACTS_CAP) { capped = true; break; } out.add(u); }
    }
    // bỏ các mục quá phổ biến (xuất hiện ở rất nhiều câu): chúng không phân biệt được câu nào và làm quét chậm theo bình phương
    const dfCap = this.dfCapOverride ?? Math.max(50, Math.ceil(2 * Math.sqrt(this.fps.size)));
    const toks = this.tokens(f).map((t) => [t, this.post.get(t)?.size ?? 0] as const).filter((x) => x[1] > 1 && x[1] <= dfCap).sort((x, y) => x[1] - y[1] || (tokenText(x[0]) < tokenText(y[0]) ? -1 : 1)).slice(0, probe);
    const cnt = new Map<string, number>();
    for (const [t] of toks) for (const u of this.post.get(t)!) if (u !== uid) cnt.set(u, (cnt.get(u) ?? 0) + 1);
    const need = Math.min(minShared, toks.length);
    const ranked = [...cnt].filter((x) => x[1] >= need).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
    for (const [u] of ranked.slice(0, topK)) out.add(u);
    return { ids: [...out], capped: capped || ranked.length > topK };
  }

  /** Đồng bộ chỉ mục với danh sách hiện tại (thêm/sửa/xoá), chia lượt để không treo giao diện. false nếu bị huỷ. */
  async sync(qs: QLike[], o: { batch?: number; signal?: { aborted: boolean }; onProgress?: (done: number, total: number) => void } = {}): Promise<boolean> {
    const batch = o.batch ?? 200;
    const seen = new Set(qs.map((q) => q.uid));
    for (const u of [...this.fps.keys()]) if (!seen.has(u)) this.remove(u);
    for (let i = 0; i < qs.length; i++) {
      this.upsert(qs[i].uid, qs[i].latex);
      if ((i + 1) % batch === 0) {
        o.onProgress?.(i + 1, qs.length);
        await yieldUi();
        if (o.signal?.aborted) return false;
      }
    }
    return true;
  }

  /** Các câu trong chỉ mục liên quan tới một bản nháp CHƯA có trong kho (không đưa nháp vào chỉ mục). */
  relatedFp(f: Fingerprint, opt: Pick<ScanOptions, 'topK' | 'probe' | 'minShared'> & { exclude?: string } = {}): { uid: string; result: PairResult }[] {
    const out: { uid: string; result: PairResult }[] = [];
    for (const u of this.candidates(opt.exclude ?? '\u0000', f, opt.topK, opt.probe, opt.minShared).ids) {
      const g = this.fps.get(u);
      if (g) out.push({ uid: u, result: comparePair(f, g) });
    }
    return out;
  }

  /** Các cặp nghi trùng liên quan tới MỘT câu (dùng cho Trình sửa / Nhập liệu). */
  related(uid: string, opt: Pick<ScanOptions, 'topK' | 'probe' | 'minShared' | 'keep'> = {}): DupPairHit[] {
    const f = this.fps.get(uid);
    if (!f) return [];
    const keep = opt.keep ?? defaultKeep;
    const hits: DupPairHit[] = [];
    for (const u of this.candidates(uid, f, opt.topK, opt.probe, opt.minShared).ids) {
      const g = this.fps.get(u);
      if (!g) continue;
      const r = comparePair(f, g);
      if (keep(r.kind)) hits.push(order2(uid, u, r));
    }
    return sortPairs(hits);
  }

  /** Quét cả ngân hàng theo từng lượt nhỏ; huỷ được; thứ tự kết quả ổn định. */
  async scan(qs: QLike[], opt: ScanOptions = {}): Promise<ScanResult> {
    const t0 = Date.now();
    const batch = opt.batch ?? 200;
    const keep = opt.keep ?? defaultKeep;
    const sideA = opt.scope ? qs.filter((q) => opt.scope!.has(q.uid)).length : qs.length;
    const stats: ScanStats = { sideA, sideB: opt.scope && !opt.vsAll ? sideA : qs.length, questions: qs.length, comparisons: 0, candidatesCapped: 0, ms: 0, aborted: false };
    if (!(await this.sync(qs, { batch, signal: opt.signal, onProgress: (d, t) => opt.onProgress?.(d, t, 'index') }))) { stats.aborted = true; stats.ms = Date.now() - t0; return { pairs: [], stats }; }
    const rank = new Map(qs.map((q, i) => [q.uid, i] as const));
    const pairs: DupPairHit[] = [];
    const inA = (u: string) => !opt.scope || opt.scope.has(u);
    for (let i = 0; i < qs.length; i++) {
      const uid = qs[i].uid;
      if (!inA(uid)) { if ((i + 1) % batch === 0) { opt.onProgress?.(i + 1, qs.length, 'scan'); await yieldUi(); if (opt.signal?.aborted) { stats.aborted = true; stats.ms = Date.now() - t0; return { pairs: sortPairs(pairs, rank), stats }; } } continue; }
      const f = this.fps.get(uid)!;
      const c = this.candidates(uid, f, opt.topK, opt.probe, opt.minShared);
      if (c.capped) stats.candidatesCapped++;
      for (const u of c.ids) {
        const j = rank.get(u);
        if (j === undefined) continue;
        const bothA = inA(u);
        if (!bothA && !opt.vsAll) continue;           // “trong phạm vi”: phía B cũng phải thuộc phạm vi
        if (bothA && j <= i) continue;                // mỗi cặp chỉ xét một lần khi cả hai cùng thuộc phạm vi
        stats.comparisons++;
        const r = comparePair(f, this.fps.get(u)!);
        if (keep(r.kind)) pairs.push({ a: uid, b: u, result: r });
      }
      if ((i + 1) % batch === 0) {
        opt.onProgress?.(i + 1, qs.length, 'scan');
        await yieldUi();
        if (opt.signal?.aborted) { stats.aborted = true; stats.ms = Date.now() - t0; return { pairs: sortPairs(pairs, rank), stats }; }
      }
    }
    opt.onProgress?.(qs.length, qs.length, 'scan');
    stats.ms = Date.now() - t0;
    return { pairs: sortPairs(pairs, rank), stats };
  }
}

const defaultKeep = (k: DupKind) => k !== 'unrelated' && k !== 'insufficient';
const order2 = (a: string, b: string, result: PairResult): DupPairHit => (a <= b ? { a, b, result } : { a: b, b: a, result });
function sortPairs(p: DupPairHit[], rank?: Map<string, number>): DupPairHit[] {
  const r = (u: string) => rank?.get(u) ?? 0;
  return p.sort((x, y) => DUP_KIND_RANK[x.result.kind] - DUP_KIND_RANK[y.result.kind] || y.result.score - x.result.score
    || (rank ? r(x.a) - r(y.a) || r(x.b) - r(y.b) : x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : 1));
}

/** Chỉ mục dùng chung cho cả màn Kiểm tra trùng và màn Nhập liệu (dựng một lần, cập nhật gia tăng). */
const shared = new DupIndex();
export const getSharedIndex = (): DupIndex => shared;
