import { buildDefault, indexOf } from '../taxonomy';
import { questionCode } from '../id';
import { locationOfForm } from '../taxpath';
import { formsOfGrade } from './tasks/ganid';
import { composition, GROUP_LABEL, MAX_CASES, parseBenchFile, reportOf, reportText, runBench } from './benchrun';
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

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nbenchrun: đạt hết.');
