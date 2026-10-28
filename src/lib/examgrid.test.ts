// Lưới chọn câu theo Dạng × mức độ: ô ⇒ dòng ma trận, số kho, và đi đúng qua bộ phân bổ (dữ liệu giả lập).
import { allocate, type EffLike, type Row } from './examgen';
import { cellId, setCell, stockIndex } from './examgrid';
import type { Level, QType, Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

let n = 0;
const mk = (formId: string, type: QType, level: Level, review: Question['review'] = 'approved'): Question => {
  n++;
  return { uid: `u${n}`, seq: n, latex: `\\begin{ex}\n Câu ${n}.\n \\choice{\\True 1}{2}{3}{4}\n\\end{ex}`, type, level, tags: [], createdAt: 0, updatedAt: 0, grade: 12, chapterId: 'c1', lessonId: 'l1', formId, review };
};
const eff = (_q: Question): EffLike => ({ form: 'chua', level: 'chua', unclassified: false });

console.log('Ô lưới ⇒ dòng ma trận');
{
  let rows: Row[] = [{ id: 'r-cu', scope: { kind: 'grade', id: '12' }, type: 'tn', level: 'NB', count: 2 }];
  rows = setCell(rows, 'f1', 'tn', 'NB', 3);
  ok(rows.length === 2 && rows[1].id === cellId('f1', 'tn', 'NB') && rows[1].scope.kind === 'form' && rows[1].count === 3, 'nhập số ⇒ thêm dòng phạm vi Dạng, giữ dòng cũ');
  rows = setCell(rows, 'f1', 'tn', 'NB', 5);
  ok(rows.length === 2 && rows[1].count === 5, 'sửa số ⇒ cập nhật đúng dòng, không nhân bản');
  rows = setCell(rows, 'f1', 'ds', 'TH', 1);
  ok(rows.length === 3 && rows[2].level === 'TH' && rows[2].type === 'ds', 'ô khác loại/mức ⇒ dòng riêng');
  rows = setCell(rows, 'f1', 'tn', 'NB', 0);
  ok(rows.length === 2 && !rows.some((r) => r.id === cellId('f1', 'tn', 'NB')), 'xóa số (0) ⇒ bỏ dòng');
  ok(setCell([], 'f1', 'tn', 'NB', NaN).length === 0 && setCell([], 'f1', 'tn', 'NB', 999)[0].count === 200 && setCell([], 'f1', 'tn', 'NB', -3).length === 0, 'giá trị lạ/âm/quá lớn được chặn');
}

console.log('Số kho theo ô');
{
  const qs = [mk('f1', 'tn', 'NB'), mk('f1', 'tn', 'NB'), mk('f1', 'tn', 'TH'), mk('f2', 'ds', 'VD'), mk('f1', 'tn', 'NB', 'needs_fix')];
  const idx = stockIndex(qs, (q) => q.review === 'approved');
  ok(idx.get('f1')?.get('tn|NB') === 2 && idx.get('f1')?.get('tn|TH') === 1 && idx.get('f2')?.get('ds|VD') === 1, 'đếm theo Dạng, loại, mức');
  ok(!idx.get('f1')?.has('ds|NB'), 'ô không có câu ⇒ không có số');
  ok(idx.get('f1')?.get('tn|NB') === 2, 'câu không đạt điều kiện (Cần sửa) không được đếm');

  console.log('Đi qua bộ phân bổ như dòng thường');
  const rows = setCell(setCell([], 'f1', 'tn', 'NB', 2), 'f1', 'tn', 'TH', 1);
  const a = allocate(qs, rows, { policy: 'duyet', eff, seed: 7 });
  const nb = a.picks[cellId('f1', 'tn', 'NB')], th = a.picks[cellId('f1', 'tn', 'TH')];
  ok(nb.length === 2 && th.length === 1 && a.deficit[cellId('f1', 'tn', 'NB')] === 0, 'lấy đúng số câu từng ô');
  ok(nb.every((u) => qs.find((q) => q.uid === u)!.level === 'NB') && !nb.includes(qs[4].uid), 'đúng mức độ, không lấy câu Cần sửa');
  const over = allocate(qs, setCell([], 'f1', 'tn', 'NB', 3), { policy: 'duyet', eff, seed: 1 });
  ok(over.deficit[cellId('f1', 'tn', 'NB')] === 1, 'nhập quá số kho ⇒ báo thiếu, không lấy câu ngoài ô');
}

if (fail) process.exit(1);
console.log('examgrid: đạt hết.');
