import assert from 'node:assert/strict';
import { answerSheetTex, sheetProblem, texText } from './answersheet';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const base = { subtitle: 'Kiểm tra', subject: 'Toán', p1: 12, p2: 4, p3: 6 };
const count = (tex: string, needle: string) => tex.split(needle).length - 1;

t('số câu hợp lệ và quá lớn', () => {
  assert.equal(sheetProblem(base), null);
  assert.match(sheetProblem({ ...base, p1: 41 })!, /tối đa 40/);
  assert.match(sheetProblem({ ...base, p2: 9 })!, /tối đa/);
  assert.match(sheetProblem({ ...base, p3: 7 })!, /tối đa/);
  assert.match(sheetProblem({ p1: 0, p2: 0, p3: 0 })!, /chưa có câu/);
  assert.ok(sheetProblem({ ...base, p1: 1.5 }));
  assert.throws(() => answerSheetTex({ ...base, p1: 99 }));
});

t('chỉ vẽ các khối đề cần', () => {
  const t1 = answerSheetTex(base);
  assert.equal(count(t1, String.raw`\node[font=\footnotesize] at (`), 12, 'Phần I: đúng 12 dòng câu');
  assert.equal(count(t1, '{Câu '), 4 + 6, 'Phần II 4 câu + Phần III 6 câu');
  const bub = (o: { p1: number; p2: number; p3: number }) => count(answerSheetTex({ ...base, ...o }), String.raw`\bub{`);
  assert.equal(bub({ p1: 12, p2: 4, p3: 6 }) - bub({ p1: 12, p2: 4, p3: 0 }), 6 * 44, 'mỗi câu Phần III có 44 ô (−, 3 dấu phẩy, 40 chữ số)');
  assert.equal(bub({ p1: 12, p2: 4, p3: 0 }) - bub({ p1: 11, p2: 4, p3: 0 }), 1, 'mỗi câu Phần I thêm một dòng ô');
  const only1 = answerSheetTex({ ...base, p2: 0, p3: 0 });
  assert.ok(!only1.includes('PHẦN II') && !only1.includes('PHẦN III') && only1.includes('PHẦN I}'));
  assert.ok(answerSheetTex({ ...base, p1: 40, p2: 8, p3: 6 }).includes('{Câu 8}'));
  assert.equal(count(answerSheetTex({ ...base, p1: 40 }), String.raw`\node[font=\footnotesize] at (`), 40);
});

t('chữ người dùng được làm sạch, không chèn lệnh TeX', () => {
  assert.equal(texText(String.raw`A \input{x} $y$ & 50%`), 'A input x y 50');
  const tex = answerSheetTex({ ...base, subtitle: String.raw`Đề \write18{x} {kiểm}` });
  assert.ok(!tex.includes(String.raw`\write18`) && tex.includes('Đề write18 x kiểm'));
});
