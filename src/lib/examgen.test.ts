// Lõi sinh đề: phân bổ toàn cục, điều kiện đủ dùng, trộn phương án nguyên văn, đáp án theo phép hoán vị, dựng .tex.
import { createHash } from 'node:crypto';
import { sourceHashes, specJson, allocate, candidatesFor, checkVariants, collect, countsOf, dsPoints, eligible, examFiles, MAIN_HEAD, hasControlChars, reconcile, fmtScore, keyTex, locateChoice, makeVariants, permuteChoice, refersToOthers, SCORING_2025, totalCenti, variantTex, type EffLike, type Row } from './examgen';
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
  const bad = mk({ latex: '\x08egin{ex}\n x\n\\choice{\\True 1}{2}{3}{4}\n\\end{ex}' });
  ok(hasControlChars(bad) && !hasControlChars(a) && !eligible(bad, eff, 'tat-ca') && !eligible(bad, eff, 'duyet'), 'câu có ký tự điều khiển lạ bị loại ở mọi chính sách');
  const a8 = allocate([bad], [row('r1', {})], { policy: 'tat-ca', eff, seed: 1, locked: { r1: [bad.uid] } });
  ok(a8.picks.r1.length === 0 && a8.deficit.r1 === 1, 'câu có ký tự lạ không vào đề kể cả khi bị khóa');
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
  // Kho THIẾU: 2 câu lớp 12 (một ở Dạng f9) cho 3 ô "Cả lớp 12" + 1 ô Dạng f9. Mọi cách chia đều chỉ được 2 câu,
  // nhưng câu duy nhất của Dạng f9 phải về ô Dạng f9, không bị ô "Cả lớp" lấy mất (lỗi thấy trên màn Tạo đề).
  const bank = [mk({ formId: 'f9' }), mk({})];
  const gs = ['g1', 'g2', 'g3'].map((id) => row(id, { scope: { kind: 'grade', id: '12' } })), fr = row('f', { scope: { kind: 'form', id: 'f9' } });
  let good = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const a = allocate(bank, seed % 2 ? [fr, ...gs] : [...gs, fr], { policy: 'duyet', eff, seed });
    if (a.picks.f[0] === bank[0].uid && Object.values(a.picks).flat().length === 2) good++;
  }
  ok(good === 20, 'kho thiếu: ô phạm vi hẹp (Dạng) được cấp câu trước ô cả lớp, tổng số câu vẫn tối đa');
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
  ok(!a7.picks.r1.includes(raw.uid) && !a7.picks.r1.includes(broken.uid), 'HỒI QUY: câu khóa chưa duyệt KHÔNG lách được chính sách “Đã duyệt”; “Cần sửa” bị loại');
  ok(a7.lost.some((l) => l.uid === raw.uid && l.why === 'chua-dat-chinh-sach') && a7.lost.some((l) => l.uid === broken.uid && l.why === 'can-sua'), 'câu khóa bị loại được báo kèm nguyên nhân, không biến mất âm thầm');
  const a7b = allocate([...bank, raw, broken], r, { policy: 'duyet', eff, seed: 9, locked: { r1: [raw.uid, broken.uid] }, exceptions: new Set([raw.uid, broken.uid]) });
  ok(a7b.picks.r1.includes(raw.uid) && !a7b.picks.r1.includes(broken.uid) && a7b.lost.length === 1 && a7b.lost[0].why === 'can-sua', 'ngoại lệ giáo viên xác nhận cho phép câu chưa duyệt nhưng không bao giờ cho “Cần sửa”');
  const ctl = mk({ latex: '\x08egin{ex}\n x\n\\choice{\\True 1}{2}{3}{4}\n\\end{ex}' });
  const a7c = allocate([...bank, ctl], r, { policy: 'tat-ca', eff, seed: 9, locked: { r1: [ctl.uid, 'khong-co-uid'] }, exceptions: new Set([ctl.uid]) });
  ok(a7c.lost.some((l) => l.uid === ctl.uid && l.why === 'ky-tu-la') && a7c.lost.some((l) => l.uid === 'khong-co-uid' && l.why === 'khong-con'), 'ký tự lạ không lách được kể cả có ngoại lệ; câu khóa đã xóa khỏi Ngân hàng được báo');
  const mismatched = mk({ type: 'ds' });
  const a7d = allocate([...bank, mismatched], r, { policy: 'tat-ca', eff, seed: 9, locked: { r1: [mismatched.uid] }, exceptions: new Set([mismatched.uid]) });
  ok(a7d.lost.some((l) => l.uid === mismatched.uid && l.why === 'khong-khop-dong'), 'câu khóa không còn khớp dòng được báo');
  const eight = allocate(bank, [row('r1', { count: 1 })], { policy: 'duyet', eff, seed: 9, locked: { r1: [bank[0].uid, bank[1].uid] } });
  ok(eight.lost.some((l) => l.why === 'du-so-cau'), 'hạ số câu dưới số câu khóa cũng được báo'); 
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
  ok(f.map((x) => x.path).join() === 'main.tex,de-101.tex,main-101.tex,de-102.tex,main-102.tex,de-103.tex,main-103.tex,de-104.tex,main-104.tex,dapan.tex,main-dapan.tex', 'bộ tệp: main gộp, de-<mã> và main-<mã> từng mã, đáp án cho giáo viên');
  const noKey = examFiles(info, vs, { withKeys: false });
  ok(noKey.every((x) => !/dapan/.test(x.path)) && noKey.length === 9, 'tắt tệp đáp án ⇒ không có dapan.tex và main-dapan.tex');
  const stu = f.filter((x) => /^main(-\d+)?\.tex$/.test(x.path));
  ok(stu.length === 5 && stu.every((x) => !/dapan|\\anloigiai\n|\\loigiai|\\True/.test(x.text.replace('%\\anloigiai', ''))), 'HỒI QUY D2: mọi tệp chính của PDF đề (gộp và từng mã) không chèn bảng đáp án, không bật lời giải');
  ok(f.find((x) => x.path === 'main-102.tex')!.text === `${MAIN_HEAD}\n\\input{de-102}\n\\end{document}\n`, 'main-<mã>.tex đúng khung (khớp derive_main ở Rust)');
  ok(f.find((x) => x.path === 'main-dapan.tex')!.text.includes('\\input{dapan}') && f.find((x) => x.path === 'dapan.tex')!.text.includes('Đáp án &'), 'bảng đáp án chỉ ở tệp dành cho giáo viên');
  ok(f[0].text.includes('\\input{khaibaochung}') && f[0].text.includes('\\input{de-104}') && !f[0].text.includes('dapan') && !/\n\n\n/.test(f[0].text), 'main.tex gộp gọi khaibaochung và các mã, KHÔNG gọi bảng đáp án');
  ok(!examFiles(info, vs, { withKeys: false }).some((x) => x.path === 'dapan.tex'), 'tắt bảng đáp án ⇒ không có dapan.tex');
  ok(keyTex(vs[0]).includes('MÃ ĐỀ 101') && keyTex(vs[0]).includes('Đáp án &'), 'bảng đáp án có tiêu đề mã');
}

console.log('Kiểm tra trước khi xuất');
{
  const mkTn = (tag: string, c: number) => mk({ type: 'tn', latex: body('tn', tag, c) });
  const qs = [mkTn('a', 0), mkTn('b', 1), mkTn('c', 2)];
  const ds = [mk({ type: 'ds', tag: 'd1' })];
  const sa = [mk({ type: 'tln', tag: 'k1' })];
  const pk = { p1: qs, p2: ds, p3: sa, p4: [] };
  const o = { count: 3, firstCode: 101, shuffleQuestions: true, shuffleOptions: true, seed: 3, keepFirstOriginal: true };
  const vs = makeVariants(pk, o);
  ok(checkVariants(vs).length === 0, 'đề sạch: không có vấn đề đáp án');
  const noAns = mk({ type: 'tln', latex: '\\begin{ex}\n Câu không đáp số.\n\\end{ex}' });
  const v1 = makeVariants({ ...pk, p3: [noAns] }, o);
  const i1 = checkVariants(v1);
  ok(i1.length === 3 && i1.every((i) => i.kind === 'thieu-dap-an' && i.uid === noAns.uid), 'HỒI QUY: đáp số trả lời ngắn không xác định ⇒ mỗi mã đều báo thiếu đáp án');
  const badTn = mk({ type: 'tn', latex: '\\begin{ex}\n A\n\\choice{1}{2}{3}{4}\n\\end{ex}' });
  ok(checkVariants(makeVariants({ ...pk, p1: [...qs, badTn] }, o)).some((i) => i.kind === 'thieu-dap-an' && i.uid === badTn.uid), 'HỒI QUY: câu trắc nghiệm thiếu \\True ⇒ đáp án “?” bị bắt');
  const twoTrue = mk({ type: 'tn', latex: '\\begin{ex}\n A\n\\choice{\\True 1}{\\True 2}{3}{4}\n\\end{ex}' });
  ok(checkVariants(makeVariants({ ...pk, p1: [...qs, twoTrue] }, o)).length > 0, 'hai \\True ⇒ bị bắt');
  const tam = structuredClone(vs);
  tam[1].parts.p1[0] = { ...tam[1].parts.p1[0], key: tam[1].parts.p1[0].key === 'A' ? 'B' : 'A' };
  ok(checkVariants(tam).some((i) => i.kind === 'dap-an-mau-thuan' && i.code === '102'), 'đáp án bị sửa lệch với văn bản ⇒ mâu thuẫn');
  const tam2 = structuredClone(vs);
  tam2[2].parts.p1[0] = { ...tam2[2].parts.p1[0], latex: tam2[0].parts.p1.find((s) => s.q.uid === tam2[2].parts.p1[0].q.uid)!.latex.replace('\\True ', '').replace('{', '{\\True ') };
  ok(checkVariants(tam2).length > 0, 'phương án đúng khác giữa các mã ⇒ bị bắt');

  const rows: Row[] = [row('r1', { count: 3 }), row('r2', { type: 'ds', level: 'any', count: 1 }), row('r3', { type: 'tln', level: 'any', count: 1 })];
  const bank = [...qs, ...ds, ...sa];
  const alloc = allocate(bank, rows, { policy: 'duyet', eff, seed: 1 });
  const picked = collect(rows, alloc.picks, new Map(bank.map((q) => [q.uid, q])));
  const vv = makeVariants(picked, o);
  ok(reconcile(rows, alloc, picked, vv, SCORING_2025).length === 0, 'tổng số câu, loại, điểm khớp ma trận ⇒ không có chênh lệch');
  const miss = structuredClone(vv);
  miss[1].parts.p1.pop();
  ok(reconcile(rows, alloc, picked, miss, SCORING_2025).some((i) => i.kind === 'tong-lech' && i.code === '102'), 'một mã thiếu câu ⇒ báo tổng lệch');
  const wrongPart = structuredClone(vv);
  wrongPart[0].parts.p2.push(wrongPart[0].parts.p1.pop()!);
  ok(reconcile(rows, alloc, picked, wrongPart, SCORING_2025).length > 0, 'câu nằm sai phần ⇒ báo');
  const short = allocate(bank, [row('r1', { count: 9 })], { policy: 'duyet', eff, seed: 1 });
  ok(reconcile([row('r1', { count: 9 })], short, collect([row('r1', { count: 9 })], short.picks, new Map(bank.map((q) => [q.uid, q]))), [], SCORING_2025).some((i) => i.kind === 'thieu-cau'), 'thiếu câu so với ma trận ⇒ báo');
}

console.log('Đổi câu không đổi nguồn và không làm mất ánh xạ đáp án');
{
  const bank = Array.from({ length: 6 }, (_, i) => mk({ type: 'tn', latex: body('tn', `s${i}`, i % 4) }));
  const before = JSON.stringify(bank);
  const rows = [row('r1', { count: 3 })];
  const a = allocate(bank, rows, { policy: 'duyet', eff, seed: 4 });
  const old = a.picks.r1[1];
  const cand = candidatesFor(bank, rows[0], { policy: 'duyet', eff }, new Set(a.picks.r1));
  const to = cand[0].uid;
  const a2 = allocate(bank, rows, { policy: 'duyet', eff, seed: 4, locked: { r1: [...a.picks.r1.filter((u) => u !== old), to] }, exclude: new Set([old]) });
  ok(a2.picks.r1.includes(to) && !a2.picks.r1.includes(old) && a2.picks.r1.length === 3, 'câu mới thay đúng câu cũ, đủ số câu');
  const pk = collect(rows, a2.picks, new Map(bank.map((q) => [q.uid, q])));
  const vs = makeVariants(pk, { count: 3, firstCode: 1, shuffleQuestions: true, shuffleOptions: true, seed: 4, keepFirstOriginal: true });
  ok(checkVariants(vs).length === 0 && reconcile(rows, a2, pk, vs, SCORING_2025).length === 0, 'sau khi đổi câu, đáp án mọi mã vẫn khớp và tổng vẫn đúng');
  ok(JSON.stringify(bank) === before, 'đổi câu và trộn không sửa câu nguồn trong Ngân hàng');
}

console.log('Nhận diện khi trộn (ca khó)');
{
  const tikz = '\\begin{ex}\n Hình\n\\begin{tikzpicture}\\node{\\choice{a}{b}{c}{d}};\\end{tikzpicture}\n\\choice{\\True 1}{2}{3}{4}\n\\end{ex}';
  const t = locateChoice(tikz);
  ok(t.ok && t.loc.correct === 0, 'chữ \\choice bên trong TikZ không bị nhầm với \\choice thật');
  ok(!locateChoice('\\begin{ex}\n A\n\\choice{\\True Cả A, B đều đúng}{x}{y}{z}\n\\end{ex}').ok, 'tham chiếu “A, B” giữa các phương án ⇒ không trộn');
  ok(!locateChoice('\\begin{ex}\n A\n\\choice{\\True 1}{Cả ba phương án trên}{y}{z}\n\\end{ex}').ok, '“phương án trên” ⇒ không trộn');
  ok(!locateChoice('\\begin{ex}\n A\n\\choice{\\True 1}{2}{3}{4}\n\\choice{1}{2}{3}{4}\n\\end{ex}').ok, 'nhiều \\choice ⇒ không trộn');
  ok(!locateChoice('\\begin{ex}\n A\n\\choice{1}{2}{3}{4}\n\\end{ex}').ok && !locateChoice('\\begin{ex}\n A\n\\choice{\\True 1}{\\True 2}{3}{4}\n\\end{ex}').ok, '\\True thiếu hoặc lặp ⇒ không trộn');
}

console.log('Điểm Đúng/Sai theo số ý đúng');
ok([0, 1, 2, 3, 4].map(dsPoints).join() === '0,10,25,50,100', '1 ý 0,1; 2 ý 0,25; 3 ý 0,5; 4 ý 1,0 (điểm tối đa của câu là 1,0)');
ok(SCORING_2025.p2 === dsPoints(4), 'điểm tối đa câu Đúng/Sai bằng điểm khi đúng cả 4 ý');

console.log('Dấu vân tệp nguồn (để bổ sung tệp chính cho đề cũ)');
{
  const files = [{ path: 'main.tex', text: 'a' }, { path: 'de-101.tex', text: 'Đề tiếng Việt\n' }, { path: 'main-101.tex', text: 'x' }, { path: 'dapan.tex', text: 'k' }];
  const h = await sourceHashes(files);
  ok(Object.keys(h).join() === 'main.tex,de-101.tex', 'chỉ main.tex và de-<mã>.tex có dấu vân');
  ok(h['de-101.tex'] === createHash('sha256').update('Đề tiếng Việt\n', 'utf8').digest('hex'), 'SHA-256 theo UTF-8, khớp công cụ độc lập');
  const j = JSON.parse(specJson({ info: { dept: '', school: '', group: '', title: 'T', subject: 'S', minutes: 1, note: '' }, rows: [], policy: 'duyet', seed: 1, scoring: SCORING_2025, variants: [], at: 'x', fileHashes: h }));
  ok(j.dauVanTep['main.tex'] === h['main.tex'] && j.v === 1, 'hedu-de.json ghi dấu vân từng tệp nguồn');
  ok(!('dauVanTep' in JSON.parse(specJson({ info: { dept: '', school: '', group: '', title: 'T', subject: 'S', minutes: 1, note: '' }, rows: [], policy: 'duyet', seed: 1, scoring: SCORING_2025, variants: [], at: 'x' }))), 'không truyền thì không ghi (tương thích)');
}

console.log('Điểm');
ok(totalCenti({ p1: 12, p2: 4, p3: 6, p4: 0 }, SCORING_2025) === 1000 && fmtScore(1000) === '10', 'cấu trúc 2025 đủ 10 điểm, không sai số thực');
ok(fmtScore(25) === '0,25' && fmtScore(1075) === '10,75', 'định dạng điểm kiểu Việt Nam');

function LETTERS(k: number) { return 'ABCD'[k] ?? '?'; }
if (fail) process.exit(1);
console.log('examgen: đạt hết.');
