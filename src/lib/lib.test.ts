// Kiểm thử phần lõi (chạy: npm test). Không cần trình duyệt.
import { parseExTest, buildExTest, splitExBlocks } from './extest';
import { questionCode } from './id';
import { findDuplicates } from './dup';
import { seedQuestions } from './seed';
import { pickByMatrix, makeVariants, shortages, examToTex } from './exam';
import { renderLatexText } from './render';
import { CURRENT_SCHEMA, migrate, SchemaNewerError } from './migrate';
import { parseCode } from './id';
import { addChild, buildDefault, countNodes, fromJson, moveNode, removeNode, renameNode, setNodeCode, toJson } from './taxonomy';

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✗ ' + msg); }
}

const bank = seedQuestions();

console.log('Đọc cú pháp ex_test');
const tn = parseExTest(bank[0].latex);
ok(tn.type === 'tn', 'nhận ra trắc nghiệm');
ok(tn.options.length === 4 && tn.options[0].correct && tn.options.filter((o) => o.correct).length === 1, 'đọc đủ 4 phương án, đúng một \\True');
ok(tn.solution?.includes("y' = 3x^2"), 'đọc lời giải');
ok(tn.issues.length === 0, 'không báo lỗi với câu đúng cú pháp');
const ds = parseExTest(bank[3].latex);
ok(ds.type === 'ds' && ds.options.map((o) => (o.correct ? 'Đ' : 'S')).join('') === 'ĐSĐS', 'đọc câu đúng/sai: ĐSĐS');
const tln = parseExTest(bank[2].latex);
ok(tln.type === 'tln' && tln.shortAnswer === '3', 'đọc đáp án trả lời ngắn');
ok(parseExTest(bank[5].latex).type === 'tl', 'nhận ra tự luận');
ok(parseExTest('\\begin{ex} Cho $x \\end{ex}').issues.some((s) => s.includes('$')), 'báo dấu $ bị lẻ');
ok(parseExTest('\\begin{ex}%[2D1B1-1]\n abc \\end{ex}').idComment === '2D1B1-1', 'đọc ID trong chú thích');
const rebuilt = parseExTest(buildExTest(tn, { order: [3, 2, 1, 0] }));
ok(rebuilt.options[3].correct && rebuilt.options[3].text === '$(0;2)$', 'dựng lại câu với thứ tự phương án mới');
ok(splitExBlocks(bank[0].latex + '\n\n' + bank[1].latex).length === 2, 'tách nhiều câu');

console.log('Gán ID');
ok(questionCode(bank[0], bank[0].level) === '2D1H1-1', 'ID câu 1: 2D1H1-1');
ok(questionCode(bank[6], bank[6].level) === '2H2N2-1', 'ID câu véc-tơ: 2H2N2-1');

console.log('Kiểm tra trùng');
const same = bank[0].latex.replace('Cho hàm số', 'Cho  hàm   số');
ok(findDuplicates(same, bank)[0]?.score === 1, 'khoảng trắng khác vẫn là trùng hẳn');
const near = bank[0].latex.replace('x^3 - 3x^2 + 2', 'x^3 - 3x^2 + 5');
const hit = findDuplicates(near, bank)[0];
ok(hit && hit.question.uid === bank[0].uid && hit.score < 1, `đổi một số → gần trùng (${hit ? Math.round(hit.score * 100) : 0}%)`);
ok(findDuplicates(bank[9].latex, bank, bank[9].uid).length === 0, 'câu khác hẳn không bị báo');

console.log('Tạo đề');
const rows = [
  { chapterId: 'c2D1', nb: 1, th: 1, vd: 1, ds: 1, tln: 1 },
  { chapterId: 'c2D4', nb: 1, th: 1, vd: 0, ds: 1, tln: 1 },
];
ok(shortages(bank, rows).length === 0, 'ma trận mẫu đủ câu');
ok(shortages(bank, [{ chapterId: 'c2H2', nb: 1, th: 0, vd: 1, ds: 0, tln: 1 }]).length === 1, 'phát hiện thiếu câu VD chương véc-tơ');
const picked = pickByMatrix(bank, rows, 42);
ok(picked.p1.length === 5 && picked.p2.length === 2 && picked.p3.length === 2, 'chọn đúng số câu mỗi phần');
const vars = makeVariants(picked, { count: 4, firstCode: 101, shuffleQuestions: true, shuffleOptions: true, seed: 42 });
ok(vars.map((v) => v.code).join(',') === '101,102,103,104', 'sinh 4 mã đề 101–104');
const keyOk = vars.every((v) => v.parts[0].every((it, i) => {
  const letter = v.key[0][i];
  const k = 'ABCD'.indexOf(letter);
  return it.parsed.options[it.order[k]]?.correct;
}));
ok(keyOk, 'bảng đáp án khớp với phương án đã trộn');
const sameSet = vars.every((v) => v.parts[0].map((x) => x.q.uid).sort().join() === vars[0].parts[0].map((x) => x.q.uid).sort().join());
ok(sameSet, 'mọi mã đề dùng chung bộ câu');
const tex = examToTex({ school: 'THPT A', title: 'Kiểm tra', minutes: 90, grade: 12 }, vars, { withSolution: false, withKey: true });
ok(tex.includes('Mã đề 104') && tex.includes('\\begin{document}') && tex.includes('Bảng đáp án'), 'xuất được mã LaTeX đề');

console.log('Xem trước');
const html = renderLatexText(bank[5].latex);
ok(html.includes('Bảng biến thiên (tkz-tab)'), 'nhận ra hình bảng biến thiên');
ok(renderLatexText('Cho $x^2$').includes('katex'), 'vẽ công thức bằng KaTeX');

console.log('Cấu trúc dữ liệu (schema)');
const v1 = { questions: [{ seq: 1 }], nextSeq: 2 };
ok(migrate(v1).schema === CURRENT_SCHEMA, 'dữ liệu bản đầu (chưa có schema) được nhận là schema 1');
ok(migrate({ ...v1, schema: CURRENT_SCHEMA }).questions.length === 1, 'schema hiện tại đi qua nguyên vẹn');
let newer: unknown = null;
try { migrate({ ...v1, schema: CURRENT_SCHEMA + 1 }); } catch (e) { newer = e; }
ok(newer instanceof SchemaNewerError && (newer as SchemaNewerError).found === CURRENT_SCHEMA + 1, 'schema mới hơn bị từ chối, không ghi đè');
let bad = false;
try { migrate({ foo: 1 }); } catch { bad = true; }
ok(bad, 'dữ liệu sai định dạng bị từ chối');
const fake = { 1: (s: { questions: { seq: number; extra?: number }[] }) => ({ ...s, questions: s.questions.map((q) => ({ ...q, extra: 7 })) }), 2: (s: object) => ({ ...s, third: true }) };
const up3 = migrate({ ...v1, schema: 1 }, fake, 3);
ok(up3.schema === 3 && up3.questions[0].extra === 7 && up3.third === true, 'chạy lần lượt từng bước nâng cấp 1→2→3');
let missing = false;
try { migrate({ ...v1, schema: 1 }, {}, 2); } catch { missing = true; }
ok(missing, 'thiếu bước nâng cấp thì báo lỗi, không đoán');

console.log('Đọc ngược ID6');
const pc = parseCode('2D1H1-1');
ok(pc?.loc.chapterId === 'c2D1' && pc.level === 'TH' && pc.loc.lessonId === 'l2D11', '2D1H1-1 → Lớp 12, chương 1, bài 1, thông hiểu');
ok(parseCode('2H2N2-2')?.loc.formId === 'f2H222', '2H2N2-2 → đúng dạng 2');
ok(parseCode('9X9') === null, 'ID sai định dạng trả về null');
ok(parseCode('2D1X1-1') === null, 'chữ mức độ lạ bị từ chối');
ok(parseCode('2D1H1-Z') === null, 'mã Dạng không có trong cây ⇒ ID không hợp lệ (không lặng lẽ vào Dạng đầu tiên)');
ok(parseCode('2D1H1')?.loc.lessonId === 'l2D11' && !!parseCode('2D1H1')?.loc.formId, 'ID không ghi Dạng ⇒ vẫn hiểu là Dạng đầu của Bài như cũ');

console.log('Cây mục lục sửa được');
const tax0 = buildDefault();
const c0 = countNodes(tax0);
ok(c0.grades === 3 && c0.chapters === 30 && c0.lessons === 99 && c0.forms === 532, `cây mặc định: ${c0.grades} lớp, ${c0.chapters} chương, ${c0.lessons} bài, ${c0.forms} dạng`);
const round = fromJson(toJson(tax0));
ok(JSON.stringify(countNodes(round.tax)) === JSON.stringify(c0) && round.warnings.length === 0, 'xuất ra JSON rồi nạp lại giữ nguyên cây');
const g0 = tax0.grades[0];
const renamed = renameNode(tax0, g0.id, 'Lớp mười');
ok(renamed.grades[0].name === 'Lớp mười' && tax0.grades[0].name === 'Lớp 10', 'đổi tên không đụng cây cũ');
const recoded = setNodeCode(tax0, g0.branches[0].id, 'X');
ok(recoded.grades[0].branches[0].code === 'X' && recoded.grades[0].branches[0].chapters.length === g0.branches[0].chapters.length, 'đổi mã phân môn giữ nguyên các chương');
ok(setNodeCode(tax0, g0.id, 'AB').grades[0].code === '0', 'mã dài hơn một ký tự bị từ chối');
const added = addChild(tax0, g0.branches[0].chapters[0].id, 'Bài mới');
ok(added.grades[0].branches[0].chapters[0].lessons.length === g0.branches[0].chapters[0].lessons.length + 1, 'thêm bài vào chương');
const removed = removeNode(tax0, g0.branches[0].id);
ok(removed.grades[0].branches.length === g0.branches.length - 1, 'xoá một phân môn');
const moved = moveNode(tax0, g0.branches[1].id, -1);
ok(moved.grades[0].branches[0].id === g0.branches[1].id, 'đổi chỗ hai phân môn');
let badTree = false;
try { fromJson('{"nodes":[]}'); } catch { badTree = true; }
ok(badTree, 'file cây rỗng bị từ chối');
ok(fromJson(JSON.stringify({ nodes: [{ code: '0', name: 'Lớp 10', children: [{ code: 'DD', name: 'Mã sai' }] }] })).warnings.length === 1, 'mã sai trong file nạp vào được báo cảnh báo');

if (failed) { console.log(`\n${failed} kiểm thử lỗi`); process.exit(1); }
console.log('\nTất cả kiểm thử đều đạt.');
