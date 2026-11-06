import assert from 'node:assert/strict';
import { parseMatrixSpec } from './exammatrix';
import { lessonOfForm, specSheet, yccdText } from './examspec';
import { buildDefault } from './taxonomy';
import type { Question } from './types';
import { YCCD_TOAN } from './yccd-toan';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const tax = buildDefault();
const text = (c: { v?: string; n?: number } | undefined) => (c?.v ?? (c?.n === undefined ? '' : String(c.n)));

// bài có yêu cầu cần đạt (Lớp 10 · Đại số · Chương 1 · Bài 1) và bài không có dữ liệu
const g10 = tax.grades.find((g) => g.code === '0')!;
const lesA = g10.branches.find((b) => b.code === 'D')!.chapters.find((c) => c.code === '1')!.lessons.find((l) => l.code === '1')!;
const chA = g10.branches.find((b) => b.code === 'D')!.chapters.find((c) => c.code === '1')!;
const fA = lesA.forms[0];
const noY = tax.grades.flatMap((g) => g.branches.flatMap((b) => b.chapters.flatMap((c) => c.lessons.map((l) => ({ g, b, c, l }))))).find((x) => !YCCD_TOAN[`${x.g.code}/${x.b.code}/${x.c.code}/${x.l.code}`])!;

const Q = (uid: string, type: Question['type'], level: Question['level'], formId: string): Question => ({ uid, seq: 1, type, level, formId, chapterId: '', lessonId: '', grade: 10, latex: '', tags: [], createdAt: 0, updatedAt: 0 });
const bank: Record<string, Question> = {
  a1: Q('a1', 'tn', 'NB', fA.id), a2: Q('a2', 'tn', 'TH', fA.id), a3: Q('a3', 'tn', 'NB', fA.id),
  b1: Q('b1', 'ds', 'VD', noY.l.forms[0].id), x1: Q('x1', 'tln', 'VDC', 'khong-co'),
};
const spec = parseMatrixSpec(JSON.stringify({
  v: 1, thongTin: { title: 'Đề thử' }, diemToiDaMoiCau: { p1: 25, p2: 100, p3: 50, p4: 100 }, matran: [],
  maDe: [{ ma: '101', phan: { p1: [{ uid: 'a1', dapAn: 'A' }, { uid: 'a2', dapAn: 'B' }, { uid: 'a3', dapAn: 'C' }], p2: [{ uid: 'b1', dapAn: 'ĐSĐS' }], p3: [{ uid: 'x1', dapAn: '3' }], p4: [] } }],
}))!;

console.log('Bản đặc tả kĩ thuật');
t('dữ liệu yêu cầu cần đạt khớp tên bài trong khung', () => {
  assert.equal(Object.keys(YCCD_TOAN).length, 97);
  assert.equal(lessonOfForm(tax, fA.id)!.yccd?.ten, lesA.name);
  assert.equal(lessonOfForm(tax, noY.l.forms[0].id)!.yccd, null);
  assert.equal(lessonOfForm(tax, 'khong-co'), null);
});
t('yêu cầu cần đạt chỉ ghi mức độ có câu; Vận dụng cao dùng ý của Vận dụng', () => {
  const y = YCCD_TOAN['0/D/1/1'];
  const s = yccdText(y, ['NB']);
  assert.ok(s.startsWith('Nhận biết:\n- '));
  assert.ok(!s.includes('Thông hiểu'));
  assert.ok(yccdText(y, ['VDC']).startsWith('Vận dụng cao:'));
  assert.equal(yccdText(null, ['NB']), '');
});
t('trang đặc tả: số câu vào đúng ô, tổng, điểm, ghi chú bài thiếu dữ liệu', () => {
  const sh = specSheet(spec, { name: 'Đề thử', grade: 10 }, tax, (u) => bank[u])!;
  assert.equal(sh.name, 'Bản đặc tả');
  assert.ok(text(sh.rows[0][0]).startsWith('BẢN ĐẶC TẢ KĨ THUẬT ĐỀ THỬ'));
  const head = sh.rows.findIndex((r) => text(r[0]) === 'STT');
  const body = sh.rows.slice(head + 2, sh.rows.findIndex((r) => text(r[0]) === 'TỔNG SỐ CÂU / Ý'));
  assert.equal(body.length, 3, 'bài A, bài không dữ liệu, chưa phân loại');
  assert.equal(text(body[0][2]), lesA.name);
  assert.ok(text(body[0][3]).includes('Nhận biết:') && text(body[0][3]).includes('Thông hiểu:'));
  // cột: 4.. = tn(NB,TH,VD,VDC), ds(...), tln(...)
  assert.equal(text(body[0][4]), 'I.1, I.3');
  assert.equal(text(body[0][5]), 'I.2');
  assert.equal(text(body[1][3]), '', 'bài không có dữ liệu: để trống');
  assert.equal(text(body[1][4 + 4 + 2]), 'II.1');
  assert.equal(text(body[2][2]), '(chưa phân loại)');
  assert.equal(text(body[2][4 + 8 + 3]), 'III.1');
  const total = sh.rows.find((r) => text(r[0]) === 'TỔNG SỐ CÂU / Ý')!;
  assert.deepEqual(total.slice(4).map((c) => c.n ?? 0), [2, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const pts = sh.rows.find((r) => text(r[0]) === 'ĐIỂM THEO TỪNG PHẦN')!;
  assert.deepEqual([pts[4].n, pts[8].n, pts[12].n], [0.75, 1, 0.5]);
  assert.ok(sh.rows.some((r) => text(r[0]).includes('Chưa có yêu cầu cần đạt cho 1 bài')));
});
t('đề chưa có mã đề: không có trang đặc tả', () => {
  const s0 = parseMatrixSpec(JSON.stringify({ v: 1, matran: [], maDe: [] }))!;
  assert.equal(specSheet(s0, { name: 'x' }, tax, () => undefined), null);
});
