// PR 4B: tránh câu đã dùng, bằng dữ liệu giả lập (không dùng ngân hàng thật).
import { allocate, candidatesFor, specJson, SCORING_2025, type EffLike, type Row } from './examgen';
import { avoidSet, avoidedFor, buildIndex, defaultScope, describeScope, matchedProjects, traceOf, usedAtLabel, type UsageProject, type UsageScope } from './examusage';
import { newDraft, parseDraft } from './examdraft';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

let n = 0;
const mk = (): Question => { n++; return { uid: `u${n}`, seq: n, latex: `\\begin{ex}\n Câu ${n}.\n \\choice{\\True 1}{2}{3}{4}\n\\end{ex}`, type: 'tn', level: 'NB', tags: [], createdAt: 0, updatedAt: 0, grade: 12, chapterId: 'c1', lessonId: 'l1', formId: 'f1', review: 'approved' }; };
const eff = (_q: Question): EffLike => ({ form: 'chua', level: 'chua', unclassified: false });
const row = (count: number): Row => ({ id: 'r1', scope: { kind: 'chapter', id: 'c1' }, type: 'tn', level: 'NB', count });
const P = (id: string, o: Partial<UsageProject> = {}): UsageProject => ({ id, name: `Đề ${id}`, folder: null, schoolYear: null, examType: null, updatedAt: '', source: 'spec', uids: [], missing: 0, note: null, ...o });
const sc = (o: Partial<UsageScope>): UsageScope => ({ ...defaultScope(), on: true, ...o });

const projects = [
  P('a', { folder: 'Lớp 12/Học kỳ 1', schoolYear: '2025-2026', examType: 'Giữa kỳ', uids: ['u1', 'u2'] }),
  P('b', { folder: 'Lớp 12/Học kỳ 2', schoolYear: '2025-2026', examType: 'Cuối kỳ', uids: ['u3'] }),
  P('c', { folder: 'Lớp 11', schoolYear: '2024-2025', examType: 'Cuối kỳ', uids: ['u4'] }),
  P('d', { folder: null, source: 'none' }),
];

console.log('Phạm vi (D8): mặc định tắt, bốn phạm vi, logic kết hợp');
ok(!defaultScope().on && matchedProjects(projects, defaultScope()).length === 0, 'mặc định tắt: không đề nào được đối chiếu');
ok(matchedProjects(projects, sc({})).length === 0, 'bật nhưng chưa chọn gì: không loại câu nào');
const ids = (s: UsageScope) => matchedProjects(projects, s).map((p) => p.id).join(',');
ok(ids(sc({ folders: ['Lớp 12'] })) === 'a,b', 'thư mục gồm cả thư mục con');
ok(ids(sc({ folders: ['Lớp 12/Học kỳ 1'] })) === 'a', 'thư mục con riêng');
ok(ids(sc({ folders: ['Lớp 1'] })) === '', 'tiền tố chữ không khớp nhầm (“Lớp 1” khác “Lớp 11/12”)');
ok(ids(sc({ years: ['2025-2026'] })) === 'a,b' && ids(sc({ types: ['Cuối kỳ'] })) === 'b,c', 'năm học và loại đề');
ok(ids(sc({ years: ['2025-2026'], types: ['Cuối kỳ'] })) === 'b', 'nhiều tiêu chí khác nhóm: VÀ');
ok(ids(sc({ types: ['Giữa kỳ', 'Cuối kỳ'] })) === 'a,b,c', 'cùng nhóm: HOẶC');
ok(ids(sc({ years: ['2024-2025'], ids: ['a'] })) === 'a,c', 'đề chọn riêng được cộng thêm');
ok(ids(sc({ ids: ['d'] })) === 'd', 'chỉ đề chọn riêng');
ok(ids(sc({ years: ['2099'] })) === '', 'đề không ghi năm học không khớp tiêu chí năm học');
ok(describeScope(sc({ years: ['2025-2026'], types: ['Cuối kỳ'] })).includes('VÀ') && describeScope(defaultScope()).includes('Không'), 'mô tả logic kết hợp bằng chữ');

console.log('UID đáng tin (D6) và độ tin cậy');
{
  const idx = buildIndex(projects, sc({ ids: ['a', 'd'] }));
  ok(idx.unverifiable.map((p) => p.id).join() === 'd', 'đề không có UID đáng tin được báo “chưa thể đối chiếu”, không coi là chưa dùng');
  ok([...idx.used.keys()].sort().join() === 'u1,u2', 'chỉ UID của đề trong phạm vi');
  ok(usedAtLabel(idx, 'u1') === 'Đề a' && usedAtLabel(idx, 'u9') === null, 'nhãn “Đã dùng ở”');
}

console.log('Lọc trước khi phân bổ; thiếu câu không tự nới');
{
  const bank = Array.from({ length: 6 }, mk);
  const idx = buildIndex([P('a', { uids: bank.slice(0, 3).map((q) => q.uid) })], sc({ ids: ['a'] }));
  const avoid = avoidSet(idx, {});
  ok(avoid.size === 3 && ['u' + (n - 5), 'u' + (n - 4), 'u' + (n - 3)].every((u) => avoid.has(u)), 'danh sách tránh = câu đã dùng trong phạm vi');
  let clean = true;
  for (let seed = 1; seed <= 20; seed++) {
    const a = allocate(bank, [row(3)], { policy: 'duyet', eff, seed, avoid });
    if (a.picks.r1.some((u) => avoid.has(u)) || a.picks.r1.length !== 3) clean = false;
  }
  ok(clean, '20 hạt giống: máy không bao giờ chọn câu đã dùng khi còn đủ câu mới');
  const a = allocate(bank, [row(5)], { policy: 'duyet', eff, seed: 1, avoid });
  ok(a.picks.r1.length === 3 && a.deficit.r1 === 2 && a.avoided.r1 === 3 && a.pool.r1 === 3, 'thiếu câu: báo thiếu 2, loại 3 ứng viên, không tự nới');
  ok(avoidedFor(bank, row(5), avoid, (q, r) => r.id === 'r1' && q.type === 'tn').length === 3, 'danh sách ứng viên bị loại để hỏi dùng lại');
  const reuse = Object.fromEntries(bank.slice(0, 3).map((q) => [q.uid, { at: 1, from: ['a'] }]));
  const a2 = allocate(bank, [row(5)], { policy: 'duyet', eff, seed: 1, avoid: avoidSet(idx, reuse) });
  ok(a2.deficit.r1 === 0 && a2.avoided.r1 === 0, 'giáo viên xác nhận dùng lại ⇒ đủ câu');
  const locked = allocate(bank, [row(2)], { policy: 'duyet', eff, seed: 1, avoid, locked: { r1: [bank[0].uid] } });
  ok(locked.picks.r1.includes(bank[0].uid) && locked.lost.length === 0, 'câu giáo viên đã khóa tay vẫn giữ');
  const cand = candidatesFor(bank, row(1), { policy: 'duyet', eff, avoid }, new Set());
  ok(cand.length === 3 && cand.every((q) => !avoid.has(q.uid)), 'danh sách đổi câu cũng ẩn câu đã dùng');
  const off = allocate(bank, [row(6)], { policy: 'duyet', eff, seed: 1 });
  ok(off.deficit.r1 === 0 && off.avoided.r1 === 0, 'không truyền avoid (tắt): hành vi cũ nguyên vẹn');
}

console.log('Dấu vết trong hedu-de.json');
{
  const idx = buildIndex(projects, sc({ ids: ['a', 'd'] }));
  ok(traceOf(defaultScope(), idx, {}, 'x') === undefined, 'tắt thì không ghi gì');
  const t = traceOf(sc({ ids: ['a', 'd'] }), idx, { u1: { at: 5, from: ['a'] } }, 'x') as { soDeDoiChieu: number; deChuaDoiChieuDuoc: string[]; giaoVienChoDungLai: { uid: string }[] };
  ok(t.soDeDoiChieu === 2 && t.deChuaDoiChieuDuoc[0] === 'd' && t.giaoVienChoDungLai[0].uid === 'u1', 'ghi phạm vi, đề chưa đối chiếu được, câu cho dùng lại');
  const base = { info: { dept: '', school: '', group: '', title: 'T', subject: 'S', minutes: 1, note: '' }, rows: [], policy: 'duyet' as const, seed: 1, scoring: SCORING_2025, variants: [], at: 'x' };
  ok(!('tranhCauDaDung' in JSON.parse(specJson(base))) && JSON.parse(specJson({ ...base, tranhCauDaDung: t })).tranhCauDaDung.soDeDoiChieu === 2, 'specJson chỉ thêm trường khi bật (tương thích)');
}

console.log('Bản nháp: mặc định tắt, dữ liệu hỏng không sập');
{
  const d = newDraft(1);
  ok(d.usage.on === false && Object.keys(d.reuse).length === 0, 'bản nháp mới: tắt');
  ok(parseDraft(JSON.stringify({ ...d, usage: 5, reuse: [] })).usage.on === false, 'usage hỏng ⇒ tắt');
  const r = parseDraft(JSON.stringify({ ...d, usage: { on: true, folders: ['x', 3], years: 'sai', types: [], ids: ['a'] }, reuse: { u1: { at: 1, from: ['a', 2] }, u2: 7 } }));
  ok(r.usage.on && r.usage.folders.join() === 'x' && r.usage.years.length === 0 && r.usage.ids[0] === 'a' && r.reuse.u1.from.join() === 'a' && !r.reuse.u2, 'lọc phần tử sai kiểu');
  ok(parseDraft(JSON.stringify({ v: 1, rows: [] })).usage.on === false, 'bản nháp cũ không có trường usage: tắt');
}

if (fail) process.exit(1);
console.log('examusage: đạt hết.');
