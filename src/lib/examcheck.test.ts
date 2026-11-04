import assert from 'node:assert/strict';
import { checkExam, failCount, warnCount, type CheckInput } from './examcheck';
import { parseMatrixSpec } from './exammatrix';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const row = (type: string, level: string, count: number) => ({ id: Math.random().toString(36), scope: { kind: 'grade', id: '12' }, type, level, count });
const code = (ma: string, n: number, o: { noKey?: boolean; dup?: boolean } = {}) => ({
  ma, phan: { p1: Array.from({ length: n }, (_, i) => ({ uid: o.dup && i === 1 ? 'u0' : `u${i}`, dapAn: o.noKey && i === 0 ? '' : 'A' })), p2: [], p3: [], p4: [] },
});
const spec = (rows: ReturnType<typeof row>[], codes: ReturnType<typeof code>[], scoring = { p1: 25, p2: 100, p3: 50, p4: 100 }) =>
  parseMatrixSpec(JSON.stringify({ v: 1, thongTin: { title: 'x' }, chinhSach: 'duyet', hatGiong: 1, diemToiDaMoiCau: scoring, matran: rows, maDe: codes }))!;
const base = (o: Partial<CheckInput> = {}): CheckInput => ({ mainFile: 'main.tex', warningCount: 0, skippedCount: 0, goods: [{ mode: 'de', pages: 4 }], spec: null, question: () => ({ ctrl: false }), ...o });
const by = (c: ReturnType<typeof checkExam>, k: string) => c.find((x) => x.key === k);

console.log('Kiểm tra đề trước khi chốt');
t('đề soạn tay: chỉ kiểm tệp chính và PDF, ghi rõ không kiểm được ma trận', () => {
  const c = checkExam(base());
  assert.equal(failCount(c), 0); assert.equal(by(c, 'spec')?.level, 'info');
  assert.equal(by(c, 'main')?.level, 'ok'); assert.equal(by(c, 'pdf')?.level, 'ok');
});
t('thiếu tệp chính / PDF ⇒ chưa đạt; cảnh báo khi nhập ⇒ nhắc', () => {
  const c = checkExam(base({ mainFile: null, goods: [], warningCount: 2, skippedCount: 1 }));
  assert.equal(failCount(c), 2); assert.equal(warnCount(c), 1);
});
t('đề tạo từ ngân hàng, đủ mọi thứ: đạt hết (40 câu TN 0,25 = 10 điểm)', () => {
  const s = spec([row('tn', 'NB', 16), row('tn', 'TH', 12), row('tn', 'VD', 8), row('tn', 'VDC', 4)], [code('101', 40), code('102', 40)]);
  const c = checkExam(base({ spec: s }));
  assert.equal(failCount(c), 0); assert.equal(warnCount(c), 0);
  assert.equal(by(c, 'points')?.level, 'ok'); assert.equal(by(c, 'codes')?.level, 'ok'); assert.equal(by(c, 'bank')?.level, 'ok');
  assert.match(by(c, 'levels')!.title, /Nhận biết 40% · Thông hiểu 30% · Vận dụng 20% · Vận dụng cao 10%/);
});
t('tổng điểm khác 10 ⇒ cảnh báo kèm số điểm; thiếu một mức ⇒ cảnh báo', () => {
  const s = spec([row('tn', 'NB', 10), row('tn', 'TH', 10)], [code('101', 20)]);
  const c = checkExam(base({ spec: s }));
  assert.equal(by(c, 'points')?.level, 'warn'); assert.match(by(c, 'points')!.title, /5, không phải 10/);
  assert.equal(by(c, 'levels')?.level, 'warn'); assert.match(by(c, 'levels')!.detail ?? '', /VD/);
});
t('mã đề lệch số câu, thiếu đáp án, lặp câu ⇒ chưa đạt, nêu rõ mã nào', () => {
  const s = spec([row('tn', 'NB', 40)], [code('101', 40), code('102', 39), code('103', 40, { noKey: true }), code('104', 40, { dup: true })]);
  const c = checkExam(base({ spec: s }));
  const d = by(c, 'codes')!;
  assert.equal(d.level, 'fail');
  assert.match(d.detail!, /mã 102 có 39 câu, ma trận cần 40/); assert.match(d.detail!, /mã 103 thiếu đáp án ở 1 câu/); assert.match(d.detail!, /mã 104 có câu bị lặp/);
});
t('câu đã xoá khỏi ngân hàng / đang "Cần sửa" ⇒ cảnh báo; ký tự điều khiển ⇒ chưa đạt', () => {
  const s = spec([row('tn', 'NB', 40)], [code('101', 40)]);
  const q = (u: string) => (u === 'u1' ? undefined : u === 'u2' ? { review: 'needs_fix' as const, ctrl: false } : u === 'u3' ? { ctrl: true } : { ctrl: false });
  const c = checkExam(base({ spec: s, question: q }));
  assert.equal(by(c, 'bank')?.level, 'warn'); assert.match(by(c, 'bank')!.title, /1 câu đã bị xoá.*1 câu đang bị đánh "Cần sửa"/);
  assert.equal(by(c, 'ctrl')?.level, 'fail');
});
t('không có mã đề nào ⇒ chưa đạt', () => {
  const c = checkExam(base({ spec: spec([row('tn', 'NB', 40)], []) }));
  assert.equal(by(c, 'codes')?.level, 'fail');
});
