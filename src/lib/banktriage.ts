// Nút "Cần xử lí · n" ở Ngân hàng: gom các câu cần thầy/cô xem lại vào một chỗ.
// Ba loại: trùng nội dung (giống hệt đề + phương án + đáp án + hình), chưa có ID, thiếu lời giải.
// Hàm thuần — mọi phép kiểm được truyền vào để test không cần kho thật.

export type TriageKind = 'dup' | 'noid' | 'nosol';
export const TRIAGE_KINDS: readonly TriageKind[] = ['dup', 'noid', 'nosol'];
export const TRIAGE_LABEL: Record<TriageKind, string> = { dup: 'Trùng nội dung', noid: 'Chưa có ID', nosol: 'Thiếu lời giải' };

export interface TriageQ { uid: string; latex: string }
export interface TriageOpts<Q extends TriageQ> {
  /** câu thuộc mục "Chưa có ID" */
  noId(q: Q): boolean;
  /** khoá so trùng (null = không so, vd câu rỗng) */
  dupKey(q: Q): string | null;
  /** hai câu đã được thầy/cô kết luận "không trùng" hoặc "biến thể hợp lệ" (quyết định còn hiệu lực) */
  decided(a: Q, b: Q): boolean;
  hasSolution(latex: string): boolean;
}
export interface TriageResult {
  /** uid → các loại việc cần xử lí (chỉ chứa câu có ít nhất một loại) */
  kinds: Map<string, TriageKind[]>;
  count: Record<TriageKind, number>;
  /** số câu cần xử lí (một câu nhiều loại chỉ đếm một lần) */
  total: number;
}

/** Một lượt O(N) (+ so cặp trong từng nhóm cùng khoá, nhóm thường rất nhỏ). */
export function triage<Q extends TriageQ>(qs: readonly Q[], o: TriageOpts<Q>): TriageResult {
  const groups = new Map<string, Q[]>();
  for (const q of qs) {
    const k = o.dupKey(q);
    if (!k) continue;
    const g = groups.get(k);
    if (g) g.push(q); else groups.set(k, [q]);
  }
  const dup = new Set<string>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (o.decided(g[i], g[j])) continue;
        dup.add(g[i].uid); dup.add(g[j].uid);
      }
    }
  }
  const kinds = new Map<string, TriageKind[]>();
  const count: Record<TriageKind, number> = { dup: 0, noid: 0, nosol: 0 };
  for (const q of qs) {
    const ks: TriageKind[] = [];
    if (dup.has(q.uid)) ks.push('dup');
    if (o.noId(q)) ks.push('noid');
    if (!o.hasSolution(q.latex)) ks.push('nosol');
    if (!ks.length) continue;
    for (const k of ks) count[k]++;
    kinds.set(q.uid, ks);
  }
  return { kinds, count, total: kinds.size };
}

/** Lọc theo nút Cần xử lí: 'all' = có ít nhất một loại. */
export function triageOk(r: TriageResult, uid: string, want: TriageKind | 'all'): boolean {
  const ks = r.kinds.get(uid);
  if (!ks) return false;
  return want === 'all' || ks.includes(want);
}

// ---- Tô màu mã LaTeX ở khung chi tiết (chỉ để đọc; không đổi nội dung) ----
export type TexTok = { t: 'txt' | 'cmt' | 'env' | 'math' | 'cmd' | 'brace'; s: string };
/** Tách mã thành các mảnh; nối lại các `s` phải ra đúng chuỗi gốc. */
export function texTokens(src: string): TexTok[] {
  const re = /(%[^\n]*)|(\\(?:begin|end)\{[^}]*\})|(\$[^$\n]*\$)|(\\[a-zA-Z@]+)|([{}])/g;
  const out: TexTok[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: 'txt', s: src.slice(last, m.index) });
    out.push({ t: m[1] ? 'cmt' : m[2] ? 'env' : m[3] ? 'math' : m[4] ? 'cmd' : 'brace', s: m[0] });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ t: 'txt', s: src.slice(last) });
  return out;
}
