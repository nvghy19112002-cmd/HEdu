import { closeTab, cycleTab, EMPTY_TABS, keepExisting, makeSlots, MAX_TABS, openTab, parseTabs, serializeTabs, type TabsState } from './examtabs';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

const s1 = openTab(EMPTY_TABS, 'a') as TabsState;
t('mở đề đầu tiên: thêm tab và xem luôn', s1.ids.join() === 'a' && s1.front === 'a');
const s2 = openTab(s1, 'b') as TabsState;
t('mở đề thứ hai: thêm ở cuối', s2.ids.join() === 'a,b' && s2.front === 'b');
const s3 = openTab({ ...s2, front: null }, 'a') as TabsState;
t('mở lại đề đã mở: chỉ chuyển sang, không thêm tab', s3.ids.join() === 'a,b' && s3.front === 'a');
let full: TabsState = EMPTY_TABS;
for (let i = 0; i < MAX_TABS; i++) full = openTab(full, `d${i}`) as TabsState;
t(`quá ${MAX_TABS} đề ⇒ báo đầy, không tự đóng tab nào`, openTab(full, 'x') === 'full' && full.ids.length === MAX_TABS);
t('đầy nhưng mở lại đề đã có vẫn được', openTab(full, 'd0') !== 'full');

const abc: TabsState = { ids: ['a', 'b', 'c'], front: 'b' };
t('đóng tab đang xem ⇒ sang tab bên phải', closeTab(abc, 'b').front === 'c');
t('đóng tab cuối đang xem ⇒ sang tab bên trái', closeTab({ ...abc, front: 'c' }, 'c').front === 'b');
t('đóng tab duy nhất ⇒ về Thư viện', closeTab(s1, 'a').front === null && closeTab(s1, 'a').ids.length === 0);
t('đóng tab khác ⇒ giữ tab đang xem', closeTab(abc, 'a').front === 'b' && closeTab(abc, 'a').ids.join() === 'b,c');
t('đóng tab không có ⇒ không đổi', closeTab(abc, 'zz') === abc);

t('Ctrl+Tab đi tiếp', cycleTab(abc, 1).front === 'c');
t('Ctrl+Tab từ đề cuối ⇒ về Thư viện', cycleTab({ ...abc, front: 'c' }, 1).front === null);
t('Ctrl+Shift+Tab từ Thư viện ⇒ đề cuối', cycleTab({ ...abc, front: null }, -1).front === 'c');
t('Ctrl+Tab khi chưa mở đề nào ⇒ vẫn ở Thư viện', cycleTab(EMPTY_TABS, 1).front === null);

t('bỏ tab của đề đã mất, đang xem nó ⇒ về Thư viện', JSON.stringify(keepExisting(abc, (id) => id !== 'b')) === JSON.stringify({ ids: ['a', 'c'], front: null }));
t('không đề nào mất ⇒ giữ nguyên đối tượng', keepExisting(abc, () => true) === abc);

t('lưu rồi đọc lại giống hệt', JSON.stringify(parseTabs(serializeTabs(abc))) === JSON.stringify(abc));
t('chưa lưu / hỏng ⇒ rỗng', parseTabs(null).ids.length === 0 && parseTabs('{hỏng').ids.length === 0 && parseTabs('{"ids":5}').ids.length === 0);
t('đọc: bỏ id xấu, trùng; front lạ ⇒ Thư viện', JSON.stringify(parseTabs(JSON.stringify({ ids: ['a', 'a', 3, '', 'b'], front: 'zz' }))) === JSON.stringify({ ids: ['a', 'b'], front: null }));
t(`đọc: cắt còn ${MAX_TABS} tab`, parseTabs(JSON.stringify({ ids: Array.from({ length: 20 }, (_, i) => `e${i}`), front: null })).ids.length === MAX_TABS);

// hàng đợi biên dịch
const slots = makeSlots(2);
const order: string[] = [];
const r1 = await slots.acquire(); order.push('1');
const r2 = await slots.acquire(); order.push('2');
let third = false;
const p3 = slots.acquire().then((r) => { third = true; order.push('3'); return r; });
await Promise.resolve();
t('hai đề đầu biên dịch ngay, đề thứ ba chờ lượt', !third && slots.busy === 2 && slots.waiting === 1);
r1(); r1(); // trả lượt hai lần chỉ tính một
const r3 = await p3;
t('xong một đề ⇒ đề chờ được chạy', third && slots.busy === 2 && slots.waiting === 0);
r2(); r3();
t('trả hết lượt ⇒ trống (trả trùng không làm âm)', slots.busy === 0);
t('thứ tự chạy đúng', order.join() === '1,2,3');

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
