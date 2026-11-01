// Màn "Xử lí TeX": chọn câu, lọc danh sách, tìm/thay thế. Phần THUẦN (không đụng giao diện, đĩa hay ngân hàng).
// Không bao giờ sửa gì ngoài chỗ người dùng bảo: hàm "plan" chỉ trả bản mới + danh sách dòng đổi, việc ghi do màn hình làm sau khi bấm Áp dụng.
import type { BlockInfo, ScratchScan } from './texscratch';

/** Khối có hình TikZ (tikzpicture hoặc bảng biến thiên tkz-tab vẽ qua tikz). */
export const hasTikz = (blockText: string): boolean => /\\begin\s*\{tikzpicture\}/.test(blockText);

export type ListFilter = 'all' | 'no-id' | 'problem' | 'tikz' | 'build-err' | 'picked';
export const FILTER_LABEL: Record<ListFilter, string> = {
  all: 'Tất cả', 'no-id': 'Chưa có ID', problem: 'Có lỗi', tikz: 'Có hình', 'build-err': 'Lỗi biên dịch', picked: 'Đã chọn',
};
export const FILTER_ORDER: ListFilter[] = ['all', 'no-id', 'problem', 'tikz', 'build-err', 'picked'];

export interface FilterCtx { buildErr: ReadonlySet<number>; picked: ReadonlySet<number> }

export function matchFilter(b: BlockInfo, f: ListFilter, ctx: FilterCtx): boolean {
  switch (f) {
    case 'all': return true;
    case 'no-id': return b.id.state === 'khong-co';
    case 'problem': return b.problems > 0;
    case 'tikz': return hasTikz(b.block.text);
    case 'build-err': return ctx.buildErr.has(b.block.n);
    case 'picked': return ctx.picked.has(b.block.n);
  }
}

export const filterInfos = (infos: readonly BlockInfo[], f: ListFilter, ctx: FilterCtx): BlockInfo[] => infos.filter((b) => matchFilter(b, f, ctx));

export function filterCounts(infos: readonly BlockInfo[], ctx: FilterCtx): Record<ListFilter, number> {
  const c = { all: 0, 'no-id': 0, problem: 0, tikz: 0, 'build-err': 0, picked: 0 } as Record<ListFilter, number>;
  for (const b of infos) for (const f of FILTER_ORDER) if (matchFilter(b, f, ctx)) c[f]++;
  return c;
}

export const SEP = '\n\n';

/** Ghép các khối đã chọn (theo thứ tự trong bàn nháp) thành một văn bản; `orig[k]` = dòng gốc (từ 1) của dòng thứ k+1 của văn bản ghép. */
export function pickBlocks(text: string, scan: ScratchScan, ns: ReadonlySet<number> | readonly number[]): { text: string; orig: number[]; count: number } {
  const want = new Set(ns);
  const parts: string[] = [];
  const map: number[] = [];
  let first = true;
  for (const b of scan.blocks) {
    if (!want.has(b.n)) continue;
    parts.push(text.slice(b.start, b.end));
    if (!first) { map.push(b.line0); } // SEP = "\n\n" ⇒ một dòng trống giữa hai khối
    first = false;
    const k = b.text.split('\n').length;
    for (let i = 0; i < k; i++) map.push(b.line0 + i);
  }
  return { text: parts.join(SEP), orig: map, count: parts.length };
}

/** Thay từng khối đã chọn bằng f(văn bản khối); phần còn lại giữ NGUYÊN. */
export function mapBlocks(text: string, scan: ScratchScan, ns: ReadonlySet<number> | readonly number[], f: (blockText: string) => string): string {
  const want = new Set(ns);
  let out = text;
  for (const b of [...scan.blocks].reverse()) {
    if (!want.has(b.n)) continue;
    out = out.slice(0, b.start) + f(text.slice(b.start, b.end)) + out.slice(b.end);
  }
  return out;
}

export interface ReplaceOpts { matchCase: boolean; regex: boolean }
export interface ReplaceChange { line: number; before: string; after: string }
export type ReplacePlan =
  | { ok: true; out: string; count: number; linesChanged: number; changes: ReplaceChange[] }
  | { ok: false; why: string };

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tìm/thay trên cả bàn nháp, hoặc chỉ trong các khối `ns` (nếu có). Dạng thường: tìm nguyên văn, KHÔNG hiểu $1, \n… trong ô thay. Dạng regex: ô thay hiểu $1, $&. */
export function planReplace(text: string, scan: ScratchScan, ns: ReadonlySet<number> | null, find: string, repl: string, o: ReplaceOpts, maxShown = 200): ReplacePlan {
  if (!find) return { ok: false, why: 'Nhập chữ cần tìm.' };
  let re: RegExp;
  try { re = new RegExp(o.regex ? find : escRe(find), o.matchCase ? 'g' : 'gi'); } catch { return { ok: false, why: 'Biểu thức tìm không hợp lệ.' }; }
  if (o.regex && new RegExp(re.source, re.flags.replace('g', '')).test('')) return { ok: false, why: 'Biểu thức này khớp cả chuỗi rỗng nên sẽ chèn khắp nơi; hãy viết cụ thể hơn.' };
  let count = 0;
  const run = (s: string): string => s.replace(re, (...m) => {
    count++;
    if (!o.regex) return repl;
    const groups = m.slice(1, m.findIndex((x) => typeof x === 'number'));
    return repl.replace(/\$(\$|&|\d)/g, (_x, c: string) => (c === '$' ? '$' : c === '&' ? m[0] : (groups[Number(c) - 1] ?? '')));
  });
  const out = ns ? mapBlocks(text, scan, ns, run) : run(text);
  const a = text.split('\n'), b = out.split('\n');
  const changes: ReplaceChange[] = [];
  let linesChanged = 0;
  if (a.length === b.length) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { linesChanged++; if (changes.length < maxShown) changes.push({ line: i + 1, before: a[i], after: b[i] }); }
  } else linesChanged = Math.max(a.length, b.length);
  return { ok: true, out, count, linesChanged, changes };
}
