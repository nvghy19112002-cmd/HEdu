import assert from 'node:assert/strict';
import { analyze } from './examstats';
import { statsBook } from './examstatsbook';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const text = (c: { v?: string; n?: number } | undefined) => c?.v ?? (c?.n === undefined ? '' : String(c.n));

console.log('Sổ Excel thống kê');
t('ba trang; tóm tắt đúng số liệu; theo câu có cột phương án; theo học sinh xếp điểm giảm dần', () => {
  const items = [{ q: 'I.1', part: 'p1' as const, key: 'A' }, { q: 'I.2', part: 'p1' as const, key: 'B' }];
  const a = analyze(items, { p1: 25, p2: 100, p3: 50, p4: 100 }, [{ name: 'An', answers: ['A', 'B'] }, { name: 'Bình', answers: ['B', 'B'] }, { name: 'Chi', answers: ['A', ''] }]);
  const b = statsBook(a, { name: 'Đề thử', code: '101' });
  assert.deepEqual(b.sheets.map((s) => s.name), ['Tóm tắt', 'Theo câu', 'Theo học sinh']);
  const row = (k: string) => b.sheets[0].rows.find((r) => text(r[0]) === k)!;
  assert.equal(text(row('Số học sinh')[1]), '3'); assert.equal(text(row('Điểm tối đa của đề')[1]), '0.5');
  const head = b.sheets[1].rows[0].map(text);
  assert.ok(head.includes('Chọn A') && head.includes('Chọn B') && head[0] === 'Câu');
  assert.equal(b.sheets[1].rows.length, 3);
  assert.deepEqual(b.sheets[2].rows.slice(1).map((r) => text(r[1])), ['An', 'Bình', 'Chi']);
});
