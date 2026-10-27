// Chạy nhiệm vụ AI "gan-id" theo từng lượt (≤ GAN_ID_BATCH câu cùng lớp) và trộn kết quả với gợi ý từ ngân hàng.
// Người gọi PHẢI đã hỏi và được giáo viên đồng ý cho lượt gửi này (AiConsentDialog). Lỗi giữa chừng ⇒ dừng, giữ kết quả đã có.
import type { Question, Taxonomy } from '../../types';
import type { SuggestConfidence, SuggestOption, Suggestion } from '../../idsuggest';
import { aiRun, AiError } from '../client';
import { latexForAi } from '../../idtex';
import { buildGanIdRequest, compactInfo, GAN_ID_BATCH, parseGanIdReply, type GanIdExample, type GanIdResult } from './ganid';

export interface GanIdJob { key: string; latex: string; grade: number; examples: GanIdExample[] }

/** Chia việc: gom theo lớp (mỗi lượt chỉ gửi cây của MỘT lớp), mỗi lượt tối đa GAN_ID_BATCH câu. */
export function batchesOf(jobs: readonly GanIdJob[]): GanIdJob[][] {
  const byGrade = new Map<number, GanIdJob[]>();
  for (const j of jobs) { const a = byGrade.get(j.grade) ?? []; a.push(j); byGrade.set(j.grade, a); }
  const out: GanIdJob[][] = [];
  for (const a of byGrade.values()) for (let i = 0; i < a.length; i += GAN_ID_BATCH) out.push(a.slice(i, i + GAN_ID_BATCH));
  return out;
}

/**
 * Câu mẫu gửi kèm AI: các câu dẫn chứng của gợi ý ngân hàng, chỉ những câu có nội dung "Đã duyệt". Đây chỉ là VÍ DỤ THAM KHẢO cho AI:
 * "Đã duyệt" nội dung KHÔNG có nghĩa là Dạng đã được giáo viên xác minh, và việc chọn mẫu này KHÔNG phải căn cứ kiểm chứng ID
 * (căn cứ kiểm chứng chỉ gồm câu có Dạng giáo viên xác minh: idreview.isEvidence). Dự kiến chuyển ví dụ sang Dạng giáo viên xác minh khi đã có đủ nhãn.
 * Nhãn cũ chưa kiểm duyệt không được đưa cho AI như đáp án chuẩn. `exclude` = uid không được dùng (chính câu đang hỏi, câu đang đo).
 */
export function examplesFor(s: Suggestion, bank: ReadonlyMap<string, Question>, exclude: ReadonlySet<string> = new Set()): GanIdExample[] {
  return s.evidence.flatMap((e) => {
    const q = bank.get(e.uid);
    return q && q.review === 'approved' && !exclude.has(q.uid) ? [{ formId: q.formId, latex: q.latex }] : [];
  }).slice(0, 5);
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
      b.forEach((j, i) => {
        const r = { ...p.results.get(ids[i])!, id: j.key };
        // phần hình/đề bị lược khi gửi ⇒ có thể mất dữ kiện quyết định: không để kết quả trông như chắc chắn
        if (compactInfo(latexForAi(j.latex)).cut) { r.cut = true; r.confidence = 'low'; }
        run.results.set(j.key, r);
      });
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
  'dong-thuan': 'AI và ngân hàng cùng chọn (chỉ là tham khảo)',
  'ai-moi': 'Theo AI (ngân hàng chưa có căn cứ)',
  'khac-nhau': 'AI khác ngân hàng — xem lại',
  'ai-khong-chac': 'AI không đủ căn cứ',
};

const uniq = (xs: (SuggestOption | null | undefined)[], skip: string | undefined): SuggestOption[] => {
  const out: SuggestOption[] = [];
  for (const x of xs) if (x && x.formId !== skip && !out.some((o) => o.formId === x.formId)) out.push({ formId: x.formId, location: x.location });
  return out.slice(0, 2);
};

/**
 * Trộn: AI là gợi ý chính khi chọn được Dạng; ngân hàng chỉ là chứng cứ tham khảo. Tin cậy KHÔNG được nâng chỉ vì AI và ngân hàng
 * cùng chọn (chưa có số liệu đo chứng minh) — nhãn lấy từ lời tự đánh giá của AI, hạ một bậc và không bao giờ là "cao":
 * high ⇒ "vừa", medium ⇒ "thấp"; AI khác ngân hàng, hoặc câu bị lược khi gửi ⇒ "thấp". Giáo viên luôn là người tick áp dụng.
 */
export function mergeAi(local: Suggestion, ai: GanIdResult): { suggestion: Suggestion; verdict: AiVerdict } {
  const note = [...(ai.reason ? [`AI: ${ai.reason}`] : []), ...(ai.cut ? ['Hình/đề quá dài nên đã lược khi gửi AI — kiểm tra kỹ trước khi nhận.'] : [])];
  if (!ai.best) {
    // AI không đủ căn cứ ⇒ KHÔNG giữ gợi ý ngân hàng làm lựa chọn chính; gợi ý ngân hàng chỉ còn là phương án tham khảo.
    const tag = ai.theory ? 'Câu lý thuyết — cần giáo viên chọn Dạng.' : 'AI chưa đủ căn cứ — cần giáo viên chọn Dạng.';
    return {
      verdict: 'ai-khong-chac',
      suggestion: { ...local, best: null, confidence: 'khong', alternatives: uniq([...ai.alternatives, local.best, ...local.alternatives], undefined), notes: [tag, ...note, ...local.notes] },
    };
  }
  const levelHint = ai.levelHint ?? local.levelHint;
  const same = local.best?.formId === ai.best.formId;
  const weakLocal = !local.best || local.confidence === 'thap' || local.confidence === 'khong';
  const verdict: AiVerdict = same ? 'dong-thuan' : weakLocal ? 'ai-moi' : 'khac-nhau';
  const confidence: SuggestConfidence = ai.cut || verdict === 'khac-nhau' ? 'thap' : ai.confidence === 'high' ? 'vua' : 'thap';
  return {
    verdict,
    suggestion: { ...local, best: { formId: ai.best.formId, location: ai.best.location }, confidence, levelHint, alternatives: uniq([local.best, ...ai.alternatives, ...local.alternatives], ai.best.formId), notes: [...note, ...local.notes] },
  };
}
