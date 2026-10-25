// Lô nhập nhiều nguồn (PR N2; phương án: claude/thiet-ke-nhap-nhieu-tep.md). Phần THUẦN: gộp câu từ nhiều tệp, thống kê theo tệp, dựng nhãn nguồn.
// Mỗi câu nhớ tệp + số dòng TRONG tệp đó; các chỗ khác của màn Nhập liệu vẫn đánh theo thứ tự câu toàn lô.
import { splitExBlocksAt, parseExTest, type ParsedQuestion } from './extest';
import { parseCode } from './id';

/** Giới hạn tạm một lô (đến khi dò trùng nhẹ hơn): rà trùng tốn ~40 KB RAM mỗi câu nhập mới. */
export const BATCH_MAX = 5000;
export const PASTE_SOURCE_NAME = 'dán trực tiếp';

export interface ImportSource { name: string; /** thư mục con tính từ thư mục đã chọn ('' nếu chọn lẻ / dán) */ rel: string; text: string }

export interface BatchRow {
  latex: string;
  /** số dòng bắt đầu câu TRONG TỆP của nó */
  line: number;
  file: string;
  rel: string;
  srcIdx: number;
  p: ParsedQuestion;
  fromId: ReturnType<typeof parseCode>;
}

/** Gộp câu của các nguồn theo thứ tự nguồn rồi thứ tự trong tệp. */
export function buildRows(sources: readonly ImportSource[]): BatchRow[] {
  const out: BatchRow[] = [];
  sources.forEach((s, srcIdx) => {
    for (const { text: latex, line } of splitExBlocksAt(s.text)) {
      const p = parseExTest(latex);
      out.push({ latex, line, file: s.name, rel: s.rel, srcIdx, p, fromId: p.idComment ? parseCode(p.idComment) : null });
    }
  });
  return out;
}

export interface FileStat { srcIdx: number; name: string; rel: string; blocks: number; idOk: number; idNoForm: number; idInvalid: number; idMissing: number }

/** Thống kê theo tệp (kể cả tệp 0 câu) để hiện bảng "Theo tệp" trước khi nhập. */
export function perFile(rows: readonly BatchRow[], sources: readonly ImportSource[]): FileStat[] {
  const st: FileStat[] = sources.map((s, srcIdx) => ({ srcIdx, name: s.name, rel: s.rel, blocks: 0, idOk: 0, idNoForm: 0, idInvalid: 0, idMissing: 0 }));
  for (const r of rows) {
    const f = st[r.srcIdx];
    if (!f) continue;
    f.blocks++;
    if (r.fromId) { if (/-/.test(r.p.idComment ?? '')) f.idOk++; else f.idNoForm++; }
    else if (r.p.idComment) f.idInvalid++;
    else f.idMissing++;
  }
  return st;
}

export interface BatchInfo { name: string; tagFile: boolean; tagBatch: boolean; tagFolder: boolean; extra: string }

const MAX_TAG = 80;
const clean = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > MAX_TAG ? t.slice(0, MAX_TAG - 1) + '…' : t;
};

/** "Nhãn thêm cho cả lô": tách theo dấu phẩy, chấm phẩy hoặc xuống dòng; bỏ trùng; tối đa 20 nhãn. */
export function parseExtraTags(s: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of s.split(/[,;\n]/)) {
    const t = clean(raw);
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
    if (out.length >= 20) break;
  }
  return out;
}

export function defaultBatchName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Nhãn gắn cho một câu khi nhập. Tiền tố cố định (`Nguồn:`, `Lô:`, `Thư mục:`) để lọc và gỡ hàng loạt về sau. */
export function tagsFor(row: Pick<BatchRow, 'file' | 'rel'>, info: BatchInfo): string[] {
  const out: string[] = [];
  const add = (t: string) => { const c = clean(t); if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c); };
  if (info.tagFile) add(`Nguồn: ${row.file || PASTE_SOURCE_NAME}`);
  if (info.tagBatch && info.name.trim()) add(`Lô: ${info.name}`);
  if (info.tagFolder && row.rel) add(`Thư mục: ${row.rel}`);
  for (const t of parseExtraTags(info.extra)) add(t);
  return out;
}
