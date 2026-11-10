// Xuất một bộ trình chiếu ra PDF khổ màn chiếu 16:9: trang bìa (tên bộ, số câu) rồi mỗi câu một trang.
// Dùng đúng bộ khai báo của đề HEdu (hedu.sty + ex_test, pdfLaTeX) nên câu hiện như khi in đề; LaTeX của câu giữ nguyên văn.
import { texText } from './examwrap';
import { heduFiles } from './hedusty';
import { invoke } from './platform';
import { getSettings } from './tikz';
import type { DeckItem } from './slidedeck';
import type { Question } from './types';

export const SLIDES_MAIN = 'trinh-chieu.tex';

/** Tệp chính: khổ 170 × 95,6 mm (16:9, chiếu toàn màn hình thì chữ to tương ứng), không đầu/chân trang; `solution` = kèm lời giải ngay dưới câu. */
export function slidesTex(name: string, items: readonly DeckItem[], solution: boolean): string {
  const L = [
    '\\documentclass[12pt,oneside]{book}',
    '\\input{khaibaochung}',
    solution ? '' : '\\anloigiai',
    '\\geometry{paperwidth=170mm,paperheight=95.6mm,margin=8mm,top=7mm,bottom=6mm,headheight=0mm,headsep=0mm,footskip=0mm}',
    '\\pagestyle{empty}',
    '\\begin{document}',
    '\\thispagestyle{empty}',
    '{\\centering\\vspace*{\\fill}',
    `{\\fontsize{22}{27}\\selectfont\\bfseries ${texText(name) || 'Trình chiếu'}\\par}\\vspace{6mm}`,
    `{\\fontsize{13}{16}\\selectfont ${items.length} câu${solution ? ' · có lời giải' : ''}\\par}`,
    '\\vspace*{\\fill}\\par}',
    '\\newpage',
  ];
  items.forEach((it, i) => {
    L.push(`% ---- câu ${i + 1} ----`, `\\setcounter{ex}{${i}}`, it.latex.trim(), '\\newpage');
  });
  L.push('\\end{document}', '');
  return L.filter((x) => x !== '').join('\n');
}

/** Bộ tệp để dịch: bộ khai báo HEdu (gói riêng suy từ chính các câu) + tệp chính. */
export function slidesFiles(name: string, items: readonly DeckItem[], solution: boolean): { path: string; text: string }[] {
  const qs = items.map((x) => ({ latex: x.latex })) as unknown as Question[];
  return [...heduFiles(qs, ''), { path: SLIDES_MAIN, text: slidesTex(name, items, solution) }];
}

/** Tên tệp: bỏ dấu, chỉ chữ số/chữ thường/gạch nối. */
export const slidesBase = (name: string, solution: boolean): string =>
  (name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'trinh-chieu') + (solution ? '-loi-giai' : '');

/** Dịch bằng pdfLaTeX rồi lưu PDF vào `destDir`; trả về đường dẫn tệp đã lưu. */
export function exportSlidesPdf(name: string, items: readonly DeckItem[], solution: boolean, destDir: string): Promise<string> {
  return invoke<string>('tex_pdf_to_dir', { files: slidesFiles(name, items, solution), main: SLIDES_MAIN, texBin: getSettings().texBin.trim() || null, engine: 'pdflatex', destDir, base: slidesBase(name, solution) });
}
