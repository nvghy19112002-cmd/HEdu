import { clampLog, clampPdf, DEFAULT_LAYOUT, lacksPreamble, LOG_MIN, parseLayout, PDF_MAX, PDF_MIN, treeShown } from './ewlayout';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

t('chưa lưu / hỏng ⇒ bố cục mặc định', JSON.stringify(parseLayout(null)) === JSON.stringify(DEFAULT_LAYOUT) && JSON.stringify(parseLayout('{hỏng')) === JSON.stringify(DEFAULT_LAYOUT));
t('đọc lại đúng giá trị đã lưu', JSON.stringify(parseLayout(JSON.stringify({ tree: false, pdf: 50, log: 300 }))) === JSON.stringify({ tree: false, pdf: 50, log: 300 }));
t('giá trị ngoài khoảng bị kẹp', parseLayout(JSON.stringify({ pdf: 99, log: 5 })).pdf === PDF_MAX && parseLayout(JSON.stringify({ pdf: 1 })).pdf === PDF_MIN && parseLayout(JSON.stringify({ log: 5 })).log === LOG_MIN);
t('kéo PDF: kẹp + làm tròn', clampPdf(33.333) === 33.3 && clampPdf(-5) === PDF_MIN);
t('nhật ký không quá ~nửa màn', clampLog(2000, 768) === Math.floor(768 * 0.55) && clampLog(10, 768) === LOG_MIN);
t('cây tệp tự động: 1 tệp ẩn, nhiều tệp hiện', !treeShown(DEFAULT_LAYOUT, 1) && treeShown(DEFAULT_LAYOUT, 3));
t('cây tệp từ 2 tệp: theo người dùng chọn', treeShown({ ...DEFAULT_LAYOUT, tree: true }, 2) && !treeShown({ ...DEFAULT_LAYOUT, tree: false }, 5));
t('đề 1 tệp: cây tệp luôn ẩn, kể cả khi từng bật tay', !treeShown({ ...DEFAULT_LAYOUT, tree: true }, 1) && !treeShown({ ...DEFAULT_LAYOUT, tree: true }, 0));
t('tệp chỉ có nội dung (không \\documentclass)', lacksPreamble('\\TieuDeDeSo{a}\n\\begin{ex}x\\end{ex}'));
t('tệp đầy đủ', !lacksPreamble('% đề\n\\documentclass[12pt]{book}\n\\begin{document}'));
t('\\documentclass bị chú thích vẫn tính là thiếu', lacksPreamble('%\\documentclass{book}\nabc'));

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
