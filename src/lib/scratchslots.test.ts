import { addDraft, cleanName, EMPTY_INDEX, INDEX_SLOT, MAIN_NAME, nameOf, newId, parseIndex, removeDraft, renameDraft, serializeIndex, setActive } from './scratchslots';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

t('chưa có tệp danh sách ⇒ rỗng, mở bàn nháp chính', parseIndex(null).items.length === 0 && parseIndex(null).active === '');
t('tệp danh sách hỏng ⇒ rỗng, không lỗi', parseIndex('{không phải json').items.length === 0);
const r = addDraft(EMPTY_INDEX, '  Đề   giữa kì 1 ', 1000);
t('thêm bàn nháp: gọn tên, mở luôn', 'ix' in r && r.ix.items[0].name === 'Đề giữa kì 1' && r.ix.active === r.id);
if ('ix' in r) {
  const ix = r.ix;
  t('id hợp lệ cho tên tệp', /^[a-z0-9-]{1,40}$/.test(r.id));
  t('lưu rồi đọc lại giống hệt', JSON.stringify(parseIndex(serializeIndex(ix))) === JSON.stringify(ix));
  t('đổi tên', nameOf(renameDraft(ix, r.id, 'Chương 3'), r.id) === 'Chương 3');
  t('không đổi tên bàn nháp chính, không đặt tên rỗng', renameDraft(ix, '', 'x') === ix && renameDraft(ix, r.id, '   ') === ix);
  const gone = removeDraft(ix, r.id);
  t('xoá đang mở ⇒ quay về bàn nháp chính', gone.items.length === 0 && gone.active === '');
  t('setActive chỉ nhận id có thật', setActive(ix, 'khong-co') === ix && setActive(ix, '').active === '');
  const two = addDraft(ix, 'B', 1000);
  t('cùng thời điểm vẫn ra id khác', 'ix' in two && two.id !== r.id);
}
t('tên bàn nháp chính', nameOf(EMPTY_INDEX, '') === MAIN_NAME);
t('id xấu bị bỏ khi đọc', parseIndex(JSON.stringify({ v: 1, active: '../x', items: [{ id: '../x', name: 'a' }, { id: INDEX_SLOT, name: 'b' }, { id: 'ok-1', name: 'c' }, { id: 'ok-1', name: 'trùng' }] })).items.map((i) => i.id).join() === 'ok-1');
t('active trỏ vào id không có ⇒ về chính', parseIndex(JSON.stringify({ v: 1, active: 'zzz', items: [] })).active === '');
t('newId tránh trùng', newId({ v: 1, active: '', items: [{ id: 'b1', name: 'x' }] }, 1) !== 'b1');
t('cleanName cắt dài', cleanName('a'.repeat(100)).length === 60);

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
