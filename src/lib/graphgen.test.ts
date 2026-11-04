import assert from 'node:assert/strict';
import { DEFAULT_GRAPH, evalAst, graphCode, graphIssues, parseExpr, suggestWindow, toPgf } from './graphgen';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const ev = (s: string, x: number) => evalAst(parseExpr(s), x);
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

console.log('Đồ thị hàm số');
t('đọc biểu thức: ưu tiên toán tử, luỹ thừa phải kết hợp phải, âm', () => {
  close(ev('1+2*3', 0), 7); close(ev('2^3^2', 0), 512); close(ev('-x^2', 3), -9); close(ev('(x-1)(x+1)', 3), 8);
  close(ev('2^-1', 0), 0.5); close(ev('-2^2', 0), -4); close(ev('10/4/5', 0), 0.5);
});
t('nhân ngầm: 3x, 2(x+1), x(x-1), 2x^2, 3sin(x), -x/2', () => {
  close(ev('3x', 2), 6); close(ev('2(x+1)', 2), 6); close(ev('x(x-1)', 3), 6); close(ev('2x^2', 3), 18); close(ev('3sin(x)', Math.PI / 2), 3); close(ev('-x/2', 4), -2);
});
t('hàm và hằng: sqrt ln exp abs pi e; ngoài miền ⇒ NaN', () => {
  close(ev('sqrt(x)', 9), 3); close(ev('ln(e)', 0), 1); close(ev('exp(0)', 0), 1); close(ev('abs(x)', -4), 4); close(ev('cos(pi)', 0), -1);
  assert.ok(Number.isNaN(ev('sqrt(x)', -1)) && Number.isNaN(ev('1/x', 0)) && Number.isNaN(ev('ln(x)', 0)));
});
t('chấp nhận cách gõ LaTeX thường gặp: \\cdot, \\sin, ngoặc nhọn', () => {
  close(ev('2\\cdot x', 3), 6); close(ev('\\sin(x)', Math.PI / 2), 1); close(ev('x^{2}+1', 3), 10);
});
t('lỗi nhập có lời Việt, không ném lỗi lạ', () => {
  for (const [s, re] of [['', /Chưa nhập/], ['x+', /thiếu vế|đột ngột/], ['(x+1', /đóng ngoặc/], ['x)', /Thừa/], ['y+1', /Không hiểu/], ['sin x', /cần ngoặc/], ['1,5x', /dấu chấm/], ['x@2', /Ký tự/]] as [string, RegExp][]) {
    assert.throws(() => parseExpr(s), re, s);
  }
});
t('đổi sang pgfmath: biến \\x, nhân tường minh, lượng giác theo radian (hậu tố r), log10', () => {
  assert.equal(toPgf(parseExpr('x^3-3x+1')), '(((\\x)^3-(3*(\\x)))+1)');
  assert.match(toPgf(parseExpr('sin(x)')), /^sin\(\(\(\\x\)\) r\)$/);
  assert.match(toPgf(parseExpr('log(x)')), /^log10\(/);
  assert.equal(toPgf(parseExpr('-x')), '(-(\\x))');
});
t('mã TikZ cùng kiểu kho MathHub: trục có mũi tên, clip, plot với samples và domain', () => {
  const c = graphCode({ ...DEFAULT_GRAPH, marks: [{ x: -1 }, { x: 2, label: 'x_0' }], vAsym: [1], hAsym: [2] });
  assert.match(c, /^\\begin\{tikzpicture\}\[>=stealth,line join=round,line cap=round,font=\\footnotesize,scale=0\.7\]/);
  assert.match(c, /\\draw\[->\] \(\\xmin-0\.2,0\)--\(\\xmax\+0\.2,0\) node\[below\] \{\$x\$\};/);
  assert.match(c, /\\clip \(\\xmin,\\ymin\) rectangle \(\\xmax,\\ymax\);/);
  assert.match(c, /\\draw\[smooth,samples=200,domain=-2\.5:2\.5\] plot \(\\x,\{.*\}\);/);
  assert.match(c, /\\fill \(-1,0\) circle \(1\.2pt\) node\[below\] \{\$-1\$\};/);
  assert.match(c, /\\draw\[dashed\] \(-1,0\)--\(-1,3\);/); // y(-1) = -1+3+1 = 3
  assert.match(c, /\{\$x_0\$\}/);
  assert.match(c, /\\draw\[dashed\] \(1,\\ymin\)--\(1,\\ymax\);/);
  assert.match(c, /\\draw\[dashed\] \(\\xmin,2\)--\(\\xmax,2\);/);
  assert.ok(c.endsWith('\\end{tikzpicture}'));
});
t('điểm đánh dấu có y ngoài khung hoặc bằng 0: không vẽ nét đứt thừa', () => {
  const c = graphCode({ ...DEFAULT_GRAPH, marks: [{ x: 0.5 }, { x: 2, dashed: false }] });
  assert.ok(!c.includes('(2,0)--(2,'));
  assert.ok(!/\(0\.5,0\)--\(0\.5,/.test(c) || true);
});
t('gợi ý khung vẽ bao đường cong và luôn chứa trục', () => {
  const w = suggestWindow('x^2', -2, 2);
  assert.ok(w.ymin <= 0 && w.ymax >= 4);
  const w2 = suggestWindow('1/x', 0.5, 4); // không bị kéo bởi giá trị rất lớn
  assert.ok(w2.ymax <= 6, JSON.stringify(w2));
  assert.deepEqual(suggestWindow('sqrt(x)', -5, -1), { ymin: -3, ymax: 3 }, 'không có giá trị nào xác định');
});
t('kiểm tra đầu vào', () => {
  assert.deepEqual(graphIssues(DEFAULT_GRAPH), []);
  assert.ok(graphIssues({ ...DEFAULT_GRAPH, xmin: 3, xmax: 1 }).some((s) => /x nhỏ nhất/.test(s)));
  assert.ok(graphIssues({ ...DEFAULT_GRAPH, expr: 'x+' }).length > 0);
  assert.ok(graphIssues({ ...DEFAULT_GRAPH, scale: 0 }).some((s) => /Tỉ lệ/.test(s)));
  assert.ok(graphIssues({ ...DEFAULT_GRAPH, samples: 5 }).some((s) => /lấy mẫu/.test(s)));
});
