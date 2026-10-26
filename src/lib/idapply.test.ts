import { applyAutoId, AUTO_ID_MAX, buildRows, defaultChoice, getAutoIdUndo, levelTarget, planApply, summarize, undoAutoId, undoConflicts, withAutoId, type RowChoice } from './idapply';
import { IdSuggester } from './idsuggest';
import { idStatus, strictCode } from './idsync';
import { sameExceptId, writeHeadId } from './idtex';
import { addMany, getState, initStore, updateMany } from './store';
import { buildDefault, indexOf } from './taxonomy';
import { checkLocation } from './taxpath';
import type { Location, Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const ix = indexOf(tax);
const g = tax.grades.find((x) => x.branches.flatMap((b) => b.chapters).flatMap((c) => c.lessons).length >= 3)!;
const lessons = g.branches.flatMap((b) => b.chapters.map((c) => ({ c, ls: c.lessons }))).flatMap(({ c, ls }) => ls.map((l) => ({ c, l })));
const at = (i: number): Location => ({ grade: g.grade, chapterId: lessons[i].c.id, lessonId: lessons[i].l.id, formId: lessons[i].l.forms[0].id });
const A = at(0), B = at(1);
const other = tax.grades.find((x) => x.grade !== g.grade)!;
const oL = other.branches[0].chapters[0].lessons[0];
const ex = (body: string) => `\\begin{ex}\n${body}\n\\choice{\\True $1$}{$2$}{$3$}{$4$}\n\\loigiai{}\n\\end{ex}`;
const TA = ['Tìm tập xác định của hàm số $y=\\sqrt{x-#}$.', 'Hàm số $y=\\dfrac{1}{x-#}$ xác định khi nào? Chọn tập xác định đúng.', 'Tập xác định $D$ của hàm số $y=\\sqrt{#-x}+\\dfrac{1}{x}$ là'];
const TB = ['Gieo một con xúc xắc cân đối, tính xác suất xuất hiện mặt # chấm.', 'Rút ngẫu nhiên một thẻ trong hộp có # thẻ đánh số, tính xác suất rút được thẻ số chẵn.', 'Chọn ngẫu nhiên # học sinh trong lớp, xác suất để chọn được hai bạn nữ là'];

// kho giả trong bộ nhớ, có thể ép ghi lỗi
const disk = { json: null as string | null, fail: false, gate: null as Promise<void> | null };
await initStore({ async load() { return { json: disk.json, recovered: false }; }, async save(j: string) { if (disk.gate) await disk.gate; if (disk.fail) throw new Error('đĩa đầy'); disk.json = j; } });
const drafts = [...TA.flatMap((t) => [3, 4, 7].map((k) => ({ ...A, latex: ex(t.replace('#', String(k))), level: 'NB' as const, tags: ['x'] }))),
  ...TB.flatMap((t) => [3, 4, 7].map((k) => ({ ...B, latex: ex(t.replace('#', String(k))), level: 'TH' as const, tags: [] })))];
addMany(drafts);
// câu "gán nhầm": nội dung tập xác định nhưng đang nằm ở Dạng B; và một câu có đường dẫn hỏng
const [wrong, broken] = addMany([
  { ...B, latex: ex('Tìm tập xác định của hàm số $y=\\sqrt{x-11}$.'), level: 'TH', tags: ['giu'] },
  { ...A, lessonId: B.lessonId, latex: ex('Hàm số $y=\\dfrac{1}{x-13}$ xác định khi nào? Chọn tập xác định đúng.'), level: 'NB', tags: [] },
]);
const reviewed = { ...wrong, review: 'approved' as const };
await updateMany([wrong.uid], () => reviewed);
const all = () => new Map(getState().questions.map((q) => [q.uid, q]));

const s = new IdSuggester(tax, getState().questions);
const rows = buildRows([all().get(wrong.uid)!, all().get(broken.uid)!], s, ix);
const rw = rows[0], rb = rows[1];
ok(rows.length === 2 && rw.snap.formId === B.formId && rw.currentOk && !rb.currentOk, 'chụp đúng vị trí hiện tại, phát hiện câu sai đường dẫn');
ok(rw.suggestion.best?.formId === A.formId, 'câu gán nhầm ⇒ gợi ý Dạng đúng');
const cw = defaultChoice(rw);
ok(cw.changeLevel === false, 'mức độ KHÔNG bao giờ tự tick');
ok(cw.apply === (rw.suggestion.confidence === 'cao'), 'chỉ tự tick khi tin cậy cao');
const same = buildRows([getState().questions.find((q) => q.latex === drafts[0].latex)!], s, ix)[0];
ok(!defaultChoice(same).apply || same.suggestion.best?.formId !== same.snap.formId, 'gợi ý trùng vị trí hiện tại ⇒ không tự tick');

const choices = new Map<string, RowChoice>([[rw.uid, { apply: true, formId: A.formId, changeLevel: false }], [rb.uid, { apply: true, formId: A.formId, changeLevel: false }]]);
const sum = summarize(rows, choices);
ok(sum.chosen === 2 && sum.moveLoc === 2 && sum.moveLevel === 0, 'tóm tắt: 2 câu chọn, 2 đổi vị trí, 0 đổi mức độ');

// kiểm lại trước khi ghi
let plan = planApply(rows, choices, all(), ix, false);
ok(plan.edits.size === 2 && plan.stale.length === 0 && plan.invalid.length === 0, 'kế hoạch hợp lệ khi câu chưa đổi');
ok([...plan.edits.values()].every((e) => !!e.loc && checkLocation(ix, e.loc, g.grade).ok), 'vị trí sẽ ghi đúng đủ đường dẫn, cùng lớp');
ok(planApply(rows, choices, all(), ix, true).stale.length === 2, 'cây đã đổi ⇒ mọi gợi ý thành cũ, không ghi');
const edited = all(); edited.set(rw.uid, { ...edited.get(rw.uid)!, latex: edited.get(rw.uid)!.latex + ' ' });
ok(planApply(rows, choices, edited, ix, false).stale.includes(rw.uid), 'nội dung câu đổi sau xem trước ⇒ không ghi đè');
const gone = all(); gone.delete(rb.uid);
ok(planApply(rows, choices, gone, ix, false).stale.includes(rb.uid), 'câu đã bị xoá ⇒ không ghi');
const bad = new Map(choices); bad.set(rw.uid, { apply: true, formId: oL.forms[0].id, changeLevel: false });
ok(planApply(rows, bad, all(), ix, false).invalid.includes(rw.uid), 'chọn Dạng ở lớp khác ⇒ bị chặn');
bad.set(rw.uid, { apply: true, formId: 'f-khong-co', changeLevel: false });
ok(planApply(rows, bad, all(), ix, false).invalid.includes(rw.uid), 'Dạng không có trong cây ⇒ bị chặn');
const keep = new Map(choices); keep.set(rw.uid, { apply: true, formId: rw.snap.formId, changeLevel: false });
ok(!planApply(rows, keep, all(), ix, false).edits.has(rw.uid), 'chọn đúng vị trí hiện tại, không đổi mức độ ⇒ không có gì để ghi');
const lvl = new Map(keep); lvl.set(rw.uid, { apply: true, formId: rw.snap.formId, changeLevel: true });
const lp = planApply(rows, lvl, all(), ix, false).edits.get(rw.uid);
ok(levelTarget(rw) ? lp?.level === levelTarget(rw) && lp?.loc === null : !lp, 'tick Đổi mức độ ⇒ chỉ đổi mức độ (nếu có gợi ý khác)');

// ghi lỗi ⇒ không câu nào đổi
plan = planApply(rows, choices, all(), ix, false);
const before = JSON.stringify(getState().questions);
disk.fail = true;
const r0 = await updateMany(plan.edits.keys(), withAutoId(plan.edits));
ok(!r0.ok && r0.changed === 0 && JSON.stringify(getState().questions) === before, 'ghi lỗi ⇒ hoàn lại, KHÔNG câu nào đổi');
disk.fail = false;

// ghi thành công: chỉ vị trí đổi
const oldW = all().get(rw.uid)!;
const r1 = await updateMany(plan.edits.keys(), withAutoId(plan.edits));
const nw = all().get(rw.uid)!, nb = all().get(rb.uid)!;
ok(r1.ok && r1.changed === 2, 'ghi 2 câu, báo đúng số');
ok(nw.formId === A.formId && nw.lessonId === A.lessonId && nw.chapterId === A.chapterId && checkLocation(ix, nw).ok && checkLocation(ix, nb).ok, 'vị trí mới đúng đủ đường dẫn');
ok(nw.uid === oldW.uid && nw.seq === oldW.seq && sameExceptId(nw.latex, oldW.latex) && nw.type === oldW.type && nw.tags.join() === oldW.tags.join()
  && nw.review === 'approved' && nw.createdAt === oldW.createdAt && nw.updatedAt === oldW.updatedAt && nw.level === oldW.level, 'giữ nguyên uid, seq, nội dung LaTeX (ngoài vùng ID), loại, nhãn, kiểm duyệt, ngày tạo/sửa, mức độ');
ok(idStatus(nw, tax).state === 'khop' && idStatus(nb, tax).state === 'khop' && nw.latex === writeHeadId(oldW.latex, (strictCode(nw, nw.level, tax) as { code: string }).code, 'them').latex, 'ID6 mới được ghi vào LaTeX đúng chỗ, khớp vị trí + mức độ');
{
  const two = { ...rows[0], snap: { ...rows[0].snap, latex: rows[0].snap.latex.replace('\\begin{ex}', '\\begin{ex}%[2D1H1-1]%[2D1V1-2]') } };
  const cur = all(); cur.set(rw.uid, { ...cur.get(rw.uid)!, ...two.snap });
  const pb = planApply([two], choices, cur, ix, false, tax);
  ok(pb.idBlocked.includes(rw.uid) && !pb.edits.has(rw.uid), 'LaTeX có nhiều ID mâu thuẫn ⇒ KHÔNG ghi vị trí (không để vị trí và ID lệch nhau)');
}
ok(JSON.parse(disk.json!).questions.find((q: Question) => q.uid === rw.uid).formId === A.formId, 'đã ghi xuống đĩa');
const r2 = await updateMany(plan.edits.keys(), withAutoId(plan.edits));
ok(r2.ok && r2.changed === 0, 'bấm Áp dụng lần hai ⇒ không đổi gì thêm');
ok(AUTO_ID_MAX === 200, 'giới hạn 200 câu mỗi lượt');

// ---------- PR-C: Hoàn tác trong phiên ----------
console.log('Hoàn tác trong phiên');
const fresh = () => all();
// đưa 2 câu về chỗ cũ (B, đường hỏng) để làm lại từ đầu bằng applyAutoId
await updateMany([rw.uid, rb.uid], (x) => (x.uid === rw.uid ? { ...x, ...rw.snap } : { ...x, ...rb.snap }));
const rows2 = buildRows([fresh().get(rw.uid)!, fresh().get(rb.uid)!], s, ix);
const lvlChoice = new Map<string, RowChoice>([[rw.uid, { apply: true, formId: A.formId, changeLevel: !!levelTarget(rows2[0]) }], [rb.uid, { apply: true, formId: A.formId, changeLevel: false }]]);
const plan2 = planApply(rows2, lvlChoice, fresh(), ix, false);
const beforeW = fresh().get(rw.uid)!, beforeB = fresh().get(rb.uid)!;
const ra = await applyAutoId(plan2.edits);
const u = getAutoIdUndo();
ok(ra.ok && ra.changed === 2 && !!u && u.items.length === 2, 'áp dụng xong ⇒ có bản ghi Hoàn tác đúng 2 câu');
ok(undoConflicts(u!, fresh()).length === 0, 'chưa ai sửa tiếp ⇒ không có xung đột');
// câu rb bị giáo viên sửa tiếp nội dung ⇒ không được hoàn tác câu đó
await updateMany([rb.uid], (x) => ({ ...x, latex: x.latex + '\n% sửa tiếp', updatedAt: x.updatedAt + 1 }));
ok(undoConflicts(u!, fresh()).includes(rb.uid), 'câu đã sửa tiếp ⇒ báo xung đột');
const uz = await undoAutoId(u!);
const w2 = fresh().get(rw.uid)!, b2 = fresh().get(rb.uid)!;
ok(uz.ok && uz.restored === 1 && uz.conflicts === 1, 'hoàn tác 1 câu, giữ 1 câu đã sửa tiếp');
ok(w2.formId === beforeW.formId && w2.lessonId === beforeW.lessonId && w2.chapterId === beforeW.chapterId && w2.level === beforeW.level && w2.latex === beforeW.latex && w2.review === beforeW.review, 'câu hoàn tác về đúng vị trí + mức độ cũ, giữ nội dung và kiểm duyệt');
ok(b2.lessonId === A.lessonId && b2.latex.endsWith('% sửa tiếp') && b2.lessonId !== beforeB.lessonId,'câu đã sửa tiếp giữ nguyên chỉnh sửa mới (không bị ghi đè)');
ok(getAutoIdUndo() === null, 'hoàn tác xong ⇒ không còn nút Hoàn tác');
const again2 = await undoAutoId(u!);
ok(again2.ok && again2.restored === 0, 'bấm Hoàn tác lần hai ⇒ không đổi gì');
// hoàn tác khi câu đã bị xoá: không lỗi, tính là xung đột
const rows3 = buildRows([fresh().get(rw.uid)!], s, ix);
await applyAutoId(planApply(rows3, new Map([[rw.uid, { apply: true, formId: A.formId, changeLevel: false }]]), fresh(), ix, false).edits);
const u3 = getAutoIdUndo()!;
const gone3 = new Map(fresh()); gone3.delete(rw.uid);
ok(undoConflicts(u3, gone3).includes(rw.uid), 'câu đã bị xoá ⇒ không hoàn tác được, báo rõ');
disk.fail = true;
const uf = await undoAutoId(u3);
disk.fail = false;
ok(!uf.ok && fresh().get(rw.uid)!.formId === A.formId && getAutoIdUndo() === u3, 'hoàn tác ghi lỗi ⇒ không đổi gì, vẫn giữ nút Hoàn tác để thử lại');

// ---------- PR-C: updateMany ghi lỗi KHÔNG cuốn theo sửa đổi khác ----------
console.log('updateMany: ghi lỗi chỉ hoàn lại câu của chính nó');
const [p1, p2] = getState().questions.slice(0, 2).map((x) => x.uid);
let release: () => void = () => undefined;
disk.gate = new Promise<void>((r) => { release = r; });
disk.fail = true;
const t1 = fresh().get(p1)!.tags.join();
const pending = updateMany([p1], (x) => ({ ...x, tags: [...x.tags, 'lo-1'] }));
await new Promise((r) => setTimeout(r, 0));
// trong lúc lô 1 đang chờ ghi: một sửa đổi khác vào câu p2
void updateMany([p2], (x) => ({ ...x, tags: [...x.tags, 'giu-lai'] }));
release();
const rf = await pending;
disk.fail = false; disk.gate = null;
ok(!rf.ok && fresh().get(p1)!.tags.join() === t1, 'lô ghi lỗi ⇒ câu của lô trở về như cũ');
ok(fresh().get(p2)!.tags.includes('giu-lai'), 'sửa đổi khác xảy ra lúc chờ ghi được GIỮ, không bị hoàn lại nhầm');

if (fail) process.exit(1);
console.log('idapply: đạt hết.');
