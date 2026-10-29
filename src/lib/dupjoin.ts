// Tìm ĐẦY ĐỦ các cặp câu cần so (không giới hạn số ứng viên, không bỏ từ phổ biến) — nền của Kiểm tra trùng và rà trùng khi nhập.
//
// Theo comparePair (dup2.ts), một cặp chỉ có thể KHÁC 'unrelated' khi thoả ít nhất một điều:
//   (1) giống nguyên mã nguồn                                  → gom theo khoá rawKey, chính xác;
//   (2) cả hai đọc đủ và cùng đề (stemKey)                      → gom theo khoá stemKey, chính xác;
//   (3) cả hai đọc đủ và lex ≥ NEAR_MIN. lex là trung bình có trọng số của Jaccard(chữ) và Jaccard(công thức)
//       (hoặc chỉ một trong hai) nên lex ≥ t kéo theo Jaccard(chữ) ≥ t HOẶC Jaccard(công thức) ≥ t;
//   (4) có câu đọc chưa đủ và Jaccard(thô) ≥ NEAR_MIN.
// (3), (4) dùng phép nối tương đồng "lọc tiền tố" (PPJoin, Xiao và cộng sự 2008): xếp token theo độ hiếm; hai tập có Jaccard ≥ t
// BẮT BUỘC chung ít nhất một token trong phần đầu của nhau, nên chỉ cần lập chỉ mục phần đầu. Mọi ứng viên được kiểm lại bằng
// phần giao chính xác. Đây là phép nối CHÍNH XÁC: không sót cặp nào, chỉ bỏ qua các cặp chắc chắn dưới ngưỡng.
import { lexical, NEAR_MIN, type Fingerprint } from './dup2';

/**
 * Mọi cặp (i, j) cần so, với i hoặc j thuộc phía A. `fps` là toàn bộ câu (phía B); `inA[i]` = 1 nếu câu i thuộc phía A.
 * Trả về mảng đã sắp, không trùng; mỗi phần tử mã hoá cặp i < j là i·n + j.
 */
export interface JoinOptions {
  signal?: { aborted: boolean };
  /** tiến độ 0–1 của phép nối */
  onProgress?: (frac: number) => void;
  t?: number;
}

/** Nhường giao diện sau mỗi ~12 ms tính toán. */
export class Slicer {
  private last = Date.now();
  constructor(private signal?: { aborted: boolean }) {}
  /** false nếu đã bị huỷ */
  async step(): Promise<boolean> {
    if (Date.now() - this.last < 12) return !this.signal?.aborted;
    await new Promise<void>((r) => setTimeout(r, 0));
    this.last = Date.now();
    return !this.signal?.aborted;
  }
}

/** null nếu bị huỷ giữa chừng. */
export async function candidatePairs(fps: readonly Fingerprint[], inA: Uint8Array, opt: JoinOptions = {}): Promise<Float64Array | null> {
  const t = opt.t ?? NEAR_MIN;
  const n = fps.length;
  const sl = new Slicer(opt.signal);
  const out = new PairBuf();
  const both = (i: number, j: number) => { if (i === j || (!inA[i] && !inA[j])) return; out.push(i < j ? i * n + j : j * n + i); };
  // (1)(2) gom theo khoá chính xác
  const group = (key: (f: Fingerprint) => string) => {
    const m = new Map<string, number[]>();
    fps.forEach((f, i) => { const k = key(f); if (!k) return; let l = m.get(k); if (!l) m.set(k, (l = [])); l.push(i); });
    for (const l of m.values()) {
      if (l.length < 2) continue;
      for (let x = 0; x < l.length; x++) if (inA[l[x]]) for (let y = 0; y < l.length; y++) if (y !== x && (!inA[l[y]] || y > x)) both(l[x], l[y]);
    }
  };
  group((f) => f.rawKey);
  group((f) => (f.complete ? f.stemKey : ''));
  // (3) chữ, công thức (chỉ câu đọc đủ); (4) tập thô (chỉ cặp có câu đọc chưa đủ)
  const prog = (base: number, w: number) => (f: number) => opt.onProgress?.(base + w * f);
  // chữ hoặc công thức giống ≥ t mới là ứng viên; chỉ giữ cặp có lex ≥ t ĐÚNG như comparePair (cùng đề đã gom ở trên)
  const lexOk = (i: number, j: number) => { if (lexical(fps[i], fps[j]).lex >= t) both(i, j); };
  if (!(await simJoin(fps.map((f) => (f.complete ? f.words : EMPTY)), inA, t, lexOk, sl, prog(0, 0.6)))) return null;
  if (!(await simJoin(fps.map((f) => (f.complete ? f.mathGrams : EMPTY)), inA, t, lexOk, sl, prog(0.6, 0.3)))) return null;
  // cặp có câu đọc chưa đủ: lấy câu đọc chưa đủ làm "phía A" của phép nối (thường rất ít), rồi lọc theo phía A thật
  const incomplete = Uint8Array.from(fps, (f) => (f.complete ? 0 : 1));
  if (incomplete.includes(1) && !(await simJoin(fps.map((f) => f.loose), incomplete, t, both, sl, prog(0.9, 0.1)))) return null;
  opt.onProgress?.(1);
  return out.sortedUnique();
}

const EMPTY = new Int32Array(0);

/** Mảng số thực tự giãn (không giới hạn 16,7 triệu phần tử như Set). */
class PairBuf {
  private a = new Float64Array(1024);
  private len = 0;
  push(x: number) { if (this.len === this.a.length) { const b = new Float64Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.len++] = x; }
  sortedUnique(): Float64Array {
    const s = this.a.subarray(0, this.len).sort();
    let k = 0;
    for (let i = 0; i < s.length; i++) if (i === 0 || s[i] !== s[i - 1]) s[k++] = s[i];
    return s.slice(0, k);
  }
}

/**
 * Nối Jaccard ≥ t trên các tập token. Phát (i, j) cho MỌI cặp có Jaccard ≥ t mà ít nhất một câu thuộc A (có thể phát trùng).
 *  - cặp A×A: tự nối trong A theo độ dài tăng dần, chỉ mục "nửa tiền tố" (PPJoin);
 *  - cặp A×(ngoài A): lập chỉ mục tiền tố của phía NHỎ hơn, phía kia dò bằng tiền tố của mình.
 * Mọi ứng viên qua lọc độ dài + lọc vị trí rồi được kiểm lại bằng phần giao chính xác.
 */
async function simJoin(sets: readonly Int32Array[], inA: Uint8Array, t: number, emit: (i: number, j: number) => void, sl: Slicer, onProgress: (f: number) => void): Promise<boolean> {
  const n = sets.length;
  // thứ hạng token: hiếm trước
  let maxTok = -1;
  for (const s of sets) for (let k = 0; k < s.length; k++) if (s[k] > maxTok) maxTok = s[k];
  if (maxTok < 0) return true;
  const df = new Int32Array(maxTok + 1);
  for (const s of sets) for (let k = 0; k < s.length; k++) df[s[k]]++;
  const toks: number[] = [];
  for (let x = 0; x <= maxTok; x++) if (df[x]) toks.push(x);
  toks.sort((x, y) => df[x] - df[y] || x - y);
  const rank = new Int32Array(maxTok + 1);
  toks.forEach((x, r) => { rank[x] = r; });
  const R: Int32Array[] = sets.map((s) => { const r = new Int32Array(s.length); for (let k = 0; k < s.length; k++) r[k] = rank[s[k]]; return r.sort(); });
  const byLen = (ids: number[]) => ids.sort((x, y) => R[x].length - R[y].length || x - y);
  const A: number[] = [], O: number[] = [];
  for (let i = 0; i < n; i++) if (R[i].length) (inA[i] ? A : O).push(i);
  const probeLen = (m: number) => m - Math.ceil(t * m - 1e-9) + 1;
  const indexLen = (m: number) => m - Math.ceil(((2 * t) / (1 + t)) * m - 1e-9) + 1;
  const overlapNeed = (p: number, q: number) => Math.ceil((t / (1 + t)) * (p + q) - 1e-9);
  const count = new Int32Array(n);
  const touched: number[] = [];
  const total = A.length + (O.length ? Math.max(A.length, O.length) : 0);
  let done = 0;

  /** x dò chỉ mục `post` bằng `pl` token đầu; phát các cặp đạt ngưỡng. */
  const probe = (x: number, post: number[][], pl: number) => {
    const r = R[x], m = r.length;
    const minLen = Math.ceil(t * m - 1e-9), maxLen = Math.floor(m / t + 1e-9);
    for (let k = 0; k < pl; k++) {
      const l = post[r[k]];
      if (!l) continue;
      for (let e = 0; e < l.length; e += 2) {
        const y = l[e], my = R[y].length;
        if (my < minLen || my > maxLen) continue; // lọc độ dài
        const c = count[y];
        if (c < 0) continue; // đã loại
        if (c === 0) touched.push(y);
        // lọc vị trí: phần giao tối đa còn đạt được nếu mọi token sau đều khớp
        count[y] = c + 1 + Math.min(m - k - 1, my - l[e + 1] - 1) >= overlapNeed(m, my) ? c + 1 : -1;
      }
    }
    for (const y of touched) {
      const c = count[y];
      count[y] = 0;
      if (c <= 0) continue;
      const ry = R[y];
      // kiểm lại bằng phần giao chính xác
      let o = 0, a = 0, b = 0;
      while (a < m && b < ry.length) { const u = r[a], v = ry[b]; if (u === v) { o++; a++; b++; } else if (u < v) a++; else b++; }
      if (o >= overlapNeed(m, ry.length)) emit(x, y);
    }
    touched.length = 0;
  };
  const tick = async (q: number) => { if ((q & 511) === 0) onProgress((done + q) / Math.max(1, total)); return (q & 15) === 0 ? sl.step() : true; };

  // A×A: tự nối
  {
    const post: number[][] = new Array(toks.length);
    const ord = byLen(A.slice());
    for (let q = 0; q < ord.length; q++) {
      if (!(await tick(q))) return false;
      const x = ord[q], r = R[x], m = r.length;
      probe(x, post, probeLen(m));
      const il = indexLen(m);
      for (let k = 0; k < il; k++) (post[r[k]] ??= []).push(x, k);
    }
    done += A.length;
  }
  // A×(ngoài A): chỉ mục phía nhỏ
  if (A.length && O.length) {
    const [small, big] = A.length <= O.length ? [A, O] : [O, A];
    const post: number[][] = new Array(toks.length);
    for (const y of small) { const r = R[y], pl = probeLen(r.length); for (let k = 0; k < pl; k++) (post[r[k]] ??= []).push(y, k); }
    for (let q = 0; q < big.length; q++) {
      if (!(await tick(q))) return false;
      const x = big[q];
      probe(x, post, probeLen(R[x].length));
    }
  }
  onProgress(1);
  return true;
}
