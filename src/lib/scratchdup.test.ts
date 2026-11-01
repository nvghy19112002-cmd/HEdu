import { checkScratchDup } from './scratchdup';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };
const E = (stem: string, opts = '\\choice{\\True $1$}{$2$}{$3$}{$4$}') => `\\begin{ex}\n${stem}\n${opts}\n\\end{ex}`;
const S1 = 'Cho hàm số $y=x^3-3x+2$. Tìm tọa độ điểm cực đại của đồ thị hàm số đã cho trên tập số thực.';
const S2 = 'Có bao nhiêu cách chọn $3$ bạn từ một nhóm $10$ bạn để làm trực nhật tuần này?';
const S3 = 'Giải phương trình $x^2=4$ trên tập số thực và cho biết số nghiệm của phương trình đó.';

(async () => {
  const bank = [{ uid: 'u1', latex: E(S1) }, { uid: 'u2', latex: E(S2) }];
  const blocks = [
    { n: 1, text: E(S1.replace('Tìm', 'Tìm   ')) },
    { n: 2, text: E(S3) },
    { n: 3, text: E(S3) },
  ];
  const r = await checkScratchDup(blocks, bank);
  t('chạy xong', r.complete);
  t('câu trùng ngân hàng được báo kèm uid câu trong ngân hàng', r.marks.get(1)?.some((m) => m.with === 'bank' && m.other === 'u1') === true);
  t('hai câu trùng nhau trong bàn nháp báo cho nhau', r.marks.get(2)?.some((m) => m.with === 'batch' && m.other === '3') === true && r.marks.get(3)?.some((m) => m.with === 'batch' && m.other === '2') === true);
  t('chụp văn bản lúc kiểm', r.snap.get(2) === blocks[1].text);
  const r2 = await checkScratchDup([{ n: 1, text: E('Tính $2+3$ rồi cho biết kết quả cuối cùng của phép tính cộng hai số tự nhiên này.') }], bank);
  t('câu mới hoàn toàn không bị báo', r2.complete && r2.marks.size === 0);
  const r3 = await checkScratchDup(blocks, bank, { signal: { aborted: true } });
  t('huỷ giữa chừng thì không coi là "không trùng"', !r3.complete);
  if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
  console.log('\nOK');
})();
