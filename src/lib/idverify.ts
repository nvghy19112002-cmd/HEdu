// Kiểm chứng ID có sẵn trong LaTeX khi nhập (quy tắc 15a, claude/thiet-ke-dot1-cung-co-ngan-hang.md mục 3.1).
// ID đọc từ tệp nguồn là bằng chứng CẦN kiểm chứng: mã đúng cú pháp và còn trong cây chưa chứng minh đúng Dạng.
// Bằng chứng độc lập = IdSuggester dựng CHỈ trên câu ĐÃ DUYỆT của ngân hàng (câu chưa kiểm tra / cần sửa không làm căn cứ).
//   khop             gợi ý tin cậy "cao/vừa" trùng đúng Dạng của ID ⇒ vào bình thường.
//   chua-kiem-chung  không đủ căn cứ (kho chưa có câu đã duyệt đủ gần, gợi ý thấp) ⇒ vào, nhưng KHÔNG gọi là đã kiểm chứng.
//   bat-dong         gợi ý tin cậy "cao" chỉ Dạng khác ID ⇒ KHÔNG nhập lặng lẽ: giáo viên chọn.
// Mức độ (N/H/V/C) không bao giờ tự đổi: đổi Dạng/vị trí vẫn giữ mức độ gốc của ID; muốn đổi mức độ phải chọn riêng.
// Quyết định của giáo viên gắn với đúng kết quả kiểm đã xem (`verificationSig`): gợi ý/cây/câu đổi ⇒ phải chọn lại.
import { IdSuggester, type SuggestConfidence, type SuggestOption } from './idsuggest';
import { placeWithId, strictCode } from './idsync';
import { reviewOf, type Level, type Location, type Question, type Taxonomy } from './types';

export type IdVerdict = 'khop' | 'chua-kiem-chung' | 'bat-dong';
/** Lựa chọn của giáo viên cho câu Bất đồng: giữ ID trong tệp / theo gợi ý / vị trí chung đang chọn. */
export type IdChoice = 'giu' | 'goi-y' | 'chung';
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

/** Câu làm căn cứ kiểm chứng: chỉ câu ĐÃ DUYỆT. */
export const evidenceQuestions = (questions: readonly Question[]): Question[] => questions.filter((q) => reviewOf(q) === 'approved');

/** Bộ gợi ý dùng để kiểm chứng: dựng chỉ trên câu đã duyệt. */
export const verifierFor = (tax: Taxonomy, questions: readonly Question[]): IdSuggester => new IdSuggester(tax, evidenceQuestions(questions));

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

export interface VerifySummary { total: number; khop: number; chua: number; batDong: number; pending: number; unchecked: number }

/** Tổng hợp cho các câu SẼ NHẬP có ID hợp lệ. `unchecked` = chưa kiểm xong (phải đợi). `pending` = Bất đồng chưa có quyết định còn hiệu lực. */
export function summarizeVerify(
  withId: readonly number[],
  verOf: (i: number) => IdVerification | undefined,
  decOf: (i: number) => IdDecision | undefined,
  importing: (i: number) => boolean,
): VerifySummary {
  const s: VerifySummary = { total: 0, khop: 0, chua: 0, batDong: 0, pending: 0, unchecked: 0 };
  for (const i of withId) {
    if (!importing(i)) continue;
    s.total++;
    const v = verOf(i);
    if (!v) { s.unchecked++; continue; }
    if (v.verdict === 'khop') s.khop++;
    else if (v.verdict === 'chua-kiem-chung') s.chua++;
    else { s.batDong++; if (!usableDecision(v, decOf(i))) s.pending++; }
  }
  return s;
}

export type Placed = { ok: true; latex: string; level: Level; loc: Location } | { ok: false; reason: string };

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
 * Giữ ID ⇒ LaTeX nguyên văn. Đổi vị trí ⇒ ghi ID mới vào `%[ID]` cùng lúc với vị trí (quy tắc 10: cả hai hoặc không gì); không ghi được ⇒ lỗi, KHÔNG lưu nửa vời.
 * Mức độ: giữ mức độ gốc của ID, trừ khi giáo viên chọn riêng "đổi theo ô Mức độ chung".
 */
export function placeDisputed(p: PlaceInput): Placed {
  const d = usableDecision(p.ver, p.decision);
  if (!d) return { ok: false, reason: 'Chưa có quyết định còn hiệu lực cho ID bất đồng (gợi ý, cây hoặc câu đã đổi sau khi bạn chọn).' };
  if (d.choice === 'giu') {
    const sc = strictCode(p.id.loc, p.id.level, p.tax);
    return sc.ok ? { ok: true, latex: p.text, level: p.id.level, loc: p.id.loc } : { ok: false, reason: `Vị trí của ID trong tệp không còn đúng đường dẫn cây (${sc.problem}).` };
  }
  const to = d.choice === 'goi-y' ? p.ver.suggested?.location : p.commonLoc;
  if (!to) return { ok: false, reason: 'Không có Dạng gợi ý để áp dụng.' };
  const level = d.level === 'chung' ? p.commonLevel : p.id.level;
  const w = placeWithId(p.text, to, level, p.tax, true);
  if ('problem' in w) return { ok: false, reason: `Không ghi được ID mới vào LaTeX (${w.problem}).` };
  return { ok: true, latex: w.latex, level, loc: to };
}
