// Giải thích khác biệt giữa hai câu theo từng phần (đề, phương án, đáp án, hình, lời giải), ở mức "từ / ký hiệu công thức".
// CHỈ ĐỌC và CHỈ ĐỂ HIỂN THỊ: không sửa LaTeX, không chèn HTML vào công thức.
import type { Fingerprint } from './dup2';

export interface Tok { t: string; math: boolean; run: number; changed?: boolean }
export interface DiffRow { label: string; a: Tok[]; b: Tok[]; same: boolean; emptyA?: boolean; emptyB?: boolean }

/** Khoá chuẩn hoá (dup2) → danh sách ký hiệu; mỗi đoạn công thức có `run` riêng để vẽ liền nhau. */
export function tokensOfKey(key: string): Tok[] {
  const out: Tok[] = [];
  let run = 0;
  for (const item of key.split('\u0001')) {
    if (!item) continue;
    if (item.startsWith('w:')) out.push({ t: item.slice(2), math: false, run: -1 });
    else if (item.startsWith('m[')) { run++; for (const t of item.slice(2, -1).split(' ')) if (t) out.push({ t, math: true, run }); }
  }
  return out;
}
const plain = (s: string): Tok[] => (s.match(/\\[A-Za-z]+|\d+(?:\.\d+)?|\p{L}+|\S/gu) ?? []).map((t) => ({ t, math: false, run: -1 }));
const id = (x: Tok) => (x.math ? 'm:' : 'w:') + x.t;

/** So hai danh sách ký hiệu bằng dãy con chung dài nhất; đánh dấu ký hiệu khác nhau ở mỗi phía. */
export function diffTokens(a: Tok[], b: Tok[]): { a: Tok[]; b: Tok[]; same: boolean } {
  const n = a.length, m = b.length;
  const A = a.map((x) => ({ ...x })), B = b.map((x) => ({ ...x }));
  if (n * m > 4_000_000) { // quá lớn: không dò chi tiết, chỉ báo khác hay giống
    const same = n === m && a.every((x, i) => id(x) === id(b[i]));
    if (!same) { A.forEach((x) => (x.changed = true)); B.forEach((x) => (x.changed = true)); }
    return { a: A, b: B, same };
  }
  const L: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = id(a[i]) === id(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, same = true;
  while (i < n && j < m) {
    if (id(a[i]) === id(b[j])) { i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { A[i++].changed = true; same = false; }
    else { B[j++].changed = true; same = false; }
  }
  while (i < n) { A[i++].changed = true; same = false; }
  while (j < m) { B[j++].changed = true; same = false; }
  return { a: A, b: B, same };
}

const mark = (ok: boolean, yes: string, no?: string): Tok[] => (ok ? [{ t: yes, math: false, run: -1 }] : no ? [{ t: no, math: false, run: -1 }] : []);
const TYPE_NAME: Record<string, string> = { tn: 'Trắc nghiệm', ds: 'Đúng/sai', tln: 'Trả lời ngắn', tl: 'Tự luận' };

export function explainPair(A: Fingerprint, B: Fingerprint): DiffRow[] {
  const rows: DiffRow[] = [];
  const push = (label: string, a: Tok[], b: Tok[], emptyA = false, emptyB = false) => { const d = diffTokens(a, b); rows.push({ label, a: d.a, b: d.b, same: d.same, emptyA, emptyB }); };

  push('Loại câu', plain(TYPE_NAME[A.type] ?? A.type), plain(TYPE_NAME[B.type] ?? B.type));
  push('Đề bài', tokensOfKey(A.stemKey), tokensOfKey(B.stemKey));

  const correctA = new Set(A.ansKey.split('\u0002').filter(Boolean));
  const correctB = new Set(B.ansKey.split('\u0002').filter(Boolean));
  const flagsA = A.type === 'ds' ? A.ansKey : '', flagsB = B.type === 'ds' ? B.ansKey : '';
  const optTokens = (f: Fingerprint, i: number, correct: Set<string>, flags: string): Tok[] => [
    ...tokensOfKey(f.optKeys[i]),
    ...(f.type === 'ds' ? mark(true, flags[i] === '1' ? '→ Đ' : '→ S') : f.type === 'tn' ? mark(correct.has(f.optKeys[i]), '→ ĐÚNG') : []),
  ];
  if (A.type === B.type && A.type === 'ds') {
    const n = Math.max(A.optKeys.length, B.optKeys.length);
    for (let i = 0; i < n; i++) {
      const ea = i >= A.optKeys.length, eb = i >= B.optKeys.length;
      push(`Ý ${String.fromCharCode(97 + i)})`, ea ? [] : optTokens(A, i, correctA, flagsA), eb ? [] : optTokens(B, i, correctB, flagsB), ea, eb);
    }
  } else if (A.type === 'tn' && B.type === 'tn') {
    // ghép phương án theo nội dung giống nhau trước, phần còn lại theo thứ tự
    const usedB = new Set<number>(); const pairs: [number | null, number | null][] = [];
    const left: number[] = [];
    A.optKeys.forEach((k, i) => { const j = B.optKeys.findIndex((x, jj) => x === k && !usedB.has(jj)); if (j >= 0) { usedB.add(j); pairs.push([i, j]); } else left.push(i); });
    const restB = B.optKeys.map((_, j) => j).filter((j) => !usedB.has(j));
    for (let k = 0; k < Math.max(left.length, restB.length); k++) pairs.push([left[k] ?? null, restB[k] ?? null]);
    pairs.sort((p, q) => (p[0] ?? 99) - (q[0] ?? 99));
    pairs.forEach(([i, j], n) => push(`Phương án ${n + 1}`, i == null ? [] : optTokens(A, i, correctA, ''), j == null ? [] : optTokens(B, j, correctB, ''), i == null, j == null));
  } else if (A.optKeys.length || B.optKeys.length) {
    const join = (f: Fingerprint) => f.optKeys.flatMap((k, i) => [...tokensOfKey(k), { t: `| ${i + 1}`, math: false, run: -1 }]);
    push('Phương án', join(A), join(B), !A.optKeys.length, !B.optKeys.length);
  }
  if ((A.type === 'tln' || B.type === 'tln')) push('Đáp án ngắn', A.type === 'tln' ? tokensOfKey(A.ansKey) : [], B.type === 'tln' ? tokensOfKey(B.ansKey) : [], A.type !== 'tln', B.type !== 'tln');
  push('Hình', A.figKey ? plain(A.figKey.replace(/\u0002/g, ' ¶ ')) : [], B.figKey ? plain(B.figKey.replace(/\u0002/g, ' ¶ ')) : [], !A.figKey, !B.figKey);
  push('Lời giải', A.solKey ? tokensOfKey(A.solKey) : [], B.solKey ? tokensOfKey(B.solKey) : [], A.solKey == null, B.solKey == null);
  return rows;
}
