import assert from 'node:assert/strict';
import { chenText, defsOf, suggestTitle, tikzBlocks } from './khochen';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const FIG = '\\begin{tikzpicture}\n\\draw (0,0)--(1,1);\n\\end{tikzpicture}';

console.log('Chèn hình từ Kho / lưu hình vào Kho');
t('văn bản chèn: khai báo kèm hình đứng trước, kết thúc xuống dòng, CRLF về LF', () => {
  assert.equal(chenText({ code: FIG, extra_preamble: '' }), FIG + '\n');
  assert.equal(chenText({ code: '\\draw;\r\n', extra_preamble: '\\def\\a{1}\r\n\\usetikzlibrary{calc}\r\n' }), '\\def\\a{1}\n\\usetikzlibrary{calc}\n\\draw;\n');
});
t('tìm khối tikzpicture, bỏ khối bị comment, ghi số dòng', () => {
  const src = `\\begin{ex}\n Đề\n${FIG}\n% ${FIG.replace(/\n/g, ' ')}\n  \\immini{x}{${FIG}}\n\\end{ex}`;
  const b = tikzBlocks(src);
  assert.equal(b.length, 2);
  assert.equal(b[0].line, 3);
  assert.equal(b[1].line, 7);
  assert.ok(b.every((x) => x.code.startsWith('\\begin{tikzpicture}') && x.code.endsWith('\\end{tikzpicture}')));
  assert.equal(tikzBlocks('không có hình').length, 0);
});
t('khai báo đi kèm hình lấy cùng bộ đọc với xem trước', () => {
  const d = defsOf('\\begin{ex}\n\\def\\r{2}\nĐề\n\\end{ex}');
  assert.match(d, /\\def\\r\{2\}/);
});
t('tên gợi ý: vài chữ đầu của đề bài, bỏ công thức và lệnh', () => {
  assert.equal(suggestTitle('Cho hình chóp $S.ABCD$ có đáy là hình vuông cạnh $a$ và chiều cao bằng một nửa cạnh đáy'), 'Hình: Cho hình chóp có đáy là hình vuông');
  assert.equal(suggestTitle('$x$', 12), 'Hình từ câu hỏi (câu 12)');
});
