// Ghi gia tăng (SQLite): chỉ gửi câu đã đổi/xoá; lỗi giữa chừng không mất gì và lần sau gửi lại đúng phần chưa xong; mở lại thấy đủ.
import { addMany, deleteMany, exportBackup, flushSave, getState, importBackup, initStore, isLastSaveOk, saveQuestion, updateMany, type Delta, type LoadedRaw, type Persistence } from './store';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const ex = (n: number) => `\\begin{ex}%[2D1H1-1]\n  Đề ${n}. $x^${n}$\n  \\choice{\\True 1}{2}{3}{4}\n  \\loigiai{x}\n\\end{ex}`;
const loc = { grade: 12, chapterId: 'c2D1', lessonId: 'l2D11', formId: 'f2D111' };

/** "SQLite" giả trong bộ nhớ: mỗi dòng là JSON câu; meta là chữ — giống đúng những gì Rust lưu. */
const db = { rows: new Map<string, string>(), meta: new Map<string, string>(), fail: 0, calls: [] as Delta[] };
const persistence: Persistence = {
  async load() { throw new Error('không dùng'); },
  async save() { throw new Error('không dùng'); },
  async loadParsed(): Promise<LoadedRaw | null> {
    if (db.rows.size === 0 && !db.meta.has('schema')) return null;
    const qs = [...db.rows.values()].map((j) => JSON.parse(j) as Question).sort((a, b) => a.seq - b.seq);
    return { schema: db.meta.get('schema') ?? null, nextSeq: db.meta.get('nextSeq') ?? null, taxonomy: db.meta.get('taxonomy') ?? null, questions: qs };
  },
  async saveDelta(d: Delta) {
    if (db.fail > 0) { db.fail--; throw new Error('đĩa đầy'); }
    db.calls.push(d);
    for (const u of d.deletes) db.rows.delete(u);
    for (const j of d.upserts) db.rows.set((JSON.parse(j) as Question).uid, j);
    for (const [k, v] of d.meta) db.meta.set(k, v);
  },
};
const reopen = async () => { await flushSave(); return initStore(persistence); };
const last = () => db.calls[db.calls.length - 1];

console.log('Nguồn mới tinh');
{
  const b = await initStore(persistence);
  ok(b.ok && b.firstRun, 'nguồn trống ⇒ lần chạy đầu (bản trình duyệt tự nạp vài câu mẫu)');
  const [a] = addMany([{ ...loc, latex: ex(1), level: 'NB', tags: [] }]);
  await flushSave();
  ok(isLastSaveOk() && db.rows.size === getState().questions.length && db.meta.get('schema') === '3' && db.meta.get('nextSeq') === String(getState().nextSeq) && db.meta.get('taxonomy') === 'null', 'ghi câu đầu tiên kèm thông tin chung (schema, nextSeq, cây)');
  ok(db.rows.get(a.uid) === JSON.stringify(a), 'câu lưu đúng nguyên văn JSON của câu');
}

console.log('Chỉ gửi phần thay đổi');
{
  const qs = addMany(Array.from({ length: 200 }, (_, i) => ({ ...loc, latex: ex(i + 2), level: 'NB' as const, tags: [] })));
  await flushSave();
  ok(db.rows.size === getState().questions.length && db.rows.size > 200, 'nguồn có đủ các câu');
  db.calls.length = 0;
  saveQuestion({ ...loc, latex: ex(999), level: 'TH', tags: ['ôn'] }, qs[10].uid);
  await flushSave();
  ok(db.calls.length === 1 && last().upserts.length === 1 && last().deletes.length === 0 && last().meta.length === 0, 'sửa MỘT câu ⇒ gửi đúng một câu, không gửi lại 200 câu còn lại, không gửi thông tin chung');
  ok((JSON.parse(db.rows.get(qs[10].uid)!) as Question).latex === ex(999), 'đã ghi bản sửa');
  db.calls.length = 0;
  await flushSave();
  ok(db.calls.length === 0, 'không có gì đổi ⇒ không ghi gì');
  const r = await deleteMany([qs[0].uid, qs[1].uid]);
  ok(r.ok && last().deletes.length === 2 && last().upserts.length === 0 && db.rows.size === getState().questions.length, 'xoá 2 câu ⇒ gửi đúng 2 lệnh xoá');
  db.calls.length = 0;
  const u = await updateMany([qs[20].uid, qs[21].uid, qs[22].uid], (q) => ({ ...q, tags: [...q.tags, 'mới'] }));
  ok(u.ok && last().upserts.length === 3, 'sửa hàng loạt 3 câu ⇒ gửi 3 câu');
  addMany([{ ...loc, latex: ex(5000), level: 'NB', tags: [] }]);
  await flushSave();
  ok(last().upserts.length === 1 && last().meta.some(([k, v]) => k === 'nextSeq' && v === String(getState().nextSeq)), 'thêm câu ⇒ gửi câu mới + nextSeq mới');
}

console.log('Lỗi ghi: không mất gì, lần sau gửi lại đúng phần chưa xong');
{
  const before = db.rows.size;
  const [a, b] = getState().questions.slice(0, 2);
  db.fail = 1;
  saveQuestion({ ...loc, latex: ex(7001), level: 'NB', tags: [] }, a.uid);
  addMany([{ ...loc, latex: ex(7002), level: 'NB', tags: [] }]);
  await flushSave();
  ok(!isLastSaveOk() && db.rows.size === before, 'ghi lỗi ⇒ báo lỗi, đĩa giữ nguyên');
  ok(getState().questions.some((q) => q.latex === ex(7001)) && getState().questions.some((q) => q.latex === ex(7002)), 'thay đổi vẫn còn trong bộ nhớ để thử lại');
  db.calls.length = 0;
  await flushSave();
  ok(isLastSaveOk() && last().upserts.length === 2, 'lần lưu kế tiếp gửi lại ĐÚNG 2 phần chưa ghi (không gửi cả ngân hàng)');
  ok(db.rows.size === before + 1 && (JSON.parse(db.rows.get(a.uid)!) as Question).latex === ex(7001), 'đĩa đã đủ');
  void b;
}

console.log('Mở lại ứng dụng');
{
  const memBefore = getState().questions.map((q) => JSON.stringify(q)).sort();
  const boot = await reopen();
  ok(boot.ok && !boot.firstRun, 'mở lại không phải lần chạy đầu');
  ok(JSON.stringify(getState().questions.map((q) => JSON.stringify(q)).sort()) === JSON.stringify(memBefore) && getState().nextSeq > 200, 'mở lại thấy đúng toàn bộ câu như trước khi đóng');
  db.calls.length = 0;
  await flushSave();
  ok(db.calls.length === 0, 'vừa mở xong chưa đổi gì ⇒ không ghi lại');
}

console.log('Khôi phục cả ngân hàng từ file sao lưu + nâng cấp cấu trúc cũ');
{
  const backup = exportBackup();
  const n = getState().questions.length;
  const parsed = JSON.parse(backup);
  parsed.questions = parsed.questions.slice(0, 50);
  importBackup(JSON.stringify(parsed));
  await flushSave();
  ok(isLastSaveOk() && db.rows.size === 50 && getState().questions.length === 50 && n > 50, 'khôi phục thay cả ngân hàng: câu thừa bị gỡ, đĩa còn đúng 50 câu');
  // dữ liệu cũ schema 1 (chương cũ) được nâng cấp khi mở và ghi lại đúng phần đã đổi
  db.meta.set('schema', '1');
  const [first] = [...db.rows.values()].map((j) => JSON.parse(j) as Question);
  db.rows.set(first.uid, JSON.stringify({ ...first, chapterId: 'g12c1', lessonId: 'g12c1b1', formId: '' }));
  const boot = await initStore(persistence);
  ok(boot.ok, 'mở được dữ liệu schema 1');
  db.calls.length = 0;
  await flushSave();
  ok(last().upserts.length === 1 && last().meta.some(([k, v]) => k === 'schema' && v === '3'), 'chỉ ghi lại câu đã được nâng cấp + số phiên bản mới');
  ok((JSON.parse(db.rows.get(first.uid)!) as Question).chapterId === '', 'câu chương cũ được đánh dấu "chưa gán vị trí" như trước (không gán bừa)');
}

console.log('Lô rất lớn');
{
  const big = addMany(Array.from({ length: 6000 }, (_, i) => ({ ...loc, latex: ex(10000 + i), level: 'NB' as const, tags: [] })));
  await flushSave();
  ok(isLastSaveOk() && db.rows.size === 6050 && big.length === 6000, 'thêm 6.000 câu: ghi đủ');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nstoredelta: đạt hết.');
