// Sinh mã TikZ vẽ đồ thị hàm số (thuần, có kiểm thử). Kiểu viết theo các hình đồ thị trong kho MathHub:
// trục có mũi tên, \clip khung vẽ, \draw[smooth,samples=…,domain=…] plot (\x,{…}). Người dùng gõ hàm số theo cách thường (x^3-3x+1);
// bộ đọc biểu thức đổi sang cú pháp của pgfmath, và dùng chính biểu thức đó để tính y tại các điểm đánh dấu và gợi ý khung vẽ.

// ---------- biểu thức ----------
export type Ast =
  | { k: 'num'; v: number }
  | { k: 'x' }
  | { k: 'const'; name: 'pi' | 'e' }
  | { k: 'neg'; a: Ast }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Ast; b: Ast }
  | { k: 'fn'; name: 'sin' | 'cos' | 'tan' | 'sqrt' | 'ln' | 'log' | 'exp' | 'abs'; a: Ast };

const FNS = ['sin', 'cos', 'tan', 'sqrt', 'ln', 'log', 'exp', 'abs'] as const;
type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function lex(src: string): Tok[] {
  const s = src.replace(/\s+/g, '').replace(/\\cdot|\\times|·/g, '*').replace(/\\left|\\right/g, '').replace(/\\(sin|cos|tan|ln|log|exp|sqrt|pi)\b/g, '$1').replace(/\{/g, '(').replace(/\}/g, ')');
  const out: Tok[] = [];
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (/[0-9.]/.test(c)) { const m = /^[0-9]*\.?[0-9]+|^[0-9]+\.?/.exec(s.slice(i)); if (!m) throw new Error(`Số không hợp lệ gần “${s.slice(i, i + 6)}”`); out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; }
    else if (/[a-zA-Z]/.test(c)) { const m = /^[a-zA-Z]+/.exec(s.slice(i))!; out.push({ t: 'id', v: m[0] }); i += m[0].length; }
    else if ('+-*/^()'.includes(c)) { out.push({ t: 'op', v: c }); i++; }
    else if (c === ',') { throw new Error('Dấu phẩy: viết số thập phân bằng dấu chấm (1.5), không dùng dấu phẩy.'); }
    else throw new Error(`Ký tự “${c}” không dùng được trong hàm số.`);
  }
  return out;
}

/** Đọc biểu thức theo x: + - * / ^ ngoặc, nhân ngầm (3x, 2(x+1), x(x-1)), sin cos tan sqrt ln log exp abs, pi, e. Lỗi ⇒ ném Error có lời Việt. */
export function parseExpr(src: string): Ast {
  const toks = lex(src);
  if (!toks.length) throw new Error('Chưa nhập hàm số.');
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;
  const startsPrimary = () => { const t = peek(); return !!t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '(')); };
  function expr(): Ast {
    let a = term();
    while (isOp('+') || isOp('-')) { const op = (toks[p++] as { v: '+' | '-' }).v; a = { k: 'bin', op, a, b: term() }; }
    return a;
  }
  function term(): Ast {
    let a = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) { const op = (toks[p++] as { v: '*' | '/' }).v; a = { k: 'bin', op, a, b: unary() }; }
      else if (startsPrimary()) a = { k: 'bin', op: '*', a, b: power() }; // nhân ngầm
      else return a;
    }
  }
  function unary(): Ast {
    if (isOp('-')) { p++; return { k: 'neg', a: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power(): Ast {
    const a = primary();
    if (isOp('^')) { p++; return { k: 'bin', op: '^', a, b: isOp('-') ? (p++, { k: 'neg', a: power() } as Ast) : power() }; }
    return a;
  }
  function primary(): Ast {
    const t = toks[p++];
    if (!t) throw new Error('Biểu thức bị thiếu vế (kết thúc đột ngột).');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'op' && t.v === '(') { const a = expr(); if (!isOp(')')) throw new Error('Thiếu dấu đóng ngoặc ).'); p++; return a; }
    if (t.t === 'id') {
      const id = t.v.toLowerCase();
      if (id === 'x') return { k: 'x' };
      if (id === 'pi') return { k: 'const', name: 'pi' };
      if (id === 'e') return { k: 'const', name: 'e' };
      if ((FNS as readonly string[]).includes(id)) {
        if (!isOp('(')) throw new Error(`Sau ${id} cần ngoặc, vd ${id}(x).`);
        p++; const a = expr(); if (!isOp(')')) throw new Error('Thiếu dấu đóng ngoặc ).'); p++;
        return { k: 'fn', name: id as (typeof FNS)[number], a };
      }
      const pre = (FNS as readonly string[]).find((f) => id.startsWith(f));
      if (pre) throw new Error(`Sau ${pre} cần ngoặc, vd ${pre}(x).`);
      // chữ liền như "xsin" không hiểu: báo rõ
      throw new Error(`Không hiểu “${t.v}”. Chỉ dùng x, pi, e và các hàm ${FNS.join(', ')}.`);
    }
    throw new Error(`Gặp “${(t as { v: string }).v}” ở chỗ không hợp lệ.`);
  }
  const a = expr();
  if (p < toks.length) throw new Error(`Thừa “${(toks[p] as { v: string | number }).v}” ở cuối biểu thức.`);
  return a;
}

/** Giá trị của biểu thức tại x (NaN nếu không xác định, vd chia cho 0, căn số âm). Lượng giác tính theo radian. */
export function evalAst(a: Ast, x: number): number {
  switch (a.k) {
    case 'num': return a.v;
    case 'x': return x;
    case 'const': return a.name === 'pi' ? Math.PI : Math.E;
    case 'neg': return -evalAst(a.a, x);
    case 'fn': { const v = evalAst(a.a, x); switch (a.name) { case 'sin': return Math.sin(v); case 'cos': return Math.cos(v); case 'tan': return Math.tan(v); case 'sqrt': return v < 0 ? NaN : Math.sqrt(v); case 'ln': return v <= 0 ? NaN : Math.log(v); case 'log': return v <= 0 ? NaN : Math.log10(v); case 'exp': return Math.exp(v); case 'abs': return Math.abs(v); } return NaN; }
    case 'bin': {
      const l = evalAst(a.a, x), r = evalAst(a.b, x);
      switch (a.op) { case '+': return l + r; case '-': return l - r; case '*': return l * r; case '/': return r === 0 ? NaN : l / r; case '^': return Math.pow(l, r); }
    }
  }
  return NaN;
}

const fmt = (n: number): string => { const s = (Math.round(n * 1e6) / 1e6).toString(); return s === '-0' ? '0' : s; };

/** Biểu thức theo cú pháp pgfmath (biến \x). sin/cos/tan của pgfmath tính theo ĐỘ nên đổi sang radian bằng hậu tố r. */
export function toPgf(a: Ast): string {
  switch (a.k) {
    case 'num': return fmt(a.v);
    case 'x': return '(\\x)';
    case 'const': return a.name === 'pi' ? 'pi' : '2.718281828';
    case 'neg': return `(-${toPgf(a.a)})`;
    case 'fn': { const u = toPgf(a.a); return a.name === 'sin' || a.name === 'cos' || a.name === 'tan' ? `${a.name}((${u}) r)` : a.name === 'log' ? `log10(${u})` : `${a.name}(${u})`; }
    case 'bin': {
      if (a.op !== '^') return `(${toPgf(a.a)}${a.op}${toPgf(a.b)})`;
      // cơ số và số mũ đã tự có ngoặc khi cần (x, phép tính, số âm); hàm và hằng thì bọc thêm cho chắc
      const wrapIf = (n: Ast, ok: Ast['k'][]) => (ok.includes(n.k) ? toPgf(n) : `(${toPgf(n)})`);
      return `${wrapIf(a.a, ['num', 'x', 'bin', 'neg'])}^${wrapIf(a.b, ['num', 'x', 'bin', 'neg'])}`;
    }
  }
}

// ---------- khung vẽ ----------
export interface GraphInput {
  /** hàm số theo x, vd "x^3-3x+1" */
  expr: string;
  xmin: number; xmax: number; ymin: number; ymax: number;
  /** miền vẽ của đường cong (mặc định = [xmin, xmax]) */
  dmin?: number; dmax?: number;
  /** tỉ lệ TikZ (scale) */
  scale: number;
  samples: number;
  /** điểm đánh dấu trên trục x: vẽ chấm, nét đứt tới đường cong và nhãn */
  marks: { x: number; label?: string; dashed?: boolean }[];
  /** đường tiệm cận đứng x = a và ngang y = b (nét đứt) */
  vAsym: number[];
  hAsym: number[];
  showO: boolean;
}

export const DEFAULT_GRAPH: GraphInput = { expr: 'x^3-3x+1', xmin: -2.5, xmax: 2.5, ymin: -2, ymax: 4, scale: 0.7, samples: 200, marks: [], vAsym: [], hAsym: [], showO: true };

/** Gợi ý khung vẽ bằng cách lấy mẫu hàm số (bỏ giá trị quá lớn gần tiệm cận); làm tròn ra số "đẹp". */
export function suggestWindow(expr: string, xmin: number, xmax: number): { ymin: number; ymax: number } {
  const a = parseExpr(expr);
  const ys: number[] = [];
  for (let i = 0; i <= 400; i++) { const y = evalAst(a, xmin + ((xmax - xmin) * i) / 400); if (Number.isFinite(y) && Math.abs(y) < 1e4) ys.push(y); }
  if (!ys.length) return { ymin: -3, ymax: 3 };
  ys.sort((p, q) => p - q);
  // bỏ 2% hai đầu để một vài điểm gần tiệm cận không kéo khung quá lớn
  const lo = ys[Math.floor(ys.length * 0.02)], hi = ys[Math.ceil(ys.length * 0.98) - 1];
  const pad = Math.max(0.5, (hi - lo) * 0.1);
  return { ymin: Math.floor((Math.min(lo, 0) - pad) * 2) / 2, ymax: Math.ceil((Math.max(hi, 0) + pad) * 2) / 2 };
}

export function graphIssues(g: GraphInput): string[] {
  const out: string[] = [];
  try { parseExpr(g.expr); } catch (e) { out.push(e instanceof Error ? e.message : String(e)); }
  if (!(g.xmin < g.xmax)) out.push('Cần x nhỏ nhất < x lớn nhất.');
  if (!(g.ymin < g.ymax)) out.push('Cần y nhỏ nhất < y lớn nhất.');
  if (!(g.scale > 0 && g.scale <= 3)) out.push('Tỉ lệ vẽ nên trong khoảng 0 đến 3.');
  if (!(g.samples >= 10 && g.samples <= 1000)) out.push('Số điểm lấy mẫu nên từ 10 đến 1000.');
  return out;
}

/** Mã TikZ. Gọi `graphIssues` trước. */
export function graphCode(g: GraphInput): string {
  const ast = parseExpr(g.expr);
  const pg = toPgf(ast);
  const d0 = g.dmin ?? g.xmin, d1 = g.dmax ?? g.xmax;
  const L: string[] = [];
  L.push(`\\begin{tikzpicture}[>=stealth,line join=round,line cap=round,font=\\footnotesize,scale=${fmt(g.scale)}]`);
  L.push(`  \\def\\xmin{${fmt(g.xmin)}}\\def\\xmax{${fmt(g.xmax)}}\\def\\ymin{${fmt(g.ymin)}}\\def\\ymax{${fmt(g.ymax)}}`);
  L.push('  \\draw[->] (\\xmin-0.2,0)--(\\xmax+0.2,0) node[below] {$x$};');
  L.push('  \\draw[->] (0,\\ymin-0.2)--(0,\\ymax+0.2) node[right] {$y$};');
  if (g.showO) L.push('  \\draw (0,0) node[below left] {$O$};');
  for (const a of g.vAsym) L.push(`  \\draw[dashed] (${fmt(a)},\\ymin)--(${fmt(a)},\\ymax);`);
  for (const b of g.hAsym) L.push(`  \\draw[dashed] (\\xmin,${fmt(b)})--(\\xmax,${fmt(b)});`);
  L.push('  \\begin{scope}');
  L.push('    \\clip (\\xmin,\\ymin) rectangle (\\xmax,\\ymax);');
  L.push(`    \\draw[smooth,samples=${Math.round(g.samples)},domain=${fmt(d0)}:${fmt(d1)}] plot (\\x,{${pg}});`);
  L.push('  \\end{scope}');
  for (const m of g.marks) {
    const y = evalAst(ast, m.x);
    const lab = m.label ?? fmt(m.x);
    L.push(`  \\fill (${fmt(m.x)},0) circle (1.2pt) node[${m.x >= 0 ? 'below' : 'below'}] {$${lab}$};`);
    if (m.dashed !== false && Number.isFinite(y) && y >= g.ymin && y <= g.ymax && Math.abs(y) > 1e-9) L.push(`  \\draw[dashed] (${fmt(m.x)},0)--(${fmt(m.x)},${fmt(y)});`);
  }
  L.push('\\end{tikzpicture}');
  return L.join('\n');
}
