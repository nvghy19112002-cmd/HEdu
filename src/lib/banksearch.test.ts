// Kiểm thử ô Tìm của Ngân hàng: tìm theo số thứ tự câu (#2086).
import { parseBankQuery, queryOk } from './banksearch';

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✗ ' + msg); }
}

const hay = 'cho ham so y = x^2 2d1h1-1';

{
  const q = parseBankQuery('#2086');
  ok(q.seqs.length === 1 && q.seqs[0] === 2086 && q.words.length === 0, '#2086 ⇒ số thứ tự 2086, không thành từ thường');
  ok(queryOk(q, hay, 2086), '#2086 tìm ra câu số 2086');
  ok(!queryOk(q, hay, 12086) && !queryOk(q, hay, 208), '#2086 không ra câu 12086 hay 208');
}
{
  const q = parseBankQuery('#86');
  ok(queryOk(q, hay, 86), '#86 tìm ra câu #0086 (không cần gõ đủ số 0)');
  ok(queryOk(parseBankQuery('#0086'), hay, 86), '#0086 cũng ra câu 86');
}
{
  const q = parseBankQuery('#12 #15');
  ok(queryOk(q, hay, 12) && queryOk(q, hay, 15) && !queryOk(q, hay, 13), 'gõ nhiều số ⇒ hiện cả các câu đó');
}
{
  const q = parseBankQuery('Hàm  #2086');
  ok(q.words.join() === 'ham' && queryOk(q, hay, 2086) && !queryOk(parseBankQuery('tich #2086'), hay, 2086), 'số kèm chữ ⇒ câu phải có cả chữ đó');
}
{
  ok(parseBankQuery('2086').seqs.length === 0, 'không có # ⇒ tìm theo chữ như trước');
  ok(parseBankQuery('#abc').words[0] === '#abc', '# kèm chữ không phải số ⇒ từ thường');
  ok(queryOk(parseBankQuery('   '), hay, 1), 'ô trống ⇒ mọi câu');
}

if (failed) { console.log(`banksearch.test: ${failed} lỗi`); process.exit(1); }
console.log('banksearch.test: OK');
