import { ENTRIES, PANES, paneLabel, searchSettings } from './settingsnav';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

console.log('Tìm cài đặt');
const hit = (q: string) => searchSettings(q).map((e) => e.pane);
ok(hit('').length === 0 && hit('   ').length === 0, 'ô tìm trống ⇒ không có kết quả');
ok(hit('TeX Live').includes('latex') && hit('tex live').length === hit('TEX LIVE').length, 'tìm "TeX Live" mở mục LaTeX & TikZ, không phân biệt hoa/thường');
ok(hit('sao luu').includes('backup') && hit('khôi phục').includes('backup'), 'tìm không dấu / có dấu đều ra mục Dữ liệu & sao lưu');
ok(hit('api').includes('ai') && hit('gemini').includes('ai'), 'tìm "api"/"gemini" ra mục AI Gemini');
ok(hit('zoom').includes('display') && hit('cập nhật').includes('updates'), 'zoom → Giao diện; cập nhật → Cập nhật ứng dụng');
ok(hit('abcxyz không có').length === 0, 'không khớp ⇒ rỗng');
ok(hit('mathhub').length === 0 && hit('sqlite').every((p) => p === 'backup'), 'không có mục giả cho MathHub; "SQLite" chỉ dẫn tới mục sao lưu thật (không hứa nhiều nguồn)');
ok(ENTRIES.every((e) => PANES.some((p) => p.id === e.pane)) && PANES.length === 8 && paneLabel('ai') === 'AI Gemini', 'mọi mục thuộc một pane có thật; đủ 8 pane');

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nsettingsnav: đạt hết.');
