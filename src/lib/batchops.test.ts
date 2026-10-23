import { applyTagOps, parseTagInput, tagChangeCount, tagCounts, withReview, withTags } from './batchops';
import { addMany, getState, initStore, updateMany } from './store';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const ex = (n: number) => `\\begin{ex}%[2D1N1-1]\n  Đề ${n}. Tính $x$ \\(\\sqrt{2}\\).\n  \\choice{\\True 1}{2}{3}{4}\n  \\loigiai{x}\n\\end{ex}`;
const loc = { grade: 12, chapterId: 'c2D1', lessonId: 'l2D11', formId: '' };

console.log('Nhãn: tách và áp dụng');
ok(JSON.stringify(parseTagInput(' a, B ;a,, b ,  c d ')) === JSON.stringify(['a', 'B', 'c d']), 'tách, bỏ rỗng, bỏ trùng không phân biệt hoa/thường');
ok(JSON.stringify(applyTagOps(['x', 'y'], { add: ['z'], remove: [] })) === '["x","y","z"]', 'thêm nhãn mới, giữ nhãn cũ và thứ tự');
ok(JSON.stringify(applyTagOps(['x', 'y'], { add: [], remove: ['X'] })) === '["y"]', 'bỏ nhãn (không phân biệt hoa/thường)');
const same = ['x', 'y'];
ok(applyTagOps(same, { add: ['x'], remove: ['q'] }) === same, 'không có gì đổi ⇒ trả cùng mảng');
ok(JSON.stringify(applyTagOps(['x'], { add: ['y'], remove: ['y'] })) === '["x","y"]', 'vừa bỏ vừa thêm cùng nhãn ⇒ kết quả có nhãn');

console.log('Hàng loạt: ghi một lần, không đụng gì khác');
const mem = { json: null as string | null };
let saves = 0, failNext = false;
const persistence = {
  async load() { return { json: mem.json, recovered: false }; },
  async save(j: string) { if (failNext) throw new Error('đĩa đầy'); mem.json = j; saves++; },
};
await initStore(persistence);
const added = addMany(Array.from({ length: 50 }, (_, i) => ({ ...loc, latex: ex(i), level: 'NB' as const, tags: i % 2 ? ['cũ'] : [] })));
const uids = added.map((q) => q.uid);
const snap = new Map<string, Question>(getState().questions.map((q) => [q.uid, q]));
saves = 0;
ok(tagChangeCount(getState().questions.filter((q) => uids.includes(q.uid)), { add: ['ôn thi'], remove: [] }) === 50, 'xem trước: 50 câu sẽ đổi');
const r1 = await updateMany(uids, withTags({ add: ['ôn thi'], remove: [] }));
ok(r1.ok && r1.changed === 50 && r1.total === 50, 'kết quả 50/50');
ok(saves === 1, `chỉ ghi đĩa 1 lần (thực tế ${saves})`);
const U = new Set(uids);
const after = getState().questions.filter((q) => U.has(q.uid));
ok(after.every((q) => q.tags.includes('ôn thi')), 'mọi câu có nhãn mới');
ok(after.filter((q) => snap.get(q.uid)!.tags.includes('cũ')).every((q) => q.tags.includes('cũ')), 'nhãn cũ còn nguyên');
ok(after.every((q) => { const o = snap.get(q.uid)!; return q.latex === o.latex && q.uid === o.uid && q.seq === o.seq && q.type === o.type && q.level === o.level && q.updatedAt === o.updatedAt; }), 'latex, uid, seq, loại, mức độ, ngày sửa không đổi');
ok(JSON.parse(mem.json!).questions.filter((q: Question) => U.has(q.uid)).every((q: Question) => q.tags.includes('ôn thi')), 'đã ghi xuống đĩa');
const r1b = await updateMany(uids, withTags({ add: ['ôn thi'], remove: [] }));
ok(r1b.ok && r1b.changed === 0 && saves === 1, 'làm lại lần nữa: 0 câu đổi, không ghi thêm');

const r3 = await updateMany(uids.slice(0, 10), withReview('needs_fix'));
ok(r3.ok && r3.changed === 10 && getState().questions.filter((q) => q.review === 'needs_fix').length === 10, 'đánh dấu Cần sửa 10 câu');
const r4 = await updateMany(uids.slice(0, 4), withReview(undefined));
ok(r4.ok && r4.changed === 4 && getState().questions.filter((q) => q.review === 'needs_fix').length === 6, 'đưa 4 câu về Chưa kiểm tra');
ok(!getState().questions.some((q) => q.review === 'approved'), 'không có duyệt hàng loạt');

console.log('Hàng loạt: ghi lỗi ⇒ hoàn lại toàn bộ');
const keep = getState();
failNext = true;
const r5 = await updateMany(uids, withTags({ add: ['hỏng'], remove: ['ôn thi'] }));
failNext = false;
ok(!r5.ok && r5.changed === 0, 'báo thất bại, không báo đã đổi');
ok(JSON.stringify(getState()) === JSON.stringify(keep) && getState().questions.every((q, i) => q === keep.questions[i]), 'bộ nhớ trở lại đúng như trước (từng câu là chính bản cũ)');
ok(!JSON.parse(mem.json!).questions.some((q: Question) => q.tags.includes('hỏng')), 'đĩa không có dữ liệu hỏng');
const r6 = await updateMany(['không-có-uid'], withReview('needs_fix'));
ok(r6.ok && r6.changed === 0, 'uid không tồn tại ⇒ 0 câu đổi');

console.log('Thống kê nhãn');
const tc = tagCounts(getState().questions);
ok(tc[0].n === 50 && tc[0].tag === 'ôn thi', 'nhãn dùng nhiều nhất xếp đầu');
ok(tc.find((x) => x.tag === 'cũ')?.n === 25, 'đếm đúng 25 câu có nhãn "cũ"');

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nOK');
