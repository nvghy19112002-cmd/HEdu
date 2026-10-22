import { CURRENT_SCHEMA, migrate } from './migrate';
import { addMany, deleteQuestion, duplicateQuestion, getState, initStore, saveQuestion, setReview } from './store';
import { reviewOf } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const ex = (n: number, body = 'Tính $x$.') => `\\begin{ex}%[2D1N1-1]\n  Đề ${n}. ${body}\n  \\choice{\\True 1}{2}{3}{4}\n  \\loigiai{x}\n\\end{ex}`;
const loc = { grade: 12, chapterId: 'c2D1', lessonId: 'l2D11', formId: '' };

console.log('Kiểm duyệt: schema 2 → 3');
const old2 = { schema: 2, nextSeq: 4, taxonomy: null, questions: [1, 2, 3].map((n) => ({ uid: `u${n}`, seq: n, latex: ex(n), type: 'tn', level: 'NB', tags: ['a'], createdAt: 100 + n, updatedAt: 200 + n, ...loc })) };
const m = migrate(JSON.parse(JSON.stringify(old2)));
ok(CURRENT_SCHEMA === 3 && m.schema === 3, 'schema hiện tại là 3');
ok(JSON.stringify(m.questions) === JSON.stringify(old2.questions), 'nâng 2→3 không đổi bất kỳ câu nào (uid, seq, latex, ngày giờ)');
ok(m.questions.every((q: { review?: string }) => q.review === undefined), 'mọi câu cũ là “Chưa kiểm tra” (vắng trường review)');

const saves: string[] = [];
let failNext = false;
const mem = { json: JSON.stringify(old2) as string | null };
const persistence = {
  async load() { return { json: mem.json, recovered: false }; },
  async save(json: string) { if (failNext) throw new Error('đĩa đầy'); mem.json = json; saves.push(json); },
};
const boot = await initStore(persistence);
ok(boot.ok === true && getState().questions.length === 3, 'mở được ngân hàng schema 2 bằng app schema 3');
ok(getState().questions.every((q) => reviewOf(q) === 'unreviewed'), 'cả 3 câu: Chưa kiểm tra');

console.log('Kiểm duyệt: đổi trạng thái lưu bền vững');
const before = getState().questions.find((q) => q.uid === 'u2')!;
ok(await setReview('u2', 'approved') === true, 'setReview trả true sau khi ghi xong');
const saved = JSON.parse(mem.json!);
ok(saved.schema === 3 && saved.questions.find((q: { uid: string }) => q.uid === 'u2').review === 'approved', 'đã ghi xuống “đĩa” với schema 3');
ok(saved.questions.filter((q: { review?: string }) => q.review).length === 1, 'chỉ câu u2 đổi, các câu khác không bị ảnh hưởng');
const after = getState().questions.find((q) => q.uid === 'u2')!;
ok(after.latex === before.latex && after.seq === before.seq && after.updatedAt === before.updatedAt, 'kiểm duyệt không đổi latex/seq/ngày sửa');
await initStore(persistence);
ok(getState().questions.find((q) => q.uid === 'u2')!.review === 'approved', 'mở lại app: trạng thái còn nguyên');

console.log('Kiểm duyệt: chính sách khi sửa');
await setReview('u3', 'needs_fix');
saveQuestion({ ...loc, latex: getState().questions.find((q) => q.uid === 'u2')!.latex, level: 'NB', tags: ['a', 'b'] }, 'u2');
ok(getState().questions.find((q) => q.uid === 'u2')!.review === 'approved', 'chỉ đổi thẻ → giữ “Đã duyệt”');
saveQuestion({ ...loc, latex: getState().questions.find((q) => q.uid === 'u2')!.latex, level: 'TH', tags: ['a'] }, 'u2');
ok(getState().questions.find((q) => q.uid === 'u2')!.review === 'approved', 'chỉ đổi mức độ → giữ “Đã duyệt”');
saveQuestion({ ...loc, latex: ex(2, 'Tính $y$.'), level: 'NB', tags: [] }, 'u2');
ok(getState().questions.find((q) => q.uid === 'u2')!.review === undefined, 'sửa LaTeX → về “Chưa kiểm tra”');
saveQuestion({ ...loc, latex: ex(3, 'Tính $z$.'), level: 'NB', tags: [] }, 'u3');
ok(getState().questions.find((q) => q.uid === 'u3')!.review === undefined, 'câu “Cần sửa” sau khi sửa LaTeX → Chưa kiểm tra (không tự “Đã duyệt”)');
await setReview('u1', 'approved');
saveQuestion({ ...loc, latex: '\\begin{ex}%[2D1N1-1]\n Đề 1 tự luận\n \\loigiai{x}\n\\end{ex}', level: 'NB', tags: [] }, 'u1');
ok(getState().questions.find((q) => q.uid === 'u1')!.review === undefined, 'đổi loại câu (TN → tự luận) → về Chưa kiểm tra');

console.log('Kiểm duyệt: nhân bản, nhập, xoá');
await setReview('u2', 'approved');
const dup = duplicateQuestion('u2')!;
ok(dup.review === undefined && dup.uid !== 'u2', 'nhân bản → Chưa kiểm tra, uid mới');
ok(getState().questions.find((q) => q.uid === 'u2')!.review === 'approved', 'bản gốc giữ nguyên trạng thái');
const added = addMany([{ ...loc, latex: ex(9), level: 'NB', tags: [] }]);
ok(added[0].review === undefined, 'câu nhập mới → Chưa kiểm tra');
deleteQuestion('u2');
ok(!JSON.stringify(getState()).includes('"u2"'), 'xoá câu: không còn dữ liệu kiểm duyệt mồ côi (cùng bản ghi)');

console.log('Kiểm duyệt: lỗi ghi file');
failNext = true;
const snap = JSON.stringify(getState().questions.find((q) => q.uid === 'u1'));
ok(await setReview('u1', 'approved') === false, 'ghi thất bại → setReview trả false');
ok(JSON.stringify(getState().questions.find((q) => q.uid === 'u1')) === snap, 'trạng thái được khôi phục, không giả vờ đã lưu');
failNext = false;

console.log('Kiểm duyệt: dữ liệu mới hơn bị từ chối');
const b2 = await initStore({ async load() { return { json: JSON.stringify({ ...old2, schema: 4 }), recovered: false }; }, async save() { throw new Error('không được ghi'); } });
ok(b2.ok === false && (b2 as { kind: string }).kind === 'schema-newer', 'schema 4 bị từ chối, không ghi đè');
ok(await setReview('u1', 'approved') === false, 'ở chế độ chỉ-đọc không đổi được trạng thái');

if (fail) { console.log(`${fail} lỗi`); process.exit(1); }
