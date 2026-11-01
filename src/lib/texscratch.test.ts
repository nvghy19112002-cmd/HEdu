// Kiểm thử phân tích chỉ đọc của màn "Xử lí TeX" (texscratch.ts). Câu tự viết, không dùng câu thật.
import { blockAtLine, blockInfos, idState, lineAt, lineStarts, scanScratch } from './texscratch';
import { strictCode } from './idsync';
import { buildDefault } from './taxonomy';

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✗ ' + msg); }
}

const tax = buildDefault();
const g = tax.grades.find((x) => x.grade === 10)!;
const b = g.branches.find((x) => x.chapters.length)!;
const c = b.chapters[0], l = c.lessons[0], f = l.forms[0];
const sc = strictCode({ grade: g.grade, chapterId: c.id, lessonId: l.id, formId: f.id }, 'NB', tax);
const good = sc.ok ? sc.code : 'x';

const text = [
  '% đề thử — chú thích đầu tệp',                 // 1
  '\\newcommand{\\vv}[1]{\\overrightarrow{#1}}',   // 2  macro ngoài khối
  `\\begin{ex}%[${good}]`,                         // 3
  '  Câu một $x^2$.',                              // 4
  '  \\choice{\\True $1$}{$2$}{$3$}{$4$}',          // 5
  '\\end{ex}',                                     // 6
  '',                                              // 7
  '% \\begin{ex} khối bị chú thích, không tính',     // 8
  '\\begin{ex}%[9Z9Z9-9]',                         // 9
  '  Câu hai {chưa đóng ngoặc.',                   // 10
  '\\end{ex}',                                     // 11
  '\\begin{ex}',                                   // 12  khối chưa đóng (gặp khối sau)
  '  Câu ba dở.',                                  // 13
  '\\begin{ex}%[0D1N1-1]%[0D1N1-2]',               // 14
  '  Câu bốn, hai ID.',                            // 15
  '\\end{ex}',                                     // 16
  '\\end{ex}',                                     // 17 thừa
  '\\input{tep-ngoai}',                            // 18
].join('\n');

console.log('Tách khối, chỉ đọc');
const s = scanScratch(text);
ok(s.blocks.length === 4, `4 khối (bỏ khối nằm trong chú thích): ${s.blocks.length}`);
ok(s.blocks.map((x) => `${x.line0}-${x.line1}`).join(' ') === '3-6 9-11 12-13 14-16', 'đúng dòng đầu/cuối từng khối: ' + s.blocks.map((x) => `${x.line0}-${x.line1}`).join(' '));
ok(s.blocks[2].closed === false && s.blocks.filter((x) => x.closed).length === 3, 'khối thiếu \\end{ex} được đánh dấu chưa đóng, không gộp với khối sau');
ok(s.blocks.map((x) => x.text).join('') === s.blocks.map((x) => text.slice(x.start, x.end)).join(''), 'văn bản khối đúng nguyên văn từ văn bản gốc');
ok(s.strayEnds.join() === '17', '\\end{ex} thừa được báo đúng dòng');
ok(s.outside.length === 2 && s.outside[0].line0 === 2 && s.outside[1].line0 === 17 && s.outside[1].line1 === 18, 'nội dung ngoài khối (macro dòng 2; \\end{ex} thừa + \\input dòng 17–18) được báo, chú thích và dòng trống không tính');
ok(s.io.length === 1 && s.io[0].line === 18 && s.io[0].text === '\\input', 'lệnh đọc tệp ngoài được báo');
ok(scanScratch('\\documentclass{article}\n\\begin{document}\n\\end{document}').fullDoc.join() === '1,2', 'dán cả tài liệu được nhận ra');
ok(scanScratch('% \\documentclass{x}\n\\begin{ex} 50\\% \\end{ex}').fullDoc.length === 0 && scanScratch('a 50\\% b \\begin{ex}x\\end{ex}').blocks.length === 1, '% bị thoát (\\%) không phải chú thích; \\documentclass trong chú thích không tính');
ok(scanScratch('').blocks.length === 0 && scanScratch('').outside.length === 0, 'văn bản trống');
const crlf = scanScratch('\\begin{ex}\r\nA\r\n\\end{ex}\r\n');
ok(crlf.blocks.length === 1 && crlf.blocks[0].line1 === 3 && crlf.blocks[0].text.includes('\r\n'), 'giữ nguyên CRLF, đếm dòng đúng');

console.log('ID của từng khối (không có nhãn "đã xác minh")');
ok(idState(s.blocks[0].text, tax).state === 'co-trong-cay', 'ID có trong cây');
ok(idState(s.blocks[1].text, tax).state !== 'co-trong-cay', 'ID không có trong cây / sai cú pháp không bị coi là đúng');
ok(idState(s.blocks[2].text, tax).state === 'khong-co', 'chưa có ID');
ok(idState(s.blocks[3].text, tax).state === 'nhieu', 'nhiều ID');

console.log('Lỗi nhanh theo dòng của văn bản');
const infos = blockInfos(s, tax);
ok(infos[1].problems > 0 && /dòng 10/.test(infos[1].firstProblem ?? ''), 'lỗi ngoặc báo theo dòng của văn bản (dòng 10): ' + infos[1].firstProblem);
ok(infos[2].problems === 1 && /end\{ex\}/.test(infos[2].firstProblem ?? ''), 'khối chưa đóng có lỗi riêng');
ok(infos[0].problems === 0, 'khối đúng không có lỗi');

console.log('Dòng ⇄ vị trí');
const st = lineStarts('a\nbb\nccc');
ok(lineAt(st, 0) === 1 && lineAt(st, 2) === 2 && lineAt(st, 5) === 3, 'đổi vị trí ký tự sang số dòng');
ok(blockAtLine(s, 4)?.n === 1 && blockAtLine(s, 7) === null, 'tìm khối đang chứa con trỏ');

if (failed) { console.log(`texscratch.test: ${failed} lỗi`); process.exit(1); }
console.log('texscratch.test: OK');
