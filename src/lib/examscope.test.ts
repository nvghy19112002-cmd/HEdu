// Kiểm thử đếm câu theo mục và lớp mặc định khi tạo đề (examscope.ts). Câu tự tạo, không dùng câu thật.
import { busiestGrade, scopeCounts } from './examscope';
import { nodeKey } from './banktree';
import { buildDefault } from './taxonomy';
import type { Question } from './types';

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✗ ' + msg); }
}

const tax = buildDefault();
const g = tax.grades.find((x) => x.grade === 12) ?? tax.grades[0];
const g10 = tax.grades.find((x) => x.grade === 10) ?? tax.grades[0];
const br = g.branches.find((b) => b.chapters.length)!;
const ch = br.chapters[0], ls = ch.lessons[0], fm = ls.forms[0];
const ch10 = g10.branches.find((b) => b.chapters.length)!.chapters[0];
let n = 0;
const q = (o: Partial<Question>): Question => { n++; return { uid: `u${n}`, seq: n, latex: '', type: 'tn', level: 'NB', tags: [], createdAt: n, updatedAt: n, grade: g.grade, chapterId: ch.id, lessonId: ls.id, formId: fm.id, ...o }; };

console.log('Đếm câu theo mục');
{
  const { counts, total } = scopeCounts(tax, [q({}), q({ level: 'TH' }), q({ formId: '' }), q({ grade: 11 })]);
  ok(total === 3, 'câu có chương không thuộc lớp của nó không được đếm');
  ok(counts.get(nodeKey('grade', g.id)) === 3 && counts.get(nodeKey('branch', br.id)) === 3 && counts.get(nodeKey('chapter', ch.id)) === 3, 'lớp, phân môn, chương');
  ok(counts.get(nodeKey('form', fm.id)) === 2 && counts.get(nodeKey('lesson', ls.id)) === 3, 'dạng chỉ đếm câu có dạng');
}

console.log('Lớp mặc định cho ô mới');
{
  const qs10 = [q({ grade: g10.grade, chapterId: ch10.id, lessonId: '', formId: '' }), q({ grade: g10.grade, chapterId: ch10.id, lessonId: '', formId: '' }), q({})];
  ok(busiestGrade(tax, qs10) === g10.grade, 'lớp có nhiều câu nhất (kho toàn lớp 10 thì không mặc định lớp 12)');
  ok(busiestGrade(tax, []) === Math.max(...tax.grades.map((x) => x.grade)), 'kho trống ⇒ lớp cao nhất');
}

if (failed) { console.log(`examscope.test: ${failed} lỗi`); process.exit(1); }
console.log('examscope.test: OK');
