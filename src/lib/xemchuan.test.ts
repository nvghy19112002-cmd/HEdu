// Kiểm thử “Xem chuẩn”: chỉ phần thuần (đầu file, phân loại lỗi); phần chạy TeX do CI Windows và máy thật kiểm.
import { categorize, compileBatch, compileQuestion, forgetCompiled, settingsSignature, withSolution, type Result } from './xemchuan';
import { DEFAULT_SETTINGS, getSettings, setSettings } from './tikz';

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✗ ' + msg); }
}

console.log('Đầu file cho Xem chuẩn');
ok(withSolution('\\usepackage{ex_test}') === '\\usepackage[loigiai]{ex_test}', 'bật [loigiai] cho ex_test');
ok(withSolution('\\usepackage[color]{ex_test}') === '\\usepackage[color,loigiai]{ex_test}', 'giữ tuỳ chọn cũ, thêm loigiai');
ok(withSolution('\\usepackage[loigiai]{ex_test}') === '\\usepackage[loigiai]{ex_test}', 'không thêm hai lần');
const own = '\\documentclass{article}\n\\usepackage{tikz}';
ok(withSolution(own) === own, 'đầu file không có ex_test thì giữ nguyên');

console.log('Phân loại lỗi biên dịch');
const e = (message: string, log = '', stage = 'latex') => categorize({ message, log, stage: stage as never });
ok(e('x', "! LaTeX Error: File `tikz-3dplot.sty' not found.").category === 'thieu-goi', 'thiếu gói');
ok(e('Undefined control sequence.', '! Undefined control sequence.\nl.7 \\foobar').category === 'thieu-lenh', 'thiếu lệnh/macro');
ok(e('Missing $ inserted.', '! Missing $ inserted.').category === 'loi-ma', 'lỗi mã LaTeX');
ok(e('x', '', 'svg').category === 'loi-svg', 'lỗi chuyển SVG');
ok(e('x', '', 'qua-lau').category === 'qua-gio', 'quá giờ');
ok(e('x', '', 'thieu-texlive').category === 'thieu-texlive', 'chưa có TeX Live');

console.log('Một câu lỗi không chặn cả đợt');
{
  // Không có Tauri trong Node: compileQuestion trả “chưa có TeX Live” cho mọi câu, nhưng đợt vẫn chạy hết và dừng được.
  const got: number[] = [];
  const stop = { stop: false };
  await compileBatch(['a', 'b', 'c', 'd', 'e'], true, { signal: stop, parallel: 2, onEach: (i, r: Result) => { got.push(i); if (i === 1) stop.stop = true; ok(!r.ok, `câu ${i}: trả lỗi có phân loại, không ném`); } });
  ok(got.length >= 2 && got.length < 5, `bấm Dừng thì không xếp thêm câu (${got.length}/5 đã chạy)`);
}

if (failed) { console.log(`\n${failed} kiểm thử Xem chuẩn lỗi`); process.exit(1); }
console.log('\nXem chuẩn: đạt hết.');
