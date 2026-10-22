// Kiểm thử trên dữ liệu thật: đặt file .tex vào data/test/ rồi chạy npm test.
// Không có file thì bỏ qua (dữ liệu câu hỏi không đưa lên kho chung).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parseExTest, splitExBlocks } from './extest';
import { parseCode } from './id';
import { checkQuestion, worstLevel } from './check';
import { cleanForDisplay, renderPartsEx } from './render';

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
    const srcErr: string[] = [];
    const errs: string[] = [];
    for (const b of blocks) {
      const p = parseExTest(b);
      if (p.idComment && !parseCode(p.idComment)) badId++;
      // Bỏ mã hình trước khi soi: \def bên trong tikzpicture là một phần của hình, không phải rác.
      const shown = cleanForDisplay(p.stem).replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, ' ');
      if (/\\def\b|\\newcommand|\\immini/.test(shown)) leak++;
      if (shown.replace(/\s+/g, ' ').trim().length < 5) emptyStem++;
      const issues = checkQuestion(p, b);
      // Lỗi ngoặc/môi trường là lỗi trong mã của người dùng: được BÁO (kèm dòng), không tính là HEdu dựng sai.
      const mine = issues.filter((i) => i.level === 'loi' && !i.source);
      if (issues.some((i) => i.source)) srcErr.push(issues.find((i) => i.source)!.message);
      if (mine.length) { hardError++; if (errs.length < 3) errs.push(mine[0].message); }
    }
    // Issue #9: mọi hình trong mã phải hiện ra, và không lệnh nào bị im lặng nuốt.
    let rawFigs = 0, shownFigs = 0, unsupportedQ = 0;
    for (const b of blocks) {
      const p = parseExTest(b);
      rawFigs += (b.match(/\\begin\{tikzpicture\}/g) ?? []).length;
      shownFigs += (p.defs.match(/\\begin\{tikzpicture\}/g) ?? []).length;
      let bad = false;
      for (const piece of [p.stem, p.figure ?? '', ...p.options.map((o) => o.text), p.solution ?? '', p.shortAnswer ?? '', p.tail]) {
        const r = renderPartsEx(piece);
        shownFigs += r.figures;
        if (r.unsupported.length) bad = true;
      }
      if (bad) unsupportedQ++;
    }
    ok(shownFigs === rawFigs, `đủ hình khi xem trước: ${shownFigs}/${rawFigs}`);
    ok(unsupportedQ === 0, `không câu nào còn lệnh chưa dựng được (${unsupportedQ} câu)`);
    ok(badId === 0, `mọi ID đọc ngược được (${badId} sai)`);
    ok(leak === 0, `đề bài không dính \\def, \\newcommand, \\immini (${leak} câu dính)`);
    ok(emptyStem === 0, `không câu nào mất đề bài (${emptyStem} câu trống)`);
    if (srcErr.length) console.log(`  ℹ ${srcErr.length} câu có lỗi hoặc lưu ý trong mã nguồn (ngoặc, môi trường, thiếu \\draw; đã báo kèm dòng): ${srcErr[0]}`);
    ok(hardError === 0, `không câu nào lỗi xem trước (${hardError} câu lỗi${errs.length ? ': ' + errs[0] : ''})`);
  }
  if (failed) { console.log(`\n${failed} kiểm thử dữ liệu thật lỗi`); process.exit(1); }
}
