import assert from 'node:assert/strict';
import { MODE_NOTE, modeLabel, pdfFileName, summarize, type CompileOut } from './examcompile';
import { bankDrift, insertionText, lineDiff, norm, toSource } from './examsources';
import type { Question } from './types';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const Q = (uid: string, latex: string): Question => ({ uid, seq: 1, latex, type: 'tn', level: 'NB', tags: [], createdAt: 0, updatedAt: 0, grade: 12, chapterId: 'x', lessonId: 'y', formId: 'z' } as unknown as Question);
const q1 = Q('u1', '\\begin{ex}\nCho $x^2$.\n\\choice{1}{\\True 2}{3}{4}\n\\loigiai{\\textbf{x}}\n\\end{ex}\n\n');
const q2 = Q('u2', '\\begin{ex}\r\nCâu hai.\r\n\\end{ex}');

t('đoạn chèn là LaTeX NGUYÊN VĂN, chỉ cắt khoảng trắng cuối câu, cách nhau một dòng trống', () => {
  const s = insertionText([q1, q2]);
  assert.equal(s, q1.latex.trimEnd() + '\n\n' + q2.latex + '\n');
  assert.ok(s.includes('\\loigiai{\\textbf{x}}') && s.includes('\\True 2'), 'không đổi/xoá chữ nào trong câu');
  assert.equal(insertionText([]), '\n');
});
t('nguồn ghi UID và LaTeX nguyên văn (nhãn ID chỉ để tham khảo)', () => {
  const s = toSource(q1);
  assert.equal(s.uid, 'u1');
  assert.equal(s.latex, q1.latex);
  assert.equal(typeof s.label, 'string');
});
t('phát hiện ngân hàng đã đổi so với bản đã chép (không tự đồng bộ)', () => {
  const item = { uid: 'u2', latex: norm(q2.latex) };
  assert.equal(bankDrift(item, [q1, q2]), 'same', 'khác xuống dòng CRLF/LF không tính là đổi');
  assert.equal(bankDrift(item, [q1, Q('u2', '\\begin{ex}\nCâu hai (đã sửa).\n\\end{ex}')]), 'changed');
  assert.equal(bankDrift(item, [q1]), null);
});
t('so sánh theo dòng chỉ ra đúng dòng bị xoá/thêm', () => {
  const d = lineDiff('a\nb\nc', 'a\nB\nc\nd');
  assert.deepEqual(d.map((x) => x.kind + ':' + x.text), ['same:a', 'del:b', 'add:B', 'same:c', 'add:d']);
  assert.deepEqual(lineDiff('x', 'x').map((x) => x.kind), ['same']);
  assert.deepEqual(lineDiff('a\r\nb', 'a\nb').map((x) => x.kind), ['same', 'same']);
});
t('tên PDF theo chế độ và nhãn', () => {
  assert.equal(pdfFileName('de', 'Đề HKI Toán 12!'), 'de_de-hki-toan-12.pdf');
  assert.equal(pdfFileName('loigiai', 'Đề HKI Toán 12'), 'dap-an_de-hki-toan-12.pdf');
  assert.equal(pdfFileName('nguyen-van', '???'), 'nguyen-van_de-thi.pdf');
  assert.match(modeLabel('de'), /không lời giải/);
  assert.match(MODE_NOTE['nguyen-van'], /có thể chứa lời giải/);
  assert.match(MODE_NOTE.loigiai, /KHÔNG phát/);
});
t('không nhận diện được chế độ không bao giờ hiện như thành công', () => {
  const o = { status: 'no-profile', message: 'x', warnings: [], warningCount: 0 } as unknown as CompileOut;
  assert.equal(summarize(o).tone, 'warn');
});
console.log('examsources: OK');
