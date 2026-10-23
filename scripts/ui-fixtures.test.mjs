// Kiểm thử bộ dữ liệu giả lập dùng để chụp ảnh giao diện.
import { makeBank } from './ui-fixtures.mjs';
let failed = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };
const locs = [{ grade: 12, chapterId: 'c1', lessonId: 'l1', formId: 'f1' }, { grade: 10, chapterId: 'c2', lessonId: 'l2', formId: 'f2' }];

console.log('Dữ liệu giả lập cho ảnh giao diện');
const a = makeBank({ count: 300, locations: locs }), b = makeBank({ count: 300, locations: locs });
ok(JSON.stringify(a) === JSON.stringify(b), 'cùng seed ⇒ cùng dữ liệu (ảnh trước/sau so được)');
ok(JSON.stringify(a) !== JSON.stringify(makeBank({ count: 300, seed: 8, locations: locs })), 'khác seed ⇒ khác dữ liệu');
ok(a.schema === 3 && a.nextSeq === a.questions.length + 1, 'đúng schema 3 và nextSeq');
ok(new Set(a.questions.map((q) => q.uid)).size === a.questions.length, 'uid không trùng');
ok(new Set(a.questions.map((q) => q.seq)).size === a.questions.length, 'seq không trùng');
ok(['tn', 'ds', 'tln'].every((t) => a.questions.some((q) => q.type === t)), 'có đủ loại câu (trắc nghiệm, đúng/sai, trả lời ngắn)');
ok(a.questions.some((q) => q.latex.includes('tikzpicture') && q.latex.includes('\\immini')), 'có câu \\immini + TikZ');
ok(a.questions.some((q) => q.latex.includes('tabular')), 'có câu bảng');
ok(a.questions.some((q) => q.review === 'approved') && a.questions.some((q) => q.review === 'needs_fix'), 'có đủ trạng thái kiểm duyệt');
ok(a.questions.length > 300, 'có thêm bản sao cố ý để màn Kiểm tra trùng có kết quả');
ok(a.questions.every((q) => q.latex.startsWith('\\begin{ex}') && q.latex.endsWith('\\end{ex}')), 'mọi câu là một khối ex hoàn chỉnh');
ok(a.questions.every((q) => locs.some((l) => l.lessonId === q.lessonId && l.grade === q.grade)), 'vị trí lấy từ danh sách được cung cấp');
let threw = false; try { makeBank({ count: 5, locations: [] }); } catch { threw = true; }
ok(threw, 'thiếu vị trí ⇒ báo lỗi, không sinh dữ liệu mơ hồ');
if (failed) { console.error(`\n${failed} lỗi`); process.exit(1); }
console.log('\nOK');
