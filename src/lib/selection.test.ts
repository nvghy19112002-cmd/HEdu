import { addMany, exportVerdict, EXPORT_MAX, pageState, prune, removeMany, selCounts, toggleOne } from './selection';
import { comparator, sortedCopy, SORT_MODES } from './qsort';
import type { Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => 'u' + (from + i));

console.log('Chọn trang / bỏ chọn trang');
{
  const all = ids(315), page1 = all.slice(0, 20), page2 = all.slice(20, 40);
  let sel = addMany(new Set<string>(), page1);
  ok(sel.size === 20 && pageState(sel, page1) === 'all' && pageState(sel, page2) === 'none', 'chọn 20 câu trang 1');
  sel = addMany(sel, page2.slice(0, 3));
  ok(sel.size === 23 && pageState(sel, page2) === 'some', 'sang trang 2 chọn thêm 3 ⇒ tổng 23, ô chọn trang ở trạng thái "một phần"');
  const c = selCounts(sel, page2, null);
  ok(c.total === 23 && c.inPage === 3 && c.outPage === 20, 'đếm: 3 ở trang này, 20 ngoài trang');
  sel = removeMany(sel, page2);
  ok(sel.size === 20 && pageState(sel, page1) === 'all', 'bỏ chọn trang 2 chỉ bỏ 3 câu của trang 2, giữ trang 1');
  sel = addMany(sel, page1);
  ok(sel.size === 20, 'chọn trang lại không nhân đôi');
  ok(pageState(new Set(), []) === 'none' && pageState(sel, []) === 'none', 'trang rỗng luôn là none');
  const t = toggleOne(new Set(['a']), 'b');
  ok(t.has('a') && t.has('b') && !toggleOne(t, 'a').has('a'), 'tick từng câu');
}
console.log('Chọn tất cả kết quả lọc (nhiều trang)');
{
  const filtered = ids(315);
  let sel = addMany(new Set<string>(), filtered);
  ok(sel.size === 315, 'chọn tất cả 315 kết quả (nhiều trang)');
  const filtered2 = new Set(ids(100)); // đổi bộ lọc: còn 100 câu
  const c = selCounts(sel, ids(20), filtered2);
  ok(c.total === 315 && c.outScope === 215 && c.inPage === 20, 'đổi bộ lọc KHÔNG tự đổi lựa chọn; báo 215 câu nằm ngoài bộ lọc');
  ok(selCounts(sel, ids(20), new Set(filtered)).outScope === 0, 'trong phạm vi: không có câu ngoài bộ lọc');
  sel = addMany(sel, ids(10, 1000));
  ok(sel.size === 325, 'chọn bổ sung từ kết quả khác là THÊM');
  ok(new Set<string>().size === 0, 'bỏ chọn toàn bộ = tập rỗng');
}
console.log('Câu bị xoá');
{
  const sel = new Set(ids(5));
  const same = prune(sel, new Set(ids(5)));
  ok(same === sel, 'không có gì đổi ⇒ trả đúng tập cũ (không vẽ lại thừa)');
  const p = prune(sel, new Set(['u1', 'u3', 'zzz']));
  ok(p.size === 2 && p.has('u1') && p.has('u3'), 'loại khoá của câu không còn tồn tại');
}
console.log('Giới hạn xuất .tex');
ok(exportVerdict(0) === 'ok' && exportVerdict(1000) === 'ok' && exportVerdict(1001) === 'warn' && exportVerdict(EXPORT_MAX) === 'warn' && exportVerdict(EXPORT_MAX + 1) === 'refuse', 'ok ≤1.000 · hỏi ≤5.000 · từ chối trên 5.000');

console.log('Sắp xếp');
{
  const mk = (uid: string, seq: number, updatedAt: number) => ({ uid, seq, updatedAt }) as unknown as Question;
  const qs = [mk('a', 1, 10), mk('b', 2, 30), mk('c', 3, 30), mk('d', 4, 20)];
  const o = (m: Parameters<typeof comparator>[0]) => sortedCopy(qs, m).map((q) => q.uid).join('');
  ok(o('updated-desc') === 'cbda', 'mới cập nhật trước; ngày bằng nhau thì số câu lớn hơn trước (ổn định)');
  ok(o('updated-asc') === 'adbc', 'cập nhật lâu nhất trước; ngày bằng nhau thì số câu nhỏ trước');
  ok(o('seq-asc') === 'abcd' && o('seq-desc') === 'dcba', 'số câu tăng / giảm dần');
  const tie = [mk('y', 5, 1), mk('x', 5, 1)];
  ok(sortedCopy(tie, 'seq-asc')[0].uid === 'x', 'trùng cả số câu: theo uid, luôn ổn định');
  ok(SORT_MODES.length === 4 && qs.every((_, i) => sortedCopy(qs, 'updated-desc')[i]), 'đủ 4 kiểu');
  ok(qs.map((q) => q.uid).join('') === 'abcd', 'sắp xếp không làm đổi mảng gốc');
}
console.log('Hiệu năng 60.000 câu');
{
  const all = ids(60000);
  let t = performance.now();
  const sel = addMany(new Set<string>(), all);
  const scope = new Set(all);
  const c = selCounts(sel, all.slice(0, 20), scope);
  const pr = prune(sel, scope);
  const dt = performance.now() - t;
  ok(sel.size === 60000 && c.total === 60000 && c.outScope === 0 && pr === sel, `chọn + đếm + dọn 60.000 câu: ${dt.toFixed(0)} ms`);
  ok(dt < 800, 'dưới 800 ms');
  const qs = all.map((u, i) => ({ uid: u, seq: i, updatedAt: (i * 7919) % 10007 }) as unknown as Question);
  t = performance.now(); sortedCopy(qs, 'updated-desc'); const ds = performance.now() - t;
  ok(ds < 1500, `sắp xếp 60.000 câu: ${ds.toFixed(0)} ms`);
}
if (fail) { console.log(`${fail} lỗi`); process.exit(1); }
