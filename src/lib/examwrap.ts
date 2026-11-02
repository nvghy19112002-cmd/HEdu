// Đề chỉ có nội dung (không có \documentclass): khi biên dịch, HEdu tự ghép phần đầu theo mẫu in đang chọn.
// Bộ tệp "bọc" chỉ ghi vào thư mục build (Rust examcompile.rs, `wrap`), tệp của đề không bị sửa.
//   hedu-boc.tex = \documentclass … \input{khaibaochung} \begin{document} \input{<tệp dữ liệu>} \end{document}
//   + bộ khai báo của mẫu in (khaibaochung.tex, hedu.sty, hedu-khaibao.tex, hedu-goithem.tex)
// Vì phần đầu do HEdu nắm (đúng một \usepackage[...]{ex_test}), bản Đề / Lời giải dùng được cho tệp dữ liệu.
import { lacksPreamble } from './ewlayout';
import { MAIN_HEAD } from './examgen';
import { themeFiles } from './examtheme';
import type { Question } from './types';

export const WRAP_MAIN = 'hedu-boc.tex';

export interface WrapFile { path: string; text: string }

/** Tên dùng trong \input{…}: bỏ thư mục và đuôi .tex. null nếu tên có ký tự TeX khó đọc (khoảng trắng, %, #, {…}) — khi đó không tự ghép. */
export function inputName(mainRel: string): string | null {
  const base = mainRel.split('/').pop() ?? '';
  const name = base.replace(/\.tex$/i, '');
  return name && /^[\p{L}\p{N}._-]+$/u.test(name) ? name : null;
}

/** Bộ tệp bọc cho tệp dữ liệu `mainRel` (nội dung `text`), theo mẫu in `themeId`. null nếu tệp đã đầy đủ hoặc tên tệp không dùng được. */
export function wrapFiles(mainRel: string, text: string, themeId: string): WrapFile[] | null {
  if (!lacksPreamble(text)) return null;
  const name = inputName(mainRel);
  if (!name) return null;
  // phần đầu giống hệt main.tex của đề do Tạo đề dựng (cùng \documentclass, cùng khaibaochung) ⇒ bản in cùng kiểu
  const main = `${MAIN_HEAD}\n\\input{${name}}\n\\end{document}\n`;
  // heduFiles chỉ đọc `.latex` để suy ra gói riêng cần nạp (hedu-goithem.tex)
  const fake = [{ latex: text }] as unknown as Question[];
  return [{ path: WRAP_MAIN, text: main }, ...themeFiles(themeId, fake, '')];
}
