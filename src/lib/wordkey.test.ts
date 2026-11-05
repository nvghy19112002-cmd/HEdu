import assert from 'node:assert/strict';
import { applyKey, parseKey } from './wordkey';
import { convertWord } from './wordimport';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };

// ---- dựng cây Pandoc giả ----
const str = (s: string) => ({ t: 'Plain', c: [{ t: 'Str', c: s }] });
const cell = (s: string, span = 1) => [['', [], []], { t: 'AlignDefault' }, 1, span, [str(s)]];
const row = (cells: unknown[]) => [['', [], []], cells];
const table = (rows: unknown[][]) => ({ t: 'Table', c: [['', [], []], [null, []], [], [['', [], []], rows.slice(0, 1)], [[['', [], []], 0, [], rows.slice(1)]], [['', [], []], []]] });

t('bảng trắc nghiệm (A): nhiều mã đề và cột ĐỀ GỐC', () => {
  const ast = { blocks: [table([
    row([cell('Câu'), cell('ĐỀ GỐC'), cell('MÃ ĐỀ 1001'), cell('MÃ ĐỀ 1002')]),
    row([cell('1'), cell('B'), cell('B'), cell('C')]),
    row([cell('2'), cell('B'), cell('C'), cell('D')]),
  ])] };
  const k = parseKey(ast);
  assert.deepEqual(k.codes, ['gốc', '1001', '1002']);
  assert.deepEqual(k.tn['1001'], ['B', 'C']); assert.deepEqual(k.tn['1002'], ['C', 'D']); assert.deepEqual(k.tn['gốc'], ['B', 'B']);
});

t('bảng đúng/sai (B): mỗi mã 2 cột, dòng "Câu n", 4 dòng Đ/S', () => {
  const ast = { blocks: [table([
    row([cell('MÃ ĐỀ 1001', 2), cell('MÃ ĐỀ 1002', 2)]),
    row([cell('Câu 1'), cell('Câu 2'), cell('Câu 1'), cell('Câu 2')]),
    row([cell('S'), cell('S'), cell('Đ'), cell('Đ')]),
    row([cell('Đ'), cell('Đ'), cell('S'), cell('S')]),
    row([cell('S'), cell('Đ'), cell('Đ'), cell('S')]),
    row([cell('Đ'), cell('S'), cell('S'), cell('Đ')]),
  ])] };
  const k = parseKey(ast);
  assert.deepEqual(k.ds['1001'], ['SĐSĐ', 'SĐĐS']); assert.deepEqual(k.ds['1002'], ['ĐSĐS', 'ĐSSĐ']);
});

t('bảng trả lời ngắn (C): mỗi dòng một mã', () => {
  const ast = { blocks: [table([
    row([cell('Câu'), cell('Câu 1'), cell('Câu 2')]),
    row([cell('MÃ ĐỀ 1001'), cell('259'), cell('35,2')]),
    row([cell('MÃ ĐỀ 1002'), cell('150'), cell('259')]),
  ])] };
  const k = parseKey(ast);
  assert.deepEqual(k.tln['1001'], ['259', '35,2']); assert.deepEqual(k.tln['1002'], ['150', '259']);
});

t('gắn đáp án một mã đề vào các câu theo thứ tự từng loại', () => {
  const tex = String.raw`\textbf{PHẦN I.} \textbf{nhiều phương án}

\textbf{Câu 1.} A?

\textbf{A.} a \textbf{B.} b \textbf{C.} c \textbf{D.} d

\textbf{Câu 2.} B?

\textbf{A.} a \textbf{B.} b \textbf{C.} c \textbf{D.} d

\textbf{PHẦN II.} \textbf{đúng sai}

\textbf{Câu 13.} Ds.

\textbf{a)} 1 \textbf{b)} 2 \textbf{c)} 3 \textbf{d)} 4

\textbf{PHẦN III.} \textbf{trả lời ngắn}

\textbf{Câu 17.} Số?
`;
  const c = convertWord(tex);
  const key = { codes: ['1001'], tn: { '1001': ['B', 'D'] }, ds: { '1001': ['ĐSĐS'] }, tln: { '1001': ['35,2'] } };
  assert.equal(applyKey(c.questions, key, '1001'), 4);
  assert.deepEqual(c.questions.map((q) => q.correct), [1, 3, -1, -1]);
  assert.deepEqual(c.questions[2].tfTrue, [true, false, true, false]); assert.equal(c.questions[3].answer, '35,2');
});
