import { clampZoom, createWheelStepper, effectiveZoom, fitFactor, stepZoom, zoomKey } from './zoom';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
console.log('zoom');
ok(clampZoom(0.5) === 0.8 && clampZoom(3) === 1.5 && clampZoom(NaN) === 1, 'giới hạn 80–150%, giá trị lạ về 100%');
ok(stepZoom(1, 1) === 1.1 && stepZoom(1.1, 1) === 1.2 && stepZoom(1, -1) === 0.9, 'mỗi bước 10%, không lệch số thực');
let z = 1; for (let i = 0; i < 10; i++) z = stepZoom(z, 1);
ok(z === 1.5, 'không vượt 150%');
z = 1; for (let i = 0; i < 10; i++) z = stepZoom(z, -1);
ok(z === 0.8, 'không dưới 80%');
const s = createWheelStepper();
ok(s(-100, 0) === 1 && s(100, 0) === -1, 'một nấc chuột = một bước');
let total = 0; for (let i = 0; i < 25; i++) total += s(-8, 0);
ok(total === 2, 'chụm ngón: nhiều sự kiện nhỏ cộng dồn thành từng bước (200/100=2)');
ok(zoomKey({ ctrlKey: true, metaKey: false, altKey: false, key: '=' }) === 1, 'Ctrl + (phím =) phóng to');
ok(zoomKey({ ctrlKey: true, metaKey: false, altKey: false, key: '+' }) === 1, 'Ctrl + phóng to');
ok(zoomKey({ ctrlKey: true, metaKey: false, altKey: false, key: '-' }) === -1, 'Ctrl − thu nhỏ');
ok(zoomKey({ ctrlKey: true, metaKey: false, altKey: false, key: '0' }) === 'reset', 'Ctrl 0 đặt lại');
ok(zoomKey({ ctrlKey: false, metaKey: false, altKey: false, key: '=' }) === null, 'không Ctrl thì bỏ qua');

ok(fitFactor(1600) === 1, 'cửa sổ 1600 px: giữ nguyên');
ok(fitFactor(1366) < 1 && fitFactor(1366) >= 0.85, 'laptop 1366: thu nhẹ');
ok(fitFactor(1920) > 1 && fitFactor(1920) <= 1.15, 'Full HD: to ra');
ok(fitFactor(800) === 0.85 && fitFactor(4000) === 1.15, 'giới hạn 85–115%');
ok(effectiveZoom(1.2, false, 1366) === 1.2, 'tắt co giãn: đúng mức người dùng');
ok(effectiveZoom(1, true, 1366) === fitFactor(1366), 'bật co giãn: nhân hệ số');
if (fail) { console.log(`${fail} lỗi`); process.exit(1); }
