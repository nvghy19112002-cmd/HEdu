// Đề chỉ có nội dung (không có \documentclass): khi biên dịch, HEdu tự ghép phần đầu theo mẫu in đang chọn.
// Bộ tệp "bọc" chỉ ghi vào thư mục build (Rust examcompile.rs, `wrap`), tệp của đề không bị sửa.
//  - Mẫu HyMath (mặc định): hedu-boc.tex giống main.tex của bộ HyMath (\ThemeFile, \CheDo mau|in|loigiai, năm học, giáo viên)
//    + lõi hymath-*.tex + tệp mẫu; chế độ do tệp bọc đặt (`wrapModes`). Dịch bằng pdfLaTeX (nhanh gấp ~3 lần): phần nạp phông
//    XeLaTeX của lõi được thay bằng phông T5 cùng họ chữ (`pdfCore`); đề có ký tự pdfLaTeX không đọc được thì dịch lại bằng XeLaTeX
//    (`needsXeLaTeX`, ExamWorkspace).
//  - "Mặc định HEdu (kiểu cũ)": hedu-boc.tex = phần đầu của Tạo đề + hedu.sty…; pdfLaTeX; Đề/Lời giải qua \usepackage[…]{ex_test}.
import { lacksPreamble } from './ewlayout';
import type { ExamMode } from './examcompile';
import { MAIN_HEAD } from './examgen';
import { HEDU_THEME_ID, hymathFiles, themeFiles, themeOf } from './examtheme';
import type { Question } from './types';

export const WRAP_MAIN = 'hedu-boc.tex';

export interface WrapFile { path: string; text: string }
export type WrapEngine = 'pdflatex' | 'xelatex';
export interface Wrap { files: WrapFile[]; /** tệp bọc tự đặt chế độ (HyMath) */ modes: boolean; /** trình dịch bắt buộc của mẫu HyMath; null = theo cài đặt của đề */ engine: WrapEngine | null }
export interface WrapInfo { schoolYear: string; teacher: string }

/**
 * Phần nạp phông của lõi HyMath khi dịch bằng pdfLaTeX. Mọi mẫu HyMath đều chọn TeX Gyre Termes (chữ) + Heros (không chân)
 * + Termes Math (công thức) ⇒ tgtermes + tgheros + newtxmath, bảng mã T5 cho tiếng Việt. Lệnh chọn phông OpenType của tệp mẫu
 * (\setmainfont, \setsansfont, \setmathfont, \IfFontExistsTF) thành lệnh rỗng. Các gói còn lại giữ như lõi XeLaTeX.
 */
export const PDF_CORE_HEAD = String.raw`% Bản pdfLaTeX của lõi HyMath (HEdu tự đổi khi biên dịch): phông T5 cùng họ chữ thay cho fontspec/unicode-math.
\usepackage[utf8]{vietnam}
\usepackage{amsmath}
\usepackage{tgtermes}
\usepackage{tgheros}
\usepackage[smallerops]{newtxmath}
\makeatletter
\@namedef{ver@amssymb.sty}{2013/01/14 v3.01 provided by newtxmath}
\@namedef{ver@amsfonts.sty}{2013/01/14 v3.01 provided by newtxmath}
\makeatother
\NewDocumentCommand{\setmainfont}{m O{}}{}
\NewDocumentCommand{\setsansfont}{m O{}}{}
\NewDocumentCommand{\setmathfont}{m O{}}{}
\providecommand{\IfFontExistsTF}[3]{#2}
\usepackage[margin=17mm,top=24mm,bottom=22mm,headheight=22pt,headsep=7mm]{geometry}
\usepackage[table]{xcolor}
\usepackage{tikz}
\usetikzlibrary{calc,patterns}
\usepackage[most]{tcolorbox}
`;

const XE_FONTS = String.raw`\usepackage{fontspec}`;
const XE_END = String.raw`\usepackage{ex_test}`;
/** Các gói lõi XeLaTeX nạp trước ex_test, đúng thứ tự mà PDF_CORE_HEAD đã tính tới. Lõi đổi khác (bộ HyMath cập nhật) ⇒ không đổi, dịch XeLaTeX như cũ. */
const XE_KNOWN = ['{fontspec}', '{amsmath}', '{unicode-math}', '[margin=17mm,top=24mm,bottom=22mm,headheight=22pt,headsep=7mm]{geometry}', '[table]{xcolor}', '{tikz}', '[most]{tcolorbox}'];

/** Lõi `hymath-core.tex` bản pdfLaTeX: thay khối nạp phông XeLaTeX (từ \usepackage{fontspec} tới trước \usepackage{ex_test}). null nếu lõi không đúng dạng đã biết. */
export function pdfCore(core: string): string | null {
  const a = core.indexOf(XE_FONTS), b = core.indexOf(XE_END);
  if (a < 0 || b < a) return null;
  const pkgs = [...core.slice(a, b).matchAll(/\\usepackage(\S*)/g)].map((m) => m[1]);
  if (pkgs.length !== XE_KNOWN.length || pkgs.some((p, i) => p !== XE_KNOWN[i])) return null;
  return core.slice(0, a) + PDF_CORE_HEAD + core.slice(b);
}

/** Bản pdfLaTeX dịch lỗi vì nội dung cần XeLaTeX (ký tự Unicode ngoài bảng mã T5, gói chỉ chạy với XeLaTeX/LuaLaTeX…) ⇒ dịch lại bằng XeLaTeX. */
export function needsXeLaTeX(rawLog: string): boolean {
  return /Unicode character [\s\S]{0,40}?not set up for use with LaTeX|Invalid UTF-8 byte|requires (?:either )?XeTeX or LuaTeX|fontspec Error|unavailable in encoding T5|Package inputenc Error|Package fontenc Error/i.test(rawLog);
}

/** Tên dùng trong \input{…}: bỏ thư mục và đuôi .tex. null nếu tên có ký tự TeX khó đọc (khoảng trắng, %, #, {…}) — khi đó không tự ghép. */
export function inputName(mainRel: string): string | null {
  const base = mainRel.split('/').pop() ?? '';
  const name = base.replace(/\.tex$/i, '');
  return name && /^[\p{L}\p{N}._-]+$/u.test(name) ? name : null;
}

/** Chế độ của HyMath (\CheDo) theo bản HEdu đang dịch. */
export const cheDo = (mode: ExamMode): 'mau' | 'in' | 'loigiai' => (mode === 'loigiai' ? 'loigiai' : mode === 'de-in' ? 'in' : 'mau');

/** Chữ người dùng gõ (năm học, tên giáo viên) đặt an toàn vào lệnh TeX: thoát ký tự đặc biệt, bỏ dấu \ và xuống dòng. */
export const texText = (s: string): string => s.replace(/[\\\r\n]+/g, ' ').replace(/([#$%&_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}').trim();

function hymathMain(name: string, themeFile: string, mode: ExamMode, info: WrapInfo): string {
  return [
    '% Tệp bọc do HEdu tự sinh khi biên dịch (chỉ trong thư mục tạm) — tương đương main.tex của bộ HyMath.',
    '\\documentclass[12pt,a4paper]{article}',
    '\\usepackage{etoolbox}',
    `\\def\\ThemeFile{${themeFile}}`,
    `\\def\\CheDo{${cheDo(mode)}}`,
    `\\newcommand{\\SchoolYear}{${texText(info.schoolYear)}}`,
    `\\newcommand{\\TeacherName}{${texText(info.teacher)}}`,
    '\\newif\\ifExamColor \\ExamColortrue',
    '\\newif\\ifExamSolutions \\ExamSolutionsfalse',
    '\\ifdefstring{\\CheDo}{in}{\\ExamColorfalse}{\\ifdefstring{\\CheDo}{loigiai}{\\ExamSolutionstrue}{}}',
    '% Thông tin đề lấy từ \\TieuDeDeSo / \\TieuDeDeThi trong tệp dữ liệu.',
    '\\newcommand{\\SchoolName}{TRƯỜNG THPT}',
    '\\newcommand{\\ExamName}{ĐỀ KIỂM TRA}',
    '\\newcommand{\\SubjectName}{TOÁN}',
    '\\newcommand{\\ExamTime}{90 phút}',
    '\\newcommand{\\ExamCode}{01}',
    '\\input{hymath-caidat.tex}',
    '\\def\\parskipchoice{2.5mm}',
    '\\input{hymath-hopgiaidap.tex}',
    '\\begin{document}',
    `\\input{${name}}`,
    '\\end{document}',
    '',
  ].join('\n');
}

/** Bộ tệp bọc cho tệp dữ liệu `mainRel` (nội dung `text`). null nếu tệp đã đầy đủ hoặc tên tệp không dùng được. */
export function wrapFiles(mainRel: string, text: string, themeId: string, mode: ExamMode = 'de', info: WrapInfo = { schoolYear: '', teacher: '' }, engine: WrapEngine = 'pdflatex'): Wrap | null {
  if (!lacksPreamble(text)) return null;
  const name = inputName(mainRel);
  if (!name) return null;
  const t = themeOf(themeId);
  const hy = themeId === HEDU_THEME_ID ? null : hymathFiles(t.id);
  if (hy && t.file) {
    const head = { path: WRAP_MAIN, text: hymathMain(name, t.file, mode, info) };
    const core = hy.find((f) => f.path === 'hymath-core.tex');
    const pdf = engine === 'pdflatex' && core ? pdfCore(core.text) : null;
    if (pdf === null) return { files: [head, ...hy], modes: true, engine: 'xelatex' };
    return { files: [head, ...hy.map((f) => (f === core ? { ...f, text: pdf } : f))], modes: true, engine: 'pdflatex' };
  }
  // kiểu cũ: phần đầu giống hệt main.tex của đề do Tạo đề dựng; heduFiles chỉ đọc `.latex` để suy ra gói riêng cần nạp
  const fake = [{ latex: text }] as unknown as Question[];
  return { files: [{ path: WRAP_MAIN, text: `${MAIN_HEAD}\n\\input{${name}}\n\\end{document}\n` }, ...themeFiles(HEDU_THEME_ID, fake, '')], modes: false, engine: null };
}
