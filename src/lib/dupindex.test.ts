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


// ---- ngân hàng cùng khuôn + cặp cài sẵn để đo "độ phủ ứng viên" so với vét cạn ----
function templated(N: number, planted: number): { qs: QLike[]; pl: { a: string; b: string; kind: string }[] } {
  let sd = 99; const r = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  const TOP = ['đạo hàm', 'tích phân', 'giới hạn', 'xác suất', 'số phức', 'mặt cầu', 'cấp số cộng', 'logarit', 'hình chóp', 'tiệm cận'];
  const mk = (a: number, b: number, c: number, t: string, verb: string, o: number[]) => {
    const v = [`$${a}$`, `$${b}$`, `$${c}$`, `$${a + b}$`];
    return `\\begin{ex}\n${verb} ${t} của hàm số $f(x)=${a}x^{${b % 5 + 2}}+${b}x+${c}$.\n\\choice${o.map((i) => `{${i === 0 ? '\\True ' : ''}${v[i]}}`).join('')}\n\\end{ex}`;
  };
  const qs: QLike[] = []; const meta: { a: number; b: number; c: number; t: string }[] = [];
  for (let i = 0; i < N; i++) { const a = 1 + Math.floor(r() * 40), b = 1 + Math.floor(r() * 40), c = Math.floor(r() * 60), t = TOP[Math.floor(r() * TOP.length)]; meta.push({ a, b, c, t }); qs.push({ uid: 'u' + i, latex: mk(a, b, c, t, 'Tính', [0, 1, 2, 3]) }); }
  const pl: { a: string; b: string; kind: string }[] = [];
  for (let i = 0; i < planted; i++) {
    const k = Math.floor(r() * N), m = meta[k], kind = ['same', 'near', 'conflict'][i % 3];
    const latex = kind === 'same' ? `\\begin{ex}\nTính ${m.t} của hàm số $f(x)=${m.a}x^{${m.b % 5 + 2}}+${m.b}x+${m.c}$.\n\\choice{$${m.b}$}{$${m.a + m.b}$}{\\True $${m.a}$}{$${m.c}$}\n\\end{ex}`
      : kind === 'near' ? mk(m.a, m.b, m.c, m.t, 'Hãy tính', [0, 1, 2, 3]) : mk(m.a, m.b, m.c, m.t, 'Tính', [1, 0, 2, 3]);
    qs.push({ uid: 'p' + i, latex }); pl.push({ a: 'u' + k, b: 'p' + i, kind });
  }
  return { qs, pl };
}
function recall(pairs: { a: string; b: string }[], pl: { a: string; b: string; kind: string }[]): number {
  const got = new Set(pairs.flatMap((p) => [p.a + '|' + p.b, p.b + '|' + p.a]));
  return pl.filter((p) => got.has(p.a + '|' + p.b)).length / Math.max(1, pl.length);
}

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


  console.log('Quét đầy đủ: trùng khớp TUYỆT ĐỐI với vét cạn mọi cặp (mọi loại, kể cả cùng mẫu / chưa đủ bằng chứng)');
  {
    const { qs: sq, pl } = templated(700, 60);
    const all = (k: string) => k !== 'unrelated';
    const ex = new Map<string, string>();
    for (let i = 0; i < sq.length; i++) for (let j = i + 1; j < sq.length; j++) {
      const k = compareLatex(sq[i].latex, sq[j].latex).kind;
      if (all(k)) ex.set(sq[i].uid + '|' + sq[j].uid, k);
    }
    const rs = await new DupIndex().scan(sq, { batch: 100, keep: all, templateCap: Infinity });
    const capped = await new DupIndex().scan(sq, { keep: all, templateCap: 50 });
    ok(capped.stats.templateTotal === [...ex.values()].filter((k) => k === 'template').length && capped.stats.templateShown === 50, 'giới hạn hiển thị cặp cùng mẫu vẫn đếm đủ tổng số');
    ok(capped.pairs.filter((p) => p.result.kind !== 'template').length === [...ex.values()].filter((k) => k !== 'template').length, 'giới hạn cùng mẫu không làm mất cặp loại khác');
    const got = new Map(rs.pairs.map((p) => [p.a + '|' + p.b, p.result.kind] as const));
    const missed = [...ex.keys()].filter((k) => !got.has(k));
    const extra = [...got.keys()].filter((k) => !ex.has(k));
    ok(ex.size >= 60, `vét cạn thấy ${ex.size} cặp (gồm ${pl.length} cặp cài sẵn)`);
    ok(missed.length === 0 && extra.length === 0, `quét đầy đủ = vét cạn (thiếu ${missed.length}, thừa ${extra.length} / ${ex.size})`);
    ok([...ex].every(([k, v]) => got.get(k) === v), 'cùng kết luận cho từng cặp');
    ok(recall(rs.pairs, pl) === 1, 'độ phủ cặp cài sẵn = 100%');
    // phạm vi: một phần câu, đối chiếu với cả kho / chỉ trong phạm vi
    const scope = new Set(sq.filter((_, i) => i % 7 === 0).map((q) => q.uid));
    for (const vsAll of [true, false]) {
      const want = [...ex.keys()].filter((k) => { const [a, b] = k.split('|'); return vsAll ? scope.has(a) || scope.has(b) : scope.has(a) && scope.has(b); });
      const r = await new DupIndex().scan(sq, { scope, vsAll, keep: all, templateCap: Infinity });
      const g = new Set(r.pairs.map((p) => [p.a, p.b].sort().join('|')));
      const w = new Set(want.map((k) => k.split('|').sort().join('|')));
      ok(g.size === w.size && [...w].every((k) => g.has(k)), `phạm vi ${scope.size} câu, ${vsAll ? 'đối chiếu cả kho' : 'trong phạm vi'}: đúng ${w.size} cặp như vét cạn (được ${g.size})`);
    }
  }
  if (process.env.DUP_BENCH) {
    const { qs: bq, pl } = templated(30000, 150);
    const rb = await new DupIndex().scan(bq, { batch: 1000 });
    const byk: Record<string, number> = {};
    for (const k of ['same', 'near', 'conflict']) byk[k] = recall(rb.pairs, pl.filter((p) => p.kind === k));
    console.log('  ℹ 30.000 câu cùng khuôn, độ phủ cặp cài sẵn theo nhãn:', JSON.stringify(byk));
    ok(Object.values(byk).every((v) => v === 1), '30.000 câu cùng khuôn: độ phủ cài sẵn 100% cho same/near/conflict');
  }

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
    console.log(`  ℹ ${n} câu: ${ms} ms, ${s.stats.comparisons} phép so (so toàn bộ cặp sẽ là ${full}), ${s.pairs.length} cặp nghi, cùng mẫu ${s.stats.templateTotal}`);
    if (n === 3000) ok(ms < 30000, '3.000 câu quét dưới 30 giây');
  }
  if (failed) { console.log(`\n${failed} kiểm thử dupindex lỗi`); process.exit(1); }
  console.log('dupindex: đạt hết.');
})();
