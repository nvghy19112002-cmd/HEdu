// Kiểm chứng ID có sẵn trong LaTeX khi nhập (quy tắc 15a, claude/thiet-ke-dot1-cung-co-ngan-hang.md mục 3.1).
// ID đọc từ tệp nguồn là bằng chứng CẦN kiểm chứng: mã đúng cú pháp và còn trong cây chưa chứng minh đúng Dạng.
// Bằng chứng độc lập = IdSuggester (từ khoá + câu giống đã có trong ngân hàng). Câu đang nhập chưa nằm trong ngân hàng nên không cần loại trừ.
//   khop             gợi ý tin cậy "cao/vừa" trùng đúng Dạng của ID ⇒ vào bình thường.
//   chua-kiem-chung  không đủ căn cứ (kho thiếu mẫu, gợi ý thấp) ⇒ vào, nhưng KHÔNG gọi là đã kiểm chứng.
//   bat-dong         gợi ý tin cậy "cao" chỉ Dạng khác ID ⇒ KHÔNG nhập lặng lẽ: giáo viên chọn.
// Mức độ (N/H/V/C) không bao giờ tự đổi: chỉ khác mức độ mà cùng Dạng thì vẫn là "khop".
import type { IdSuggester, SuggestConfidence, SuggestOption } from './idsuggest';
import type { Location } from './types';

export type IdVerdict = 'khop' | 'chua-kiem-chung' | 'bat-dong';
/** Lựa chọn của giáo viên cho câu Bất đồng: giữ ID trong tệp / theo gợi ý / vị trí chung đang chọn. */
export type IdChoice = 'giu' | 'goi-y' | 'chung';

export const VERDICT_LABEL: Record<IdVerdict, string> = {
  khop: 'ID khớp ngân hàng',
  'chua-kiem-chung': 'ID chưa kiểm chứng',
  'bat-dong': 'ID bất đồng với ngân hàng',
};

export interface IdVerification {
  verdict: IdVerdict;
  confidence: SuggestConfidence;
  /** Dạng gợi ý độc lập (có thể trùng hoặc khác ID) */
  suggested: SuggestOption | null;
  /** LaTeX lúc kiểm: câu sửa sau đó ⇒ kết quả cũ không dùng nữa */
  latex: string;
  /** dấu phiên bản cây lúc kiểm */
  taxRev: string;
}

/** Kiểm một câu có ID hợp lệ. `idLoc` = vị trí đọc từ ID trong LaTeX. */
export function verifyId(latex: string, idLoc: Location, s: IdSuggester, key: string): IdVerification {
  const sg = s.suggest({ key, latex, grade: idLoc.grade });
  const best = sg.best;
  let verdict: IdVerdict = 'chua-kiem-chung';
  if (best && best.formId === idLoc.formId && (sg.confidence === 'cao' || sg.confidence === 'vua')) verdict = 'khop';
  else if (best && best.formId !== idLoc.formId && sg.confidence === 'cao') verdict = 'bat-dong';
  return { verdict, confidence: sg.confidence, suggested: best, latex, taxRev: sg.taxRev };
}

/** Kết quả kiểm còn dùng được không (câu chưa sửa, cây chưa đổi). */
export const isFresh = (v: IdVerification | undefined, latexNow: string, taxRevNow: string): boolean =>
  !!v && v.latex === latexNow && v.taxRev === taxRevNow;

/** Lựa chọn hợp lệ với câu Bất đồng: 'goi-y' chỉ khi có Dạng gợi ý. Chưa chọn / không hợp lệ ⇒ undefined (câu chưa được nhập). */
export function usableChoice(v: IdVerification | undefined, c: IdChoice | undefined): IdChoice | undefined {
  if (!v || v.verdict !== 'bat-dong' || !c) return undefined;
  if (c === 'goi-y' && !v.suggested) return undefined;
  return c;
}

export interface VerifySummary { total: number; khop: number; chua: number; batDong: number; pending: number; unchecked: number }

/** Tổng hợp cho các câu SẼ NHẬP có ID hợp lệ. `unchecked` = chưa kiểm xong (phải đợi). `pending` = Bất đồng chưa chọn. */
export function summarizeVerify(
  withId: readonly number[],
  verOf: (i: number) => IdVerification | undefined,
  choiceOf: (i: number) => IdChoice | undefined,
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
    else { s.batDong++; if (!usableChoice(v, choiceOf(i))) s.pending++; }
  }
  return s;
}
