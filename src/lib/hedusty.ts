// Gói khai báo đề thi của HEdu (hedu.sty) — giai đoạn 1: đóng gói phần khai báo chung đang dùng thành MỘT gói có số phiên bản,
// cộng chỗ nạp các gói riêng mà câu hỏi của từng đề cần (hedu-goithem.tex, do HEdu tự sinh), và lệnh \hetde.
// Bố cục trang, tiêu đề, đầu/chân trang GIỮ NGUYÊN như khaibaochung cũ (nằm ở hedu-khaibao.tex) để không đổi bản in.
//
//   main.tex ──\input{khaibaochung}──▶ khaibaochung.tex (\usepackage{hedu})
//                                        └▶ hedu.sty ──▶ hedu-khaibao.tex (khai báo chung: gói, khổ giấy, tiêu đề, đầu/chân trang)
//                                                      └▶ hedu-goithem.tex (gói riêng của bộ câu hỏi này; không có thì bỏ qua)
import { collectNeeds, type Need } from './texproject';
import { KHAIBAOCHUNG_TEX } from './texproject.template';
import type { Question } from './types';

export const HEDU_STY_VERSION = '1.0';
export const HEDU_STY_DATE = '2026/10/29';

/** Gói không cần nạp thêm (lớp tài liệu, gói nền đã có trong khai báo). */
const SKIP = new Set(['article', 'book', 'report', 'amsmath', 'amssymb', 'graphicx', 'xcolor', 'hedu']);

export const HEDU_STY = String.raw`% ============================================================================
% hedu.sty — Gói khai báo đề thi của HEdu, phiên bản ${HEDU_STY_VERSION} (${HEDU_STY_DATE}).
% Do HEdu tạo cùng bộ đề. Muốn đổi bố cục chung: sửa hedu-khaibao.tex; gói riêng của bộ câu hỏi: hedu-goithem.tex.
% ============================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{hedu}[${HEDU_STY_DATE} v${HEDU_STY_VERSION} Khai bao de thi HEdu]
\DeclareOption*{\PackageWarning{hedu}{Tuy chon '\CurrentOption' chua dung o phien ban nay, bo qua}}
\ProcessOptions\relax
% Khai báo chung (gói, khổ giấy, tiêu đề, đầu/chân trang) — tệp viết theo kiểu tài liệu thường nên đọc với @ là ký tự thường.
\makeatother
\input{hedu-khaibao.tex}
\makeatletter
% Dòng kết thúc đề.
\providecommand\hetde{\par\vspace{2ex}\begin{center}\textbf{------------ HẾT ------------}\end{center}\par}
% Gói riêng mà các câu hỏi của bộ đề này cần (HEdu tự sinh từ mã câu hỏi).
\IfFileExists{hedu-goithem.tex}{\input{hedu-goithem.tex}}{}
\endinput
`;

/** khaibaochung.tex mới: chỉ nạp hedu.sty (main.tex vẫn \input{khaibaochung} như cũ). */
export const KHAIBAOCHUNG_THIN = String.raw`% khaibaochung.tex — nạp gói khai báo đề thi của HEdu (hedu.sty, để cùng thư mục).
% Bố cục chung nằm ở hedu-khaibao.tex; gói riêng của bộ câu hỏi nằm ở hedu-goithem.tex.
\usepackage{hedu}
`;

/** Tên gói hợp lệ để ghi vào \usepackage (tránh chèn mã lạ). */
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;

/**
 * hedu-goithem.tex: các gói/thư viện mà câu hỏi khai báo hoặc dùng lệnh đặc trưng nhưng khai báo chung CHƯA có.
 * Gói đã được nạp (vd trong shared-content) thì bỏ qua bằng \@ifpackageloaded nên không xung đột tuỳ chọn.
 */
export function goiThemTex(needs: readonly Need[]): string {
  const extra = needs.filter((n) => n.from !== 'khai-bao' && !n.bundled && SAFE.test(n.name));
  const pk = [...new Set(extra.filter((n) => n.kind === 'package' && !SKIP.has(n.name)).map((n) => n.name))].sort();
  const tz = [...new Set(extra.filter((n) => n.kind === 'tikzlib').map((n) => n.name))].sort();
  const pg = [...new Set(extra.filter((n) => n.kind === 'pgfplotslib').map((n) => n.name))].sort();
  const L = ['% hedu-goithem.tex — gói riêng mà câu hỏi của bộ đề này cần (HEdu tự sinh; sửa tay được).', '\\makeatletter'];
  for (const p of pk) L.push(`\\@ifpackageloaded{${p}}{}{\\usepackage{${p}}}`);
  if (tz.length) L.push(`\\usetikzlibrary{${tz.join(',')}}`);
  if (pg.length) L.push(`\\@ifpackageloaded{pgfplots}{\\usepgfplotslibrary{${pg.join(',')}}}{}`);
  if (!pk.length && !tz.length && !pg.length) L.push('% (bộ câu hỏi này không cần gói nào ngoài khai báo chung)');
  L.push('\\makeatother');
  return L.join('\n') + '\n';
}

/** Bộ tệp khai báo của một đề/bộ câu hỏi: khaibaochung.tex (mỏng), hedu.sty, hedu-khaibao.tex, hedu-goithem.tex. */
export function heduFiles(qs: readonly Question[], sharedContent: string): { path: string; text: string }[] {
  return [
    { path: 'khaibaochung.tex', text: KHAIBAOCHUNG_THIN },
    { path: 'hedu.sty', text: HEDU_STY },
    { path: 'hedu-khaibao.tex', text: KHAIBAOCHUNG_TEX },
    { path: 'hedu-goithem.tex', text: goiThemTex(collectNeeds(qs, sharedContent)) },
  ];
}
