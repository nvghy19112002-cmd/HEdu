// Phần "đầu tệp" riêng của từng câu: khi nhập một tệp .tex, các định nghĩa (macro, môi trường, thư viện TikZ…) nằm ở đầu tệp bị bỏ đi
// nên câu dùng chúng sẽ không biên dịch được. Ở đây tách các định nghĩa ấy ra và giữ cho từng câu CHỈ những định nghĩa câu đó dùng
// (kể cả bắc cầu: định nghĩa này gọi định nghĩa kia). Thuần, có kiểm thử. Không đoán: gặp chỗ không đọc được thì bỏ qua.
import { readGroup } from './extest';

export interface PreDef {
  /** tên lệnh (không có dấu \) hoặc tên môi trường; '' nếu là dòng thiết lập chung (thư viện TikZ, \tikzset) */
  name: string;
  kind: 'cmd' | 'env' | 'tikz';
  /** mã nguyên văn của định nghĩa */
  text: string;
}

const CMD_DEF = /\\(newcommand|renewcommand|providecommand|DeclareMathOperator|DeclareRobustCommand|def|let|newenvironment|renewenvironment)(\*?)(?![A-Za-z])/g;
const ws = (s: string, i: number): number => { while (i < s.length && /\s/.test(s[i])) i++; return i; };

/** Gỡ chú thích % (giữ nguyên độ dài dòng không cần thiết: ở đây chỉ để đọc cấu trúc, văn bản trả về lấy từ bản gốc). */
const mask = (s: string): string => s.replace(/(^|[^\\])%[^\n]*/g, (m, p: string) => p + ' '.repeat(m.length - p.length));

/** Phần đầu tệp: từ đầu đến trước \begin{ex} đầu tiên (hoặc trước \begin{document}); không có thì rỗng. */
export function headOf(text: string): string {
  const ex = text.search(/\\begin\{ex\}/);
  const doc = text.search(/\\begin\{document\}/);
  const cut = ex >= 0 ? ex : doc;
  return cut > 0 ? text.slice(0, cut) : '';
}

/** Đọc các định nghĩa trong phần đầu tệp. */
export function parseDefs(head: string): PreDef[] {
  const m = mask(head);
  const out: PreDef[] = [];
  const begin = m.search(/\\begin\{document\}/);
  const limit = begin >= 0 ? begin : m.length;
  // định nghĩa \newcommand… \def… \newenvironment…
  CMD_DEF.lastIndex = 0;
  let r: RegExpExecArray | null;
  while ((r = CMD_DEF.exec(m)) && r.index < limit) {
    const kind = r[1];
    let i = ws(m, r.index + r[0].length);
    let name = '';
    let end = i;
    if (kind === 'def' || kind === 'let') {
      const n = /^\\([A-Za-z]+)/.exec(m.slice(i));
      if (!n) continue;
      name = n[1];
      end = i + n[0].length;
      if (kind === 'let') { end = ws(m, end); if (m[end] === '=') end++; end = ws(m, end); const t = /^\\[A-Za-z]+|^./.exec(m.slice(end)); end += t ? t[0].length : 0; }
      else {
        // tham số kiểu #1#2 rồi nhóm thân
        const hash = /^(?:#\d|[^{#\n])*/.exec(m.slice(end));
        end += hash ? hash[0].length : 0;
        const g = readGroup(m, end);
        if (!g) continue;
        end = g[1];
      }
    } else if (kind === 'newenvironment' || kind === 'renewenvironment') {
      const g0 = readGroup(m, i);
      if (!g0) continue;
      name = m.slice(i + 1, g0[1] - 1).trim();
      end = g0[1];
      end = skipOpts(m, end);
      for (let k = 0; k < 2; k++) { const g = readGroup(m, ws(m, end)); if (!g) { end = -1; break; } end = g[1]; }
      if (end < 0) continue;
    } else {
      // \newcommand{\ten}[n][def]{thân}  hoặc  \newcommand\ten…
      if (m[i] === '{') {
        const g0 = readGroup(m, i);
        if (!g0) continue;
        name = m.slice(i + 1, g0[1] - 1).trim().replace(/^\\/, '');
        end = g0[1];
      } else {
        const n = /^\\([A-Za-z]+|.)/.exec(m.slice(i));
        if (!n) continue;
        name = n[1];
        end = i + n[0].length;
      }
      end = skipOpts(m, end);
      if (kind === 'DeclareMathOperator') {
        const g = readGroup(m, ws(m, end));
        if (!g) continue;
        end = g[1];
      } else {
        const g = readGroup(m, ws(m, end));
        if (!g) continue;
        end = g[1];
      }
    }
    if (!/^[A-Za-z@]+$/.test(name)) { CMD_DEF.lastIndex = Math.max(CMD_DEF.lastIndex, end); continue; }
    out.push({ name, kind: kind.includes('environment') ? 'env' : 'cmd', text: head.slice(r.index, end).trim() });
    CMD_DEF.lastIndex = end;
  }
  // thư viện / thiết lập TikZ
  for (const t of m.slice(0, limit).matchAll(/\\(usetikzlibrary|tikzset|tikzstyle|usepgflibrary|pgfplotsset)(?![A-Za-z])/g)) {
    const at = t.index ?? 0;
    let e = ws(m, at + t[0].length);
    if (t[1] === 'tikzstyle') { const eq = m.indexOf('=', e); if (eq < 0) continue; e = ws(m, eq + 1); if (m[e] === '[') { const close = m.indexOf(']', e); if (close < 0) continue; e = close + 1; } }
    else if (m[e] === '[') { const close = m.indexOf(']', e); if (close < 0) continue; e = ws(m, close + 1); }
    const g = t[1] === 'tikzstyle' ? ([0, e] as [number, number]) : readGroup(m, e);
    if (!g) continue;
    out.push({ name: '', kind: 'tikz', text: head.slice(at, g[1]).trim() });
  }
  return out;
}

const skipOpts = (m: string, from: number): number => {
  let i = from;
  for (let k = 0; k < 2; k++) {
    const j = ws(m, i);
    if (m[j] !== '[') break;
    const close = m.indexOf(']', j);
    if (close < 0) break;
    i = close + 1;
  }
  return i;
};

const usedNames = (s: string): { cmds: Set<string>; envs: Set<string> } => {
  const cmds = new Set<string>(), envs = new Set<string>();
  for (const x of mask(s).matchAll(/\\([A-Za-z@]+)/g)) cmds.add(x[1]);
  for (const x of mask(s).matchAll(/\\(?:begin|end)\{([^}]+)\}/g)) envs.add(x[1]);
  return { cmds, envs };
};

/** Các định nghĩa mà `latex` dùng (kể cả bắc cầu), theo đúng thứ tự trong phần đầu tệp. Câu không dùng gì ⇒ chuỗi rỗng. */
export function neededFor(defs: readonly PreDef[], latex: string): string {
  const withTikz = /\\begin\{tikzpicture\}|\\tikz(?![A-Za-z])/.test(latex);
  const picked = new Set<number>();
  const queue: string[] = [latex];
  const u0 = usedNames(latex);
  const seenCmd = new Set<string>(u0.cmds), seenEnv = new Set<string>(u0.envs);
  const take = (i: number) => {
    if (picked.has(i)) return;
    picked.add(i);
    const u = usedNames(defs[i].text);
    for (const c of u.cmds) if (!seenCmd.has(c)) { seenCmd.add(c); }
    for (const e of u.envs) if (!seenEnv.has(e)) { seenEnv.add(e); }
    queue.push(defs[i].text);
  };
  for (let round = 0; round < 8; round++) {
    const before = picked.size;
    defs.forEach((d, i) => {
      if (d.kind === 'tikz') { if (withTikz) take(i); return; }
      if (d.kind === 'cmd' ? seenCmd.has(d.name) : seenEnv.has(d.name)) take(i);
    });
    if (picked.size === before) break;
  }
  return [...picked].sort((a, b) => a - b).map((i) => defs[i].text).join('\n');
}

/** Gộp phần đầu riêng của nhiều câu: bỏ dòng trùng, giữ thứ tự xuất hiện đầu tiên. */
export function mergePreambles(list: readonly (string | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of list) {
    if (!p) continue;
    for (const chunk of splitChunks(p)) {
      const k = chunk.replace(/\s+/g, ' ').trim();
      if (k && !seen.has(k)) { seen.add(k); out.push(chunk.trim()); }
    }
  }
  return out.join('\n');
}

/** Tách một khối nhiều định nghĩa thành từng định nghĩa (theo parseDefs; phần dư không đọc được giữ nguyên theo dòng). */
function splitChunks(p: string): string[] {
  const defs = parseDefs(p);
  if (defs.length) return defs.map((d) => d.text);
  return p.split('\n').filter((l) => l.trim());
}

/** Phần đầu riêng của câu `latex` lấy từ nguồn `sourceText` (cả tệp). Không có gì cần thì ''. */
export function preambleFromSource(sourceText: string, latex: string): string {
  const defs = parseDefs(headOf(sourceText));
  return defs.length ? neededFor(defs, latex) : '';
}
