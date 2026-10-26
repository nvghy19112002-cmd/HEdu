// Chấm điểm một lượt đo AI gán Dạng trên bộ câu CÓ NHÃN do giáo viên xác minh. Chỉ tính toán, KHÔNG gọi AI, KHÔNG đọc dữ liệu thật.
// Báo RIÊNG từng tầng: Chương, Bài, Dạng, mức độ và ID6 đầy đủ (Dạng + mức độ) — không dùng độ đúng Dạng thay cho độ đúng ID6.
import type { Level } from '../types';
// Mục tiêu chất lượng: ≥ 95% đúng Dạng trong nhóm "đủ tin cậy" (precision) và luôn báo kèm độ bao phủ. Đây là mục tiêu ĐO KIỂM:
// chỉ được nói "đạt" khi bộ nhãn là nhãn chuẩn của giáo viên và đủ mẫu (xem MIN_SAMPLE); nhãn chưa xác minh ⇒ chỉ là ước lượng.

export interface BenchItem {
  id: string;
  /** Dạng đúng theo giáo viên; null = trong cây KHÔNG có Dạng phù hợp (AI nên từ chối) */
  truth: string | null;
  /** Dạng AI chọn (sau bộ kiểm đường dẫn); null = từ chối / không hợp lệ */
  predicted: string | null;
  /** AI/hệ thống coi là "đủ tin cậy" (vd. AI tin cậy cao, hoặc AI và ngân hàng cùng chọn) */
  confident: boolean;
  /** lượt trả về JSON hợp lệ cho câu này */
  jsonOk: boolean;
  /** thời gian của lượt chia đều cho các câu trong lượt (ms) */
  ms: number;
  /** đúng Chương / đúng Bài (null = câu không có Dạng phù hợp hoặc AI không chọn) */
  chapterHit?: boolean | null;
  lessonHit?: boolean | null;
  /** mức độ theo nhãn (chữ N/H/V/C của ID6 đúng) và mức độ AI gợi ý */
  truthLevel?: Level | null;
  predLevel?: Level | null;
  /** lượt của câu này quá giờ / lỗi API khác (không tính lỗi JSON) */
  timeout?: boolean;
  apiError?: boolean;
}

export interface BenchScore {
  total: number;
  /** mục tiêu: precision ≥ 0.95 */
  confidentN: number;
  coverage: number;
  precision: number | null;
  /** độ đúng toàn tập: dự đoán trùng nhãn, từ chối đúng với câu không có Dạng cũng tính là đúng */
  accuracyAll: number;
  /** trong câu KHÔNG có Dạng phù hợp: tỉ lệ AI vẫn gán bừa một Dạng */
  wrongFillRate: number | null;
  /** trong câu KHÔNG có Dạng phù hợp: tỉ lệ từ chối đúng */
  correctRefusalRate: number | null;
  /** trong câu CÓ Dạng phù hợp: tỉ lệ AI từ chối nhầm */
  falseRefusalRate: number | null;
  jsonErrorRate: number;
  timeoutRate: number;
  apiErrorRate: number;
  /** trên câu CÓ Dạng phù hợp: đúng Chương / Bài / Dạng (AI từ chối ⇒ tính là chưa đúng) */
  chapterAcc: number | null;
  lessonAcc: number | null;
  formAcc: number | null;
  /** trên câu có mức độ trong nhãn: mức độ gợi ý đúng */
  levelAcc: number | null;
  /** trên câu có Dạng + mức độ trong nhãn: đúng CẢ Dạng lẫn mức độ = ID6 đúng hoàn toàn */
  id6Acc: number | null;
  /** tỉ lệ gán SAI trong nhóm đủ tin cậy (= 1 − precision) */
  wrongInConfident: number | null;
  avgMs: number;
  /** đủ mẫu để kết luận chưa */
  enoughSample: boolean;
}

export const MIN_SAMPLE = 100;
export const TARGET_PRECISION = 0.95;
/** Dưới mức bao phủ này thì độ đúng cao KHÔNG đủ để kết luận (tránh "đạt 95%" chỉ nhờ chọn ít câu dễ). */
export const MIN_COVERAGE = 0.5;
const rate = (n: number, d: number): number | null => (d ? n / d : null);

export function scoreRun(items: readonly BenchItem[]): BenchScore {
  const total = items.length;
  const hit = (x: BenchItem) => x.predicted === x.truth;
  const conf = items.filter((x) => x.confident && x.predicted !== null);
  const noForm = items.filter((x) => x.truth === null);
  const hasForm = items.filter((x) => x.truth !== null);
  const withLevel = items.filter((x) => !!x.truthLevel);
  const withId6 = hasForm.filter((x) => !!x.truthLevel);
  return {
    total,
    confidentN: conf.length,
    coverage: total ? conf.length / total : 0,
    precision: rate(conf.filter(hit).length, conf.length),
    accuracyAll: total ? items.filter(hit).length / total : 0,
    wrongFillRate: rate(noForm.filter((x) => x.predicted !== null).length, noForm.length),
    correctRefusalRate: rate(noForm.filter((x) => x.predicted === null).length, noForm.length),
    falseRefusalRate: rate(hasForm.filter((x) => x.predicted === null).length, hasForm.length),
    jsonErrorRate: total ? items.filter((x) => !x.jsonOk && !x.timeout && !x.apiError).length / total : 0,
    timeoutRate: total ? items.filter((x) => x.timeout).length / total : 0,
    apiErrorRate: total ? items.filter((x) => x.apiError).length / total : 0,
    chapterAcc: rate(hasForm.filter((x) => x.chapterHit === true).length, hasForm.length),
    lessonAcc: rate(hasForm.filter((x) => x.lessonHit === true).length, hasForm.length),
    formAcc: rate(hasForm.filter(hit).length, hasForm.length),
    levelAcc: rate(withLevel.filter((x) => x.predLevel === x.truthLevel).length, withLevel.length),
    id6Acc: rate(withId6.filter((x) => hit(x) && x.predLevel === x.truthLevel).length, withId6.length),
    wrongInConfident: conf.length ? conf.filter((x) => !hit(x)).length / conf.length : null,
    avgMs: total ? items.reduce((a, x) => a + x.ms, 0) / total : 0,
    enoughSample: total >= MIN_SAMPLE,
  };
}

const pct = (v: number | null): string => (v === null ? 'không có mẫu' : `${(v * 100).toFixed(1)}%`);

/** Bản tóm tắt tiếng Việt. `verifiedLabels` = nhãn đã được giáo viên xác minh; false ⇒ không bao giờ kết luận "đạt". */
export function describeScore(s: BenchScore, verifiedLabels: boolean): string {
  const lines = [
    `Mẫu: ${s.total} câu${s.enoughSample ? '' : ` (chưa đủ ${MIN_SAMPLE} — chỉ tham khảo)`}.`,
    `Nhóm đủ tin cậy: ${s.confidentN} câu (bao phủ ${pct(s.coverage)}); đúng Dạng trong nhóm này: ${pct(s.precision)} (mục tiêu ≥ ${TARGET_PRECISION * 100}%).`,
    `Độ đúng toàn tập: ${pct(s.accuracyAll)}. Câu không có Dạng: từ chối đúng ${pct(s.correctRefusalRate)}, gán bừa ${pct(s.wrongFillRate)}. Câu có Dạng: từ chối nhầm ${pct(s.falseRefusalRate)}.`,
    `Câu có Dạng phù hợp — đúng Chương ${pct(s.chapterAcc)} · đúng Bài ${pct(s.lessonAcc)} · đúng Dạng ${pct(s.formAcc)}. Mức độ đúng ${pct(s.levelAcc)}. ID6 đúng hoàn toàn (Dạng + mức độ) ${pct(s.id6Acc)}.`,
    `Gán sai trong nhóm đủ tin cậy: ${pct(s.wrongInConfident)}.`,
    `Lỗi JSON ${pct(s.jsonErrorRate)} · quá giờ ${pct(s.timeoutRate)} · lỗi API ${pct(s.apiErrorRate)}; thời gian trung bình ${(s.avgMs / 1000).toFixed(1)} giây/câu.`,
  ];
  const reached = s.precision !== null && s.precision >= TARGET_PRECISION;
  const lowCoverage = s.coverage < MIN_COVERAGE;
  lines.push(!verifiedLabels ? 'Nhãn CHƯA được giáo viên xác minh: chỉ là ước lượng, không kết luận đạt/không đạt.'
    : !s.enoughSample ? 'Chưa đủ mẫu để kết luận đạt mục tiêu.'
    : reached && lowCoverage ? `Độ đúng đạt nhưng bao phủ chỉ ${pct(s.coverage)} (< ${MIN_COVERAGE * 100}%): chưa đủ để kết luận — AI mới tự đề xuất được ít câu.`
    : reached ? 'Đạt mục tiêu độ đúng trong nhóm đủ tin cậy (trên bộ nhãn này).' : 'CHƯA đạt mục tiêu độ đúng trong nhóm đủ tin cậy.');
  return lines.join('\n');
}
