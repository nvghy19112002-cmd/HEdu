// Gán ID nhờ Claude — áp dụng luôn (chủ dự án chọn 31/10/2026): ghi Dạng + mức + ID theo Claude cho câu chưa xác minh, giữ câu
// giáo viên đã xác minh, câu và trạng thái cả hai hoặc không gì, Hoàn tác. Câu tự tạo, không dùng câu thật.
import { applyDirect, undoDirect } from './claudeapply';
import { planImport, PROPOSAL_FORMAT, type ProposalFile } from './claudeid';
import { _resetReview, commitRecs, contentKeys, effectiveOf, getRec, loadIdReview, makeRec, type Backend } from './idreview';
import { readHead } from './idtex';
import { strictCode } from './idsync';
import { addMany, getState, initStore, updateMany } from './store';
import { buildDefault, indexOf } from './taxonomy';
import { taxRevision } from './taxpath';
import type { Level, Location, Question } from './types';

let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const tax = buildDefault();
const ix = indexOf(tax);
const taxRev = taxRevision(tax);
const g = tax.grades.find((x) => x.grade === 12)!;
const lessons = g.branches.flatMap((b) => b.chapters.flatMap((c) => c.lessons.map((l) => ({ c, l }))));
const at = (i: number): Location => ({ grade: g.grade, chapterId: lessons[i].c.id, lessonId: lessons[i].l.id, formId: lessons[i].l.forms[0].id });
const A = at(0), B = at(1);
const code = (loc: Location, lv: Level) => { const s = strictCode(loc, lv, tax); if (!s.ok) throw new Error('mã'); return s.code; };
const ex = (body: string, id?: string) => `\\begin{ex}${id ? `%[${id}]` : ''}\n${body}\n\\choice{\\True $1$}{$2$}{$3$}{$4$}\n\\end{ex}`;

const disk = { json: null as string | null, fail: false };
const be: Backend = { async load() { return disk.json; }, async save(j) { if (disk.fail) throw new Error('đĩa đầy'); disk.json = j; } };
await initStore({ async load() { return { json: null, recovered: false }; }, async save() { /* bộ nhớ */ } });
_resetReview(be);
await loadIdReview();
const eff = (q: Question) => effectiveOf(q, getRec(q.uid), { ix, taxRev });
const cur = (uid: string) => getState().questions.find((x) => x.uid === uid)!;

const [qA, qGv, qNoId] = addMany([
  { ...A, latex: ex('Câu một ở chỗ sai.', code(A, 'TH')), level: 'TH', tags: [] },
  { ...A, latex: ex('Câu thầy cô đã xác minh.', code(A, 'NB')), level: 'NB', tags: [] },
  { ...A, latex: ex('Câu chưa có ID.'), level: 'NB', tags: [] },
]);
await commitRecs([
  [qGv.uid, makeRec(qGv, { form: 'gv', level: 'gv', src: 'tay', taxRev })],
  [qNoId.uid, makeRec(qNoId, { form: 'chua', src: 'tep', taxRev, unclassified: true, lop: 12 })],
]);
const fp = (q: Question) => contentKeys(q.latex).i;
const prop: ProposalFile = { format: PROPOSAL_FORMAT, v: 1, lo: 'L9', boi: 'Claude', cau: [
  { k: qA.uid, fp: fp(qA), dang: B.formId, muc: 'VD', chac: 'vua', lyDo: 'đổi Dạng' },
  { k: qGv.uid, fp: fp(qGv), dang: B.formId, muc: 'VD', chac: 'cao', lyDo: '' },
  { k: qNoId.uid, fp: fp(qNoId), dang: B.formId, chac: 'cao', lyDo: 'có Dạng' },
] };

console.log('Kế hoạch áp dụng luôn');
const plan = planImport(prop, getState().questions, { ix, taxRev, effOf: eff, now: 5, direct: { tax } });
ok(plan.edits.length === 2 && !plan.edits.some((e) => e.uid === qGv.uid), 'câu chưa xác minh (kể cả Chưa có ID) được áp dụng; câu giáo viên đã xác minh KHÔNG');
ok(plan.recs.length === 0 && plan.gold.n === 1, 'câu đã xác minh chỉ dùng để đo, không vào hàng đợi (lô thường)');
const eA = plan.edits.find((e) => e.uid === qA.uid)!;
ok(eA.after.formId === B.formId && eA.after.level === 'VD' && readHead(eA.after.latex).ids[0]?.code === code(B, 'VD') && eA.level === 'may', 'đổi vị trí + mức Claude chọn + ID6 mới, mức "máy đề xuất"');
const eN = plan.edits.find((e) => e.uid === qNoId.uid)!;
ok(eN.after.level === 'NB' && readHead(eN.after.latex).ids[0]?.code === code(B, 'NB'), 'Claude không ghi mức ⇒ giữ mức đang lưu, câu Chưa có ID được ghi ID');

console.log('Ghi lỗi ⇒ không đổi gì');
disk.fail = true;
const bad = await applyDirect(plan, 'L9', taxRev, 6);
disk.fail = false;
ok(!bad.ok && cur(qA.uid).formId === A.formId && cur(qA.uid).latex === qA.latex && cur(qNoId.uid).latex === qNoId.latex, 'trạng thái không lưu được ⇒ trả mọi câu về như cũ');

console.log('Áp dụng');
const r = await applyDirect(plan, 'L9', taxRev, 7);
ok(r.ok && r.applied === 2 && r.stale === 0, 'áp dụng 2 câu');
const a = cur(qA.uid), nI = cur(qNoId.uid);
ok(a.formId === B.formId && a.level === 'VD' && readHead(a.latex).ids[0]?.code === code(B, 'VD') && a.latex.includes('Câu một ở chỗ sai.'), 'câu đổi Dạng, mức, ID; nội dung giữ nguyên');
ok(eff(a).form === 'may' && eff(a).level === 'may' && eff(a).src === 'ai-ngoai', 'trạng thái "Máy phân loại", nguồn AI ngoài (không thành giáo viên xác minh)');
ok(!eff(nI).unclassified && nI.formId === B.formId, 'câu Chưa có ID rời mục, vào đúng Dạng');
ok(cur(qGv.uid).latex === qGv.latex && eff(cur(qGv.uid)).form === 'gv', 'câu giáo viên đã xác minh giữ nguyên');

console.log('Hoàn tác');
await updateMany([qNoId.uid], (x) => ({ ...x, latex: x.latex.replace('Câu chưa có ID.', 'Câu chưa có ID, đã sửa tiếp.') }));
const u = await undoDirect((r as { undo: NonNullable<Extract<typeof r, { ok: true }>['undo']> }).undo);
ok(u.ok && u.restored === 1 && u.kept === 1, 'trả câu còn nguyên; câu đã sửa tiếp thì giữ');
ok(cur(qA.uid).formId === A.formId && cur(qA.uid).latex === qA.latex && cur(qA.uid).level === 'TH', 'vị trí, mức, ID cũ trở lại');

if (fail) { console.log(`\n${fail} kiểm thử claudeapply lỗi`); process.exit(1); }
console.log('claudeapply: đạt hết.');
