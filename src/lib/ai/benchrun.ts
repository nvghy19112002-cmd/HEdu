// Bộ ĐO độ chính xác AI gán Dạng trên bộ câu có nhãn chuẩn do giáo viên xác minh.
// KHÔNG tự chạy: chỉ chạy khi giáo viên chọn tệp nhãn và đồng ý (hộp xin phép nêu số câu THẬT sẽ gửi, model, số lượt) cho TỪNG model.
// Mọi model chạy trên CÙNG tập câu, CÙNG prompt, CÙNG cây chương trình, CÙNG câu mẫu ngân hàng (đã loại chính các câu đang đo
// khỏi ngân hàng dẫn chứng để không "chép đáp án"). Kết quả báo cáo không chứa nội dung câu hỏi.
// Chống rò nhãn: loại khỏi ngân hàng dẫn chứng cả câu đang đo LẪN các câu cùng họ gần trùng với nó (trùng mã, cùng câu, mâu thuẫn
// đáp án, gần trùng) — câu mẫu gửi AI còn phải "Đã duyệt" (examplesFor).
import { type Suggestion, IdSuggester } from '../idsuggest';
import { indexOf } from '../taxonomy';
import { checkLocation, locationOfForm } from '../taxpath';
import { readLatexId, resolveCode } from '../idsync';
import type { Level, Question, Taxonomy } from '../types';
import { aiRun, AiError } from './client';
import { buildGanIdRequest, parseGanIdReply, type GanIdResult } from './tasks/ganid';
import { batchesOf, examplesFor, mergeAi, type GanIdJob } from './tasks/ganidrun';
import { describeScore, MIN_COVERAGE, MIN_SAMPLE, scoreRun, TARGET_PRECISION, type BenchItem, type BenchScore } from './benchmark';

export const MAX_CASES = 300;
const MAX_LATEX = 6000;

export const GROUP_LABEL: Record<string, string> = {
  'ly-thuyet': 'Lý thuyết thuần',
  'tinh-toan': 'Tính toán',
  'co-loi-giai': 'Có lời giải',
  'khong-loi-giai': 'Không có lời giải',
  'dang-gan-nhau': 'Dạng gần nhau',
  'thieu-can-cu': 'Thiếu căn cứ (không có Dạng phù hợp)',
  'bat-dong': 'AI và ngân hàng bất đồng',
};
/** Nhóm giáo viên tự gắn trong tệp nhãn (các nhóm còn lại tự suy ra). */
export const MANUAL_GROUPS = ['ly-thuyet', 'tinh-toan', 'dang-gan-nhau', 'thieu-can-cu'] as const;

export interface BenchCase {
  id: string; latex: string; grade: number;
  /** form_id đúng; null = trong cây không có Dạng phù hợp */
  truth: string | null;
  /** ID6 đúng (chuẩn hoá) và mức độ theo nhãn; null khi không có Dạng phù hợp */
  truthCode: string | null;
  truthLevel: Level | null;
  groups: string[];
}

/**
 * Tệp nhãn: JSON `{ "items": [ { "id": "c1", "latex": "\\begin{ex}…", "truth": "2D1H1-1" | null, "grade": 12, "groups": ["ly-thuyet"] } ] }`.
 * `truth` là ID6 đúng do giáo viên xác nhận (Dạng lấy từ mã), hoặc null khi không có Dạng phù hợp (khi đó phải ghi `grade`).
 */
export function parseBenchFile(text: string, tax: Taxonomy): { cases: BenchCase[]; problems: string[] } {
  const ix = indexOf(tax);
  const problems: string[] = [];
  const cases: BenchCase[] = [];
  let rows: unknown[] = [];
  try {
    const v = JSON.parse(text) as { items?: unknown };
    if (Array.isArray(v?.items)) rows = v.items; else problems.push('Tệp nhãn không đúng khuôn: cần {"items": [...]}.');
  } catch { problems.push('Tệp nhãn không phải JSON hợp lệ.'); }
  if (rows.length > MAX_CASES) problems.push(`Chỉ đo tối đa ${MAX_CASES} câu một lần (tệp có ${rows.length}); phần thừa bị bỏ.`);
  const seen = new Set<string>();
  rows.slice(0, MAX_CASES).forEach((r, i) => {
    const o = r as Record<string, unknown>;
    const id = typeof o?.id === 'string' && o.id.trim() ? o.id.trim() : `#${i + 1}`;
    const tag = `Mục ${id}`;
    if (seen.has(id)) { problems.push(`${tag}: id trùng — bỏ qua.`); return; }
    if (typeof o?.latex !== 'string' || !o.latex.trim()) { problems.push(`${tag}: thiếu nội dung câu — bỏ qua.`); return; }
    if (o.latex.length > MAX_LATEX) { problems.push(`${tag}: câu quá dài (> ${MAX_LATEX} ký tự) — bỏ qua.`); return; }
    let truth: string | null = null;
    let truthCode: string | null = null;
    let truthLevel: Level | null = null;
    let grade = typeof o.grade === 'number' ? o.grade : NaN;
    if (o.truth != null) {
      // đọc CHẶT: mã thiếu Dạng / mã trùng trong cây không phải nhãn chuẩn
      const p = typeof o.truth === 'string' ? resolveCode(o.truth, tax) : null;
      if (!p || !p.ok || !checkLocation(ix, p.loc, p.loc.grade).ok) { problems.push(`${tag}: nhãn "${String(o.truth)}" không phải ID đúng đủ Dạng trong cây — bỏ qua.`); return; }
      truth = p.loc.formId;
      truthCode = p.code;
      truthLevel = p.level;
      grade = p.loc.grade;
    }
    if (!tax.grades.some((g) => g.grade === grade)) { problems.push(`${tag}: thiếu lớp hợp lệ (câu không có Dạng phù hợp phải ghi "grade") — bỏ qua.`); return; }
    const manual = Array.isArray(o.groups) ? (o.groups as unknown[]).filter((g): g is string => typeof g === 'string' && (MANUAL_GROUPS as readonly string[]).includes(g)) : [];
    if (truth === null && !manual.includes('thieu-can-cu')) manual.push('thieu-can-cu');
    seen.add(id);
    cases.push({ id, latex: o.latex, grade, truth, truthCode, truthLevel, groups: [...new Set([...manual, hasSolution(o.latex) ? 'co-loi-giai' : 'khong-loi-giai'])] });
  });
  return { cases, problems };
}

const hasSolution = (latex: string): boolean => /\\loigiai\s*\{\s*[^\s}]/.test(latex);

/** Thành phần bộ nhãn theo nhóm + nhóm còn thiếu (để giáo viên biết bộ đã đủ loại chưa). */
export function composition(cases: readonly BenchCase[]): { counts: Record<string, number>; missing: string[]; enough: boolean } {
  const counts: Record<string, number> = {};
  for (const c of cases) for (const g of c.groups) counts[g] = (counts[g] ?? 0) + 1;
  const need = ['ly-thuyet', 'tinh-toan', 'co-loi-giai', 'khong-loi-giai', 'dang-gan-nhau', 'thieu-can-cu'];
  return { counts, missing: need.filter((g) => !counts[g]).map((g) => GROUP_LABEL[g]), enough: cases.length >= 100 };
}

export interface BenchRun {
  model: string;
  /** AI một mình: "đủ tin cậy" = AI chọn Dạng với độ tin cậy cao */
  itemsAi: BenchItem[];
  /** AI + ngân hàng: "đủ tin cậy" = nhãn "vừa" sau khi trộn (AI chắc, không bất đồng với ngân hàng, câu không bị lược) */
  itemsHybrid: BenchItem[];
  calls: number;
  done: number;
  total: number;
  timeouts: number;
  /** lượt trả về JSON hỏng/sai khuôn */
  jsonErrors: number;
  /** tỉ lệ AI trùng gợi ý ngân hàng trong các câu cả hai đều chọn được */
  agreement: number | null;
  disagreeIds: string[];
  error: AiError | null;
  cancelled: boolean;
  totalMs: number;
}

const STOP_KINDS = new Set(['quota_day', 'bad_key', 'forbidden', 'no_key', 'not_desktop', 'bad_request']);

/** Loại dạng trùng coi là "cùng họ" với câu đang đo (template = biến thể khác số liệu: vẫn được làm mẫu). */
const FAMILY_KINDS = new Set(['raw', 'same', 'conflict', 'near']);

/** Ngân hàng dẫn chứng không chứa câu đang đo, cũng không chứa câu cùng họ gần trùng với câu đang đo. */
export function leakFreeBank(tax: Taxonomy, cases: readonly BenchCase[], bank: readonly Question[]): Question[] {
  const tested = new Set(cases.map((c) => c.latex));
  const base = bank.filter((q) => !tested.has(q.latex));
  const probe = new IdSuggester(tax, base);
  const family = new Set<string>();
  for (const c of cases) for (const e of probe.suggest({ key: c.id, latex: c.latex, grade: c.grade }).evidence) if (FAMILY_KINDS.has(e.kind)) family.add(e.uid);
  return family.size ? base.filter((q) => !family.has(q.uid)) : base;
}

/** Tỉ lệ đọc đúng ID có sẵn trong LaTeX (không cần AI): câu có ID ở đầu được bộ đọc chung trả đúng mã nhãn. */
export function idReadScore(cases: readonly BenchCase[], tax: Taxonomy): { withId: number; correct: number } {
  let withId = 0, correct = 0;
  for (const c of cases) {
    const r = readLatexId(c.latex, tax);
    if (r.state === 'khong-co' || r.state === 'khong-phai-ex' || !c.truthCode) continue;
    withId++;
    if (r.resolved && r.resolved.code === c.truthCode) correct++;
  }
  return { withId, correct };
}

export async function runBench(tax: Taxonomy, cases: readonly BenchCase[], model: string, bank: readonly Question[], opt: { onProgress?(done: number, total: number): void; shouldStop?(): boolean } = {}): Promise<BenchRun> {
  const refBank = leakFreeBank(tax, cases, bank);
  const byUid = new Map(refBank.map((q) => [q.uid, q]));
  const sug = new IdSuggester(tax, refBank);
  const ix = indexOf(tax);
  const local = new Map<string, Suggestion>();
  const jobs: GanIdJob[] = cases.map((c) => {
    const s = sug.suggest({ key: c.id, latex: c.latex, grade: c.grade });
    local.set(c.id, s);
    return { key: c.id, latex: c.latex, grade: c.grade, examples: examplesFor(s, byUid) };
  });
  const batches = batchesOf(jobs);
  const byId = new Map(cases.map((c) => [c.id, c]));
  const run: BenchRun = { model, itemsAi: [], itemsHybrid: [], calls: 0, done: 0, total: batches.length, timeouts: 0, jsonErrors: 0, agreement: null, disagreeIds: [], error: null, cancelled: false, totalMs: 0 };
  let both = 0, same = 0;
  opt.onProgress?.(0, run.total);
  for (const b of batches) {
    if (opt.shouldStop?.()) { run.cancelled = true; break; }
    const ids = b.map((_, i) => `q${i + 1}`);
    const t0 = Date.now();
    run.calls++;
    let results: Map<string, GanIdResult> | null = null;
    let jsonOk = true;
    let timeout = false, apiError = false;
    try {
      const reply = await aiRun(buildGanIdRequest(tax, b[0].grade, b.map((j, i) => ({ id: ids[i], latex: j.latex, examples: j.examples })), model));
      const p = parseGanIdReply(reply.text, tax, b[0].grade, ids);
      jsonOk = !p.problems.some((x) => /không đọc được|không đúng khuôn/.test(x));
      if (!jsonOk) run.jsonErrors++;
      results = p.results;
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('bad_response', e instanceof Error ? e.message : String(e));
      if (err.kind === 'timeout') { run.timeouts++; timeout = true; } else apiError = true;
      jsonOk = false;
      if (STOP_KINDS.has(err.kind)) { run.error = err; run.totalMs += Date.now() - t0; break; }
    }
    const ms = (Date.now() - t0) / b.length;
    run.totalMs += Date.now() - t0;
    b.forEach((j, i) => {
      const c = byId.get(j.key)!;
      const ai = results?.get(ids[i]) ?? null;
      const predicted = ai?.best?.formId ?? null;
      const tiers = (pred: string | null) => {
        const t = c.truth ? locationOfForm(ix, c.truth) : null, q = pred ? locationOfForm(ix, pred) : null;
        return { chapterHit: t ? !!q && q.chapterId === t.chapterId : null, lessonHit: t ? !!q && q.lessonId === t.lessonId : null };
      };
      const common = { id: c.id, truth: c.truth, jsonOk, ms, timeout, apiError, truthLevel: c.truthLevel };
      // "đủ tin cậy" của AI một mình: AI tự đánh giá cao và câu không bị lược khi gửi
      run.itemsAi.push({ ...common, predicted, confident: !!ai?.best && ai.confidence === 'high' && !ai.cut, predLevel: ai?.levelHint ?? null, ...tiers(predicted) });
      let hybridPred = predicted, hybridConf = false, hybridLevel: Level | null = ai?.levelHint ?? null;
      if (ai) {
        const m = mergeAi(local.get(c.id)!, ai);
        hybridPred = m.suggestion.best?.formId ?? null;
        hybridLevel = m.suggestion.levelHint;
        // như nhãn trong app: kết quả trộn tối đa "vừa" (AI chắc, không bất đồng với ngân hàng, không bị lược)
        hybridConf = !!hybridPred && m.suggestion.confidence === 'vua';
        const lb = local.get(c.id)!.best?.formId;
        if (lb && ai.best) { both++; if (lb === ai.best.formId) same++; else run.disagreeIds.push(c.id); }
      }
      run.itemsHybrid.push({ ...common, predicted: hybridPred, confident: hybridConf, predLevel: hybridLevel, ...tiers(hybridPred) });
    });
    run.done++;
    opt.onProgress?.(run.done, run.total);
  }
  run.agreement = both ? same / both : null;
  return run;
}

export interface BenchReport { ai: BenchScore; hybrid: BenchScore; byGroup: { group: string; n: number; precision: number | null; coverage: number; accuracyAll: number }[] }

export function reportOf(run: BenchRun, cases: readonly BenchCase[]): BenchReport {
  const disagree = new Set(run.disagreeIds);
  const groupsOf = (id: string): string[] => [...(cases.find((c) => c.id === id)?.groups ?? []), ...(disagree.has(id) ? ['bat-dong'] : [])];
  const byGroup = Object.keys(GROUP_LABEL).map((g) => {
    const items = run.itemsAi.filter((x) => groupsOf(x.id).includes(g));
    const s = scoreRun(items);
    return { group: g, n: items.length, precision: s.precision, coverage: s.coverage, accuracyAll: s.accuracyAll };
  }).filter((r) => r.n > 0);
  return { ai: scoreRun(run.itemsAi), hybrid: scoreRun(run.itemsHybrid), byGroup };
}

const pct = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

/** Báo cáo Markdown KHÔNG chứa nội dung câu hỏi (chỉ số liệu) — an toàn để lưu/chia sẻ. */
export function reportText(run: BenchRun, cases: readonly BenchCase[], verifiedLabels: boolean, tax?: Taxonomy): string {
  const r = reportOf(run, cases);
  const idRead = tax ? idReadScore(cases, tax) : null;
  const lines = [
    `## Model ${run.model}`,
    `Câu đã chấm: ${run.itemsAi.length}/${cases.length} · lượt gọi ${run.calls}/${run.total} · lỗi JSON ${run.jsonErrors} lượt · quá giờ ${run.timeouts} lượt · tổng ${(run.totalMs / 1000).toFixed(0)} giây.`,
    run.error ? `DỪNG SỚM: ${run.error.message}` : run.cancelled ? 'Đã dừng theo yêu cầu.' : '',
    `Đồng thuận AI – ngân hàng (trên các câu cả hai đều chọn được): ${pct(run.agreement)}.`,
    idRead && idRead.withId ? `Đọc ID có sẵn trong LaTeX (không cần AI): ${idRead.correct}/${idRead.withId} câu đúng mã nhãn.` : '',
    '', '### AI một mình', describeScore(r.ai, verifiedLabels),
    '', '### AI + ngân hàng (nhãn "vừa" trong app — giáo viên vẫn tự tick)', describeScore(r.hybrid, verifiedLabels),
    '', '### Theo nhóm (AI một mình)', '| Nhóm | Số câu | Đúng trong nhóm tin cậy | Bao phủ | Đúng toàn nhóm |', '|---|---|---|---|---|',
    ...r.byGroup.map((g) => `| ${GROUP_LABEL[g.group]} | ${g.n} | ${pct(g.precision)} | ${pct(g.coverage)} | ${pct(g.accuracyAll)} |`),
  ];
  return lines.filter((l) => l !== '' || true).join('\n');
}

/** Bảng so sánh nhiều model trên CÙNG bộ nhãn (không chứa nội dung câu). HEdu không tự đổi model mặc định. */
export function compareText(runs: readonly BenchRun[], cases: readonly BenchCase[], verifiedLabels: boolean): string {
  const rows = runs.map((r) => ({ r, s: reportOf(r, cases).ai }));
  const meets = (x: BenchScore) => verifiedLabels && x.enoughSample && x.precision !== null && x.precision >= TARGET_PRECISION && x.coverage >= MIN_COVERAGE;
  const lines = [
    '## So sánh model (AI một mình, cùng bộ nhãn, cùng prompt)',
    '| Model | Đúng Dạng | ID6 đúng | Mức độ | Đúng trong nhóm tin cậy | Bao phủ | Từ chối nhầm | Lỗi JSON / quá giờ / API | Giây/câu | Đạt tiêu chí |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(({ r, s: x }) => `| ${r.model} | ${pct(x.formAcc)} | ${pct(x.id6Acc)} | ${pct(x.levelAcc)} | ${pct(x.precision)} | ${pct(x.coverage)} | ${pct(x.falseRefusalRate)} | ${pct(x.jsonErrorRate)} / ${pct(x.timeoutRate)} / ${pct(x.apiErrorRate)} | ${(x.avgMs / 1000).toFixed(1)} | ${meets(x) ? 'Có' : 'Chưa'} |`),
    '',
    verifiedLabels
      ? `Tiêu chí: ≥ ${TARGET_PRECISION * 100}% đúng Dạng trong nhóm đủ tin cậy, bao phủ ≥ ${MIN_COVERAGE * 100}%, ≥ ${MIN_SAMPLE} câu. HEdu KHÔNG tự đổi model mặc định — chủ dự án quyết định.`
      : 'Nhãn CHƯA được giáo viên xác minh: bảng chỉ để tham khảo, không kết luận model nào đạt.',
  ];
  return lines.join('\n');
}
