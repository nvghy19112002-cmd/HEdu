// Bản nháp Tạo đề: đọc dữ liệu hỏng không làm sập, câu chọn tay thành dòng khóa, mẫu đề 2025, tên phạm vi.
import { newDraft, parseDraft, rowsFromPick, scopeLabel, template2025 } from './examdraft';
import { allocate, totalCenti, SCORING_2025, countsOf, collect } from './examgen';
import { buildDefault } from './taxonomy';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

console.log('Đọc bản nháp');
{
  ok(parseDraft(null).rows.length === 0 && parseDraft('{hỏng').rows.length === 0 && parseDraft('{"v":2}').rows.length === 0, 'rỗng, JSON hỏng, khác phiên bản ⇒ bản nháp mới');
  const d = newDraft(5);
  d.rows = template2025(12);
  d.policy = 'tat-ca'; d.count = 3; d.info.title = 'Thi thử';
  const back = parseDraft(JSON.stringify(d));
  ok(back.rows.length === 5 && back.policy === 'tat-ca' && back.count === 3 && back.info.title === 'Thi thử' && back.seed === 5, 'lưu rồi đọc lại giữ nguyên');
  const bad = parseDraft(JSON.stringify({ v: 1, rows: [{ id: 'a', scope: { kind: 'sai', id: 'x' }, type: 'tn', level: 'NB', count: 2 }, { id: 'b', scope: { kind: 'chapter', id: 'c' }, type: 'xx', level: 'NB', count: 2 }, { id: 'c', scope: { kind: 'chapter', id: 'c' }, type: 'tn', level: 'NB', count: 99999 }], policy: 'lạ', count: 999, info: { minutes: -4, title: 5 } }));
  ok(bad.rows.length === 1 && bad.rows[0].count === 200, 'dòng sai kiểu bị bỏ; số lượng bị chặn trong giới hạn');
  const ex = parseDraft(JSON.stringify({ v: 1, exceptions: { u1: { at: 5, why: 'chon-tay' }, u2: 'sai', u3: { at: 'x' } } }));
  ok(Object.keys(ex.exceptions).join() === 'u1' && ex.exceptions.u1.at === 5, 'ngoại lệ do giáo viên xác nhận được lưu lại; bản ghi hỏng bị bỏ');
  ok(bad.policy === 'duyet' && bad.count === 24 && bad.info.minutes === 1 && typeof bad.info.title === 'string', 'giá trị lạ về mặc định hoặc bị chặn');
}

console.log('Mẫu đề 2025 và câu chọn tay');
{
  const rows = template2025(12);
  const cnt = { p1: 0, p2: 0, p3: 0, p4: 0 };
  rows.forEach((r) => { cnt[r.type === 'tn' ? 'p1' : r.type === 'ds' ? 'p2' : r.type === 'tln' ? 'p3' : 'p4'] += r.count; });
  ok(cnt.p1 === 12 && cnt.p2 === 4 && cnt.p3 === 6 && totalCenti(cnt, SCORING_2025) === 1000, 'mẫu 2025 = 12 + 4 + 6 câu = 10 điểm');
  ok(new Set(rows.map((r) => r.id)).size === rows.length, 'mã dòng không trùng');
  const q = (uid: string, formId: string, level: Question['level'], type: Question['type']): Question => ({ uid, seq: 1, latex: '\\begin{ex}\nx\n\\choice{\\True 1}{2}{3}{4}\n\\end{ex}', type, level, tags: [], createdAt: 0, updatedAt: 0, grade: 12, chapterId: 'c', lessonId: 'l', formId, review: undefined });
  const qs = [q('a', 'f1', 'NB', 'tn'), q('b', 'f1', 'NB', 'tn'), q('c', 'f2', 'TH', 'tn')];
  const p = rowsFromPick(qs);
  ok(p.rows.length === 2 && p.rows[0].count === 2 && p.locked[p.rows[0].id].join() === 'a,b', 'gộp câu chọn tay theo Dạng, loại, mức độ và khóa chúng');
  const a = allocate(qs, p.rows, { policy: 'duyet', eff: () => ({ form: 'chua', level: 'chua', unclassified: false }), seed: 1, locked: p.locked });
  ok(countsOf(collect(p.rows, a.picks, new Map(qs.map((x) => [x.uid, x])))).p1 === 0 && a.lost.length === 3, 'câu chưa duyệt chọn tay mà chưa xác nhận ngoại lệ KHÔNG vào đề, và được báo là câu khóa bị loại');
  const a2 = allocate(qs, p.rows, { policy: 'duyet', eff: () => ({ form: 'chua', level: 'chua', unclassified: false }), seed: 1, locked: p.locked, exceptions: new Set(['a', 'b', 'c']) });
  const pk = collect(p.rows, a2.picks, new Map(qs.map((x) => [x.uid, x])));
  ok(countsOf(pk).p1 === 3 && a2.lost.length === 0 && Object.values(a2.deficit).every((x) => x === 0), 'sau khi giáo viên xác nhận ngoại lệ, các câu vào đề');
}

console.log('Tên phạm vi');
{
  const tax = buildDefault();
  const g = tax.grades[0], c = g.branches[0].chapters[0], l = c.lessons[0], f = l.forms[0];
  ok(scopeLabel({ kind: 'grade', id: '12' }, tax) === 'Cả lớp 12', 'cả lớp');
  ok(scopeLabel({ kind: 'chapter', id: c.id }, tax)?.includes(c.name) === true && scopeLabel({ kind: 'lesson', id: l.id }, tax)?.includes(l.name) === true, 'chương, bài');
  ok(scopeLabel({ kind: 'form', id: f.id }, tax)?.includes(f.name) === true, 'dạng');
  ok(scopeLabel({ kind: 'form', id: 'khong-co' }, tax) === null, 'mục đã xóa khỏi cây ⇒ null (giao diện báo, không sập)');
}

if (fail) process.exit(1);
console.log('examdraft: đạt hết.');
