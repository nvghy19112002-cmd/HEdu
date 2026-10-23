import { diffTokens, explainPair, tokensOfKey } from './dupdiff';
import { fingerprint } from './dup2';
import { DUP_PAIRS } from './dupfixtures';

let failed = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };
const by = Object.fromEntries(DUP_PAIRS.map((p) => [p.id, p]));
const rows = (id: string) => explainPair(fingerprint(by[id].a), fingerprint(by[id].b));
const row = (id: string, label: string) => rows(id).find((r) => r.label === label)!;
const changed = (r: { a: { changed?: boolean; t: string }[]; b: { changed?: boolean; t: string }[] }) => [...r.a.filter((x) => x.changed), ...r.b.filter((x) => x.changed)].map((x) => x.t);

console.log('Khác biệt theo ký hiệu');
{
  const d = diffTokens(tokensOfKey('w:cho\u0001m[x > 0]'), tokensOfKey('w:cho\u0001m[x < 0]'));
  ok(!d.same && changed(d).join('') === '><', 'x>0 và x<0: chỉ dấu bị đánh dấu khác');
  ok(diffTokens(tokensOfKey('w:a\u0001w:b'), tokensOfKey('w:a\u0001w:b')).same, 'giống hệt ⇒ same');
}
console.log('Khác biệt trên bộ cặp thử');
ok(row('tmp-lt', 'Đề bài').same === false && changed(row('tmp-lt', 'Đề bài')).length > 0, 'tmp-lt: phần Đề bài khác, ký hiệu khác được đánh dấu');
ok(row('tmp-fig', 'Hình').same === false, 'tmp-fig: phần Hình khác');
ok(row('same-ws', 'Đề bài').same && row('same-ws', 'Phương án 1').same, 'same-ws: đề và phương án giống');
ok(rows('conf-true').some((r) => /Phương án/.test(r.label) && !r.same), 'conf-true: phương án đáp án đúng khác được chỉ ra');
ok(rows('conf-true').filter((r) => /Phương án/.test(r.label) && !r.same).length === 2, 'conf-true: đúng hai phương án đổi dấu đúng');
ok(rows('conf-ds').some((r) => /^Ý /.test(r.label) && !r.same), 'conf-ds: ý Đ/S khác được chỉ ra');
ok(rows('conf-short').find((r) => r.label === 'Đáp án ngắn')?.same === false, 'conf-short: đáp án ngắn khác');
ok(row('same-reorder', 'Đề bài').same && rows('same-reorder').filter((r) => /Phương án/.test(r.label)).every((r) => r.same), 'same-reorder: ghép phương án theo nội dung ⇒ không báo khác dù đổi thứ tự');
ok(row('tmp-type', 'Loại câu').same === false, 'tmp-type: khác loại câu');
ok(row('same-solution', 'Lời giải').same === false, 'same-solution: lời giải khác được thấy (nhưng không làm đổi nhãn)');
ok(rows('un-1').every((r) => Array.isArray(r.a) && Array.isArray(r.b)), 'cặp không liên quan vẫn ra bảng đối chiếu');
for (const p of DUP_PAIRS) { try { explainPair(fingerprint(p.a), fingerprint(p.b)); } catch (e) { ok(false, `${p.id} gây lỗi: ${e}`); } }
ok(true, 'explainPair chạy được trên mọi cặp trong bộ thử, không ngoại lệ');

if (failed) { console.log(`\n${failed} kiểm thử dupdiff lỗi`); process.exit(1); }
console.log('dupdiff: đạt hết.');
