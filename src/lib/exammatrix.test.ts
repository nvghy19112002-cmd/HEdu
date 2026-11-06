import assert from 'node:assert/strict';
import { matrixBook, parseMatrixSpec, rowPlace } from './exammatrix';
import { buildDefault } from './taxonomy';
import type { Question } from './types';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const tax = buildDefault();
const g12 = tax.grades.find((g) => g.grade === 12)!;
const ch = g12.branches[0].chapters[0];
const l1 = ch.lessons[0], l2 = ch.lessons[1];
const f1 = l1.forms[0];
const spec = JSON.stringify({
  v: 1, thongTin: { title: 'Đề thử' }, chinhSach: 'duyet', hatGiong: 77, diemToiDaMoiCau: { p1: 25, p2: 100, p3: 50, p4: 100 },
  matran: [
    { id: 'a', scope: { kind: 'lesson', id: l1.id }, type: 'tn', level: 'NB', count: 2 },
    { id: 'b', scope: { kind: 'lesson', id: l1.id }, type: 'tn', level: 'TH', count: 1 },
    { id: 'c', scope: { kind: 'form', id: f1.id }, type: 'ds', level: 'VD', count: 1 },
    { id: 'd', scope: { kind: 'lesson', id: l2.id }, type: 'tln', level: 'VDC', count: 1 },
    { id: 'e', scope: { kind: 'chapter', id: ch.id }, type: 'tn', level: 'any', count: 1 },
    { id: 'x', scope: { kind: 'lesson', id: l2.id }, type: 'tn', level: 'NB', count: 0 },
  ],
  maDe: [{ ma: '101', phan: { p1: [{ uid: 'u1', dapAn: 'B' }], p2: [{ uid: 'u2', dapAn: 'ĐSĐS' }], p3: [], p4: [] } }, { ma: '102', phan: {} }],
});
const text = (c: { v?: string; n?: number } | undefined) => (c?.v ?? (c?.n === undefined ? '' : String(c.n)));

console.log('Ma trận đề ra Excel');
t('đọc hedu-de.json; bỏ dòng sai và dòng 0 câu; từ chối tệp lạ', () => {
  const s = parseMatrixSpec(spec)!;
  assert.equal(s.rows.length, 5); assert.equal(s.codes, 2); assert.equal(s.firstCode!.code, '101'); assert.equal(s.seed, 77);
  assert.equal(parseMatrixSpec('không phải json'), null);
  assert.equal(parseMatrixSpec('{"v":2,"matran":[]}'), null);
  assert.equal(parseMatrixSpec('{"v":1}'), null);
});
t('vị trí dòng ma trận theo khung chương trình', () => {
  assert.deepEqual(rowPlace({ scope: { kind: 'lesson', id: l1.id }, type: 'tn', level: 'NB', count: 1 }, tax), { chapter: ch.name, item: l1.name });
  assert.deepEqual(rowPlace({ scope: { kind: 'form', id: f1.id }, type: 'tn', level: 'NB', count: 1 }, tax), { chapter: ch.name, item: `${l1.name} › ${f1.name}` });
  assert.equal(rowPlace({ scope: { kind: 'chapter', id: ch.id }, type: 'tn', level: 'NB', count: 1 }, tax).item, 'Cả chương');
  assert.equal(rowPlace({ scope: { kind: 'lesson', id: 'khong-co' }, type: 'tn', level: 'NB', count: 1, label: 'Bài cũ' }, tax).item, 'Bài cũ');
});
t('bảng ma trận: số câu, điểm theo thang của đề, tỉ lệ, dòng cộng', () => {
  const spc = parseMatrixSpec(spec)!;
  const q = (uid: string): Question | undefined => (uid === 'u1' ? { uid, seq: 12, type: 'tn', level: 'NB', formId: f1.id, chapterId: ch.id, lessonId: l1.id, grade: 12, latex: '', tags: [], createdAt: 0, updatedAt: 0 } : undefined);
  const b = matrixBook(spc, { name: 'Đề thử', grade: 12, schoolYear: '2026–2027', examType: 'Giữa kỳ 1' }, tax, q);
  assert.equal(b.sheets.length, 3);
  const m = b.sheets[0];
  assert.equal(text(m.rows[0][0]), 'MA TRẬN ĐỀ KIỂM TRA');
  assert.equal(text(m.rows[4][2]), '6 câu · 2,5 điểm'); // 4 tn × 0,25 + 1 ds × 1 + 1 tln × 0,5
  const head = m.rows.findIndex((r) => text(r[0]) === 'STT');
  const body = m.rows.slice(head + 2, m.rows.findIndex((r) => text(r[0]) === 'Cộng'));
  assert.equal(body.length, 4, 'bài 1, bài 1 › dạng, bài 2, cả chương');
  const sum = m.rows.find((r) => text(r[0]) === 'Cộng')!;
  // tn 5 cột (NB TH VD VDC Chung), ds 5, tln 5
  const vals = sum.slice(3, 18).map((c) => c.n ?? 0);
  assert.deepEqual(vals, [2, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
  const tail = sum.slice(18).map((c) => c.n);
  assert.deepEqual(tail, [6, 2.5, 100]);
  assert.ok(m.merges!.some((x) => x[0] === head && x[2] === head && x[3] - x[1] === 4), 'nhóm loại câu gộp theo số mức độ');
  assert.ok(m.freeze && m.landscape);
});
t('trang câu trong đề dùng thông tin từ ngân hàng khi có', () => {
  const spc = parseMatrixSpec(spec)!;
  const q = (uid: string): Question | undefined => (uid === 'u1' ? { uid, seq: 12, type: 'tn', level: 'NB', formId: f1.id, chapterId: ch.id, lessonId: l1.id, grade: 12, latex: '', tags: [], createdAt: 0, updatedAt: 0 } : undefined);
  const s2 = matrixBook(spc, { name: 'x' }, tax, q).sheets[2];
  assert.equal(text(s2.rows[0][7]), 'Đáp án (mã 101)');
  assert.deepEqual(s2.rows[1].map(text).slice(0, 4), ['I.1', 'I', 'Trắc nghiệm', 'NB']);
  assert.equal(text(s2.rows[1][6]), '#0012 · u1');
  assert.equal(text(s2.rows[2][2]), '', 'câu không còn trong ngân hàng: để trống, vẫn giữ mã và đáp án');
  assert.equal(text(s2.rows[2][7]), 'ĐSĐS');
});
