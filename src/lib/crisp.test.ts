import { isAxisAligned } from './crisp';

let failed = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };

console.log('Nét thẳng ngang/dọc (độ sắc nét SVG)');
ok(isAxisAligned('M0 0H199.17'), 'nét ngang H');
ok(isAxisAligned('M28.452756 0V56.905512'), 'nét dọc V');
ok(isAxisAligned('M0 0H10V10H0Z'), 'khung chữ nhật H V Z');
ok(isAxisAligned('M0 0L10 0L10 5'), 'L ngang rồi dọc');
ok(isAxisAligned('M0 0h10v5h-10z'), 'tương đối h v');
ok(isAxisAligned('M0 0H10M0 5H10M0 10H10'), 'nhiều nét ngang trong một path (lưới)');
ok(!isAxisAligned('M0 0L10 5'), 'đường chéo KHÔNG đổi');
ok(!isAxisAligned('M0 0C1 1 2 2 3 3'), 'đường cong KHÔNG đổi');
ok(!isAxisAligned('M0 0H10L15 5'), 'có một đoạn chéo thì cả path không đổi');
ok(!isAxisAligned('M0 0A5 5 0 0 1 10 0'), 'cung tròn KHÔNG đổi');
ok(!isAxisAligned(''), 'path rỗng không đổi');
ok(!isAxisAligned('M0 0L10 0 20 7'), 'L nhiều điểm có đoạn chéo');

if (failed) { console.log(`\n${failed} kiểm thử crisp lỗi`); process.exit(1); }
console.log('Crisp: đạt hết.');
