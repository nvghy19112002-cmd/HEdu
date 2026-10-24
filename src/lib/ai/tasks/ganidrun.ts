// Chạy nhiệm vụ AI "gan-id" theo từng lượt (≤ GAN_ID_BATCH câu cùng lớp) và trộn kết quả với gợi ý từ ngân hàng.
// Người gọi PHẢI đã hỏi và được giáo viên đồng ý cho lượt gửi này (AiConsentDialog). Lỗi giữa chừng ⇒ dừng, giữ kết quả đã có.
import type { Question, Taxonomy } from '../../types';
import type { SuggestConfidence, SuggestOption, Suggestion } from '../../idsuggest';
import { aiRun, AiError } from '../client';
import { buildGanIdRequest, GAN_ID_BATCH, parseGanIdReply, type GanIdExample, type GanIdResult } from './ganid';

export interface GanIdJob { key: string; latex: string; grade: number; examples: GanIdExample[] }

/** Chia việc: gom theo lớp (mỗi lượt chỉ gửi cây của MỘT lớp), mỗi lượt tối đa GAN_ID_BATCH câu. */
export function batchesOf(jobs: readonly GanIdJob[]): GanIdJob[][] {
  const byGrade = new Map<number, GanIdJob[]>();
  for (const j of jobs) { const a = byGrade.get(j.grade) ?? []; a.push(j); byGrade.set(j.grade, a); }
  const out: GanIdJob[][] = [];
  for (const a of byGrade.values()) for (let i = 0; i < a.length; i += GAN_ID_BATCH) out.push(a.slice(i, i + GAN_ID_BATCH));
  return out;
}

/** Câu mẫu gửi kèm: chính các câu dẫn chứng của gợi ý ngân hàng (đã có vị trí). */
export function examplesFor(s: Suggestion, bank: ReadonlyMap<string, Question>): GanIdExample[] {
  return s.evidence.flatMap((e) => { const q = bank.get(e.uid); return q ? [{ formId: q.formId, latex: q.latex }] : []; }).slice(0, 5);
}

export interface GanIdRun {
  results: Map<string, GanIdResult>;
  /** số lượt đã gọi xong / tổng số lượt */
  done: number;
  total: number;
  error: AiError | null;
  cancelled: boolean;
  problems: string[];
}

/**
 * Gọi lần lượt từng lượt. id gửi cho AI là số ngắn (q1, q2…) chứ không phải uid. Lỗi (kể cả sau khi Rust đã thử lại)
 * ⇒ dừng ngay, không gọi dồn; kết quả các lượt trước vẫn giữ. `shouldStop` để giáo viên bấm Dừng.
 */
export async function runGanId(tax: Taxonomy, jobs: readonly GanIdJob[], model: string, opt: { onProgress?(done: number, total: number): void; shouldStop?(): boolean } = {}): Promise<GanIdRun> {
  const batches = batchesOf(jobs);
  const run: GanIdRun = { results: new Map(), done: 0, total: batches.length, error: null, cancelled: false, problems: [] };
  opt.onProgress?.(0, run.total);
  for (const b of batches) {
    if (opt.shouldStop?.()) { run.cancelled = true; break; }
    const ids = b.map((_, i) => `q${i + 1}`);
    try {
      const reply = await aiRun(buildGanIdRequest(tax, b[0].grade, b.map((j, i) => ({ id: ids[i], latex: j.latex, examples: j.examples })), model));
      const p = parseGanIdReply(reply.text, tax, b[0].grade, ids);
      b.forEach((j, i) => run.results.set(j.key, { ...p.results.get(ids[i])!, id: j.key }));
      run.problems.push(...p.problems.map((x) => x.replace(/câu q\d+/g, `một câu trong lượt ${run.done + 1}`)));
    } catch (e) {
      run.error = e instanceof AiError ? e : new AiError('bad_response', e instanceof Error ? e.message : String(e));
      break;
    }
    run.done++;
    opt.onProgress?.(run.done, run.total);
  }
  return run;
}

/** Kết quả trộn AI + ngân hàng. */
export type AiVerdict = 'dong-thuan' | 'ai-moi' | 'khac-nhau' | 'ai-khong-chac';

export const AI_VERDICT_LABEL: Record<AiVerdict, string> = {
  'dong-thuan': 'AI và ngân hàng cùng chọn',
  'ai-moi': 'Theo AI (ngân hàng chưa chắc)',
  'khac-nhau': 'AI khác ngân hàng — xem lại',
  'ai-khong-chac': 'AI không đủ căn cứ',
};

const uniq = (xs: (SuggestOption | null | undefined)[], skip: string | undefined): SuggestOption[] => {
  const out: SuggestOption[] = [];
  for (const x of xs) if (x && x.formId !== skip && !out.some((o) => o.formId === x.formId)) out.push({ formId: x.formId, location: x.location });
  return out.slice(0, 2);
};

/**
 * Trộn: AI dẫn đầu khi đủ căn cứ; ngân hàng là bằng chứng. Nhãn "cao" CHỈ khi hai bên cùng chọn. Khi khác nhau:
 * gợi ý chính là của AI nhưng nhãn "thấp" và phương án của ngân hàng đứng ngay sau — giáo viên quyết định.
 */
export function mergeAi(local: Suggestion, ai: GanIdResult): { suggestion: Suggestion; verdict: AiVerdict } {
  const note = ai.reason ? [`AI: ${ai.reason}`] : [];
  if (!ai.best) {
    return { verdict: 'ai-khong-chac', suggestion: { ...local, notes: [...local.notes, ...(note.length ? note : ['AI không đủ căn cứ để chọn Dạng.'])] } };
  }
  const levelHint = ai.levelHint ?? local.levelHint;
  if (local.best?.formId === ai.best.formId) {
    return { verdict: 'dong-thuan', suggestion: { ...local, confidence: 'cao', levelHint, alternatives: uniq([...ai.alternatives, ...local.alternatives], ai.best.formId), notes: [...note, ...local.notes] } };
  }
  const weakLocal = !local.best || local.confidence === 'thap' || local.confidence === 'khong';
  const confidence: SuggestConfidence = weakLocal && ai.confidence === 'high' ? 'vua' : 'thap';
  return {
    verdict: weakLocal ? 'ai-moi' : 'khac-nhau',
    suggestion: { ...local, best: { formId: ai.best.formId, location: ai.best.location }, confidence, levelHint, alternatives: uniq([local.best, ...ai.alternatives, ...local.alternatives], ai.best.formId), notes: [...note, ...local.notes] },
  };
}
