// So sánh hai đoạn mã theo dòng (thuần, có kiểm thử): dùng cho Lịch sử phiên bản. Bỏ phần đầu/cuối giống nhau rồi tìm dãy dòng chung dài nhất (LCS);
// đoạn giữa quá lớn thì coi như thay thế toàn bộ (không treo giao diện).
export type DiffOp = { t: 'same' | 'add' | 'del'; text: string };

const MAX_CELLS = 4_000_000;

export function diffLines(a: string, b: string): DiffOp[] {
  const A = a.split('\n'), B = b.split('\n');
  let s = 0;
  while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length, eb = B.length;
  while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const ops: DiffOp[] = A.slice(0, s).map((text) => ({ t: 'same', text }));
  const ma = A.slice(s, ea), mb = B.slice(s, eb);
  if (ma.length * mb.length > MAX_CELLS) {
    ops.push(...ma.map((text): DiffOp => ({ t: 'del', text })), ...mb.map((text): DiffOp => ({ t: 'add', text })));
  } else if (!ma.length || !mb.length) {
    ops.push(...ma.map((text): DiffOp => ({ t: 'del', text })), ...mb.map((text): DiffOp => ({ t: 'add', text })));
  } else {
    // bảng độ dài LCS của hậu tố
    const w = mb.length + 1;
    const L = new Uint32Array((ma.length + 1) * w);
    for (let i = ma.length - 1; i >= 0; i--) for (let j = mb.length - 1; j >= 0; j--) L[i * w + j] = ma[i] === mb[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    let i = 0, j = 0;
    while (i < ma.length && j < mb.length) {
      if (ma[i] === mb[j]) { ops.push({ t: 'same', text: ma[i] }); i++; j++; }
      else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) ops.push({ t: 'del', text: ma[i++] });
      else ops.push({ t: 'add', text: mb[j++] });
    }
    while (i < ma.length) ops.push({ t: 'del', text: ma[i++] });
    while (j < mb.length) ops.push({ t: 'add', text: mb[j++] });
  }
  ops.push(...A.slice(ea).map((text): DiffOp => ({ t: 'same', text })));
  return ops;
}

export function diffStat(ops: readonly DiffOp[]): { add: number; del: number } {
  return { add: ops.filter((o) => o.t === 'add').length, del: ops.filter((o) => o.t === 'del').length };
}

/** Chỉ giữ các dòng đổi và `ctx` dòng giống nhau quanh chúng; đoạn giống nhau dài được thay bằng một dòng "…". */
export function collapseDiff(ops: readonly DiffOp[], ctx = 2): (DiffOp | { t: 'skip'; n: number })[] {
  const keep = new Array(ops.length).fill(false);
  ops.forEach((o, i) => { if (o.t !== 'same') for (let k = Math.max(0, i - ctx); k <= Math.min(ops.length - 1, i + ctx); k++) keep[k] = true; });
  const out: (DiffOp | { t: 'skip'; n: number })[] = [];
  for (let i = 0; i < ops.length; ) {
    if (keep[i]) { out.push(ops[i]); i++; continue; }
    let j = i;
    while (j < ops.length && !keep[j]) j++;
    out.push({ t: 'skip', n: j - i });
    i = j;
  }
  return out;
}
