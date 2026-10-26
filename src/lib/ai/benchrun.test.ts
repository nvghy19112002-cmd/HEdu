import { buildDefault, indexOf } from '../taxonomy';
import { questionCode } from '../id';
import { locationOfForm } from '../taxpath';
import { formsOfGrade } from './tasks/ganid';
import { compareText, composition, GROUP_LABEL, idReadScore, leakFreeBank, MAX_CASES, parseBenchFile, reportOf, reportText, runBench } from './benchrun';
import type { Question } from '../types';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const g = globalThis as unknown as { window?: unknown };

const tax = buildDefault();
const ix = indexOf(tax);
const F = formsOfGrade(tax, 12).map((f) => f.formId);
const codeOf = (formId: string) => questionCode(locationOfForm(ix, formId)!, 'TH');
const mkItem = (n: number, extra: Record<string, unknown> = {}) => ({ id: `c${n}`, latex: `\\begin{ex}CASE-${n} nội dung ${n}\\loigiai{x}\\end{ex}`, truth: codeOf(F[n % 7]), groups: ['tinh-toan'], ...extra });

console.log('Tệp nhãn');
{
  const file = JSON.stringify({ items: [
    mkItem(1), mkItem(2, { groups: ['ly-thuyet'] }),
    { id: 'c3', latex: '\\begin{ex}CASE-3 không lời giải\\end{ex}', truth: null, grade: 12 },
    mkItem(1), // trùng id
    { id: 'c5', latex: '', truth: null, grade: 12 },
    { id: 'c6', latex: 'x', truth: '9Z9Z9-9', grade: 12 },
    { id: 'c7', latex: 'x', truth: null },
    { id: 'c8', latex: 'x'.repeat(7000), truth: null, grade: 12 },
  ] });
  const p = parseBenchFile(file, tax);
  ok(p.cases.length === 3 && p.problems.length === 5, 'nhận 3 câu hợp lệ, báo 5 mục lỗi (trùng id, trống, nhãn sai, thiếu lớp, quá dài)');
  const c3 = p.cases.find((c) => c.id === 'c3')!;
  ok(c3.truth === null && c3.grade === 12 && c3.groups.includes('thieu-can-cu') && c3.groups.includes('khong-loi-giai'), 'nhãn null ⇒ nhóm "thiếu căn cứ"; không có \\loigiai ⇒ "không lời giải"');
  ok(p.cases.find((c) => c.id === 'c1')!.truth === F[1] && p.cases.find((c) => c.id === 'c1')!.groups.includes('co-loi-giai'), 'ID6 đổi đúng sang Dạng; có \\loigiai ⇒ "có lời giải"');
  ok(parseBenchFile('không phải json', tax).cases.length === 0 && parseBenchFile('{"x":1}', tax).problems.length === 1, 'tệp hỏng/sai khuôn ⇒ không có câu, có thông báo');
  const big = parseBenchFile(JSON.stringify({ items: Array.from({ length: MAX_CASES + 20 }, (_, i) => mkItem(i)) }), tax);
  ok(big.cases.length === MAX_CASES && big.problems.some((x) => /tối đa/.test(x)), `tối đa ${MAX_CASES} câu`);
  const comp = composition(p.cases);
  ok(!comp.enough && comp.missing.includes(GROUP_LABEL['dang-gan-nhau']), 'cho biết bộ chưa đủ 100 câu và còn thiếu nhóm nào');
}

console.log('Chạy đo với AI giả lập (không gọi mạng)');
const sent: string[] = [];
let mode: 'ok' | 'timeout2' | 'quota2' = 'ok';
g.window = { __TAURI__: {
  core: { async invoke(cmd: string, args: { req: { user: string; model: string } }) {
    if (cmd !== 'ai_run') throw new Error('lệnh lạ');
    sent.push(args.req.user);
    if (mode === 'timeout2' && sent.length === 2) throw { kind: 'timeout', message: 'quá lâu', retryAfterSecs: null };
    if (mode === 'quota2' && sent.length === 2) throw { kind: 'quota_day', message: 'hết lượt', retryAfterSecs: null };
    const qs = [...args.req.user.matchAll(/<cau_hoi id="(q\d+)">\n([\s\S]*?)(?=<cau_hoi|$)/g)];
    const results = qs.map(([, id, body]) => {
      const n = Number(/CASE-(\d+)/.exec(body)![1]);
      const truth = F[n % 7];
      const k = n % 5;
      if (k === 3) return { id, form_id: null, confidence: 'low', reason: 'chưa chắc' };
      if (k === 2) return { id, form_id: F[(n + 1) % 7], confidence: 'high', reason: 'sai' };
      return { id, form_id: truth, confidence: k === 1 ? 'medium' : 'high', reason: 'ok' };
    });
    return { text: JSON.stringify({ results }), finish: 'STOP', promptTokens: 1, outputTokens: 1, model: args.req.model };
  } },
  event: { async listen() { return () => {}; } },
} };
const file = JSON.stringify({ items: Array.from({ length: 25 }, (_, i) => mkItem(i, i % 5 === 3 ? { truth: codeOf(F[i % 7]) } : {})) });
const { cases } = parseBenchFile(file, tax);
const bank: Question[] = [{ uid: 'b1', seq: 1, latex: cases[0].latex, type: 'tn', level: 'TH', tags: [], createdAt: 1, updatedAt: 1, ...locationOfForm(ix, F[0])! }];

const run = await runBench(tax, cases, 'gemini-3.8-flash', bank);
ok(run.calls === 3 && run.done === 3 && !run.error && run.itemsAi.length === 25 && run.itemsHybrid.length === 25, '25 câu ⇒ 3 lượt, đủ 25 kết quả cho cả hai cách tính');
ok(!sent.some((u) => u.includes('uid') ), 'không gửi uid nội bộ');
ok(sent.every((u) => !u.includes('<cac_cau_mau_da_phan_loai>') || !u.includes('CASE-0 ')), 'câu đang đo bị loại khỏi ngân hàng dẫn chứng (không tự chép đáp án)');
const s = reportOf(run, cases);
const conf = run.itemsAi.filter((x) => x.confident);
ok(conf.length === 15 && Math.abs((s.ai.precision ?? 0) - conf.filter((x) => x.predicted === x.truth).length / conf.length) < 1e-9, 'precision tính trong nhóm AI tin cậy cao');
ok(s.ai.accuracyAll < 1 && s.ai.coverage > 0 && s.ai.coverage < 1, 'bao phủ và độ đúng toàn tập được báo riêng');
ok(s.byGroup.some((x) => x.group === 'co-loi-giai') && s.byGroup.some((x) => x.group === 'tinh-toan'), 'báo cáo theo nhóm');
const txt = reportText(run, cases, false);
ok(!/nội dung \d|CASE-/.test(txt) && /CHƯA được giáo viên xác minh/.test(txt) && !/Đạt mục tiêu/.test(txt), 'báo cáo không chứa nội dung câu; nhãn chưa xác minh ⇒ không kết luận đạt');

sent.length = 0; mode = 'timeout2';
const r2 = await runBench(tax, cases, 'gemini-3.6-flash', bank);
ok(r2.timeouts === 1 && r2.done === 3 && r2.calls === 3 && r2.itemsAi.length === 25 && r2.itemsAi.filter((x) => !x.jsonOk).length === 10, 'quá giờ ở một lượt: ghi nhận, các câu của lượt đó không có đáp án, vẫn chạy tiếp lượt sau');
sent.length = 0; mode = 'quota2';
const r3 = await runBench(tax, cases, 'm', bank);
ok(r3.error?.kind === 'quota_day' && r3.calls === 2 && r3.itemsAi.length === 10 && sent.length === 2, 'hết lượt ngày ⇒ dừng ngay, không gọi thêm, chỉ chấm các câu đã chạy');
sent.length = 0; mode = 'ok';
let stop = false;
const r4 = await runBench(tax, cases, 'm', bank, { onProgress: (d) => { if (d === 1) stop = true; }, shouldStop: () => stop });
ok(r4.cancelled && r4.calls === 1 && sent.length === 1, 'bấm Dừng ⇒ không gửi thêm lượt nào');
ok(r4.agreement === null || (r4.agreement >= 0 && r4.agreement <= 1), 'tỉ lệ đồng thuận hợp lệ hoặc không có mẫu');

console.log('PR 3: nhãn ID6, chống rò nhãn, đọc ID, so sánh model');
{
  const c1 = cases.find((c) => c.id === 'c1')!;
  ok(c1.truthCode === codeOf(F[1]) && c1.truthLevel === 'TH', 'nhãn giữ ID6 chuẩn + mức độ để chấm ID6 đầy đủ');
  ok(parseBenchFile(JSON.stringify({ items: [{ id: 'x', latex: 'x', truth: '2D1H1' }] }), tax).cases.length === 0, 'nhãn thiếu Dạng không được nhận làm nhãn chuẩn');
  const near = (uid: string, latex: string): Question => ({ uid, seq: 9, latex, type: 'tn', level: 'TH', tags: [], createdAt: 1, updatedAt: 1, review: 'approved', ...locationOfForm(ix, F[0])! });
  const ca = '\\begin{ex}Cho hàm số $y=x^3-3x+2$. Tìm giá trị cực đại của hàm số đã cho.\n\\choice{\\True $4$}{$0$}{$2$}{$-1$}\n\\end{ex}';
  const fam = near('fam', ca.replace('Tìm', '%ghi chú\nTìm'));
  const other = near('khac', '\\begin{ex}Gieo một con xúc xắc cân đối, tính xác suất xuất hiện mặt sáu chấm.\n\\choice{\\True $1/6$}{$1/2$}{$1/3$}{$1$}\n\\end{ex}');
  const lc = [{ id: 'k', latex: ca, grade: 12, truth: F[0], truthCode: codeOf(F[0]), truthLevel: 'TH' as const, groups: [] }];
  const free = leakFreeBank(tax, lc, [fam, other, near('chinh', ca)]);
  ok(!free.some((q) => q.uid === 'fam' || q.uid === 'chinh') && free.some((q) => q.uid === 'khac'), 'loại khỏi câu mẫu: chính câu đang đo + câu cùng họ gần trùng; câu khác vẫn giữ');
  const withId = [{ ...lc[0], latex: ca.replace('\\begin{ex}', `\\begin{ex}%[${codeOf(F[0])}]`) }, { ...lc[0], id: 'k2', latex: ca.replace('\\begin{ex}', '\\begin{ex}%[2D1H1]') }, lc[0]];
  const rd = idReadScore(withId, tax);
  ok(rd.withId === 2 && rd.correct === 1, 'đo tỉ lệ đọc đúng ID có sẵn trong LaTeX (ID thiếu Dạng ⇒ không tính là đọc đúng)');
  const rep = reportOf(run, cases);
  ok(rep.ai.formAcc !== null && rep.ai.id6Acc !== null && rep.ai.chapterAcc !== null && rep.ai.lessonAcc !== null, 'báo cáo có Chương / Bài / Dạng / ID6');
  ok(run.itemsHybrid.filter((x) => x.confident).length <= run.itemsAi.filter((x) => x.confident).length, 'nhóm tin cậy "AI + ngân hàng" không rộng hơn AI một mình (không tự nâng tin cậy)');
  const cmp = compareText([run, r2], cases, false);
  ok(cmp.includes('| gemini-3.8-flash |') && cmp.includes('| gemini-3.6-flash |') && cmp.includes('CHƯA được giáo viên xác minh') && !cmp.includes('| Có |') && !cmp.includes('CASE-'), 'bảng so sánh model: mỗi model một dòng, không chứa nội dung câu, nhãn chưa xác minh ⇒ không model nào "đạt"');
}

console.log('Bộ đo: nhãn chuẩn tách khỏi nội dung gửi AI (câu thử mang sẵn ID đúng hoặc cố tình sai)');
{
  sent.length = 0; mode = 'ok';
  const wrongCode = codeOf(F[6]);
  const items = Array.from({ length: 6 }, (_, i) => {
    const truth = codeOf(F[i % 7]);
    const head = i % 2 === 0 ? `%[${truth}]` : `%[Đề thử]%[${wrongCode}]`; // câu chẵn: ID ĐÚNG ngay trong LaTeX; câu lẻ: ID cố tình SAI
    return { id: `L${i}`, latex: `\\begin{ex}${head}\nCASE-${i} nội dung ${i}\\loigiai{x}\\end{ex}`, truth, groups: ['tinh-toan'] };
  });
  const lc = parseBenchFile(JSON.stringify({ items }), tax).cases;
  const before = lc.map((c) => c.latex);
  const lr = await runBench(tax, lc, 'gemini-3.5-flash-lite', []);
  const all = sent.join('\n');
  ok(lr.itemsAi.length === 6 && sent.length === 1, 'đã chạy đủ 6 câu thử (AI giả lập)');
  ok(lc.every((c) => !all.includes(c.truthCode!)) && !all.includes(wrongCode), 'model KHÔNG nhìn thấy ID đúng (nhãn) cũng như ID cố tình sai có sẵn trong câu thử');
  ok(all.includes('Đề thử') && lc.every((_, i) => all.includes(`CASE-${i} nội dung ${i}`)), 'nội dung câu và nhãn nguồn vẫn gửi đủ');
  ok(lc.every((c, i) => c.latex === before[i]) && lc.every((c) => c.truth && c.truthCode), 'nhãn chuẩn giữ riêng trong bộ đo (truth / truthCode), LaTeX câu thử không bị sửa');
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nbenchrun: đạt hết.');
