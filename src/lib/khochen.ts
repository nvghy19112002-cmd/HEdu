// Chèn hình từ Kho hình vào câu / bàn nháp, và lưu hình trong một câu vào Kho (hàm thuần, có kiểm thử).
import { extractDefs } from './extest';

export interface KhoChen { title: string; code: string; extra_preamble: string }

/**
 * Văn bản chèn vào mã câu: các khai báo đi kèm hình (\def, \newcommand, \usetikzlibrary…) rồi mã hình.
 * Kết thúc bằng xuống dòng để chèn giữa dòng cũng không dính chữ. Không thêm chú thích nào.
 */
export function chenText(h: Pick<KhoChen, 'code' | 'extra_preamble'>): string {
  const extra = h.extra_preamble.replace(/\r\n?/g, '\n').trim();
  const code = h.code.replace(/\r\n?/g, '\n').trim();
  return `${extra ? extra + '\n' : ''}${code}\n`;
}

export interface TikzBlock { code: string; /** dòng bắt đầu (từ 1) */ line: number; /** vị trí ký tự bắt đầu trong mã */ start: number }

/** Các khối \begin{tikzpicture}…\end{tikzpicture} trong mã (bỏ khối nằm trong chú thích %). */
export function tikzBlocks(latex: string): TikzBlock[] {
  const out: TikzBlock[] = [];
  const re = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g;
  for (let m: RegExpExecArray | null; (m = re.exec(latex)); ) {
    const lineStart = latex.lastIndexOf('\n', m.index - 1) + 1;
    const before = latex.slice(lineStart, m.index);
    if (/(^|[^\\])%/.test(before)) continue; // cùng dòng, đứng sau dấu % ⇒ đã bị comment
    out.push({ code: m[0], line: latex.slice(0, m.index).split('\n').length, start: m.index });
  }
  return out;
}

/** Các khai báo \def/\newcommand… đi kèm hình trong câu (cùng bộ đọc với xem trước). */
export const defsOf = (latex: string): string => extractDefs(latex).defs.trim();

/** Tên gợi ý khi lưu hình vào Kho: vài chữ đầu của đề bài. */
export function suggestTitle(stem: string, seq?: number): string {
  const plain = stem.replace(/\$[^$]*\$/g, ' ').replace(/\\[a-zA-Z]+\*?/g, ' ').replace(/[{}%\\]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = plain.split(' ').filter(Boolean).slice(0, 8).join(' ');
  const head = words ? `Hình: ${words}` : 'Hình từ câu hỏi';
  return seq ? `${head} (câu ${seq})` : head;
}
