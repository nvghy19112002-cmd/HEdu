// Ma trận theo từng câu: tách dòng, đặt cấu trúc đề, sửa hàng loạt, lưới nhập nhanh, thống kê độ khó; đi đúng qua bộ phân bổ.
import { allocate, type EffLike, type Row } from './examgen';
import { applyForm, difficultyLabel, expandRows, formOf, FORM_THPT, gridCounts, levelStats, moveSlot, partSlots, patchSlots, setGridCell, setPartCount } from './examslots';
import { cellId } from './examgrid';
import type { Level, QType, Question } from './types';

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
let k = 0;
const nid = () => `n${++k}`;
const G: Row['scope'] = { kind: 'grade', id: '12' };
let qn = 0;
const mk = (formId: string, type: QType, level: Level): Question => {
  qn++;
  return { uid: `u${qn}`, seq: qn, latex: `\\begin{ex}\n Câu ${qn}.\n \\choice{\\True 1}{2}{3}{4}\n\\end{ex}`, type, level, tags: [], createdAt: 0, updatedAt: 0, grade: 12, chapterId: 'c1', lessonId: 'l1', formId, review: 'approved' };
};
const eff = (): EffLike => ({ form: 'chua', level: 'chua', unclassified: false });

console.log('Ma trận theo từng câu');
{
  const rows: Row[] = [{ id: 'a', scope: G, type: 'tn', level: 'NB', count: 3 }, { id: 'b', scope: G, type: 'ds', level: 'any', count: 0 }, { id: 'c', scope: G, type: 'tln', level: 'any', count: 1 }];
  const e = expandRows(rows, { a: ['x', 'y'], c: ['z'], ma: ['w'] }, nid);
  ok(e.changed && e.rows.length === 4 && e.rows.every((r) => r.count === 1), 'dòng 3 câu ⇒ 3 ô, dòng 0 câu bị bỏ');
  ok(e.rows[0].id === 'a' && e.locked.a?.[0] === 'x' && e.locked[e.rows[1].id]?.[0] === 'y' && !e.locked[e.rows[2].id] && e.locked.c?.[0] === 'z', 'câu khóa chia lần lượt cho từng ô, giữ id ô đầu');
  ok(!('ma' in e.locked), 'khóa của dòng không còn bị bỏ');
  const again = expandRows(e.rows, e.locked, nid);
  ok(!again.changed && again.rows.length === 4, 'đã là ô 1 câu ⇒ không đổi (không lặp vô hạn)');
  const many = expandRows([{ id: 'p', scope: G, type: 'tn', level: 'NB', count: 1 }], { p: ['q1', 'q2'] }, nid);
  ok(many.rows.length === 2 && many.locked.p[0] === 'q1' && many.locked[many.rows[1].id][0] === 'q2', 'ô có 2 câu khóa (dữ liệu cũ) ⇒ tách, không mất câu khóa');
}
{
  let r = applyForm([], FORM_THPT, G, nid).rows;
  const f = formOf(r);
  ok(f.p1 === 12 && f.p2 === 4 && f.p3 === 6 && f.p4 === 0, 'Form THPT ⇒ 12 / 4 / 6');
  ok(r.slice(0, 12).map((x) => x.level).join(',') === 'NB,NB,NB,NB,NB,TH,TH,TH,TH,VD,VD,VD', 'phần trắc nghiệm mới chia mức 5 NB : 4 TH : 3 VD');
  ok(r.map((x) => x.type).join('') === 'tn'.repeat(0) + [...Array(12).fill('tn'), ...Array(4).fill('ds'), ...Array(6).fill('tln')].join(''), 'các phần theo thứ tự I → III');
  r = patchSlots(r, new Set([r[11].id]), { scope: { kind: 'chapter', id: 'c9' }, level: 'VD' }).rows;
  const s = setPartCount(r, 'p1', 14, G, nid);
  ok(partSlots(s.rows, 'p1').length === 14 && s.rows[12].scope.id === 'c9' && s.rows[12].level === 'VD' && s.rows[14].type === 'ds', 'thêm câu phần I: chép phạm vi/mức của câu cuối, chèn trước phần II');
  const d = setPartCount(s.rows, 'p1', 10, G, nid);
  ok(partSlots(d.rows, 'p1').length === 10 && d.removed.length === 4, 'bớt câu: bỏ từ cuối, báo id để gỡ khóa');
  const t = setPartCount(d.rows, 'p4', 2, G, nid);
  ok(t.rows.slice(-2).every((x) => x.type === 'tl' && x.level === 'any'), 'thêm phần tự luận ở cuối');
  const pt = patchSlots(t.rows, new Set([t.rows[0].id, t.rows[1].id]), { level: 'TH' });
  ok(pt.touched.length === 2 && pt.rows[0].level === 'TH', 'sửa hàng loạt mức độ, báo ô bị đổi');
  ok(patchSlots(pt.rows, new Set([pt.rows[0].id]), { level: 'TH' }).touched.length === 0, 'sửa mà không đổi gì ⇒ không gỡ khóa');
  const flagged: Row[] = [{ id: 'f', scope: G, type: 'tn', level: 'NB', count: 1, flag: 'mat', label: 'cũ' }];
  const fx = patchSlots(flagged, new Set(['f']), { scope: { kind: 'lesson', id: 'l2' } }).rows[0];
  ok(!fx.flag && !fx.label && fx.scope.id === 'l2', 'chọn lại phạm vi gỡ cờ “không còn trong cây”');
  const mv = moveSlot(t.rows, t.rows[1].id, -1);
  ok(mv[0].id === t.rows[1].id && mv[1].id === t.rows[0].id && moveSlot(mv, mv[0].id, -1)[0].id === mv[0].id, 'đổi chỗ trong phần, không vượt đầu phần');
}
{
  let r: Row[] = [];
  r = setGridCell(r, 'f1', 'tn', 'NB', 3, nid).rows;
  r = setGridCell(r, 'f2', 'ds', 'TH', 1, nid).rows;
  r = setGridCell(r, 'f1', 'tn', 'TH', 2, nid).rows;
  ok(gridCounts(r).get(cellId('f1', 'tn', 'NB')) === 3 && gridCounts(r).get(cellId('f1', 'tn', 'TH')) === 2, 'lưới nhập nhanh ⇒ đúng số ô theo Dạng × mức');
  ok(r.map((x) => x.type).join(',') === 'tn,tn,tn,tn,tn,ds', 'ô mới vẫn nằm đúng phần');
  const d = setGridCell(r, 'f1', 'tn', 'NB', 1, nid);
  ok(d.removed.length === 2 && gridCounts(d.rows).get(cellId('f1', 'tn', 'NB')) === 1, 'bớt số ở lưới ⇒ bỏ ô tương ứng');

  console.log('Đi qua bộ phân bổ: mỗi ô đúng 1 câu, câu khóa giữ đúng ô');
  const qs = [mk('f1', 'tn', 'NB'), mk('f1', 'tn', 'NB'), mk('f1', 'tn', 'NB'), mk('f1', 'tn', 'TH'), mk('f1', 'tn', 'TH'), mk('f2', 'ds', 'TH')];
  const lockId = r[1].id;
  const a = allocate(qs, r, { policy: 'duyet', eff, seed: 3, locked: { [lockId]: ['u3'] } });
  ok(r.every((x) => (a.picks[x.id] ?? []).length === 1), 'mỗi ô được đúng một câu');
  ok(a.picks[lockId][0] === 'u3', 'ô có câu khóa nhận đúng câu đó');
  ok(new Set(Object.values(a.picks).flat()).size === r.length, 'không câu nào lặp giữa các ô');
}
{
  const s = levelStats(['NB', 'NB', 'TH', 'VD', 'VDC', 'any']);
  ok(s.NB === 2 && s.unknown === 1 && s.easyPct === 60 && s.hardPct === 40, 'tỉ lệ nhận biết–thông hiểu / vận dụng (bỏ ô chưa rõ mức)');
  ok(s.difficulty === 4 && difficultyLabel(s.difficulty) === 'Vừa sức', 'độ khó thang 0–10');
  ok(levelStats([]).difficulty === 0 && levelStats(['VDC']).difficulty === 10 && levelStats(['NB']).difficulty === 0, 'biên độ khó');
}
if (fail) { console.log(`\n${fail} kiểm thử examslots lỗi`); process.exit(1); }
console.log('examslots: đạt hết.');
