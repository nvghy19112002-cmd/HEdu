// Lô lớn + lỗi giữa chừng ở chế độ SQLite (dùng ĐÚNG mã sqlitePersistence, chỉ giả lập phía Rust):
// một lô đi trong MỘT giao dịch; lỗi ⇒ không câu nào của lô được ghi, không báo thành công sai, thử lại ghi đủ; mở lại thấy đúng.
// Cộng: cập nhật/khôi phục bị chặn khi còn thay đổi chưa ghi; mô tả chế độ lưu trữ đúng.
import { installUpdate, restoreBackup } from './updates';
import { ATOMIC_MAX, saveDeltaWith, sqlitePersistence, storageSummary } from './storage';
import { addMany, deleteMany, flushSave, getState, initStore, isLastSaveOk, type Delta } from './store';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const g = globalThis as unknown as { window?: unknown };

// ---- "Rust + SQLite" giả: mỗi db_apply là MỘT giao dịch nguyên tử ----
const db = { rows: new Map<string, string>(), meta: new Map<string, string>(), applyCalls: 0, failOnCall: 0, installs: 0, restores: 0, reloaded: 0 };
const invoke = async (cmd: string, args: Record<string, unknown>) => {
  if (cmd === 'db_apply') {
    db.applyCalls++;
    if (db.failOnCall && db.applyCalls === db.failOnCall) throw 'đĩa đầy';
    const a = args as { upserts: string[]; deletes: string[]; meta: [string, string][] };
    const parsed = a.upserts.map((j) => JSON.parse(j) as Question); // lỗi parse ⇒ không ghi gì
    for (const u of a.deletes) db.rows.delete(u);
    parsed.forEach((q, i) => db.rows.set(q.uid, a.upserts[i]));
    for (const [k, v] of a.meta) db.meta.set(k, v);
    return null;
  }
  if (cmd === 'db_load_meta') return { schema: db.meta.get('schema') ?? null, nextSeq: db.meta.get('nextSeq') ?? null, taxonomy: db.meta.get('taxonomy') ?? null, count: db.rows.size };
  if (cmd === 'db_load_page') {
    const after = args.afterSeq == null ? null : { seq: args.afterSeq as number, uid: args.afterUid as string };
    const all = [...db.rows.values()].map((j) => JSON.parse(j) as Question).sort((x, y) => x.seq - y.seq || (x.uid < y.uid ? -1 : 1));
    return all.filter((q) => !after || q.seq > after.seq || (q.seq === after.seq && q.uid > after.uid)).slice(0, args.limit as number).map((q) => ({ seq: q.seq, uid: q.uid, json: db.rows.get(q.uid)! }));
  }
  if (cmd === 'install_update') { db.installs++; return null; }
  if (cmd === 'restore_backup') { db.restores++; return 'ok'; }
  throw new Error('lệnh lạ ' + cmd);
};
g.window = { __TAURI__: { core: { invoke }, event: { async listen() { return () => {}; } } }, location: { reload() { db.reloaded++; } }, dispatchEvent() { return true; }, addEventListener() {} };
const same = () => getState().questions.length === db.rows.size && getState().questions.every((q) => db.rows.get(q.uid) === JSON.stringify(q));
const loc = { grade: 12, chapterId: 'c2D1', lessonId: 'l2D11', formId: 'f2D111' };
const mk = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ ...loc, latex: `\\begin{ex}${tag} ${i}\\end{ex}`, level: 'NB' as const, tags: [] }));

console.log('Lô lớn trong MỘT giao dịch');
{
  const b = await initStore(sqlitePersistence);
  ok(b.ok && b.firstRun, 'nguồn trống');
  db.applyCalls = 0;
  addMany(mk(20000, 'A'));
  await flushSave();
  ok(isLastSaveOk() && db.applyCalls === 1 && same(), '20.000 câu ⇒ đúng MỘT lệnh ghi (một giao dịch), đĩa khớp bộ nhớ');
  ok(ATOMIC_MAX >= 60000, 'ngưỡng chia lô lớn hơn ngân hàng thật (60.000 câu đã đo ~4 giây trong app thật)');
}

console.log('Lỗi khi ghi lô lớn (> 5.000 thay đổi)');
{
  const before = db.rows.size;
  const snapshotBefore = new Map(db.rows);
  addMany(mk(6000, 'B'));
  db.applyCalls = 0; db.failOnCall = 1;
  await flushSave();
  ok(!isLastSaveOk(), 'ghi lỗi ⇒ KHÔNG báo thành công');
  ok(db.rows.size === before && [...snapshotBefore].every(([k, v]) => db.rows.get(k) === v), 'giao dịch bị huỷ trọn: đĩa y nguyên, không câu nào của lô dở dang được ghi');
  ok(getState().questions.length === before + 6000, 'thay đổi còn nguyên trong bộ nhớ (chưa mất), người dùng được báo lỗi để thử lại');
  db.failOnCall = 0;
  await flushSave();
  ok(isLastSaveOk() && same(), 'thử lại ⇒ ghi đủ 6.000 câu, đĩa khớp bộ nhớ');
  // xoá hàng loạt cũng nguyên tử
  const del = getState().questions.slice(0, 7000).map((q) => q.uid);
  db.applyCalls = 0; db.failOnCall = 1;
  const r = await deleteMany(del);
  ok(!r.ok && db.rows.size === getState().questions.length && db.rows.size === 26000, 'xoá 7.000 câu mà ghi lỗi ⇒ hoàn lại, đĩa vẫn đủ 26.000 câu');
  db.failOnCall = 0;
}

console.log('Mở lại ứng dụng: thấy đúng dữ liệu đã ghi');
{
  const memBefore = getState().questions.length;
  await initStore(sqlitePersistence);
  ok(getState().questions.length === memBefore && same(), 'nạp lại theo trang: đủ câu, từng câu giống từng ký tự');
}

console.log('Đường chia lô (chỉ khi lô khổng lồ) vẫn an toàn khi lỗi giữa chừng');
{
  db.rows.clear(); db.meta.clear();
  const qs = addMany(mk(50, 'C')); // chỉ để có đối tượng câu hợp lệ
  void qs;
  const delta: Delta = { upserts: getState().questions.slice(-50).map((q) => JSON.stringify(q)), deletes: [], meta: [['nextSeq', '999']] };
  db.applyCalls = 0; db.failOnCall = 3; // lỗi ở khúc thứ ba
  const err = await saveDeltaWith(delta, 10).then(() => null, (e: unknown) => e);
  ok(err !== null, 'lỗi giữa chừng ⇒ ném lỗi (không báo thành công)');
  ok(db.rows.size > 0 && db.rows.size < 50 && !db.meta.has('nextSeq'), 'các khúc đã ghi trọn vẹn, thông tin chung (nextSeq) CHƯA ghi nên không thể lớn hơn dữ liệu thật trên đĩa');
  db.failOnCall = 0; db.applyCalls = 0;
  await saveDeltaWith(delta, 10);
  ok(db.rows.size === 50 && db.meta.get('nextSeq') === '999', 'gửi lại cả lô ⇒ hội tụ đúng (ghi chồng an toàn)');
}

console.log('Cập nhật / khôi phục không chạy khi còn thay đổi chưa ghi');
{
  db.rows.clear(); db.meta.clear();
  await initStore(sqlitePersistence);
  addMany(mk(3, 'D'));
  db.failOnCall = db.applyCalls + 1;
  const e1 = await installUpdate('beta', () => {}).then(() => null, (e: unknown) => (e as Error).message);
  ok(typeof e1 === 'string' && /CHƯA ghi/.test(e1) && db.installs === 0, 'cập nhật bị chặn, KHÔNG gọi lệnh cài khi ghi lỗi');
  db.failOnCall = db.applyCalls + 1;
  const e2 = await restoreBackup().then(() => null, (e: unknown) => (e as Error).message);
  ok(typeof e2 === 'string' && /CHƯA ghi/.test(e2) && db.restores === 0 && db.reloaded === 0, 'khôi phục sau cập nhật bị chặn, không đổi dữ liệu, không tải lại');
  db.failOnCall = 0;
  await installUpdate('beta', () => {});
  ok(db.installs === 1 && same(), 'ghi được rồi thì cập nhật chạy (dữ liệu đã nằm trên đĩa trước khi cài)');
  await restoreBackup();
  ok(db.restores === 1 && db.reloaded === 1, 'khôi phục chạy khi dữ liệu đã an toàn');
  // màn lỗi khởi động (dữ liệu không đọc được ⇒ chỉ-đọc): vẫn cho khôi phục từ bản sao lưu
  await initStore({ async load() { throw new Error('hỏng'); }, async save() { throw new Error('x'); } });
  db.restores = 0;
  await restoreBackup();
  ok(db.restores === 1, 'kho không đọc được (chỉ-đọc): vẫn khôi phục được từ bản sao lưu');
}

console.log('Mô tả chế độ lưu trữ');
{
  const s = storageSummary('sqlite', 'C:\\Users\\a\\AppData\\Roaming\\vn.hedu.app\\');
  ok(s.label === 'SQLite' && s.path === 'C:\\Users\\a\\AppData\\Roaming\\vn.hedu.app\\profiles\\default\\sources\\main\\hedu.db' && /hedu\.db/.test(s.detail) && !/hedu\.json/.test(s.detail), 'SQLite: đúng tên, đúng đường dẫn hedu.db');
  const j = storageSummary('json', 'C:\\x');
  ok(j.label.startsWith('JSON') && j.path === 'C:\\x\\data\\hedu.json' && /Để sau/.test(j.detail), 'JSON cũ: đúng tên, nói rõ lý do và lần sau hỏi lại');
  const w = storageSummary('web', null);
  ok(w.label === 'Trình duyệt' && w.path === null, 'bản trình duyệt: không có đường dẫn');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nstoragefail: đạt hết.');
