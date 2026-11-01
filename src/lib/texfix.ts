// Màn "Xử lí TeX" — Đợt 2: chuẩn hoá CÓ XEM TRƯỚC (claude/de-xuat-man-xu-li-tex.md mục 5, 10.1 Q4).
// Mọi luật chạy trên BẢN SAO và trả danh sách thay đổi theo dòng; chỉ ghi vào khung soạn khi giáo viên bấm "Áp dụng" (có Hoàn tác).
// - Nhóm "kỹ thuật" (bật sẵn): không đổi bản in (BOM, CRLF, khoảng trắng cuối dòng, ký tự ẩn).
// - Nhóm "công thức" (TẮT sẵn): đổi cách in công thức; chỉ chạy BÊN TRONG công thức ($…$, \(…\), \[…\], $$…$$),
//   bỏ qua chú thích %, tikzpicture, verbatim. Không có luật nào xoá chú thích (xoá chú thích có thể xoá %[ID]).
// Sắp xếp theo ID chỉ đổi THỨ TỰ các khối (+ dòng chú thích tiêu đề chương), không sửa nội dung câu.
import { resolveCode } from './idsync';
import { readHead } from './idtex';
import { scanScratch, type ScratchScan } from './texscratch';
import { LEVELS, type Taxonomy } from './types';

export type FixGroup = 'ky-thuat' | 'cong-thuc';
export interface FixRule { id: string; group: FixGroup; label: string; hint: string; on: boolean; run(text: string): string }

/** Áp `f` lên nội dung BÊN TRONG mỗi công thức, ngoài chú thích/tikzpicture/verbatim. Không đổi số dòng nếu `f` không đổi số dòng. */
export function mapMath(text: string, f: (inner: string) => string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  const skipEnv = (name: string): number => { const e = text.indexOf(`\\end{${name}}`, i); return e < 0 ? n : e + name.length + 6; };
  while (i < n) {
    const ch = text[i];
    if (ch === '%') { const e = text.indexOf('\n', i); const j = e < 0 ? n : e; out += text.slice(i, j); i = j; continue; }
    if (ch === '\\') {
      const env = /^\\begin\{(tikzpicture|verbatim|lstlisting)\}/.exec(text.slice(i, i + 24));
      if (env) { const j = skipEnv(env[1]); out += text.slice(i, j); i = j; continue; }
      const open = text.slice(i, i + 2);
      if (open === '\\(' || open === '\\[') {
        const close = open === '\\(' ? '\\)' : '\\]';
        const e = text.indexOf(close, i + 2);
        if (e < 0) { out += text.slice(i); break; }
        out += open + f(text.slice(i + 2, e)) + close; i = e + 2; continue;
      }
      out += text.slice(i, i + 2); i += 2; continue; // lệnh hoặc ký tự thoát (\$, \%)
    }
    if (ch === '$') {
      const dbl = text[i + 1] === '$';
      const d = dbl ? '$$' : '$';
      let j = i + d.length;
      while (j < n && !(text.startsWith(d, j) && text[j - 1] !== '\\')) j++;
      if (j >= n) { out += text.slice(i); break; }
      out += d + f(text.slice(i + d.length, j)) + d; i = j + d.length; continue;
    }
    out += ch; i++;
  }
  return out;
}

/** $$…$$ → \[…\] (ngoài chú thích/tikzpicture). */
function ddollar(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '%') { const e = text.indexOf('\n', i); const j = e < 0 ? n : e; out += text.slice(i, j); i = j; continue; }
    if (ch === '\\') {
      const env = /^\\begin\{(tikzpicture|verbatim|lstlisting)\}/.exec(text.slice(i, i + 24));
      if (env) { const e = text.indexOf(`\\end{${env[1]}}`, i); const j = e < 0 ? n : e + env[1].length + 6; out += text.slice(i, j); i = j; continue; }
      out += text.slice(i, i + 2); i += 2; continue;
    }
    if (ch === '$' && text[i + 1] === '$') {
      const e = text.indexOf('$$', i + 2);
      if (e < 0) { out += text.slice(i); break; }
      out += '\\[' + text.slice(i + 2, e) + '\\]'; i = e + 2; continue;
    }
    if (ch === '$') { const e = text.indexOf('$', i + 1); const j = e < 0 ? n : e + 1; out += text.slice(i, j); i = j; continue; }
    out += ch; i++;
  }
  return out;
}

export const FIX_RULES: FixRule[] = [
  { id: 'bom', group: 'ky-thuat', on: true, label: 'Bỏ ký tự BOM đầu tệp', hint: 'Ký tự ẩn do một số trình soạn thêm vào đầu tệp.', run: (t) => t.replace(/^﻿/, '') },
  { id: 'an', group: 'ky-thuat', on: true, label: 'Bỏ ký tự ẩn (khoảng trắng độ rộng 0)', hint: 'U+200B, U+200C, U+200D, U+2060, U+FEFF giữa văn bản — thường dính khi chép từ web/PDF.', run: (t) => t.replace(/[​-‍⁠]|(?!^)﻿/g, '') },
  { id: 'cuoi-dong', group: 'ky-thuat', on: true, label: 'Cắt khoảng trắng cuối dòng', hint: 'Không đổi bản in.', run: (t) => t.replace(/[ \t]+(?=\r?\n|$)/g, '') },
  { id: 'xuong-dong', group: 'ky-thuat', on: true, label: 'Đổi xuống dòng CRLF → LF', hint: 'Không đổi bản in.', run: (t) => t.replace(/\r\n?/g, '\n') },
  { id: 'do', group: 'cong-thuc', on: false, label: '^0 / ^{0} thành ^\\circ (độ)', hint: 'Chỉ trong công thức. Kiểm lại: số mũ 0 thật (a^0) cũng bị đổi.', run: (t) => mapMath(t, (m) => m.replace(/\^\s*\{\s*0\s*\}|\^\s*0(?![0-9])/g, '^\\circ')) },
  { id: 'dfrac', group: 'cong-thuc', on: false, label: '\\frac thành \\dfrac', hint: 'Phân số to hơn trong dòng chữ. Đổi bản in.', run: (t) => mapMath(t, (m) => m.replace(/\\frac(?![A-Za-z])/g, '\\dfrac')) },
  { id: 'dollar2', group: 'cong-thuc', on: false, label: '$$…$$ thành \\[…\\]', hint: 'Cách viết công thức riêng dòng khuyên dùng cho LaTeX.', run: ddollar },
  { id: 'phay', group: 'cong-thuc', on: false, label: 'Dấu phẩy thập phân 3,5 → 3{,}5', hint: 'Bỏ khoảng trắng thừa sau dấu phẩy thập phân. Kiểm lại: toạ độ (1,2) cũng bị đổi.', run: (t) => mapMath(t, (m) => m.replace(/(\d),(\d)/g, '$1{,}$2')) },
];

export interface FixChange { line: number; before: string; after: string }
export interface FixPlan { out: string; changes: FixChange[]; perRule: Record<string, number>; linesChanged: number }

const countDiffLines = (a: string, b: string): number => {
  const x = a.split('\n'), y = b.split('\n');
  if (x.length !== y.length) return Math.max(x.length, y.length);
  let k = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) k++;
  return k;
};

/** Chạy các luật được chọn trên bản sao; trả văn bản mới và các dòng đổi (so theo dòng). Không ghi gì. */
export function planFix(text: string, ids: ReadonlySet<string>, maxShown = 200): FixPlan {
  let cur = text;
  const perRule: Record<string, number> = {};
  for (const r of FIX_RULES) {
    if (!ids.has(r.id)) continue;
    const next = r.run(cur);
    perRule[r.id] = next === cur ? 0 : r.id === 'bom' ? 1 : r.id === 'xuong-dong' ? (cur.match(/\r/g) ?? []).length : countDiffLines(cur, next);
    cur = next;
  }
  const a = text.replace(/\r\n?/g, '\n').split('\n'), b = cur.split('\n');
  const changes: FixChange[] = [];
  let linesChanged = 0;
  if (a.length === b.length) {
    for (let i = 0; i < a.length; i++) {
      const before = text.split(/\n/)[i] ?? '';
      if (before !== b[i]) { linesChanged++; if (changes.length < maxShown) changes.push({ line: i + 1, before, after: b[i] }); }
    }
  } else linesChanged = Math.max(a.length, b.length);
  return { out: cur, changes, perRule, linesChanged };
}

// ---------- Sắp xếp theo ID ----------

const HEAD_RE = /^\s*%% ===== .* =====\s*$/;

export interface SortPlan { ok: true; out: string; sorted: number; noId: number; moved: boolean }
export type SortResult = SortPlan | { ok: false; why: string };

/** Thứ tự của mỗi nút trong cây (để sắp theo đúng thứ tự chương/bài/dạng của cây đang dùng). */
function orderIndex(tax: Taxonomy): Map<string, number> {
  const m = new Map<string, number>();
  let k = 0;
  for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) {
    m.set(c.id, k++);
    for (const l of c.lessons) { m.set(l.id, k++); for (const f of l.forms) m.set(f.id, k++); }
  }
  return m;
}

/**
 * Xếp các khối ex theo ID (lớp → chương → bài → dạng → mức độ), câu không có ID hợp lệ dồn cuối, giữ thứ tự cũ khi bằng nhau.
 * Phần trước khối đầu (khai báo, chú thích) giữ nguyên ở đầu. Có nội dung khác giữa các khối hoặc khối chưa đóng ⇒ từ chối (không đoán).
 */
export function planSort(text: string, tax: Taxonomy, scan: ScratchScan = scanScratch(text)): SortResult {
  const bs = scan.blocks;
  if (!bs.length) return { ok: false, why: 'Chưa có khối \\begin{ex} nào.' };
  if (bs.some((b) => !b.closed)) return { ok: false, why: `Câu ${bs.find((b) => !b.closed)!.n} chưa có \\end{ex}. Sửa xong rồi mới sắp xếp được.` };
  for (let k = 1; k < bs.length; k++) {
    const gap = text.slice(bs[k - 1].end, bs[k].start);
    if (gap.split('\n').some((l) => l.trim() && !HEAD_RE.test(l))) return { ok: false, why: `Có nội dung (chú thích hoặc chữ) giữa câu ${k} và câu ${k + 1}. Sắp xếp có thể làm nó lệch chỗ, nên HEdu không sắp. Hãy chuyển phần đó lên đầu hoặc vào trong câu.` };
  }
  const idx = orderIndex(tax);
  const gradeOf = (g: number) => tax.grades.findIndex((x) => x.grade === g);
  const keyed = bs.map((b, i) => {
    const h = readHead(b.text);
    const r = h.ids.length === 1 ? resolveCode(h.ids[0].code, tax) : null;
    if (!r || !r.ok) return { b, i, key: null as number[] | null, ch: '' };
    return { b, i, key: [gradeOf(r.loc.grade), idx.get(r.loc.chapterId) ?? 0, idx.get(r.loc.lessonId) ?? 0, idx.get(r.loc.formId) ?? 0, LEVELS.indexOf(r.level)], ch: r.loc.chapterId };
  });
  const cmp = (x: (typeof keyed)[number], y: (typeof keyed)[number]) => {
    if (!x.key || !y.key) return (x.key ? 0 : 1) - (y.key ? 0 : 1) || x.i - y.i;
    for (let k = 0; k < x.key.length; k++) if (x.key[k] !== y.key[k]) return x.key[k] - y.key[k];
    return x.i - y.i;
  };
  const sorted = [...keyed].sort(cmp);
  const chName = new Map<string, string>();
  for (const g of tax.grades) for (const b of g.branches) for (const c of b.chapters) chName.set(c.id, `Lớp ${g.grade} · ${c.name}`);
  const parts: string[] = [];
  let lastCh: string | null = null;
  for (const x of sorted) {
    const head = x.key ? x.ch : '__khong-id__';
    if (head !== lastCh) {
      parts.push(x.key ? `%% ===== ${chName.get(x.ch) ?? 'Chương'} =====` : '%% ===== Chưa có ID hợp lệ =====');
      lastCh = head;
    }
    parts.push(x.b.text);
  }
  // dòng tiêu đề do lần sắp trước chèn vào thì bỏ, để sắp lại nhiều lần vẫn ra cùng kết quả
  const prefix = text.slice(0, bs[0].start).split('\n').filter((l) => !HEAD_RE.test(l)).join('\n').replace(/\s*$/, '');
  const suffix = text.slice(bs[bs.length - 1].end);
  const out = (prefix ? prefix + '\n\n' : '') + parts.join('\n\n') + suffix;
  return { ok: true, out, sorted: keyed.filter((x) => x.key).length, noId: keyed.filter((x) => !x.key).length, moved: sorted.some((x, k) => x.i !== k) };
}
