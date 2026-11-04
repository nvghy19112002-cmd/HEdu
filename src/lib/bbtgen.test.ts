import assert from 'node:assert/strict';
import { autoMarks, bbtCode, bbtIssues, DEFAULT_BBT, nodePos, signTableCode, signTableIssues, type BbtInput } from './bbtgen';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const squash = (s: string) => s.replace(/\s+/g, '').replace(/,z,/g, ',0,').replace(/,z\}/g, ',0}'); // 'z' và '0' cùng nghĩa ở kho cũ
const base = (o: Partial<BbtInput>): BbtInput => ({ ...DEFAULT_BBT, ...o });

console.log('Bảng biến thiên (tkz-tab)');
t('khớp hình MathHub có tiệm cận đứng (+D-): x = -∞,0,1,2,+∞ với y\' = - + + -', () => {
  const i = base({
    nodes: [{ x: '-\\infty', mark: 't', y: '+\\infty' }, { x: '0', mark: 'z', y: '-1' }, { x: '1', mark: 'd', y: '+\\infty', yRight: '-\\infty' }, { x: '2', mark: 'z', y: '-5' }, { x: '+\\infty', mark: 't', y: '-\\infty' }],
    signs: ['-', '+', '+', '-'],
  });
  const want = "\\begin{tikzpicture}\\tkzTabInit[nocadre=true,lgt=1.2,espcl=2.5,deltacl=0.5]{$x$/0.7,$y'$/0.7,$y$/2}{$-\\infty$,$0$,$1$,$2$,$+\\infty$}\\tkzTabLine{,-,0,+,d,+,0,-,}\\tkzTabVar{+/$+\\infty$,-/$-1$,+D-/$+\\infty$/$-\\infty$,+/$-5$,-/$-\\infty$}\\end{tikzpicture}";
  assert.equal(squash(bbtCode(i)), squash(want));
});
t('khớp hình MathHub -D+ với y\' = - -: gián đoạn tại 2', () => {
  const i = base({
    nodes: [{ x: '-\\infty', mark: 't', y: '2' }, { x: '2', mark: 'd', y: '-\\infty', yRight: '+\\infty' }, { x: '+\\infty', mark: 't', y: '2' }],
    signs: ['-', '-'],
  });
  const code = bbtCode(i);
  assert.match(code, /\\tkzTabVar\{\+\/\$2\$,-D\+\/\$-\\infty\$\/\$\+\\infty\$,-\/\$2\$\}/);
  assert.match(code, /\\tkzTabLine\{,-,d,-,\}/);
});
t('đỉnh và đáy: mũi tên suy từ dấu y\' (cực đại +, cực tiểu -); đầu/cuối theo khoảng kề', () => {
  const n = [{ x: '-\\infty', mark: 't' as const, y: '-\\infty' }, { x: '-1', mark: 'z' as const, y: '3' }, { x: '1', mark: 'z' as const, y: '-1' }, { x: '+\\infty', mark: 't' as const, y: '+\\infty' }];
  const s = ['+', '-', '+'] as ('+' | '-')[];
  assert.deepEqual(n.map((_, k) => nodePos(k, n, s).left), ['-', '+', '-', '+']);
  assert.match(bbtCode(base({ nodes: n, signs: s })), /\\tkzTabVar\{-\/\$-\\infty\$,\+\/\$3\$,-\/\$-1\$,\+\/\$\+\\infty\$\}/);
});
t('nút giữ nguyên dấu mà không gián đoạn (điểm uốn) ⇒ R; phân số dùng \\dfrac và hàng cao hơn', () => {
  const i = base({
    nodes: [{ x: '-\\infty', mark: 't', y: '-\\infty' }, { x: '0', mark: 'z', y: '0' }, { x: '+\\infty', mark: 't', y: '\\frac{1}{3}' }],
    signs: ['+', '+'],
  });
  const code = bbtCode(i);
  assert.match(code, /\\tkzTabVar\{-\/\$-\\infty\$,R,\+\/\$\\dfrac\{1\}\{3\}\$\}/);
  assert.match(code, /\$y\$\/2\.5/);
});
t('mặc định đúng: đổi dấu ⇒ z, giữ dấu ⇒ d, đầu/cuối ⇒ t', () => {
  assert.deepEqual(autoMarks(['+', '-', '-']), ['t', 'z', 'd', 't']);
  assert.deepEqual(autoMarks(['-']), ['t', 't']);
});
t('không có hàng đạo hàm: chỉ có hàng x (dùng cho bảng giá trị)', () => {
  const code = bbtCode(base({ derivName: null }));
  assert.ok(!code.includes('tkzTabLine') && !code.includes('tkzTabVar'));
});
t('báo lỗi nhập liệu', () => {
  assert.deepEqual(bbtIssues(DEFAULT_BBT), []);
  assert.ok(bbtIssues(base({ nodes: [DEFAULT_BBT.nodes[0]], signs: [] })).some((x) => /ít nhất 2/.test(x)));
  assert.ok(bbtIssues(base({ signs: ['+'] })).some((x) => /số khoảng/.test(x)));
  assert.ok(bbtIssues(base({ nodes: DEFAULT_BBT.nodes.map((n, k) => (k === 1 ? { ...n, x: ' ' } : n)) })).some((x) => /thứ 2 đang trống/.test(x)));
});
t('bảng xét dấu nhiều hàng khớp hình MathHub (2x+1)/(x-3)', () => {
  const i = { xName: 'x', xs: ['-\\infty', '-\\tfrac{1}{2}', '3', '+\\infty'], rows: [{ label: '2x+1', signs: ['-', '+', '+'] as ('+' | '-')[], marks: ['z', 't'] as ('z' | 't' | 'd')[] }, { label: 'x-3', signs: ['-', '-', '+'] as ('+' | '-')[], marks: ['t', 'z'] as ('z' | 't' | 'd')[] }, { label: '\\dfrac{2x+1}{x-3}', signs: ['+', '-', '+'] as ('+' | '-')[], marks: ['z', 'd'] as ('z' | 't' | 'd')[] }], nocadre: true, lgt: 1.5, espcl: 2.5 };
  assert.deepEqual(signTableIssues(i), []);
  const code = signTableCode(i);
  assert.match(squash(code), /\\tkzTabLine\{,-,0,\+,t,\+,\}\\tkzTabLine\{,-,t,-,0,\+,\}\\tkzTabLine\{,\+,0,-,d,\+,\}/);
  assert.ok(signTableIssues({ ...i, rows: [{ label: 'a', signs: ['+'], marks: [] }] }).length >= 1);
});
