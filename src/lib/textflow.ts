// Dựng phần CHỮ của một câu hỏi LaTeX (ngoài tikzpicture) thành HTML để xem trước.
// Đây là bộ đọc theo cấu trúc ngoặc lồng nhau, KHÔNG phải thay thế bằng biểu thức chính quy:
// nhờ vậy `\resizebox{!}{5cm}{…}`, `\textbf{\underline{…}}`, `{\bf …}`, `\begin{center}…` lồng nhau đều đúng.
//
// Nguyên tắc (Issue #9):
//  - Không sửa mã gốc. Đây chỉ là bản xem trước.
//  - Lệnh nào chưa hiểu thì HIỆN RA (khung đỏ nhạt) và ghi vào `unsupported`, không im lặng nuốt, không để lọt `{` `}`.
//  - Hình TikZ đã được thay bằng dấu `\u0000FIG{n}\u0000` từ trước; ở đây chỉ giữ nguyên dấu đó (kèm kích thước nếu nằm trong \resizebox).

import { readGroup } from './extest';

export interface FlowHooks {
  renderMath: (tex: string, display: boolean) => string;
  findDollar: (s: string, from: number) => number;
}

export interface FigMeta { w?: string; h?: string }

export interface FlowResult {
  html: string;
  /** các lệnh/môi trường xem trước chưa dựng được */
  unsupported: string[];
  /** kích thước yêu cầu của hình (từ \resizebox), theo số thứ tự dấu hình */
  meta: Record<number, FigMeta>;
}

/** Dấu mở/đóng một khối bố cục (để React dựng lại khi chen giữa các hình). */
export const OPEN = (cls: string) => `\u0002O:${cls}\u0003`;
export const CLOSE = '\u0002C\u0003';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Ctx extends FlowHooks {
  unsup: Set<string>;
  meta: Record<number, FigMeta>;
  size: FigMeta | null;
  depth: number;
  /** độ sâu danh sách hiện tại (0 = ngoài cùng) để chọn nhãn mặc định */
  listDepth: number;
}

// ---------- lệnh có đối số, bảng tra ----------
const FMT_TAG: Record<string, string> = {
  textbf: 'b', textit: 'i', emph: 'i', textsl: 'i', underline: 'u', uline: 'u',
};
const FMT_PLAIN = new Set(['textrm', 'textsf', 'textup', 'textnormal', 'textmd', 'mbox', 'hbox', 'text', 'textsc', 'mathbf']);
const SWITCH_TAG: Record<string, string> = { bf: 'b', bfseries: 'b', it: 'i', itshape: 'i', sl: 'i', slshape: 'i', em: 'i' };
const SWITCH_NOOP = new Set([
  'rm', 'rmfamily', 'sf', 'sffamily', 'sc', 'scshape', 'upshape', 'mdseries', 'normalfont', 'tt', 'ttfamily',
  'tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge',
  'centering', 'raggedright', 'raggedleft', 'color',
]);
const IGNORE_0 = new Set([
  'noindent', 'indent', 'hfill', 'hfil', 'vfill', 'vfil', 'medskip', 'bigskip', 'smallskip', 'relax', 'protect',
  'allowbreak', 'nobreak', 'ignorespaces', 'strut', 'leavevmode', 'newpage', 'clearpage', 'pagebreak', 'nopagebreak',
  'null', 'unskip', 'unkern', 'displaystyle', 'textstyle', 'hrulefill', 'dotfill', 'flushleft', 'maketitle',
]);
// lệnh chỉ cần BỎ các đối số của nó
const DROP_ARGS: Record<string, number> = {
  vspace: 1, label: 1, phantom: 1, hphantom: 1, vphantom: 1, setlength: 2, addtolength: 2, setcounter: 2, addtocounter: 2,
  pagestyle: 1, thispagestyle: 1, cline: 1, bigstrut: 0, rule: 2, hyphenation: 1, index: 1, linespread: 1, renewcommand: 0,
};
const SYMBOLS: Record<string, string> = {
  ldots: '…', dots: '…', textellipsis: '…', lq: '‘', rq: '’', textbackslash: '\\', textasciitilde: '~',
  textdegree: '°', degree: '°', textbullet: '•', textendash: '–', textemdash: '—', LaTeX: 'LaTeX', TeX: 'TeX',
  ss: 'ß', quad: ' ', qquad: '  ', enspace: ' ', thinspace: ' ', textquotedblleft: '“', textquotedblright: '”',
  textquoteleft: '‘', textquoteright: '’', copyright: '©', S: '§', P: '¶', ldotp: '.', textperiodcentered: '·',
};
const MATH_ENVS = new Set(['align', 'align*', 'aligned', 'alignat', 'alignat*', 'gather', 'gather*', 'gathered', 'equation', 'equation*', 'flalign', 'flalign*', 'eqnarray', 'eqnarray*', 'multline', 'multline*', 'displaymath', 'math', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'split']);
const LIST_ENVS = new Set(['itemize', 'enumerate', 'listEX', 'enumEX', 'itemchoice', 'description', 'itemEX', 'tasks']);
const WRAP_ENVS = new Set(['minipage', 'figure', 'figure*', 'table', 'table*', 'wrapfigure', 'adjustbox', 'varwidth', 'quote', 'quotation', 'small', 'footnotesize', 'large', 'Large', 'tiny', 'scriptsize', 'normalsize', 'sloppypar', 'samepage', 'spacing', 'singlespace']);
const TABLE_ENVS = new Set(['tabular', 'tabular*', 'array', 'longtable', 'tabularx', 'tblr']);
const COLORS = new Set(['red', 'blue', 'green', 'black', 'gray', 'grey', 'orange', 'purple', 'brown', 'cyan', 'magenta', 'violet', 'teal', 'olive', 'pink', 'darkgray', 'lightgray']);

// ---------- đọc cú pháp ----------
const isLetter = (c: string | undefined) => !!c && /[A-Za-z@]/.test(c);
const skipWs = (s: string, i: number) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };

function readOptional(s: string, i: number): [string, number] | null {
  const p = skipWs(s, i);
  if (s[p] !== '[') return null;
  let depth = 0;
  for (let j = p + 1; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === ']' && depth <= 0) return [s.slice(p + 1, j), j + 1];
  }
  return null;
}

function readArgs(s: string, i: number, n: number): [string[], number] {
  const out: string[] = [];
  let pos = i;
  while (out.length < n) {
    const p = skipWs(s, pos);
    const g = readGroup(s, p);
    if (!g) break;
    out.push(g[0]);
    pos = g[1];
  }
  return [out, pos];
}

/** Độ dài LaTeX hợp lệ (vd 3cm, .5em) → CSS; không hợp lệ → null. */
function cssLength(raw: string): string | null {
  const m = /^\s*(-?\d*\.?\d+)\s*(cm|mm|pt|em|ex|in|bp|pc)\s*$/.exec(raw);
  return m ? `${m[1]}${m[2]}` : null;
}

interface EnvInfo { name: string; body: string; end: number }

/** s[i] bắt đầu bằng \begin{tên}. Tìm \end{tên} tương ứng, tính cả lồng cùng tên. */
function readEnv(s: string, i: number): (EnvInfo & { startBody: number }) | null {
  const head = /^\\begin\s*\{([^}]+)\}/.exec(s.slice(i, i + 80));
  if (!head) return null;
  const name = head[1];
  const re = new RegExp('\\\\(begin|end)\\s*\\{' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}', 'g');
  re.lastIndex = i + head[0].length;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[1] === 'begin') depth++;
    else if (--depth === 0) return { name, body: s.slice(i + head[0].length, m.index), startBody: i + head[0].length, end: m.index + m[0].length };
  }
  return null;
}

/** Cắt một chuỗi tại các lệnh cấp ngoài cùng (không nằm trong {…} hay \begin…\end khác). */
function splitTop(body: string, re: RegExp): { cmd: string; at: number; after: number }[] {
  const hits: { cmd: string; at: number; after: number }[] = [];
  let brace = 0;
  let env = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') {
      const mb = /^\\(begin|end)\s*\{/.exec(body.slice(i, i + 12));
      if (mb) { env += mb[1] === 'begin' ? 1 : -1; const close = body.indexOf('}', i + mb[0].length); i = close < 0 ? i + mb[0].length - 1 : close; continue; }
      if (brace === 0 && env === 0) {
        re.lastIndex = 0;
        const m = re.exec(body.slice(i));
        if (m && m.index === 0) { hits.push({ cmd: m[0], at: i, after: i + m[0].length }); i += m[0].length - 1; continue; }
      }
      i++;
      continue;
    }
    if (c === '{') brace++;
    else if (c === '}') brace--;
  }
  return hits;
}

/** Tách một chuỗi theo dấu & hoặc \\ ở cấp ngoài cùng. */
function splitCells(body: string, sep: '&' | '\\\\'): string[] {
  const out: string[] = [];
  let brace = 0;
  let env = 0;
  let last = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') {
      const mb = /^\\(begin|end)\s*\{/.exec(body.slice(i, i + 12));
      if (mb) { env += mb[1] === 'begin' ? 1 : -1; const close = body.indexOf('}', i + mb[0].length); i = close < 0 ? i + mb[0].length - 1 : close; continue; }
      if (sep === '\\\\' && body[i + 1] === '\\' && brace === 0 && env === 0) {
        out.push(body.slice(last, i));
        i += 1;
        const star = body[i + 1] === '*' ? 1 : 0;
        i += star;
        const opt = readOptional(body, i + 1);
        if (opt && skipWs(body, i + 1) === i + 1) i = opt[1] - 1;
        last = i + 1;
        continue;
      }
      i++;
      continue;
    }
    if (c === '{') brace++;
    else if (c === '}') brace--;
    else if (sep === '&' && c === '&' && brace === 0 && env === 0) { out.push(body.slice(last, i)); last = i + 1; }
  }
  out.push(body.slice(last));
  return out;
}

// ---------- dựng ----------
const ROMAN: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
const romanOf = (n: number) => { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; };
const alphOf = (n: number) => String.fromCharCode(96 + (((n - 1) % 26) + 26) % 26 + 1);

/** Giá trị của một bộ đếm theo kiểu: arabic | alph | Alph | roman | Roman. */
function counterText(kind: string, n: number): string {
  switch (kind) {
    case 'alph': return alphOf(n);
    case 'Alph': return alphOf(n).toUpperCase();
    case 'roman': return romanOf(n);
    case 'Roman': return romanOf(n).toUpperCase();
    default: return String(n);
  }
}

/**
 * Nhãn mục theo enumitem, trả về MÃ LaTeX (để walk dựng tiếp: \it, \textbf, $..$ đều xử lý như văn bản thường).
 *  - `\alph*`, `\Alph*`, `\roman*`, `\Roman*`, `\arabic*` → giá trị bộ đếm.
 *  - nhãn ngắn: ký tự `1 a A i I` ĐẦU TIÊN nằm ngoài {} và ngoài tên lệnh (như enumitem; `\it TH1:` → `\it TH2:`).
 * Không tự sửa mã của giáo viên: chỉ đọc nhãn để dựng xem trước.
 */
function labelTex(opt: string, n: number): string {
  const num = n + 1;
  const star = /\\(arabic|alph|Alph|roman|Roman)\s*\*/g;
  if (star.test(opt)) return opt.replace(star, (_, k: string) => counterText(k, num));
  let out = '';
  let done = false;
  let brace = 0;
  for (let i = 0; i < opt.length; i++) {
    const c = opt[i];
    if (c === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(opt.slice(i)); const len = m ? m[0].length : 1; out += opt.slice(i, i + len); i += len - 1; continue; }
    if (c === '{') brace++;
    else if (c === '}') brace = Math.max(0, brace - 1);
    else if (!done && brace === 0 && '1aAiI'.includes(c)) {
      done = true;
      out += c === '1' ? String(num) : c === 'a' ? alphOf(num) : c === 'A' ? alphOf(num).toUpperCase() : c === 'i' ? romanOf(num) : romanOf(num).toUpperCase();
      continue;
    }
    out += c;
  }
  return done ? out : opt;
}

/** Nhãn mặc định của LaTeX theo độ sâu: 1. → (a) → i. → A. */
function defaultLabel(env: string, n: number, depth: number): string {
  const num = n + 1;
  if (env === 'itemchoice') return `${alphOf(num)})`;
  if (env === 'enumerate' || env === 'enumEX') {
    return [`${num}.`, `(${alphOf(num)})`, `${romanOf(num)}.`, `${alphOf(num).toUpperCase()}.`][Math.min(depth, 3)];
  }
  return depth === 0 ? '•' : depth === 1 ? '–' : '∗';
}

function walk(s: string, ctx: Ctx): string {
  if (ctx.depth > 40) { ctx.unsup.add('lồng quá sâu'); return esc(s); }
  ctx.depth++;
  const closers: string[] = [];
  let out = '';
  let i = 0;
  const unk = (what: string) => { ctx.unsup.add(what); out += `<span class="tx-unk" title="Xem trước chưa dựng được lệnh này">${esc(what)}</span>`; };

  while (i < s.length) {
    const ch = s[i];

    if (ch === '\u0000') {
      const e = s.indexOf('\u0000', i + 1);
      const stop = e < 0 ? s.length : e + 1;
      const mk = /^\u0000FIG(\d+)\u0000$/.exec(s.slice(i, stop));
      if (mk && ctx.size && (ctx.size.w || ctx.size.h)) ctx.meta[Number(mk[1])] = ctx.size;
      out += s.slice(i, stop);
      i = stop;
      continue;
    }

    if (ch === '$') {
      const display = s[i + 1] === '$';
      const open = display ? 2 : 1;
      const close = display ? s.indexOf('$$', i + 2) : ctx.findDollar(s, i + 1);
      if (close < 0) { ctx.unsup.add('dấu $ không đóng'); out += '<span class="tx-unk">$</span>'; i++; continue; }
      out += ctx.renderMath(s.slice(i + open, close), display);
      i = close + open;
      continue;
    }

    if (ch === '{') {
      const g = readGroup(s, i);
      if (!g) { ctx.unsup.add('ngoặc { không đóng'); out += '<span class="tx-unk">{</span>'; i++; continue; }
      out += walk(g[0], ctx);
      i = g[1];
      continue;
    }
    if (ch === '}') { ctx.unsup.add('ngoặc } thừa'); out += '<span class="tx-unk">}</span>'; i++; continue; }
    if (ch === '~') { out += '&nbsp;'; i++; continue; }
    if (ch === '-') {
      if (s.startsWith('---', i)) { out += '—'; i += 3; continue; }
      if (s.startsWith('--', i)) { out += '–'; i += 2; continue; }
    }
    if (ch === '`' && s[i + 1] === '`') { out += '“'; i += 2; continue; }
    if (ch === "'" && s[i + 1] === "'") { out += '”'; i += 2; continue; }
    if (ch === '&') { out += '&amp;'; i++; continue; }
    if (ch === '<') { out += '&lt;'; i++; continue; }
    if (ch === '>') { out += '&gt;'; i++; continue; }
    if (ch === '"') { out += '&quot;'; i++; continue; }
    if (/\s/.test(ch)) {
      let j = i;
      let nl = 0;
      while (j < s.length && /\s/.test(s[j])) { if (s[j] === '\n') nl++; j++; }
      out += nl >= 2 ? '<br>' : ' ';
      i = j;
      continue;
    }
    if (ch !== '\\') { out += ch; i++; continue; }

    // ----- bắt đầu bằng dấu \ -----
    const nx = s[i + 1];
    if (nx === undefined) { i++; continue; }

    // \( … \) và \[ … \]
    if (nx === '(' || nx === '[') {
      const display = nx === '[';
      const end = s.indexOf(display ? '\\]' : '\\)', i + 2);
      if (end < 0) { unk(`\\${nx}`); i += 2; continue; }
      out += ctx.renderMath(s.slice(i + 2, end), display);
      i = end + 2;
      continue;
    }
    if (!isLetter(nx)) {
      i += 2;
      if (nx === '\\') {
        if (s[i] === '*') i++;
        const o = readOptional(s, i);
        if (o && skipWs(s, i) === i) i = o[1];
        out += '<br>';
      } else if ('%&#_${} '.includes(nx)) out += nx === ' ' ? ' ' : esc(nx);
      else if (nx === ',' || nx === ';' || nx === ':') out += ' ';
      else if (nx === '!' || nx === '/' || nx === '-' || nx === '@') { /* không hiện gì */ }
      else if (nx === '|') out += '‖';
      else if (nx === '"' || nx === "'" || nx === '`' || nx === '^' || nx === '~' || nx === '=' || nx === '.') {
        // dấu phụ kiểu \'a: giữ chữ cái theo sau, bỏ dấu phụ (xem trước)
        out += '';
      } else unk(`\\${nx}`);
      continue;
    }

    let j = i + 1;
    while (j < s.length && isLetter(s[j])) j++;
    const name = s.slice(i + 1, j);
    let k = j; // vị trí sau tên lệnh
    const star = s[k] === '*' && /^(hspace|vspace|immini|newline|section|subsection|caption|resizebox|scalebox)$/.test(name);
    if (star) k++;
    const afterWs = skipWs(s, k); // LaTeX nuốt khoảng trắng sau tên lệnh

    // ---- môi trường ----
    if (name === 'begin') {
      const env = readEnv(s, i);
      if (!env) { unk('\\begin (thiếu \\end tương ứng)'); i = k; continue; }
      i = env.end;
      out += renderEnv(env.name, env.body, ctx);
      continue;
    }
    if (name === 'end') { const m = /^\s*\{[^}]*\}/.exec(s.slice(k)); unk('\\end thừa'); i = k + (m ? m[0].length : 0); continue; }

    // ---- định dạng có đối số ----
    if (FMT_TAG[name] || FMT_PLAIN.has(name)) {
      const [a, e] = readArgs(s, afterWs, 1);
      if (!a.length) { i = afterWs; continue; }
      const inner = walk(a[0], ctx);
      out += FMT_TAG[name] ? `<${FMT_TAG[name]}>${inner}</${FMT_TAG[name]}>` : inner;
      i = e;
      continue;
    }
    if (name === 'texttt') { const [a, e] = readArgs(s, afterWs, 1); out += `<code class="tx-tt">${walk(a[0] ?? '', ctx)}</code>`; i = e; continue; }
    if (name === 'textsuperscript' || name === 'textsubscript') { const [a, e] = readArgs(s, afterWs, 1); const t = name === 'textsuperscript' ? 'sup' : 'sub'; out += `<${t}>${walk(a[0] ?? '', ctx)}</${t}>`; i = e; continue; }
    if (name === 'textcolor' || name === 'colorbox' || name === 'fcolorbox') {
      const n = name === 'fcolorbox' ? 3 : 2;
      const o = readOptional(s, afterWs);
      const [a, e] = readArgs(s, o ? o[1] : afterWs, n);
      const inner = walk(a[n - 1] ?? '', ctx);
      const c = (a[0] ?? '').trim().toLowerCase();
      out += name === 'textcolor' && COLORS.has(c) ? `<span style="color:${c}">${inner}</span>` : inner;
      i = e;
      continue;
    }
    if (name === 'fbox' || name === 'framebox') {
      const o1 = readOptional(s, afterWs);
      const o2 = o1 ? readOptional(s, o1[1]) : null;
      const [a, e] = readArgs(s, (o2 ?? o1)?.[1] ?? afterWs, 1);
      out += `<span class="tx-box">${walk(a[0] ?? '', ctx)}</span>`;
      i = e;
      continue;
    }
    if (name === 'makebox' || name === 'raisebox' || name === 'parbox') {
      const nopt = name === 'parbox' ? 3 : 2;
      let pos = afterWs;
      let groupsBefore = name === 'parbox' ? 1 : 0;
      for (let t = 0; t < nopt; t++) { const o = readOptional(s, pos); if (!o) break; pos = o[1]; }
      const [pre, e0] = readArgs(s, pos, groupsBefore);
      groupsBefore = pre.length;
      const [a, e] = readArgs(s, e0, 1);
      out += walk(a[0] ?? '', ctx);
      i = e;
      continue;
    }

    // ---- bọc quanh hình / nội dung (giữ nội dung, bỏ phần co giãn) ----
    if (name === 'resizebox') {
      const [a, e] = readArgs(s, afterWs, 3);
      if (a.length < 3) { unk('\\resizebox (thiếu đối số)'); i = e; continue; }
      const prev = ctx.size;
      const w = a[0].trim() === '!' ? undefined : (cssLength(a[0]) ?? undefined);
      const h = a[1].trim() === '!' ? undefined : (cssLength(a[1]) ?? undefined);
      ctx.size = { w, h };
      out += walk(a[2], ctx);
      ctx.size = prev;
      i = e;
      continue;
    }
    if (name === 'scalebox') {
      const [, e1] = readArgs(s, afterWs, 1);
      const o = readOptional(s, e1);
      const [b, e] = readArgs(s, o ? o[1] : e1, 1);
      out += walk(b[0] ?? '', ctx);
      i = e;
      continue;
    }
    if (name === 'rotatebox' || name === 'adjustbox') {
      const o = readOptional(s, afterWs);
      const [a, e] = readArgs(s, o ? o[1] : afterWs, 2);
      out += walk(a[a.length - 1] ?? '', ctx);
      i = e;
      continue;
    }

    // ---- hai cột \immini ----
    if (name === 'immini') {
      const o = readOptional(s, afterWs);
      const [a, e] = readArgs(s, o ? o[1] : afterWs, 2);
      if (a.length < 1) { unk('\\immini (thiếu nhóm)'); i = e; continue; }
      if (a.length === 1) ctx.unsup.add('\\immini thiếu nhóm hình');
      out += OPEN('tx-immini') + OPEN('tx-col') + walk(a[0], ctx) + CLOSE + OPEN('tx-col tx-colfig') + walk(a[1] ?? '', ctx) + CLOSE + CLOSE;
      i = e;
      continue;
    }

    // ---- danh sách, xuống dòng, khoảng trắng ----
    if (name === 'item' || name === 'itemch') { const o = readOptional(s, afterWs); out += `<br>${o ? `<b>${walk(o[0], ctx)}</b>` : '•'} `; i = o ? o[1] : afterWs; continue; }
    if (name === 'newline' || name === 'break' || name === 'par' || name === 'linebreak') { out += '<br>'; i = afterWs; continue; }
    if (name === 'hspace' || name === 'hskip') {
      const [a, e] = readArgs(s, afterWs, 1);
      const w = a.length ? cssLength(a[0]) : null;
      if (w && parseFloat(w) > 0) out += `<span class="tx-hs" style="width:${w}"></span>`;
      else if (!a.length) out += ' ';
      i = a.length ? e : afterWs;
      continue;
    }
    if (name in DROP_ARGS) { const [, e] = readArgs(s, afterWs, DROP_ARGS[name]); i = DROP_ARGS[name] ? e : afterWs; continue; }
    if (name === 'caption' || name === 'captionof') {
      const o = readOptional(s, afterWs);
      const [a, e] = readArgs(s, o ? o[1] : afterWs, name === 'captionof' ? 2 : 1);
      out += `<span class="tx-cap">${walk(a[a.length - 1] ?? '', ctx)}</span>`;
      i = e;
      continue;
    }
    if (name === 'footnote') { const [a, e] = readArgs(s, afterWs, 1); out += `<sup title="${esc(a[0] ?? '')}">*</sup>`; i = e; continue; }
    if (name === 'lq' || name === 'rq') {
      // \lq\lq → “ ; \rq\rq → ”
      const again = new RegExp('^\\\\' + name + '(?![A-Za-z])').test(s.slice(afterWs));
      const [l, r] = name === 'lq' ? ['‘', '“'] : ['’', '”'];
      if (again) { out += r; i = skipWs(s, afterWs + name.length + 1); } else { out += l; i = afterWs; }
      continue;
    }
    if (name in SYMBOLS) { out += SYMBOLS[name]; i = name === 'quad' || name === 'qquad' ? k : afterWs; continue; }
    if (name in SWITCH_TAG) { out += `<${SWITCH_TAG[name]}>`; closers.push(`</${SWITCH_TAG[name]}>`); i = afterWs; continue; }
    if (SWITCH_NOOP.has(name)) {
      if (name === 'color') { const [, e] = readArgs(s, afterWs, 1); i = e; } else i = afterWs;
      continue;
    }
    if (IGNORE_0.has(name)) { i = afterWs; continue; }

    // ---- chưa hiểu: HIỆN RA, không nuốt ----
    unk('\\' + name);
    i = k;
  }

  ctx.depth--;
  return out + closers.reverse().join('');
}

function renderEnv(name: string, body: string, ctx: Ctx): string {
  const wrapBlock = (cls: string, inner: string) => OPEN(cls) + inner + CLOSE;

  if (name === 'center') return wrapBlock('tx-center', walk(body, ctx));
  if (name === 'flushleft') return wrapBlock('tx-left', walk(body, ctx));
  if (name === 'flushright') return wrapBlock('tx-right', walk(body, ctx));

  if (MATH_ENVS.has(name)) {
    let b = body;
    let n = name;
    if (name === 'eqnarray' || name === 'eqnarray*') {
      n = 'aligned';
      b = splitCells(body, '\\\\').map((row) => {
        const c = splitCells(row, '&');
        return c.length === 3 ? `${c[0]} &${c[1]}${c[2]}` : row;
      }).join(' \\\\ ');
    }
    return ctx.renderMath(`\\begin{${n}}${b}\\end{${n}}`, true);
  }

  if (LIST_ENVS.has(name)) {
    let rest = body;
    let opt: string | null = null;
    let p = 0;
    // phần đối số đầu: [..] (nhãn) và [n] (số cột của listEX)
    for (let t = 0; t < 2; t++) {
      const o = readOptional(rest, p);
      if (!o || rest.slice(0, skipWs(rest, p)).trim()) break;
      if (!/^\d+$/.test(o[0].trim())) opt = o[0];
      p = o[1];
    }
    rest = rest.slice(p);
    const hits = splitTop(rest, /\\item(?:ch)?(?![A-Za-z])/y);
    const head = rest.slice(0, hits[0]?.at ?? rest.length);
    let out = '';
    if (head.trim()) out += walk(head, ctx);
    let items = '';
    hits.forEach((h, n) => {
      const end = hits[n + 1]?.at ?? rest.length;
      let text = rest.slice(h.after, end);
      let lab: string | null = null;
      const o = readOptional(text, 0);
      if (o && !text.slice(0, skipWs(text, 0)).trim()) { lab = o[0]; text = text.slice(o[1]); }
      const labTex = lab ?? (opt != null && (name === 'enumerate' || name === 'enumEX' || name === 'itemchoice') ? labelTex(opt, n) : null);
      const label = labTex != null ? walk(labTex, ctx) : esc(defaultLabel(name, n, ctx.listDepth));
      ctx.listDepth++;
      const inner = walk(text, ctx);
      ctx.listDepth--;
      items += OPEN('tx-item') + `<span class="tx-lab">${label}</span>` + OPEN('tx-itemtxt') + inner + CLOSE + CLOSE;
    });
    return out + OPEN('tx-list') + items + CLOSE;
  }

  if (TABLE_ENVS.has(name)) return renderTable(name, body, ctx);

  if (WRAP_ENVS.has(name)) {
    let p = 0;
    const o1 = readOptional(body, p);
    if (o1) p = o1[1];
    const need = name === 'wrapfigure' ? 2 : name === 'minipage' || name === 'varwidth' || name === 'adjustbox' ? 1 : name === 'spacing' ? 1 : 0;
    const [, e] = readArgs(body, p, need);
    const o2 = readOptional(body, e);
    return wrapBlock('tx-wrap', walk(body.slice(o2 ? o2[1] : e), ctx));
  }

  if (name === 'verbatim' || name === 'verbatim*') return `<pre class="tx-pre">${esc(body)}</pre>`;

  ctx.unsup.add(`\\begin{${name}}`);
  return `<span class="tx-unk">\\begin{${name}}</span>` + wrapBlock('tx-wrap', walk(body, ctx)) + `<span class="tx-unk">\\end{${name}}</span>`;
}

/** Dòng kẻ ngang cuối bảng (\hline sau hàng cuối): một hàng cao 0 phủ ĐỦ mọi cột để đường kẻ chạy suốt chiều ngang. */
function ruleRow(n: number): string {
  let s = OPEN('tx-tr rule');
  for (let i = 0; i < Math.max(1, n); i++) s += OPEN('tx-td') + CLOSE;
  return s + CLOSE;
}

function renderTable(name: string, body: string, ctx: Ctx): string {
  let p = 0;
  const o = readOptional(body, p);
  if (o) p = o[1];
  const [pre, e] = readArgs(body, p, name === 'tabular*' || name === 'tabularx' ? 2 : 1);
  const spec = pre[pre.length - 1] ?? '';
  const content = body.slice(e);
  // cột: l c r p{…} và đường kẻ dọc |
  const cols: { a: string; bl: boolean }[] = [];
  let bar = false;
  for (let i = 0; i < spec.length; i++) {
    const c = spec[i];
    if (c === '|') bar = true;
    else if ('lcrXpmb'.includes(c)) {
      if ('pmb'.includes(c) && spec[i + 1] === '{') { const g = readGroup(spec, i + 1); if (g) i = g[1] - 1; }
      cols.push({ a: c === 'l' ? 'left' : c === 'r' ? 'right' : c === 'c' ? 'center' : 'left', bl: bar });
      bar = false;
    } else if (c === '{') { const g = readGroup(spec, i); if (g) i = g[1] - 1; }
  }
  const lastBar = bar;
  const rows = splitCells(content, '\\\\');
  // Dựng bằng các khối display:table (chứ không dùng <table>) để hình TikZ trong ô vẫn chen vào được.
  let out = OPEN('tx-table');
  let rule = false;
  rows.forEach((raw) => {
    let r = raw;
    let top = false;
    for (;;) {
      const m = /^\s*\\(hline|toprule|midrule|bottomrule)\b/.exec(r) ?? /^\s*\\cline\s*\{[^}]*\}/.exec(r);
      if (!m) break;
      top = true;
      r = r.slice(m[0].length);
    }
    if (!r.trim()) { if (top) rule = true; return; }
    out += OPEN(`tx-tr${top || rule ? ' top' : ''}`);
    rule = false;
    let ci = 0;
    splitCells(r, '&').forEach((cell) => {
      let colspan = 1;
      let align = cols[ci]?.a ?? 'left';
      let txt = cell;
      const mc = /^\s*\\multicolumn\b/.exec(cell);
      if (mc) {
        const [g] = readArgs(cell, mc[0].length, 3);
        if (g.length === 3) {
          colspan = Math.max(1, Number(g[0]) || 1);
          align = /r/.test(g[1]) ? 'right' : /c/.test(g[1]) ? 'center' : 'left';
          txt = g[2];
        }
      }
      const bl = cols[ci]?.bl ? ' bl' : '';
      const br = lastBar && ci + colspan >= cols.length ? ' br' : '';
      out += OPEN(`tx-td a-${align}${bl}${br}`) + walk(txt, ctx) + CLOSE;
      for (let k = 1; k < colspan; k++) out += OPEN('tx-td') + CLOSE;
      ci += colspan;
    });
    out += CLOSE;
  });
  if (rule) out += ruleRow(cols.length);
  return out + CLOSE;
}

/** Dựng một đoạn chữ LaTeX (đã thay hình bằng dấu) thành HTML. */
export function renderFlow(src: string, hooks: FlowHooks): FlowResult {
  const ctx: Ctx = { ...hooks, unsup: new Set(), meta: {}, size: null, depth: 0, listDepth: 0 };
  const html = walk(src, ctx);
  return { html, unsupported: [...ctx.unsup], meta: ctx.meta };
}
