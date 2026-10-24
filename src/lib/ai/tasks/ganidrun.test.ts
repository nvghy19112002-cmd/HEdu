import type { Suggestion } from '../../idsuggest';
import { buildDefault, indexOf } from '../../taxonomy';
import { locationOfForm, taxRevision } from '../../taxpath';
import { formsOfGrade } from './ganid';
import { batchesOf, examplesFor, mergeAi, runGanId, type GanIdJob } from './ganidrun';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const g = globalThis as unknown as { window?: unknown };

const tax = buildDefault();
const ix = indexOf(tax);
const F = formsOfGrade(tax, 12).map((f) => f.formId);
const F10 = formsOfGrade(tax, 10).map((f) => f.formId);
const o = (id: string) => ({ formId: id, location: locationOfForm(ix, id)! });

console.log('Chạy nhiệm vụ gan-id theo lượt');
const jobs: GanIdJob[] = [
  ...Array.from({ length: 23 }, (_, i) => ({ key: `u${i}`, latex: `\\begin{ex}câu ${i}\\end{ex}`, grade: 12, examples: [] })),
  ...Array.from({ length: 3 }, (_, i) => ({ key: `v${i}`, latex: `\\begin{ex}lớp 10 câu ${i}\\end{ex}`, grade: 10, examples: [] })),
];
const bs = batchesOf(jobs);
ok(bs.length === 4 && bs.every((b) => b.length <= 10 && b.every((j) => j.grade === b[0].grade)), 'chia lượt: ≤10 câu, mỗi lượt một lớp (23 câu lớp 12 + 3 câu lớp 10 ⇒ 4 lượt)');

const sent: { user: string; schema: unknown }[] = [];
let mode: 'ok' | 'quota' = 'ok';
g.window = { __TAURI__: {
  core: { async invoke(cmd: string, args: { req: { user: string; schema: unknown } }) {
    if (cmd !== 'ai_run') throw new Error('lệnh lạ');
    sent.push(args.req);
    if (mode === 'quota' && sent.length === 2) throw { kind: 'quota_day', message: 'Đã hết lượt miễn phí hôm nay.', retryAfterSecs: null };
    const n = (args.req.user.match(/<cau_hoi id=/g) ?? []).length;
    const grade10 = args.req.user.includes('lớp 10 câu');
    const pool = grade10 ? F10 : F;
    return { text: JSON.stringify({ results: Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}`, form_id: pool[i], level: 'TH', confidence: 'high', reason: 'lý do' })) }), finish: 'STOP', promptTokens: 1, outputTokens: 1, model: 'm' };
  } },
  event: { async listen() { return () => {}; } },
} };
const prog: string[] = [];
const r = await runGanId(tax, jobs, 'gemini-3.8-flash', { onProgress: (d, t) => prog.push(`${d}/${t}`) });
ok(r.done === 4 && r.total === 4 && !r.error && r.results.size === 26, 'chạy đủ 4 lượt, đủ 26 kết quả');
ok(r.results.get('u0')!.best?.formId === F[0] && r.results.get('u12')!.best?.formId === F[2] && r.results.get('v1')!.best?.formId === F10[1], 'kết quả gắn đúng câu (id ngắn q1…q10 đổi lại đúng uid)');
ok(!sent.some((s) => /<cau_hoi id="u\d/.test(s.user)), 'không gửi uid nội bộ cho AI');
ok(prog.join(',') === '0/4,1/4,2/4,3/4,4/4', 'báo tiến độ từng lượt');

sent.length = 0; mode = 'quota';
const r2 = await runGanId(tax, jobs, 'm');
ok(r2.error?.kind === 'quota_day' && r2.done === 1 && sent.length === 2 && r2.results.size === 10, 'hết lượt giữa chừng ⇒ dừng ngay, giữ kết quả lượt trước, không gọi tiếp');
sent.length = 0; mode = 'ok';
let stop = false;
const r3 = await runGanId(tax, jobs, 'm', { onProgress: (d) => { if (d === 1) stop = true; }, shouldStop: () => stop });
ok(r3.cancelled && r3.done === 1 && sent.length === 1, 'bấm Dừng ⇒ không gửi thêm lượt nào');

console.log('Trộn kết quả AI với ngân hàng');
const local = (best: string | null, confidence: Suggestion['confidence'], alts: string[] = []): Suggestion => ({ key: 'k', best: best ? o(best) : null, alternatives: alts.map(o), confidence, levelHint: 'NB', evidence: [], notes: ['ghi chú cũ'], taxRev: taxRevision(tax) });
const ai = (best: string | null, confidence: 'high' | 'medium' | 'low' = 'high', alts: string[] = []) => ({ id: 'k', best: best ? { ...o(best), reason: '' } : null, alternatives: alts.map((a) => ({ ...o(a), reason: '' })), levelHint: 'VD' as const, confidence, reason: 'tích phân cơ bản' });
const m1 = mergeAi(local(F[0], 'vua', [F[1]]), ai(F[0], 'high', [F[2]]));
ok(m1.verdict === 'dong-thuan' && m1.suggestion.confidence === 'cao' && m1.suggestion.best?.formId === F[0] && m1.suggestion.levelHint === 'VD', 'cùng chọn ⇒ nhãn cao; mức độ gợi ý lấy của AI (vẫn chỉ tham khảo)');
ok(m1.suggestion.alternatives.length <= 2 && !m1.suggestion.alternatives.some((a) => a.formId === F[0]), 'phương án khác không trùng gợi ý chính, tối đa 2');
const m2 = mergeAi(local(F[5], 'thap'), ai(F[0], 'high'));
ok(m2.verdict === 'ai-moi' && m2.suggestion.best?.formId === F[0] && m2.suggestion.confidence === 'vua' && m2.suggestion.alternatives[0]?.formId === F[5], 'ngân hàng chưa chắc + AI chắc ⇒ theo AI (vừa), phương án ngân hàng đứng sau');
const m3 = mergeAi(local(F[5], 'cao'), ai(F[0], 'high'));
ok(m3.verdict === 'khac-nhau' && m3.suggestion.best?.formId === F[0] && m3.suggestion.confidence === 'thap' && m3.suggestion.alternatives[0]?.formId === F[5], 'AI khác ngân hàng ⇒ nhãn thấp, hiện cả hai để giáo viên chọn');
const m4 = mergeAi(local(F[5], 'vua'), ai(null, 'low'));
ok(m4.verdict === 'ai-khong-chac' && m4.suggestion.best?.formId === F[5] && m4.suggestion.confidence === 'vua' && m4.suggestion.notes.some((x) => x.startsWith('AI')), 'AI không đủ căn cứ ⇒ giữ gợi ý ngân hàng, ghi chú lý do');
const m5 = mergeAi(local(null, 'khong'), ai(F[0], 'medium'));
ok(m5.verdict === 'ai-moi' && m5.suggestion.confidence === 'thap', 'AI không chắc lắm ⇒ chỉ "thấp"');
ok(m1.suggestion.taxRev === taxRevision(tax), 'giữ dấu phiên bản cây để kiểm lại trước khi ghi');

const bank = new Map([['a', { uid: 'a', seq: 1, latex: 'L', type: 'tn' as const, level: 'TH' as const, tags: [], createdAt: 1, updatedAt: 1, ...o(F[0]).location }]]);
ok(examplesFor({ ...local(F[0], 'vua'), evidence: [{ uid: 'a', formId: F[0], score: 0.5, kind: 'near' }, { uid: 'mat', formId: F[0], score: 0.4, kind: 'near' }] }, bank).length === 1, 'câu mẫu lấy từ dẫn chứng còn trong ngân hàng');

if (fail) process.exit(1);
console.log('ai/tasks/ganidrun: đạt hết.');
