// Kiểm thử trên dữ liệu thật: đặt file .tex vào data/test/ rồi chạy npm test.
// Không có file thì bỏ qua (dữ liệu câu hỏi không đưa lên kho chung).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parseExTest, splitExBlocks } from './extest';
import { parseCode } from './id';
import { checkQuestion, worstLevel } from './check';
import { cleanForDisplay } from './render';

const DIR = 'data/test';
if (!existsSync(DIR) || !readdirSync(DIR).some((f) => f.endsWith('.tex'))) {
  console.log('Dữ liệu thật (data/test/*.tex): không có, bỏ qua.');
} else {
  let failed = 0;
  const ok = (c: unknown, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.tex'))) {
    const blocks = splitExBlocks(readFileSync(`${DIR}/${f}`, 'utf8'));
    console.log(`Dữ liệu thật · ${f} · ${blocks.length} câu`);
    ok(blocks.length > 0, 'tách được câu từ file');

    let badId = 0, leak = 0, emptyStem = 0, hardError = 0;
    const errs: string[] = [];
    for (const b of blocks) {
      const p = parseExTest(b);
      if (p.idComment && !parseCode(p.idComment)) badId++;
      // Bỏ mã hình trước khi soi: \def bên trong tikzpicture là một phần của hình, không phải rác.
      const shown = cleanForDisplay(p.stem).replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, ' ');
      if (/\\def\b|\\newcommand|\\immini/.test(shown)) leak++;
      if (shown.replace(/\s+/g, ' ').trim().length < 5) emptyStem++;
      const issues = checkQuestion(p, b);
      if (worstLevel(issues) === 'loi') { hardError++; if (errs.length < 3) errs.push(issues.find((i) => i.level === 'loi')!.message); }
    }
    ok(badId === 0, `mọi ID đọc ngược được (${badId} sai)`);
    ok(leak === 0, `đề bài không dính \\def, \\newcommand, \\immini (${leak} câu dính)`);
    ok(emptyStem === 0, `không câu nào mất đề bài (${emptyStem} câu trống)`);
    ok(hardError === 0, `không câu nào lỗi xem trước (${hardError} câu lỗi${errs.length ? ': ' + errs[0] : ''})`);
  }
  if (failed) { console.log(`\n${failed} kiểm thử dữ liệu thật lỗi`); process.exit(1); }
}
