import { DupIndex, type QLike } from './dupindex';
import { compareLatex } from './dup2';
import { DUP_PAIRS } from './dupfixtures';

let failed = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };

// ---- ngân hàng giả lập (dữ liệu tự sinh, KHÔNG phải dữ liệu thật) ----
let seed = 12345;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const TOPICS = ['đạo hàm', 'tích phân', 'giới hạn', 'xác suất', 'số phức', 'mặt cầu', 'cấp số cộng', 'logarit', 'hình chóp', 'tiệm cận', 'đồng biến', 'cực trị', 'tổ hợp', 'vectơ', 'elip'];
const VERBS = ['Tính', 'Tìm', 'Xác định', 'Cho biết', 'Giải'];
function synth(i: number): string {
  const t = pick(TOPICS), a = 1 + Math.floor(rnd() * 90), b = 1 + Math.floor(rnd() * 90), c = Math.floor(rnd() * 400);
  const id = `${i.toString(36)}${Math.floor(rnd() * 1e6).toString(36)}`;
  const stem = `${pick(VERBS)} ${t} của hàm số $f(x)=${a}x^{${b % 5 + 2}}+${b}x+${c}$ tại điểm có mã ${id} trên đoạn $[${a},${a + b}]$.`;
  return `\\begin{ex}\n${stem}\n\\choice{\\True $${a}$}{$${b}$}{$${c}$}{$${a + b}$}\n\\end{ex}`;
}
function bank(n: number): QLike[] { seed = 777; return Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, latex: synth(i) })); }

(async () => {
  console.log('Quét ngân hàng: đúng kết quả');
  const small = bank(300);
  // cài sẵn các cặp đã biết vào cuối ngân hàng
  const planted = DUP_PAIRS.filter((p) => ['same-ws', 'conf-true', 'tmp-lt', 'near-words', 'raw-1'].includes(p.id));
  const qs: QLike[] = [...small];
  planted.forEach((p, i) => { qs.push({ uid: `pa${i}`, latex: p.a }, { uid: `pb${i}`, latex: p.b }); });
  const idx = new DupIndex();
  const r1 = await idx.scan(qs, { batch: 50 });
  for (let i = 0; i < planted.length; i++) {
    const want = compareLatex(planted[i].a, planted[i].b).kind;
    const hit = r1.pairs.find((x) => x.a === `pa${i}` && x.b === `pb${i}`);
    ok(hit?.result.kind === want, `${planted[i].id}: tìm thấy cặp cài sẵn (${want})`);
  }
  const r2 = await new DupIndex().scan(qs, { batch: 17 });
  ok(JSON.stringify(r1.pairs.map((x) => [x.a, x.b, x.result.kind])) === JSON.stringify(r2.pairs.map((x) => [x.a, x.b, x.result.kind])), 'quét hai lần (kích thước lượt khác nhau) cho cùng thứ tự kết quả');
  ok(r1.pairs.every((x) => x.a !== x.b), 'không có cặp tự so với chính nó');
  ok(new Set(r1.pairs.map((x) => x.a + '|' + x.b)).size === r1.pairs.length, 'mỗi cặp chỉ xuất hiện một lần');

  console.log('Cập nhật từng phần');
  idx.upsert('pb0', planted[0].a);
  ok(idx.related('pa0').some((h) => h.a === 'pb0' || h.b === 'pb0'), 'sau khi sửa câu, related() thấy ngay cặp mới');
  idx.remove('pb0');
  ok(!idx.related('pa0').some((h) => h.a === 'pb0' || h.b === 'pb0'), 'sau khi xoá, câu biến khỏi chỉ mục');

  console.log('Huỷ giữa chừng & tiến độ');
  const sig = { aborted: false }; let ticks = 0;
  const ra = await new DupIndex().scan(bank(1000), { batch: 100, signal: sig, onProgress: () => { if (++ticks === 3) sig.aborted = true; } });
  ok(ra.stats.aborted && ticks >= 3, 'huỷ được và có báo tiến độ');

  console.log('Hiệu năng (dữ liệu giả lập, máy chạy test này)');
  const sizes = process.env.DUP_BENCH ? [300, 3000, 30000, 60000] : [300, 3000];
  for (const n of sizes) {
    const b = bank(n);
    const t = Date.now();
    const s = await new DupIndex().scan(b, { batch: 500 });
    const ms = Date.now() - t;
    const full = (n * (n - 1)) / 2;
    console.log(`  ℹ ${n} câu: ${ms} ms, ${s.stats.comparisons} phép so (so toàn bộ cặp sẽ là ${full}), ${s.pairs.length} cặp nghi, ${s.stats.candidatesCapped} câu bị cắt ứng viên`);
    if (n === 3000) ok(s.stats.comparisons < full / 20, '3.000 câu: số phép so ít hơn 1/20 so toàn bộ cặp');
    if (n === 3000) ok(ms < 30000, '3.000 câu quét dưới 30 giây');
  }
  if (failed) { console.log(`\n${failed} kiểm thử dupindex lỗi`); process.exit(1); }
  console.log('dupindex: đạt hết.');
})();
