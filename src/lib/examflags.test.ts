// Hồi quy: dòng ma trận có cờ (phạm vi đã xóa / đổi vị trí) KHÔNG được chọn câu và KHÔNG được lưu/xuất cho tới khi giáo viên xử lý.
import { allocate, checkVariants, collect, makeVariants, reconcile, rowMatches, type EffLike, type Row } from './examgen';
import { applyTemplate, snapshotFrom } from './examtemplates';
import { confirmRow, effectiveRows, newDraft, newRowId, parseDraft, rescopeRow, type Draft } from './examdraft';
import { buildDefault } from './taxonomy';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const g = tax.grades.find((x) => x.grade === 12) ?? tax.grades[tax.grades.length - 1];
const chaps = g.branches.flatMap((b) => b.chapters);
const chap = chaps.find((c) => c.lessons.length >= 1 && c.lessons.some((l) => l.forms.length)) ?? chaps[0];
const les = chap.lessons.find((l) => l.forms.length) ?? chap.lessons[0];
const frm = les.forms[0];
const other = chaps.find((c) => c.id !== chap.id && c.lessons.length)!;

let n = 0;
const q = (formId: string): Question => ({ uid: `u${++n}`, seq: n, latex: `\\begin{ex}\n C${n}\n\\choice{\\True 1}{2}{3}{4}\n\\end{ex}`, type: 'tn', level: 'NB', tags: [], createdAt: 0, updatedAt: 0, grade: g.grade, chapterId: chap.id, lessonId: les.id, formId, review: 'approved' });
// ngân hàng còn rất nhiều câu mang ID của Dạng `frm` (kể cả khi Dạng này đã bị xóa/chuyển khỏi cây)
const bank: Question[] = Array.from({ length: 30 }, () => q(frm.id));
const eff = (): EffLike => ({ form: 'chua', level: 'chua', unclassified: false });

const baseDraft = (): Draft => {
  const d = newDraft(1);
  d.policy = 'duyet';
  d.rows = [
    { id: 'r1', scope: { kind: 'grade', id: String(g.grade) }, type: 'tn', level: 'NB', count: 3 },
    { id: 'r2', scope: { kind: 'form', id: frm.id }, type: 'tn', level: 'NB', count: 2 },
  ];
  return d;
};

/** Đúng đường xử lý của màn Tạo đề: dòng dùng thật → chọn câu → đối chiếu → điều kiện xuất. */
function run(d: Draft, taxNow = tax) {
  const rows = effectiveRows(d.rows, taxNow);
  const a = allocate(bank, rows, { policy: d.policy, eff, seed: d.seed, locked: d.locked });
  const byUid = new Map(bank.map((x) => [x.uid, x]));
  const picked = collect(rows, a.picks, byUid);
  const variants = makeVariants(picked, { count: 2, firstCode: 101, shuffleQuestions: true, shuffleOptions: true, seed: d.seed, keepFirstOriginal: true });
  const issues = [...checkVariants(variants), ...reconcile(rows, a, picked, variants, d.scoring)];
  const missing = rows.reduce((s, r) => s + (a.deficit[r.id] ?? 0), 0);
  const canExport = picked.p1.length > 0 && missing === 0 && issues.length === 0 && a.lost.length === 0;
  return { rows, a, issues, missing, canExport, picked };
}

// bài chuyển sang chương khác nhưng GIỮ NGUYÊN ID (Dạng không đổi ID)
const taxMoved = structuredClone(tax);
{
  const all = taxMoved.grades.flatMap((gg) => gg.branches.flatMap((b) => b.chapters));
  const src = all.find((c) => c.id === chap.id)!;
  const dst = all.find((c) => c.id === other.id)!;
  const lesson = src.lessons.find((l) => l.id === les.id)!;
  src.lessons = src.lessons.filter((l) => l.id !== les.id);
  dst.lessons.push(lesson);
}
// Dạng bị xóa khỏi cây
const taxGone = structuredClone(tax);
for (const gg of taxGone.grades) for (const b of gg.branches) for (const c of b.chapters) for (const l of c.lessons) l.forms = l.forms.filter((f) => f.id !== frm.id);

console.log('Nền: ma trận hợp lệ xuất được, hành vi thường không đổi');
{
  const d = baseDraft();
  const r = run(d);
  ok(r.canExport && r.issues.length === 0 && r.missing === 0 && r.picked.p1.length === 5, 'ma trận không có cờ: đủ câu, không vướng, xuất được');
  const plain = allocate(bank, d.rows, { policy: d.policy, eff, seed: d.seed });
  ok(JSON.stringify(plain.picks) === JSON.stringify(r.a.picks), 'đường mới cho kết quả chọn câu y hệt khi không có cờ (không ảnh hưởng sinh đề thường)');
  ok(rowMatches(d.rows[1], bank[0]) && !rowMatches({ ...d.rows[1], flag: 'mat' }, bank[0]) && !rowMatches({ ...d.rows[1], flag: 'doi-vi-tri' }, bank[0]), 'rowMatches: dòng có cờ không khớp câu nào');
}

console.log('Đổi vị trí (cùng ID): chưa xác nhận thì không xuất');
{
  const base = baseDraft();
  const tpl = { ...snapshotFrom(base, tax, 'Mẫu', 1), id: 'tpl-1' };
  const applied = applyTemplate(tpl, newDraft(2), taxMoved, 'replace', newRowId);
  const moved = applied.draft.rows.find((x) => x.scope.kind === 'form')!;
  ok(moved.flag === 'doi-vi-tri' && applied.bad === 1, 'áp mẫu khi cây đã chuyển Dạng: dòng được gắn cờ “đổi vị trí”');
  const r = run(applied.draft, taxMoved);
  ok(r.a.pool[moved.id] === 0 && r.a.picks[moved.id].length === 0, 'dù ngân hàng còn nhiều câu mang đúng ID đó, dòng có cờ KHÔNG lấy câu');
  ok(r.missing === moved.count && !r.canExport, 'thiếu câu ⇒ không xuất');
  // đủ câu, đáp án và tổng đều hợp lệ nhưng vẫn còn cờ: vẫn phải chặn (hạ số câu của dòng cờ về 0 để thiếu câu bằng 0)
  const zero: Draft = { ...applied.draft, rows: applied.draft.rows.map((x) => (x.id === moved.id ? { ...x, count: 0 } : x)) };
  const z = run(zero, taxMoved);
  ok(z.missing === 0 && checkVariants(makeVariants(z.picked, { count: 2, firstCode: 1, shuffleQuestions: true, shuffleOptions: true, seed: 1, keepFirstOriginal: true })).length === 0, 'điều kiện số câu và đáp án đều đạt');
  ok(z.issues.some((i) => i.kind === 'dong-chua-xu-ly') && !z.canExport, 'HỒI QUY: đạt hết mọi điều kiện khác nhưng còn dòng có cờ ⇒ Lưu/Xuất vẫn bị chặn');
  // câu đã khóa thuộc dòng có cờ cũng không lọt vào
  const locked: Draft = { ...applied.draft, locked: { [moved.id]: [bank[0].uid] } };
  ok(run(locked, taxMoved).a.lost.some((l) => l.uid === bank[0].uid && l.why === 'khong-khop-dong'), 'câu khóa thuộc dòng có cờ bị loại và được báo (không biến mất âm thầm)');

  // xác nhận “Đã xem” (giữ ID hiện tại): kiểm lại nút còn thật rồi bỏ cờ
  const fx = confirmRow(moved, taxMoved);
  ok(fx.ok && !('flag' in fx.row) && !('label' in fx.row) && fx.row.scope.id === frm.id, 'xác nhận: bỏ cờ, giữ nguyên ID hiện tại');
  const after: Draft = { ...applied.draft, rows: applied.draft.rows.map((x) => (x.id === moved.id && fx.ok ? fx.row : x)) };
  const ra = run(after, taxMoved);
  ok(ra.canExport && ra.picked.p1.length === 5 && ra.issues.length === 0, 'sau xác nhận: dùng lại bình thường (chọn câu, đối chiếu, xuất)');
  ok(!confirmRow({ ...moved, scope: { kind: 'form', id: 'khong-co' } }, taxMoved).ok, 'xác nhận bị từ chối nếu nút không còn thật trong cây');
}

console.log('Phạm vi bị xóa khỏi cây (ngân hàng còn câu mang ID cũ): không được lấy câu');
{
  const d = baseDraft(); // dòng r2 trỏ Dạng `frm`, nhưng cây hiện tại không còn Dạng đó và KHÔNG có cờ (bản nháp lưu từ trước)
  ok(d.rows.every((x) => !x.flag), 'bản nháp cũ chưa có cờ');
  const r = run(d, taxGone);
  const r2 = r.rows.find((x) => x.id === 'r2')!;
  ok(r2.flag === 'mat', 'dòng có nút phạm vi không còn trong cây tự được coi là “mất”');
  ok(r.a.pool.r2 === 0 && r.a.picks.r2.length === 0 && bank.every((x) => x.formId === frm.id), 'ngân hàng vẫn đầy câu mang ID cũ nhưng dòng không lấy câu nào');
  ok(!r.canExport && r.issues.some((i) => i.kind === 'dong-chua-xu-ly'), 'không xuất được');
  // áp mẫu khi Dạng đã bị xóa
  const tpl = { ...snapshotFrom(baseDraft(), tax, 'Mẫu', 1), id: 'tpl-2' };
  const ap = applyTemplate(tpl, newDraft(3), taxGone, 'replace', newRowId);
  const lost = ap.draft.rows.find((x) => x.scope.kind === 'form')!;
  ok(lost.flag === 'mat' && lost.scope.id === frm.id && !!lost.label, 'áp mẫu: dòng “mất” giữ phạm vi và tên gốc, không tự đổi sang Dạng khác');
  const c = confirmRow(lost, taxGone);
  ok(!c.ok, '“mất” KHÔNG xác nhận được: phải chọn lại hoặc xóa');
  // chọn lại phạm vi hợp lệ ⇒ bỏ cờ, ma trận chạy bình thường
  const valid = rescopeRow(lost, { kind: 'chapter', id: chap.id }, taxGone);
  ok(valid.ok && !('flag' in valid.row) && valid.row.scope.kind === 'chapter' && valid.row.scope.id === chap.id, 'chọn lại phạm vi có thật: bỏ cờ và đổi phạm vi');
  const fixed: Draft = { ...ap.draft, rows: ap.draft.rows.map((x) => (x.id === lost.id && valid.ok ? valid.row : x)) };
  const rf = run(fixed, taxGone);
  ok(rf.canExport && rf.issues.length === 0, 'sau khi chọn lại: chọn câu và xuất bình thường');
  // phạm vi mới KHÔNG có trong cây: từ chối, giữ nguyên cờ
  const bad = rescopeRow(lost, { kind: 'form', id: frm.id }, taxGone);
  ok(!bad.ok, 'chọn lại vào nút vẫn không có trong cây ⇒ từ chối, không bỏ cờ');
  ok(!rescopeRow(lost, { kind: 'grade', id: '99' }, taxGone).ok, 'lớp không có trong cây ⇒ từ chối');
  // xóa dòng không hợp lệ ⇒ ma trận hoạt động bình thường
  const removed: Draft = { ...ap.draft, rows: ap.draft.rows.filter((x) => x.id !== lost.id) };
  ok(run(removed, taxGone).issues.every((i) => i.kind !== 'dong-chua-xu-ly'), 'xóa dòng không hợp lệ: không còn vướng');
}

console.log('Cờ tồn tại qua đóng/mở app (bản nháp)');
{
  const tpl = { ...snapshotFrom(baseDraft(), tax, 'Mẫu', 1), id: 'tpl-3' };
  const ap = applyTemplate(tpl, newDraft(4), taxMoved, 'replace', newRowId);
  const back = parseDraft(JSON.stringify(ap.draft));
  const flagged = back.rows.filter((r): r is Row & { flag: 'mat' | 'doi-vi-tri' } => !!r.flag);
  ok(flagged.length === 1 && flagged[0].flag === 'doi-vi-tri' && !!flagged[0].label, 'lưu rồi đọc lại bản nháp: cờ và tên gốc vẫn còn');
  ok(!run(back, taxMoved).canExport, 'mở lại app: vẫn bị chặn xuất cho tới khi xử lý');
  const rubbish = parseDraft(JSON.stringify({ v: 1, rows: [{ id: 'x', scope: { kind: 'form', id: 'a' }, type: 'tn', level: 'NB', count: 1, flag: 'la-hoac-gia-mao' }] }));
  ok(rubbish.rows.length === 1 && !rubbish.rows[0].flag, 'giá trị cờ lạ trong dữ liệu hỏng bị bỏ (không tạo cờ giả)');
}

if (fail) process.exit(1);
console.log('examflags: đạt hết.');
