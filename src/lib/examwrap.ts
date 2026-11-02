// Đề chỉ có nội dung (không có \documentclass): khi biên dịch, HEdu tự ghép phần đầu theo mẫu in đang chọn.
// Bộ tệp "bọc" chỉ ghi vào thư mục build (Rust examcompile.rs, `wrap`), tệp của đề không bị sửa.
//  - Mẫu HyMath (mặc định): hedu-boc.tex giống main.tex của bộ HyMath (\ThemeFile, \CheDo mau|in|loigiai, năm học, giáo viên)
//    + lõi hymath-*.tex + tệp mẫu; XeLaTeX; chế độ do tệp bọc đặt (`wrapModes`).
//  - "Mặc định HEdu (kiểu cũ)": hedu-boc.tex = phần đầu của Tạo đề + hedu.sty…; pdfLaTeX; Đề/Lời giải qua \usepackage[…]{ex_test}.
import { lacksPreamble } from './ewlayout';
import type { ExamMode } from './examcompile';
import { MAIN_HEAD } from './examgen';
import { HEDU_THEME_ID, hymathFiles, themeFiles, themeOf } from './examtheme';
import type { Question } from './types';

export const WRAP_MAIN = 'hedu-boc.tex';

export interface WrapFile { path: string; text: string }
export interface Wrap { files: WrapFile[]; /** tệp bọc tự đặt chế độ (HyMath) */ modes: boolean; /** trình dịch bắt buộc (HyMath cần XeLaTeX) */ engine: 'xelatex' | null }
export interface WrapInfo { schoolYear: string; teacher: string }

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
export function wrapFiles(mainRel: string, text: string, themeId: string, mode: ExamMode = 'de', info: WrapInfo = { schoolYear: '', teacher: '' }): Wrap | null {
  if (!lacksPreamble(text)) return null;
  const name = inputName(mainRel);
  if (!name) return null;
  const t = themeOf(themeId);
  const hy = themeId === HEDU_THEME_ID ? null : hymathFiles(t.id);
  if (hy && t.file) return { files: [{ path: WRAP_MAIN, text: hymathMain(name, t.file, mode, info) }, ...hy], modes: true, engine: 'xelatex' };
  // kiểu cũ: phần đầu giống hệt main.tex của đề do Tạo đề dựng; heduFiles chỉ đọc `.latex` để suy ra gói riêng cần nạp
  const fake = [{ latex: text }] as unknown as Question[];
  return { files: [{ path: WRAP_MAIN, text: `${MAIN_HEAD}\n\\input{${name}}\n\\end{document}\n` }, ...themeFiles(HEDU_THEME_ID, fake, '')], modes: false, engine: null };
}
