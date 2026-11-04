import assert from 'node:assert/strict';
import { issueLines, type Issue } from './check';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const latex = '\\begin{ex}\n  Cho $x^{2$ biết\n  \\choice{\\True $1$}{$2$}{$3$}{$4$}\n  \\loigiai{ta có \\frac{1}{2}}\n\\end{ex}';

console.log('Dòng có vấn đề trong mã câu');
t('chỉ ra đúng dòng theo đoạn mã của vấn đề; nặng nhất thắng khi trùng dòng', () => {
  const issues: Issue[] = [
    { level: 'canh', message: 'cảnh báo nhẹ', detail: 'Cho $x^{2$' },
    { level: 'loi', message: 'Ngoặc lệch', detail: '$x^{2$' },
    { level: 'canh', message: 'Lời giải dùng \\frac', detail: '\\frac{1}{2}' },
  ];
  const r = issueLines(latex, issues);
  assert.deepEqual(r.map((x) => [x.line, x.level]), [[2, 'loi'], [4, 'canh']]);
  assert.equal(r[0].message, 'Ngoặc lệch');
  assert.match(r[0].text, /Cho/);
});
t('bỏ vấn đề không có đoạn mã, mức "tin", đoạn quá ngắn hoặc không tìm thấy; chịu dấu … ở cuối', () => {
  const issues: Issue[] = [
    { level: 'loi', message: 'Thiếu \\True' },
    { level: 'tin', message: 'có hình', detail: 'Cho $x^{2$' },
    { level: 'loi', message: 'ngắn', detail: '$' },
    { level: 'loi', message: 'không có', detail: 'không có trong mã' },
    { level: 'loi', message: 'cắt ngắn', detail: '\\loigiai{ta có…' },
  ];
  const r = issueLines(latex, issues);
  assert.deepEqual(r.map((x) => x.line), [4]);
});
