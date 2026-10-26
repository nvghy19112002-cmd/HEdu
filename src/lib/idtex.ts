// Bộ ĐỌC / GHI vùng ID trong mã LaTeX của một câu — NƠI DUY NHẤT trong app được đọc hay sửa `%[ID]` (thuần cú pháp, không biết cây).
// Vùng ID ("chú thích đầu") chỉ có hai chỗ:
//   \begin{ex}%[2D1H1-1]            chú thích nằm cùng dòng, ngay sau \begin{ex}
//   \begin{ex}                      hoặc dòng ngay sau \begin{ex} (dòng đầu tiên, trước nội dung câu) bắt đầu bằng %
//   %[2D1H1-1]
// Trong chú thích đầu có thể có nhiều cặp ngoặc: `%[Đề thi Sở HN]%[2D1H1-1]`. Chỉ cặp có HÌNH DẠNG mã (chữ số + chữ cái + …,
// không khoảng trắng) mới là ứng viên ID; cặp khác là nhãn nguồn, giữ nguyên. `%[…]` ở chỗ khác (đề, lời giải, TikZ) KHÔNG phải ID chính.
// Ghi: chỉ chèn/thay đúng chữ của mã, không trim, không dựng lại câu; mã giống hệt ⇒ trả lại chuỗi y nguyên.

export interface IdCandidate {
  /** chữ bên trong ngoặc, đã bỏ khoảng trắng hai đầu */
  code: string;
  /** vị trí (trong latex) của chữ mã đã bỏ khoảng trắng — để thay đúng chỗ */
  start: number;
  end: number;
}

export interface HeadRead {
  /** vị trí ngay sau `\begin{ex}` đầu tiên (không nằm trong chú thích); -1 = không phải khối ex */
  beginEnd: number;
  /** chú thích đầu: từ dấu % tới hết dòng (không gồm xuống dòng) */
  comment: { start: number; end: number; sameLine: boolean } | null;
  /** các ứng viên ID trong chú thích đầu, theo thứ tự */
  ids: IdCandidate[];
  /** nhãn khác trong chú thích đầu (vd tên đề) — chỉ để hiển thị */
  labels: string[];
  /** số `%[…]` có hình dạng mã nằm NGOÀI chú thích đầu (không dùng làm ID, chỉ báo) */
  stray: number;
}

/** Hình dạng một mã ID: bắt đầu bằng chữ số rồi chữ cái (mã lớp + phân môn), chỉ gồm chữ/số/gạch ngang. */
export const ID_SHAPE = /^[0-9][A-Za-z][0-9A-Za-z-]*$/;

const BEGIN = '\\begin{ex}';

/** Ký tự ở vị trí i bị "thoát" bởi số lẻ dấu \ đứng trước (vd `\%`). */
function escaped(s: string, i: number): boolean {
  let n = 0;
  for (let j = i - 1; j >= 0 && s[j] === '\\'; j--) n++;
  return n % 2 === 1;
}

/** Vị trí dấu % mở chú thích đầu tiên trong đoạn [from, to), -1 nếu không có. */
function commentStart(s: string, from: number, to: number): number {
  for (let i = from; i < to; i++) if (s[i] === '%' && !escaped(s, i)) return i;
  return -1;
}

function lineEnd(s: string, i: number): number {
  const n = s.indexOf('\n', i);
  const e = n < 0 ? s.length : n;
  return e > i && s[e - 1] === '\r' ? e - 1 : e;
}

/** Sau vị trí i, ký tự xuống dòng tiếp theo (\r\n hoặc \n) kết thúc ở đâu; -1 nếu hết chuỗi. */
function afterNewline(s: string, i: number): number {
  if (s[i] === '\r' && s[i + 1] === '\n') return i + 2;
  if (s[i] === '\n' || s[i] === '\r') return i + 1;
  return -1;
}

const skipBlank = (s: string, i: number): number => { while (s[i] === ' ' || s[i] === '\t') i++; return i; };

/** `\begin{ex}` đầu tiên không nằm trong chú thích. */
function findBegin(s: string): number {
  let lineStart = 0;
  while (lineStart <= s.length) {
    const le = lineEnd(s, lineStart);
    const cs = commentStart(s, lineStart, le);
    const stop = cs < 0 ? le : cs;
    const k = s.indexOf(BEGIN, lineStart);
    if (k >= 0 && k + BEGIN.length <= stop) return k;
    if (k < 0) return -1;
    const nl = s.indexOf('\n', le);
    if (nl < 0) return -1;
    lineStart = nl + 1;
  }
  return -1;
}

const BRACKET = /\[([^\]\r\n]*)\]/g;
const ANY_ID_COMMENT = /%\s*\[([^\]\r\n]*)\]/g;

/** Đọc vùng ID của một câu. Không bao giờ đoán: không có chú thích đầu ⇒ ids rỗng. */
export function readHead(latex: string): HeadRead {
  const out: HeadRead = { beginEnd: -1, comment: null, ids: [], labels: [], stray: 0 };
  const b = findBegin(latex);
  if (b < 0) return out;
  out.beginEnd = b + BEGIN.length;
  let i = skipBlank(latex, out.beginEnd);
  let sameLine = true;
  if (latex[i] !== '%') {
    const nx = afterNewline(latex, i);
    if (nx < 0) i = -1;
    else { i = skipBlank(latex, nx); sameLine = false; if (latex[i] !== '%') i = -1; }
  }
  if (i >= 0) {
    const end = lineEnd(latex, i);
    out.comment = { start: i, end, sameLine };
    const text = latex.slice(i, end);
    for (const m of text.matchAll(BRACKET)) {
      const inner = m[1];
      const code = inner.trim();
      const at = i + m.index! + 1 + inner.indexOf(code);
      if (code && ID_SHAPE.test(code)) out.ids.push({ code, start: at, end: at + code.length });
      else if (code) out.labels.push(code);
    }
  }
  for (const m of latex.matchAll(ANY_ID_COMMENT)) {
    if (escaped(latex, m.index!)) continue;
    if (out.comment && m.index! >= out.comment.start && m.index! < out.comment.end) continue;
    if (ID_SHAPE.test(m[1].trim())) out.stray++;
  }
  return out;
}

/** So sánh hai mã không phân biệt hoa/thường (mã một ký tự mỗi cấp, hoa/thường là một). */
export const sameCode = (a: string, b: string): boolean => a.toUpperCase() === b.toUpperCase();

export type WritePolicy =
  /** chỉ THÊM khi câu chưa có ID; câu có ID khác ⇒ không đụng, báo cần xác nhận */
  | 'them'
  /** thêm, hoặc thay ĐÚNG MỘT ID cũ (giáo viên đã xác nhận đổi) */
  | 'thay';

export type WriteResult =
  | { action: 'giu' | 'them' | 'thay'; latex: string; old: string | null }
  | { action: 'bo-qua'; latex: string; old: string | null; reason: 'khong-phai-ex' | 'nhieu-id' | 'can-xac-nhan' };

/** Kiểu xuống dòng của câu (giữ đúng CRLF nếu câu dùng CRLF). */
const eolOf = (s: string): string => (s.includes('\r\n') ? '\r\n' : '\n');

/**
 * Đặt ID `target` vào vùng ID của câu. Chỉ sửa đúng chữ của mã:
 *   chưa có ID ⇒ chèn `%[target]` ngay sau \begin{ex} (nếu cùng dòng còn chữ đề thì xuống dòng để đề không thành chú thích);
 *   đúng một ID giống target ⇒ trả lại nguyên chuỗi;   đúng một ID khác ⇒ chỉ thay khi policy 'thay';
 *   nhiều ID (mâu thuẫn hoặc lặp) hoặc không phải khối ex ⇒ không đụng.
 * `target` phải là mã đã được kiểm (idsync.strictCode) — hàm này không kiểm cây.
 */
export function writeHeadId(latex: string, target: string, policy: WritePolicy): WriteResult {
  const h = readHead(latex);
  if (h.beginEnd < 0) return { action: 'bo-qua', latex, old: null, reason: 'khong-phai-ex' };
  if (h.ids.length > 1) return { action: 'bo-qua', latex, old: h.ids[0].code, reason: 'nhieu-id' };
  if (h.ids.length === 1) {
    const c = h.ids[0];
    if (sameCode(c.code, target)) return { action: 'giu', latex, old: c.code };
    if (policy !== 'thay') return { action: 'bo-qua', latex, old: c.code, reason: 'can-xac-nhan' };
    return { action: 'thay', latex: latex.slice(0, c.start) + target + latex.slice(c.end), old: c.code };
  }
  const at = h.beginEnd;
  const rest = latex.slice(at, lineEnd(latex, at));
  // phần còn lại của dòng \begin{ex} trống hoặc đã là chú thích ⇒ chèn cùng dòng là an toàn (không chữ đề nào bị biến thành chú thích)
  const safe = rest.trim() === '' || (h.comment?.sameLine ?? false);
  const ins = `%[${target}]` + (safe ? '' : eolOf(latex));
  return { action: 'them', latex: latex.slice(0, at) + ins + latex.slice(at), old: null };
}

/**
 * Bản "bỏ vùng ID" của câu — CHỈ để so sánh (vd giữ trạng thái kiểm duyệt khi chỉ đổi ID). Không bao giờ ghi kết quả này.
 * Bỏ các ứng viên ID trong chú thích đầu; nếu dòng \begin{ex} sau đó không còn gì thì bỏ luôn xuống dòng, để
 * `\begin{ex}\n Đề`, `\begin{ex}%[ID]\n Đề` và `\begin{ex}Đề` / `\begin{ex}%[ID]\nĐề` so ra như nhau.
 */
export function withoutHeadId(latex: string): string {
  const h = readHead(latex);
  if (h.beginEnd < 0) return latex;
  let s = latex;
  for (const c of [...h.ids].reverse()) {
    // bỏ cả ngoặc và dấu % đứng ngay trước ngoặc (nếu có)
    let a = s.lastIndexOf('[', c.start);
    const z = s.indexOf(']', c.end) + 1;
    if (a < 0 || z <= 0) continue;
    const pct = skipBack(s, a);
    if (s[pct] === '%' && pct >= h.beginEnd) a = pct;
    s = s.slice(0, a) + s.slice(z);
  }
  const at = h.beginEnd;
  const le = lineEnd(s, at);
  if (s.slice(at, le).replace(/%/g, '').trim() === '') {
    const nx = afterNewline(s, le);
    s = s.slice(0, at) + (nx < 0 ? '' : s.slice(nx));
  }
  return s;
}

function skipBack(s: string, i: number): number {
  let j = i - 1;
  while (j >= 0 && (s[j] === ' ' || s[j] === '\t')) j--;
  return j;
}

/** Hai bản LaTeX chỉ khác nhau ở vùng ID (thêm/đổi mã) ⇒ nội dung câu không đổi. */
export const sameExceptId = (a: string, b: string): boolean => a === b || withoutHeadId(a) === withoutHeadId(b);

/**
 * Bản sao LaTeX CHỈ để gửi AI phân loại: xoá chữ mã của mọi ứng viên ID trong vùng ID chính (`%[2D1H1-1]` → `%[]`), giữ nguyên
 * cấu trúc chú thích, nhãn nguồn và mọi ký tự khác — để model không "đọc đáp án" từ ID có sẵn (đúng hay cố tình sai).
 * Không bao giờ ghi kết quả này vào ngân hàng.
 */
export function latexForAi(latex: string): string {
  const h = readHead(latex);
  let s = latex;
  for (const c of [...h.ids].reverse()) s = s.slice(0, c.start) + s.slice(c.end);
  return s;
}

/**
 * Các bản "chưa từng có ID" của câu, đúng như trước khi writeHeadId chèn/thay mã: bỏ nguyên văn mỗi `%[mã]` trong chú thích đầu,
 * và (nếu ngay sau đó là xuống dòng) thêm bản bỏ luôn xuống dòng đó. Dùng để quyết định trùng / nhãn chuẩn đã lưu
 * không bị coi là "câu đã sửa" chỉ vì HEdu thêm hay đổi ID. Không bao giờ ghi kết quả này.
 */
export function idlessVariants(latex: string): string[] {
  const h = readHead(latex);
  if (!h.ids.length) return [];
  let s = latex;
  let firstAt = -1;
  for (const c of [...h.ids].reverse()) {
    let a = s.lastIndexOf('[', c.start);
    const z = s.indexOf(']', c.end) + 1;
    if (a < 0 || z <= 0) return [];
    if (a > 0 && s[a - 1] === '%') a--;
    s = s.slice(0, a) + s.slice(z);
    firstAt = a;
  }
  const out = [s];
  if (firstAt === h.beginEnd) {
    const nx = afterNewline(s, firstAt);
    if (nx > 0) out.push(s.slice(0, firstAt) + s.slice(nx));
  }
  return out;
}
