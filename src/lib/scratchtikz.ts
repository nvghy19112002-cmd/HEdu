// Bốc mọi khối \begin{tikzpicture}…\end{tikzpicture} của bàn nháp Xử lí TeX (hàm thuần, có kiểm thử).
// Mỗi hình kèm câu chứa nó (số khối ex), dòng bắt đầu trong bàn nháp và các khai báo \def/\newcommand… của câu đó
// để dịch đúng như trong câu. Không sửa mã: chỉ đọc.
import { defsOf, tikzBlocks } from './khochen';
import { blockAtLine, type ScratchScan } from './texscratch';

export interface ScratchFig {
  /** số thứ tự hình trong bàn nháp, từ 1 */
  i: number;
  /** số thứ tự câu (khối ex) chứa hình; null nếu hình nằm ngoài mọi câu */
  n: number | null;
  /** hình thứ mấy trong câu, từ 1 */
  k: number;
  /** dòng bắt đầu (từ 1) trong bàn nháp */
  line: number;
  /** vị trí ký tự bắt đầu của mã hình trong bàn nháp (để áp dụng bản sửa đúng chỗ) */
  start: number;
  /** số dòng của mã hình */
  lines: number;
  code: string;
  /** khai báo đi kèm (của câu chứa hình) */
  defs: string;
}

/** Các hình TikZ của bàn nháp; `only` = chỉ lấy hình trong các câu này (null/rỗng = tất cả). */
export function scratchFigures(text: string, scan: ScratchScan, only: ReadonlySet<number> | null = null): ScratchFig[] {
  const out: ScratchFig[] = [];
  const per = new Map<number, number>();
  const defsCache = new Map<number, string>();
  for (const b of tikzBlocks(text)) {
    const blk = blockAtLine(scan, b.line);
    const n = blk ? blk.n : null;
    if (only && only.size && (n === null || !only.has(n))) continue;
    const key = n ?? 0;
    const k = (per.get(key) ?? 0) + 1;
    per.set(key, k);
    let defs = '';
    if (blk) {
      if (!defsCache.has(blk.n)) defsCache.set(blk.n, defsOf(blk.text));
      defs = defsCache.get(blk.n)!;
    }
    out.push({ i: out.length + 1, n, k, line: b.line, start: b.start, lines: b.code.split('\n').length, code: b.code, defs });
  }
  return out;
}

/** Văn bản đưa vào hộp "Lưu vào Kho hình": khai báo rồi mã hình (hộp tự tách lại hai phần). */
export const khoLatex = (f: Pick<ScratchFig, 'code' | 'defs'>): string => (f.defs ? `${f.defs}\n${f.code}` : f.code);

/** Nhãn ngắn của hình: "Câu 3 · hình 2 · dòng 41". */
export const figLabel = (f: ScratchFig): string => `${f.n === null ? 'Ngoài câu' : `Câu ${f.n}`}${f.k > 1 || f.n === null ? ` · hình ${f.k}` : ''} · dòng ${f.line}`;
