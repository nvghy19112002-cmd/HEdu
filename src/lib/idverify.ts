// Kiểm chứng ID có sẵn trong LaTeX khi nhập (quy tắc 15a, claude/thiet-ke-dot1-cung-co-ngan-hang.md mục 3.1).
// ID đọc từ tệp nguồn là bằng chứng CẦN kiểm chứng: mã đúng cú pháp và còn trong cây chưa chứng minh đúng Dạng.
// Bằng chứng độc lập = IdSuggester dựng CHỈ trên câu ĐÃ DUYỆT của ngân hàng (câu chưa kiểm tra / cần sửa không làm căn cứ).
//   khop             gợi ý tin cậy "cao/vừa" trùng đúng Dạng của ID ⇒ vào bình thường.
//   chua-kiem-chung  không đủ căn cứ (kho chưa có câu đã duyệt đủ gần, gợi ý thấp) ⇒ vào, nhưng KHÔNG gọi là đã kiểm chứng.
//   bat-dong         gợi ý tin cậy "cao" chỉ Dạng khác ID ⇒ KHÔNG nhập lặng lẽ: giáo viên chọn.
// Mức độ (N/H/V/C) không bao giờ tự đổi: đổi Dạng/vị trí vẫn giữ mức độ gốc của ID; muốn đổi mức độ phải chọn riêng.
// Quyết định của giáo viên gắn với đúng kết quả kiểm đã xem (`verificationSig`): gợi ý/cây/câu đổi ⇒ phải chọn lại.
import { isEvidence, type Effective, type FormState, type IdSource } from './idreview';
import { IdSuggester, type SuggestConfidence, type SuggestOption } from './idsuggest';
import { placeWithId, strictCode } from './idsync';
import type { Level, Location, Question, Taxonomy } from './types';

export type IdVerdict = 'khop' | 'chua-kiem-chung' | 'bat-dong';
/**
 * Lựa chọn của giáo viên cho câu Bất đồng: chờ xác minh (hàng đợi, MẶC ĐỊNH) / giữ ID trong tệp / theo gợi ý / chưa phân loại (vị trí chung).
 * Mặc định "chờ xác minh" giữ ID gốc ở đúng vị trí tệp ghi, đánh dấu cần xem lại (không làm căn cứ), để lô lớn không bị chặn bởi vài câu khó.
 */
export type IdChoice = 'cho' | 'giu' | 'goi-y' | 'chung';
/** Mức độ khi đổi vị trí: giữ mức độ gốc của ID (mặc định) hoặc đổi theo ô Mức độ chung — lựa chọn riêng, rõ ràng. */
export type LevelChoice = 'giu' | 'chung';

export const VERDICT_LABEL: Record<IdVerdict, string> = {
  khop: 'ID khớp ngân hàng',
  'chua-kiem-chung': 'ID chưa kiểm chứng',
  'bat-dong': 'ID bất đồng với ngân hàng',
};

export interface IdVerification {
  verdict: IdVerdict;
  confidence: SuggestConfidence;
  /** Dạng của ID trong tệp */
  idFormId: string;
  /** Dạng gợi ý độc lập (có thể trùng hoặc khác ID) */
  suggested: SuggestOption | null;
  /** LaTeX lúc kiểm: câu sửa sau đó ⇒ kết quả cũ không dùng nữa */
  latex: string;
  /** dấu phiên bản cây lúc kiểm */
  taxRev: string;
}

const NO_STATE: Effective = { form: 'chua', level: 'chua', unclassified: false };

/**
 * Câu làm căn cứ kiểm chứng: Dạng "giáo viên xác minh" hoặc nội dung "Đã duyệt" (tạm thời, đến khi có hàng đợi xác nhận Dạng),
 * trừ câu "cần xem lại" và câu "chưa phân loại". Câu chưa duyệt / cần sửa / "máy phân loại" không bao giờ là căn cứ.
 */
export const evidenceQuestions = (questions: readonly Question[], effOf: (q: Question) => Effective = () => NO_STATE): Question[] =>
  questions.filter((q) => isEvidence(q, effOf(q)));

/** Bộ gợi ý dùng để kiểm chứng: dựng chỉ trên câu làm căn cứ. */
export const verifierFor = (tax: Taxonomy, questions: readonly Question[], effOf?: (q: Question) => Effective): IdSuggester => new IdSuggester(tax, evidenceQuestions(questions, effOf));

/** Kiểm một câu có ID hợp lệ. `idLoc` = vị trí đọc từ ID trong LaTeX. `s` PHẢI dựng bằng `verifierFor`. */
export function verifyId(latex: string, idLoc: Location, s: IdSuggester, key: string): IdVerification {
  const sg = s.suggest({ key, latex, grade: idLoc.grade });
  const best = sg.best;
  let verdict: IdVerdict = 'chua-kiem-chung';
  if (best && best.formId === idLoc.formId && (sg.confidence === 'cao' || sg.confidence === 'vua')) verdict = 'khop';
  else if (best && best.formId !== idLoc.formId && sg.confidence === 'cao') verdict = 'bat-dong';
  return { verdict, confidence: sg.confidence, idFormId: idLoc.formId, suggested: best, latex, taxRev: sg.taxRev };
}

/** Dấu của một kết quả kiểm: đổi gợi ý, Dạng của ID, kết luận hoặc phiên bản cây ⇒ dấu đổi. */
export const verificationSig = (v: IdVerification): string => [v.verdict, v.idFormId, v.suggested?.formId ?? '', v.taxRev].join('|');

/** Kết quả kiểm còn dùng được không (câu chưa sửa, cây chưa đổi). */
export const isFresh = (v: IdVerification | undefined, latexNow: string, taxRevNow: string): boolean =>
  !!v && v.latex === latexNow && v.taxRev === taxRevNow;

/** Quyết định của giáo viên cho một câu bất đồng, gắn với kết quả kiểm đã xem. */
export interface IdDecision { choice: IdChoice; level: LevelChoice; latex: string; sig: string }

export const decide = (v: IdVerification, choice: IdChoice, level: LevelChoice = 'giu'): IdDecision => ({ choice, level, latex: v.latex, sig: verificationSig(v) });

/** Quyết định còn hiệu lực? Chỉ khi kết quả kiểm hiện tại là Bất đồng, đúng câu, đúng dấu đã xem; 'goi-y' cần có Dạng gợi ý. */
export function usableDecision(v: IdVerification | undefined, d: IdDecision | undefined): IdDecision | undefined {
  if (!v || !d || v.verdict !== 'bat-dong') return undefined;
  if (d.latex !== v.latex || d.sig !== verificationSig(v)) return undefined;
  if (d.choice === 'goi-y' && !v.suggested) return undefined;
  return d;
}

/**
 * Quyết định áp dụng thật cho một câu: quyết định của giáo viên nếu còn hiệu lực (đúng câu, đúng gợi ý, đúng cây đã xem),
 * nếu không (chưa chọn, hoặc gợi ý/cây/câu đã đổi) ⇒ mặc định "chờ xác minh". Câu không bất đồng ⇒ undefined.
 */
export function effectiveDecision(v: IdVerification | undefined, d: IdDecision | undefined): IdDecision | undefined {
  if (!v || v.verdict !== 'bat-dong') return undefined;
  return usableDecision(v, d) ?? decide(v, 'cho');
}

export interface VerifySummary { total: number; khop: number; chua: number; batDong: number; /** trong số bất đồng: bao nhiêu câu vào hàng đợi (chờ xác minh) */ queued: number; unchecked: number }

/** Tổng hợp cho các câu SẼ NHẬP có ID hợp lệ. `unchecked` = chưa kiểm xong (phải đợi). */
export function summarizeVerify(
  withId: readonly number[],
  verOf: (i: number) => IdVerification | undefined,
  decOf: (i: number) => IdDecision | undefined,
  importing: (i: number) => boolean,
): VerifySummary {
  const s: VerifySummary = { total: 0, khop: 0, chua: 0, batDong: 0, queued: 0, unchecked: 0 };
  for (const i of withId) {
    if (!importing(i)) continue;
    s.total++;
    const v = verOf(i);
    if (!v) { s.unchecked++; continue; }
    if (v.verdict === 'khop') s.khop++;
    else if (v.verdict === 'chua-kiem-chung') s.chua++;
    else { s.batDong++; if (effectiveDecision(v, decOf(i))?.choice === 'cho') s.queued++; }
  }
  return s;
}

/** Trạng thái xác minh sẽ lưu kèm (tệp phụ id-review). */
export interface PlacedMeta { form: FormState; src: IdSource; unclassified: boolean; why?: string; /** ID nguyên bản trong tệp */ orig?: string; /** Dạng máy đề xuất (câu chờ xác minh) */ prop?: string }
export type Placed = ({ ok: true; latex: string; level: Level; loc: Location } & PlacedMeta) | { ok: false; reason: string };

export interface PlaceInput {
  /** LaTeX đã cắt khoảng trắng đầu/cuối, đúng như sẽ lưu */
  text: string;
  /** vị trí + mức độ đọc từ ID trong tệp */
  id: { loc: Location; level: Level };
  /** kết quả kiểm HIỆN TẠI (kiểm lại ngay trước khi ghi) */
  ver: IdVerification;
  decision: IdDecision | undefined;
  commonLoc: Location;
  commonLevel: Level;
  tax: Taxonomy;
}

/**
 * Vị trí, mức độ và LaTeX sẽ GHI cho một câu có ID nhưng BẤT ĐỒNG với ngân hàng. Không có quyết định còn hiệu lực ⇒ KHÔNG ghi.
 * Giữ ID ⇒ LaTeX nguyên văn. Theo gợi ý ⇒ ghi ID mới vào `%[ID]` cùng lúc với vị trí (quy tắc 10: cả hai hoặc không gì); không ghi được ⇒ lỗi, KHÔNG lưu nửa vời.
 * Vị trí chung ⇒ Chưa phân loại: LaTeX nguyên văn, không ghi ID. Chờ xác minh (mặc định) ⇒ giữ ID gốc, cần xem lại, vào hàng đợi.
 * Mức độ: giữ mức độ gốc của ID, trừ khi giáo viên chọn riêng "đổi theo ô Mức độ chung".
 */
export function placeDisputed(p: PlaceInput): Placed {
  const d = effectiveDecision(p.ver, p.decision);
  if (!d) return { ok: false, reason: 'Câu này không ở trạng thái ID bất đồng.' };
  if (d.choice === 'cho') {
    // Chờ xác minh (mặc định): giữ ID gốc ở đúng vị trí tệp ghi, LaTeX nguyên văn, đánh dấu cần xem lại; Dạng máy đề xuất lưu ở tệp phụ.
    const sc = strictCode(p.id.loc, p.id.level, p.tax);
    return sc.ok
      ? { ok: true, latex: p.text, level: p.id.level, loc: p.id.loc, form: 'xem-lai', src: 'tep', unclassified: false, why: 'ID bất đồng với ngân hàng; chờ xác minh', ...(p.ver.suggested ? { prop: p.ver.suggested.formId } : {}) }
      : { ok: false, reason: `Vị trí của ID trong tệp không còn đúng đường dẫn cây (${sc.problem}).` };
  }
  if (d.choice === 'giu') {
    const sc = strictCode(p.id.loc, p.id.level, p.tax);
    return sc.ok
      ? { ok: true, latex: p.text, level: p.id.level, loc: p.id.loc, form: 'chua', src: 'tep', unclassified: false, why: 'ID bất đồng với ngân hàng; giữ ID trong tệp' }
      : { ok: false, reason: `Vị trí của ID trong tệp không còn đúng đường dẫn cây (${sc.problem}).` };
  }
  if (d.choice === 'chung') {
    // Chưa phân loại: vào vị trí chung, LaTeX NGUYÊN VĂN (không ghi ID giả); ID gốc của tệp vẫn nằm trong LaTeX và sẽ hiện là lệch vị trí.
    const lv = d.level === 'chung' ? p.commonLevel : p.id.level;
    const sc = strictCode(p.commonLoc, lv, p.tax);
    if (!sc.ok) return { ok: false, reason: `Vị trí chung không còn đúng đường dẫn cây (${sc.problem}).` };
    return { ok: true, latex: p.text, level: lv, loc: p.commonLoc, form: 'chua', src: 'tay', unclassified: true, why: 'ID bất đồng với ngân hàng; chuyển vào Chưa phân loại' };
  }
  const to = p.ver.suggested?.location;
  if (!to) return { ok: false, reason: 'Không có Dạng gợi ý để áp dụng.' };
  const level = d.level === 'chung' ? p.commonLevel : p.id.level;
  const w = placeWithId(p.text, to, level, p.tax, true);
  if ('problem' in w) return { ok: false, reason: `Không ghi được ID mới vào LaTeX (${w.problem}).` };
  return { ok: true, latex: w.latex, level, loc: to, form: 'may', src: 'goi-y', unclassified: false };
}
