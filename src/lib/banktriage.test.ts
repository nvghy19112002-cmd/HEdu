import assert from 'node:assert/strict';
import { texTokens, triage, triageOk } from './banktriage';

type Q = { uid: string; latex: string; key: string | null; noid?: boolean };
const qs: Q[] = [
  { uid: 'a', latex: '\\loigiai{Có lời giải}', key: 'K1' },
  { uid: 'b', latex: '\\loigiai{Cũng có}', key: 'K1' },
  { uid: 'c', latex: '', key: 'K2', noid: true },
  { uid: 'd', latex: '\\loigiai{x}', key: 'K3' },
  { uid: 'e', latex: '\\loigiai{x}', key: 'K3' },
  { uid: 'f', latex: '\\loigiai{x}', key: null },
  { uid: 'g', latex: '\\loigiai{x}', key: null },
];
const decidedPairs = new Set(['d|e']);
const r = triage(qs, {
  noId: (q) => !!q.noid,
  dupKey: (q) => q.key,
  decided: (x, y) => decidedPairs.has(`${x.uid}|${y.uid}`),
  hasSolution: (l) => l.includes('\\loigiai'),
});
// a,b trùng; c chưa có ID + thiếu lời giải; d,e đã kết luận không trùng; f,g không có khoá ⇒ không so
assert.deepEqual(r.kinds.get('a'), ['dup']);
assert.deepEqual(r.kinds.get('b'), ['dup']);
assert.deepEqual(r.kinds.get('c'), ['noid', 'nosol']);
assert.equal(r.kinds.has('d'), false);
assert.equal(r.kinds.has('f'), false);
assert.deepEqual(r.count, { dup: 2, noid: 1, nosol: 1 });
assert.equal(r.total, 3);
assert.equal(triageOk(r, 'c', 'all'), true);
assert.equal(triageOk(r, 'c', 'dup'), false);
assert.equal(triageOk(r, 'c', 'nosol'), true);
assert.equal(triageOk(r, 'd', 'all'), false);

// nhóm 3 câu: một cặp đã kết luận, hai cặp còn lại vẫn trùng ⇒ cả ba vẫn cần xem
const r3 = triage([{ uid: 'x', latex: 's' }, { uid: 'y', latex: 's' }, { uid: 'z', latex: 's' }], {
  noId: () => false, dupKey: () => 'K', decided: (p, q) => p.uid === 'x' && q.uid === 'y', hasSolution: () => true,
});
assert.equal(r3.count.dup, 3);

// tô màu LaTeX: nối lại phải ra đúng mã gốc
const src = '\\begin{ex}%[2D1H1-1]\n Cho $x^2$ {a}\\loigiai{ok}\n\\end{ex}';
const toks = texTokens(src);
assert.equal(toks.map((t) => t.s).join(''), src);
assert.deepEqual(toks.slice(0, 2).map((t) => t.t), ['env', 'cmt']);
assert.ok(toks.some((t) => t.t === 'math' && t.s === '$x^2$'));
assert.ok(toks.some((t) => t.t === 'cmd' && t.s === '\\loigiai'));
assert.deepEqual(texTokens(''), []);

console.log('banktriage.test: OK');
