import assert from 'node:assert/strict';
import { buildPack, counts, hashOf, locate, nextBase, parsePack, plan } from './bankshare';
import type { Question, Taxonomy } from './types';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const tax: Taxonomy = { name: 'x', grades: [{ id: 'g12', code: '12', name: 'Lớp 12', grade: 12, branches: [{ id: 'b', code: 'D', name: 'Đại số', chapters: [{ id: 'c1', code: '1', name: 'Hàm số', lessons: [{ id: 'l1', code: '1', name: 'Đơn điệu', forms: [{ id: 'f1', code: '1', name: 'Tìm khoảng' }] }] }] }] }] };
const q = (uid: string, latex: string, o: Partial<Question> = {}): Question => ({ uid, seq: 1, latex, type: 'tn', level: 'NB', tags: [], createdAt: 1, updatedAt: 2, grade: 12, chapterId: 'c1', lessonId: 'l1', formId: 'f1', ...o });

console.log('Chia sẻ ngân hàng');
t('gói xuất ra đọc lại được, có đường dẫn tên', () => {
  const p = buildPack([q('a', 'A')], tax, 'Cô Lan');
  const r = parsePack(JSON.stringify(p));
  assert.ok('pack' in r);
  if ('pack' in r) { assert.equal(r.pack.questions[0].path[1], 'Hàm số'); assert.equal(r.pack.from, 'Cô Lan'); }
  assert.ok('error' in parsePack('{"app":"x"}')); assert.ok('error' in parsePack('khong phai json'));
});
t('băm bỏ qua khoảng trắng cuối dòng và kiểu xuống dòng', () => { assert.equal(hashOf('a \r\nb'), hashOf('a\nb')); assert.notEqual(hashOf('a'), hashOf('b')); });
t('định vị: theo mã, rồi theo tên khi mã khác, không có thì null', () => {
  const s = buildPack([q('a', 'A')], tax, 'x').questions[0];
  assert.deepEqual(locate(tax, s), { grade: 12, chapterId: 'c1', lessonId: 'l1', formId: 'f1' });
  const tax2: Taxonomy = JSON.parse(JSON.stringify(tax).replace(/"c1"/g, '"cX"').replace(/"l1"/g, '"lX"').replace(/"f1"/g, '"fX"'));
  assert.deepEqual(locate(tax2, s), { grade: 12, chapterId: 'cX', lessonId: 'lX', formId: 'fX' });
  assert.equal(locate(tax, { ...s, loc: { ...s.loc, grade: 10 } }), null);
});
t('kế hoạch gộp đủ các trường hợp', () => {
  const mine = [q('same', 'S'), q('upd', 'U0'), q('kept', 'K1'), q('conf', 'C1'), q('own', 'trung noi dung')];
  const base = { upd: hashOf('U0'), kept: hashOf('K0'), conf: hashOf('C0') };
  const theirs = buildPack([q('same', 'S'), q('upd', 'U1'), q('kept', 'K0'), q('conf', 'C2'), q('new1', 'N'), q('dupx', 'trung   noi dung'), q('far', 'F', { grade: 10 })], tax, 'x');
  const rows = plan(theirs, mine, tax, base);
  assert.deepEqual(rows.map((r) => r.verdict), ['same', 'update', 'keep-mine', 'conflict', 'new', 'dup', 'no-place']);
  assert.equal(rows[5].dupOf, 'own');
  assert.equal(counts(rows).new, 1);
});
t('lần đầu (chưa có bản nền) mà khác nhau ⇒ xung đột, không tự ghi đè', () => {
  const rows = plan(buildPack([q('a', 'X2')], tax, 'x'), [q('a', 'X1')], tax, {});
  assert.equal(rows[0].verdict, 'conflict');
});
t('sau khi nhận, bản nền nhớ bản của đồng nghiệp: giữ của mình thì lần sau không báo xung đột lại', () => {
  const theirs = buildPack([q('a', 'X2'), q('b', 'Y2')], tax, 'x');
  const rows = plan(theirs, [q('a', 'X1'), q('b', 'Y1')], tax, {});
  const nb = nextBase({}, rows, { a: 'mine', b: 'theirs' });
  assert.equal(nb.a, hashOf('X2')); assert.equal(nb.b, hashOf('Y2'));
  assert.equal(plan(theirs, [q('a', 'X1'), q('b', 'Y2')], tax, nb).map((r) => r.verdict).join(), 'keep-mine,same');
});
