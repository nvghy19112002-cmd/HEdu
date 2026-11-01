import { checkScratchBlocks, needsLook, worstOf } from './scratchcheck';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

const good = '\\begin{ex}\nTính $2+3$ rồi cho biết kết quả của phép cộng.\n\\choice{\\True $5$}{$4$}{$6$}{$7$}\n\\loigiai{$2+3=5$}\n\\end{ex}';
const noTrue = '\\begin{ex}\nTính $2+3$ rồi cho biết kết quả.\n\\choice{$5$}{$4$}{$6$}{$7$}\n\\loigiai{ok}\n\\end{ex}';
const badMath = '\\begin{ex}\nTính $\\frac{1}{$ rồi cho biết.\n\\choice{\\True $5$}{$4$}{$6$}{$7$}\n\\loigiai{ok}\n\\end{ex}';

(async () => {
  const blocks = [good, noTrue, badMath].map((text, i) => ({ n: i + 1, text, line0: 1 + i * 6 }));
  const r = await checkScratchBlocks(blocks, { chunk: 1 });
  t('chạy xong, chụp văn bản từng câu', r.complete && r.snap.size === 3 && r.snap.get(2) === noTrue);
  t('câu tốt không có vấn đề nặng', !needsLook(r.issues.get(1)));
  t('thiếu \\True ⇒ cần xem', needsLook(r.issues.get(2)) && worstOf(r.issues.get(2)) === 'canh');
  t('công thức hỏng ⇒ lỗi', worstOf(r.issues.get(3)) === 'loi');
  const tiến: number[] = [];
  await checkScratchBlocks(blocks, { chunk: 2, onProgress: (d) => tiến.push(d) });
  t('báo tiến độ và kết thúc ở tổng số', tiến[tiến.length - 1] === 3);
  const sig = { aborted: false };
  const r2 = await checkScratchBlocks(blocks, { signal: sig, chunk: 1, onProgress: () => { sig.aborted = true; } });
  t('dừng giữa chừng ⇒ không coi là đã soát xong', !r2.complete);
  if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
  console.log('\nOK');
})();
