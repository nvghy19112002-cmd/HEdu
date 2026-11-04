import assert from 'node:assert/strict';
import { analyze, maxPts, parsePaste, scoreItem, type KeyItem, type Scoring } from './examstats';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const SC: Scoring = { p1: 25, p2: 100, p3: 50, p4: 100 };
const items: KeyItem[] = [{ q: 'I.1', part: 'p1', key: 'A' }, { q: 'I.2', part: 'p1', key: 'B' }, { q: 'II.1', part: 'p2', key: 'ĐSĐS' }, { q: 'III.1', part: 'p3', key: '0,5' }];

console.log('Thống kê sau thi');
t('điểm từng câu: TN, Đúng/Sai theo số ý đúng, trả lời ngắn (số thập phân dấu , hay .)', () => {
  assert.deepEqual(scoreItem(items[0], 'a', SC), { pts: 0.25, frac: 1 });
  assert.deepEqual(scoreItem(items[0], 'B', SC), { pts: 0, frac: 0 });
  assert.deepEqual(scoreItem(items[0], '', SC), { pts: 0, frac: 0 });
  assert.deepEqual(scoreItem(items[2], 'ĐSĐS', SC), { pts: 1, frac: 1 });
  assert.deepEqual(scoreItem(items[2], 'DSDS', SC), { pts: 1, frac: 1 }, 'D thay cho Đ');
  assert.deepEqual(scoreItem(items[2], 'ĐSĐĐ', SC), { pts: 0.5, frac: 0.75 });
  assert.deepEqual(scoreItem(items[2], 'SDSD', SC), { pts: 0, frac: 0 });
  assert.deepEqual(scoreItem(items[2], 'ĐS', SC), { pts: 0, frac: 0 }, 'thiếu ý ⇒ 0');
  assert.deepEqual(scoreItem(items[3], '0.5', SC), { pts: 0.5, frac: 1 });
  assert.deepEqual(scoreItem(items[3], '0,50', SC), { pts: 0.5, frac: 1 });
  assert.deepEqual(scoreItem(items[3], '1', SC), { pts: 0, frac: 0 });
  assert.equal(maxPts(items[2], SC), 1);
});
t('đọc bảng dán từ Excel: tab, tự nhận dòng tiêu đề, thiếu cột thì để trống, thừa cột thì báo', () => {
  const text = 'Họ tên\tCâu 1\tCâu 2\tCâu 3\tCâu 4\nAn\tA\tB\tĐSĐS\t0,5\nBình\tA\tC\tĐSĐĐ\n\nChi\tD\tB\tSSSS\t1\tthừa';
  const p = parsePaste(text, 4);
  assert.deepEqual(p.header, ['Họ tên', 'Câu 1', 'Câu 2', 'Câu 3', 'Câu 4']);
  assert.equal(p.rows.length, 3);
  assert.deepEqual(p.rows[1].answers, ['A', 'C', 'ĐSĐĐ', '']);
  assert.equal(p.extraCols, 1);
  const noHead = parsePaste('An,A,B,ĐSĐS,0.5\nBình,B,B,SSSS,2', 4);
  assert.equal(noHead.header, null); assert.equal(noHead.rows.length, 2); assert.equal(noHead.rows[0].name, 'An');
  assert.deepEqual(parsePaste(['Tên', 'C1', 'C2'].join('\t') + '\n' + ['An', 'A', 'B'].join('\t'), 2).header, ['Tên', 'C1', 'C2'], 'tiêu đề ngắn kiểu C1');
  assert.equal(parsePaste('', 4).rows.length, 0);
  assert.equal(parsePaste('A,B', 4, true).rows.length, 0, 'ép dòng đầu là tiêu đề');
});
t('tổng điểm, trung bình, trung vị, histogram theo thang 10', () => {
  const rows = [
    { name: 'a', answers: ['A', 'B', 'ĐSĐS', '0,5'] },   // 0,25+0,25+1+0,5 = 2,0 (tối đa 2,0)
    { name: 'b', answers: ['A', 'C', 'ĐSĐĐ', ''] },      // 0,25+0+0,5 = 0,75
    { name: 'c', answers: ['', '', '', ''] },            // 0
  ];
  const r = analyze(items, SC, rows);
  assert.deepEqual(r.students.map((s) => s.score), [2, 0.75, 0]);
  assert.equal(r.summary.maxPossible, 2); assert.equal(r.summary.n, 3);
  assert.equal(r.summary.mean, 0.92); assert.equal(r.summary.median, 0.75); assert.equal(r.summary.max, 2); assert.equal(r.summary.min, 0);
  assert.equal(r.histogram.length, 10); assert.equal(r.histogram[9], 1); assert.equal(r.histogram[3], 1); assert.equal(r.histogram[0], 1);
  assert.equal(r.students[0].correct, 4);
});
t('thống kê từng câu: độ khó, số làm đúng, phân bố lựa chọn, bỏ trống', () => {
  const rows = [{ name: 'a', answers: ['A', 'B', 'ĐSĐS', '0,5'] }, { name: 'b', answers: ['A', 'C', 'ĐSĐĐ', ''] }, { name: 'c', answers: ['B', '', 'SSSS', '1'] }, { name: 'd', answers: ['A', 'C', 'ĐSĐS', '0.5'] }];
  const r = analyze(items, SC, rows);
  assert.equal(r.items[0].p, 0.75); assert.equal(r.items[0].fullCorrect, 3);
  assert.deepEqual(r.items[0].options, { A: 3, B: 1 });
  assert.equal(r.items[1].blank, 1); assert.deepEqual(r.items[1].options, { B: 1, C: 2 });
  assert.equal(r.items[3].fullCorrect, 2); assert.equal(r.items[3].blank, 1);
  assert.equal(r.items[0].d, null, 'lớp dưới 10 học sinh: không tính độ phân biệt');
});
t('lớp 20 học sinh: độ phân biệt dương cho câu phân hoá, cờ câu khó / dễ / phân biệt kém', () => {
  const rows = Array.from({ length: 20 }, (_, i) => {
    const strong = i < 10; // 10 học sinh giỏi làm đúng cả; 10 yếu sai cả
    return { name: `s${i}`, answers: [strong ? 'A' : 'B', 'B', strong ? 'ĐSĐS' : 'SDSD', i === 0 ? '0,5' : ''] };
  });
  const r = analyze(items, SC, rows);
  assert.ok(r.items[0].d! > 0.9, `d=${r.items[0].d}`);
  assert.equal(r.items[1].p, 1); assert.ok(r.items[1].flags.includes('de'));
  assert.ok(r.items[1].flags.includes('phan-biet-kem'), 'ai cũng đúng ⇒ không phân biệt');
  assert.ok(r.items[3].flags.includes('kho'));
  assert.ok(r.items[0].r! > 0.5);
});
t('đáp án có vẻ sai: phương án nhiễu được chọn nhiều hơn đáp án đúng', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ name: `s${i}`, answers: [i < 2 ? 'A' : 'C', 'B', 'ĐSĐS', '0,5'] }));
  assert.ok(analyze(items, SC, rows).items[0].flags.includes('dap-an-ngo'));
});
t('độ tin cậy (alpha) hợp lý khi học sinh làm đúng theo năng lực', () => {
  const its: KeyItem[] = Array.from({ length: 6 }, (_, k) => ({ q: `I.${k + 1}`, part: 'p1', key: 'A' }));
  const rows = Array.from({ length: 12 }, (_, i) => ({ name: `s${i}`, answers: its.map((_x, k) => (k < Math.floor(i / 2) ? 'A' : 'B')) }));
  const a = analyze(its, SC, rows).summary.kr20;
  assert.ok(a !== null && a > 0.6 && a <= 1, String(a));
  assert.equal(analyze(its, SC, [{ name: 'x', answers: ['A', 'A', 'A', 'A', 'A', 'A'] }]).summary.kr20, null);
});
