// Lõi sinh đề: phân bổ toàn cục, điều kiện đủ dùng, trộn phương án nguyên văn, đáp án theo phép hoán vị, dựng .tex.
import { allocate, candidatesFor, collect, countsOf, eligible, examFiles, fmtScore, keyTex, locateChoice, makeVariants, permuteChoice, refersToOthers, SCORING_2025, totalCenti, variantTex, type EffLike, type Row } from './examgen';
import { parseExTest } from './extest';
import type { Level, QType, Question } from './types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

let n = 0;
const body = (type: QType, tag: string, correct = 0) => {
  const opt = [0, 1, 2, 3].map((i) => `{${i === correct ? '\\True ' : ''}$${tag}_${i}$}`).join('\n  ');
  if (type === 'tn') return `\\begin{ex}\n  Câu ${tag}.\n  \\choice\n  ${opt}\n  \\loigiai{Lời giải ${tag} \\choice{x}}\n\\end{ex}`;
  if (type === 'ds') return `\\begin{ex}\n  Câu ${tag}.\n  \\choiceTF\n  {\\True a}\n  {b}\n  {\\True c}\n  {d}\n\\end{ex}`;
  if (type === 'tln') return `\\begin{ex}\n  Câu ${tag}.\n  \\shortans{${tag}}\n\\end{ex}`;
  return `\\begin{ex}\n  Câu ${tag}.\n\\end{ex}`;
};
const mk = (o: { type?: QType; level?: Level; chapterId?: string; lessonId?: string; formId?: string; review?: Question['review']; latex?: string; tag?: string }): Question => {
  n++;
  const type = o.type ?? 'tn';
  return { uid: `u${n}`, seq: n, latex: o.latex ?? body(type, o.tag ?? `q${n}`, n % 4), type, level: o.level ?? 'NB', tags: [], createdAt: 0, updatedAt: 0, grade: 12, chapterId: o.chapterId ?? 'c1', lessonId: o.lessonId ?? 'l1', formId: o.formId ?? 'f1', review: 'review' in o ? o.review : 'approved' };
};
const eff = (_q: Question): EffLike => ({ form: 'chua', level: 'chua', unclassified: false });
const effGv = (_q: Question): EffLike => ({ form: 'gv', level: 'gv', unclassified: false });
const row = (id: string, o: Partial<Row> & { chapterId?: string }): Row => ({ id, scope: { kind: 'chapter', id: o.chapterId ?? 'c1' }, type: 'tn', level: 'NB', count: 1, ...o });

console.log('Điều kiện đủ dùng');
{
  const a = mk({ review: 'approved' }), u = mk({ review: undefined }), f = mk({ review: 'needs_fix' });
  ok(eligible(a, eff, 'duyet') && !eligible(u, eff, 'duyet') && !eligible(f, eff, 'duyet'), 'duyệt: chỉ câu Đã duyệt');
  ok(!eligible(a, eff, 'xac-minh') && eligible(a, effGv, 'xac-minh'), 'xác minh: cần Dạng và mức độ do giáo viên xác minh');
  ok(!eligible(a, () => ({ form: 'gv', level: 'may', unclassified: false }), 'xac-minh'), 'xác minh: mức độ mới do máy thì chưa đủ');
  ok(!eligible(a, () => ({ form: 'gv', level: 'gv', unclassified: true }), 'xac-minh'), 'xác minh: câu chưa phân loại không đủ');
  ok(eligible(u, eff, 'tat-ca') && !eligible(f, eff, 'tat-ca'), 'tất cả: nhận câu chưa kiểm tra, vẫn loại “Cần sửa”');
}

console.log('Phân bổ toàn cục');
{
  // Hàng 1 nhận bất kỳ NB chương c1 hoặc bài l1; hàng 2 chỉ nhận bài l2. Tham lam theo thứ tự hàng sẽ báo thiếu giả.
  const bank = [mk({ lessonId: 'l1' }), mk({ lessonId: 'l2' }), mk({ lessonId: 'l2' })];
  const rows: Row[] = [row('r1', { scope: { kind: 'chapter', id: 'c1' }, count: 2 }), row('r2', { scope: { kind: 'lesson', id: 'l1' }, count: 1 })];
  const a = allocate(bank, rows, { policy: 'duyet', eff, seed: 1 });
  ok(a.deficit.r1 === 0 && a.deficit.r2 === 0, 'dòng chồng lấn vẫn đủ nhờ luồng cực đại (không thiếu giả)');
  ok(a.picks.r2.length === 1 && bank.find((q) => q.uid === a.picks.r2[0])!.lessonId === 'l1', 'dòng hẹp lấy đúng câu của nó');
  const all = [...a.picks.r1, ...a.picks.r2];
  ok(new Set(all).size === 3 && all.length === 3, 'mỗi câu chỉ dùng một lần');
  ok(a.pool.r1 === 3 && a.pool.r2 === 1, 'đếm kho từng dòng');
}
{
  const bank = [mk({}), mk({})];
  const a = allocate(bank, [row('r1', { count: 5 })], { policy: 'duyet', eff, seed: 2 });
  ok(a.picks.r1.length === 2 && a.deficit.r1 === 3, 'thiếu thật được báo đúng số câu');
  const b = allocate(bank, [row('r1', { count: 2, type: 'ds' })], { policy: 'duyet', eff, seed: 2 });
  ok(b.deficit.r1 === 2, 'khác loại câu thì không khớp');
}
{
  const bank = Array.from({ length: 30 }, () => mk({}));
  const r = [row('r1', { count: 5 })];
  const a1 = allocate(bank, r, { policy: 'duyet', eff, seed: 7 }), a2 = allocate(bank, r, { policy: 'duyet', eff, seed: 7 }), a3 = allocate(bank, r, { policy: 'duyet', eff, seed: 8 });
  ok(JSON.stringify(a1) === JSON.stringify(a2), 'cùng hạt giống ⇒ cùng kết quả');
  ok(JSON.stringify(a1.picks) !== JSON.stringify(a3.picks), 'hạt giống khác ⇒ chọn khác');
  const lock = bank[29].uid;
  const a4 = allocate(bank, r, { policy: 'duyet', eff, seed: 9, locked: { r1: [lock] } });
  ok(a4.picks.r1[0] === lock && a4.picks.r1.length === 5 && new Set(a4.picks.r1).size === 5, 'câu khóa được giữ và đủ số lượng');
  const a5 = allocate(bank, r, { policy: 'duyet', eff, seed: 9, locked: { r1: [lock] }, exclude: new Set([lock]) });
  ok(!a5.picks.r1.includes(lock), 'câu bị loại trừ không được giữ dù đã khóa');
  const lockBad = mk({ type: 'ds' });
  const a6 = allocate([...bank, lockBad], r, { policy: 'duyet', eff, seed: 9, locked: { r1: [lockBad.uid] } });
  ok(!a6.picks.r1.includes(lockBad.uid), 'câu khóa không còn khớp dòng thì bị bỏ');
  const raw = mk({ review: undefined }), broken = mk({ review: 'needs_fix' });
  const a7 = allocate([...bank, raw, broken], r, { policy: 'duyet', eff, seed: 9, locked: { r1: [raw.uid, broken.uid] } });
  ok(a7.picks.r1.includes(raw.uid) && !a7.picks.r1.includes(broken.uid), 'giáo viên khóa/chọn tay câu chưa duyệt thì giữ; câu “Cần sửa” vẫn bị loại');
}
{
  const bank = Array.from({ length: 40 }, (_, i) => mk({ lessonId: `l${i % 4}`, level: (['NB', 'TH', 'VD', 'VDC'] as Level[])[i % 4] }));
  const rows: Row[] = [
    row('a', { scope: { kind: 'chapter', id: 'c1' }, level: 'any', count: 6 }),
    row('b', { scope: { kind: 'lesson', id: 'l0' }, level: 'NB', count: 4 }),
    row('c', { scope: { kind: 'lesson', id: 'l1' }, level: 'TH', count: 4 }),
  ];
  const t0 = Date.now();
  const a = allocate(bank, rows, { policy: 'duyet', eff, seed: 3 });
  ok(Object.values(a.deficit).every((x) => x === 0) && new Set(Object.values(a.picks).flat()).size === 14, 'nhiều dòng chồng lấn: đủ và không trùng');
  const big = Array.from({ length: 60000 }, (_, i) => mk({ lessonId: `l${i % 40}`, level: (['NB', 'TH', 'VD'] as Level[])[i % 3] }));
  const rows2 = Array.from({ length: 24 }, (_, i) => row(`r${i}`, { scope: { kind: 'lesson', id: `l${i}` }, level: (['NB', 'TH', 'VD'] as Level[])[i % 3], count: 5 }));
  const t1 = Date.now();
  const b = allocate(big, rows2, { policy: 'duyet', eff, seed: 4 });
  ok(Object.values(b.deficit).every((x) => x === 0), 'kho 60.000 câu, 24 dòng: đủ');
  ok(Date.now() - t1 < 3000, `kho 60.000 câu phân bổ dưới 3 giây (${Date.now() - t1} ms)`);
  void t0;
  const cand = candidatesFor(bank, rows[2], { policy: 'duyet', eff }, new Set(a.picks.c));
  ok(cand.every((q) => q.lessonId === 'l1' && q.level === 'TH' && !a.picks.c.includes(q.uid)), 'ứng viên thay thế đúng dòng và chưa dùng');
}

console.log('Trộn phương án nguyên văn');
{
  const src = `\\begin{ex}%[12D1T1-1]\n  % ghi chú \\choice{x}{y}{z}{w}\n  Tính $\\frac{1}{2}$ 50\\%.\n  \\choice\n  {\\True $1$}\n  {$2$ % chú thích {\n}\n  {$\\{3\\}$}\n  {$4$}\n  \\loigiai{Chọn A. \\choice{1}{2}{3}{4}}\n\\end{ex}`;
  const loc = locateChoice(src);
  ok(loc.ok && loc.loc.correct === 0 && loc.loc.spans.length === 4, 'tìm đúng 4 nhóm, bỏ qua \\choice trong chú thích và lời giải');
  if (loc.ok) {
    const out = permuteChoice(src, loc.loc, [2, 0, 3, 1]);
    const a = loc.loc.spans.map(([x, y]) => src.slice(x, y));
    ok(out.includes(a[2] + '\n  ' + a[0]) || out.indexOf(a[2]) < out.indexOf(a[0]), 'phương án đổi chỗ');
    ok(out.replace(/\{[^]*?\}/g, '') !== undefined && out.length === src.length, 'độ dài giữ nguyên (chỉ hoán vị)');
    ok(out.startsWith(src.slice(0, loc.loc.spans[0][0])) && out.endsWith(src.slice(loc.loc.spans[3][1])), 'phần trước và sau \\choice giữ nguyên từng byte');
    const back = (() => { const l2 = locateChoice(out); return l2.ok ? permuteChoice(out, l2.loc, [1, 3, 0, 2]) : ''; })();
    ok(back === src, 'hoán vị ngược khôi phục đúng bản gốc');
    ok(permuteChoice(src, loc.loc, [0, 1, 2, 3]) === src, 'hoán vị đồng nhất không đổi byte');
  }
  ok(!locateChoice('\\begin{ex}\nA\n\\choice{\\True 1}{2}{3}\n\\end{ex}').ok, 'chỉ 3 phương án ⇒ không trộn');
  ok(!locateChoice('\\begin{ex}\nA\n\\choice{1}{2}{3}{4}\n\\end{ex}').ok, 'chưa có \\True ⇒ không trộn');
  ok(!locateChoice('\\begin{ex}\nA\n\\choice{\\True 1}{\\True 2}{3}{4}\n\\end{ex}').ok, 'hai \\True ⇒ không trộn');
  ok(!locateChoice('\\begin{ex}\nA \\choice{\\True 1}{2}{3}{4}\n\\choice{1}{2}{3}{4}\n\\end{ex}').ok, 'hai \\choice ở ngoài lời giải ⇒ không trộn');
  ok(!locateChoice(body('ds', 'x')).ok, 'câu đúng/sai (\\choiceTF) không bị coi là \\choice');
  ok(locateChoice('\\begin{ex}\nA\n\\choice[2]{\\True 1}{2}{3}{4}\n\\end{ex}').ok, 'chấp nhận \\choice có tham số [ ]');
  ok(!locateChoice('\\begin{ex}\nA\n\\choice{\\True Cả A và B đúng}{Chỉ A}{Chỉ B}{Không có}\n\\end{ex}').ok, '“Cả A và B đúng” ⇒ giữ thứ tự');
  ok(refersToOthers(['Tất cả các phương án trên']) !== null && refersToOthers(['$x=1$', 'Hàm số đồng biến']) === null, 'nhận diện phương án nhắc phương án khác');
}

console.log('Biến thể và đáp án');
{
  const bank = Array.from({ length: 12 }, (_, i) => mk({ type: 'tn', latex: body('tn', `t${i}`, i % 4) }));
  const ds = [mk({ type: 'ds', tag: 'd1' }), mk({ type: 'ds', tag: 'd2' })];
  const tl = [mk({ type: 'tln', tag: 'k1' })];
  const picked = collect([row('r', {})], { r: [] }, new Map());
  ok(countsOf(picked).p1 === 0, 'không chọn gì ⇒ đề rỗng');
  const pk = { p1: bank, p2: ds, p3: tl, p4: [] };
  const vs = makeVariants(pk, { count: 4, firstCode: 101, shuffleQuestions: true, shuffleOptions: true, seed: 11, keepFirstOriginal: true });
  ok(vs.map((v) => v.code).join() === '101,102,103,104', 'mã đề liên tiếp');
  ok(vs[0].parts.p1.map((s) => s.q.uid).join() === bank.map((q) => q.uid).join() && vs[0].parts.p1.every((s) => s.latex === s.q.latex && !s.shuffled), 'mã đầu giữ thứ tự và nguyên văn');
  let allMatch = true, anyMoved = false, same = true;
  for (const v of vs) for (const s of v.parts.p1) {
    const p = parseExTest(s.latex);
    const k = p.options.findIndex((o) => o.correct);
    if (LETTERS(k) !== s.key) allMatch = false;
    if (s.shuffled) anyMoved = true;
    if (s.latex !== s.q.latex && !s.shuffled) same = false;
  }
  ok(allMatch, 'đáp án từng mã khớp với \\True trong chính văn bản đã trộn');
  ok(anyMoved && same, 'có câu được trộn, cờ shuffled đúng');
  ok(vs.slice(1).some((v) => v.parts.p1.map((s) => s.q.uid).join() !== bank.map((q) => q.uid).join()), 'các mã sau đảo thứ tự câu');
  const again = makeVariants(pk, { count: 4, firstCode: 101, shuffleQuestions: true, shuffleOptions: true, seed: 11, keepFirstOriginal: true });
  ok(JSON.stringify(vs.map((v) => v.parts.p1.map((s) => s.latex))) === JSON.stringify(again.map((v) => v.parts.p1.map((s) => s.latex))), 'cùng hạt giống ⇒ tái hiện đúng từng mã');
  ok(vs[0].parts.p2[0].key === 'ĐSĐS' && vs[0].parts.p3[0].key === 'k1', 'đáp án phần II và III');
  const noshuf = makeVariants(pk, { count: 2, firstCode: 1, shuffleQuestions: false, shuffleOptions: false, seed: 1, keepFirstOriginal: false });
  ok(noshuf[1].parts.p1.every((s) => s.latex === s.q.latex), 'tắt trộn ⇒ mọi mã nguyên văn');
  const odd = mk({ type: 'tn', latex: '\\begin{ex}\nA\n\\choice{\\True Cả A và B}{x}{y}{z}\n\\end{ex}' });
  const v2 = makeVariants({ p1: [odd], p2: [], p3: [], p4: [] }, { count: 2, firstCode: 1, shuffleQuestions: true, shuffleOptions: true, seed: 1, keepFirstOriginal: false });
  ok(v2[0].parts.p1[0].latex === odd.latex && /không trộn/.test(v2[0].parts.p1[0].note ?? '') && v2[0].parts.p1[0].key === 'A', 'câu không nhận diện chắc: giữ nguyên, có ghi chú, đáp án vẫn đúng');
  const bad = mk({ type: 'tn', latex: '\\begin{ex}\nA\n\\choice{1}{2}{3}{4}\n\\end{ex}' });
  const v3 = makeVariants({ p1: [bad], p2: [], p3: [], p4: [] }, { count: 1, firstCode: 1, shuffleQuestions: false, shuffleOptions: false, seed: 1, keepFirstOriginal: false });
  ok(v3[0].parts.p1[0].key === '?', 'thiếu đáp án ⇒ dấu ? chứ không đoán');

  console.log('Dựng .tex');
  const info = { dept: 'SỞ GD&ĐT', school: 'THPT A_B', title: 'Kiểm tra 50%', subject: 'Môn: Toán 12', minutes: 90, group: '', note: '' };
  const t = variantTex(info, vs[1]);
  ok(t.includes('\\def\\made{102}') && t.includes('\\def\\socaulc{12}') && t.includes('\\def\\socauds{2}') && t.includes('\\def\\socaukq{1}'), 'khai báo mã đề và số câu từng phần');
  ok(t.includes('THPT A\\_B') && t.includes('Kiểm tra 50\\%'), 'ký tự đặc biệt trong thông tin đề được thoát');
  ok(t.indexOf('\\caulc') < t.indexOf('\\cauds') && t.indexOf('\\cauds') < t.indexOf('\\caukq') && !t.includes('\\cautl'), 'thứ tự phần; phần rỗng không in');
  ok(vs[1].parts.p1.every((s) => t.includes(s.latex)), 'mọi câu có mặt nguyên văn trong tệp');
  ok(!/(?<!mbox)\{\}/.test(t.split('\n').find((l) => l.startsWith('\\begin{name}')) ?? ''), 'tham số rỗng của môi trường name được thay bằng hộp rỗng');
  ok(t.trimEnd().endsWith('\\zlabel{\\made-lastpage}'), 'có nhãn trang cuối cho chân trang “Trang x/y”');
  const f = examFiles(info, vs, { withKeys: true });
  ok(f.map((x) => x.path).join() === 'main.tex,de-101.tex,de-102.tex,de-103.tex,de-104.tex,dapan.tex', 'bộ tệp: main, từng mã, đáp án');
  ok(f[0].text.includes('\\input{khaibaochung}') && f[0].text.includes('\\input{de-104}') && f[0].text.includes('\\input{dapan}') && !/\n\n\n/.test(f[0].text), 'main.tex gọi khaibaochung, các mã và bảng đáp án');
  ok(!examFiles(info, vs, { withKeys: false }).some((x) => x.path === 'dapan.tex'), 'tắt bảng đáp án ⇒ không có dapan.tex');
  ok(keyTex(vs[0]).includes('MÃ ĐỀ 101') && keyTex(vs[0]).includes('Đáp án &'), 'bảng đáp án có tiêu đề mã');
}

console.log('Điểm');
ok(totalCenti({ p1: 12, p2: 4, p3: 6, p4: 0 }, SCORING_2025) === 1000 && fmtScore(1000) === '10', 'cấu trúc 2025 đủ 10 điểm, không sai số thực');
ok(fmtScore(25) === '0,25' && fmtScore(1075) === '10,75', 'định dạng điểm kiểu Việt Nam');

function LETTERS(k: number) { return 'ABCD'[k] ?? '?'; }
if (fail) process.exit(1);
console.log('examgen: đạt hết.');
