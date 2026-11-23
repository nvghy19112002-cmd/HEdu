// Tự chuẩn hoá mã ex_test do AI chép (Studio, Đợt 1b). Chỉ sửa những lỗi CHẮC CHẮN, đếm từng loại để giao diện
// liệt kê "Tự chuẩn hoá n chỗ" và cho hoàn tác cả lượt. Không đụng vào tikzpicture và dòng chú thích %.
// Quy tắc lấy từ bộ HEdu-OCR (references/ex-test.md mục 10, cập nhật 23/11/2026 về ngoặc tự giãn).

export type NormRule = 'left-right' | 'decimal' | 'dfrac' | 'unicode';
export interface NormChange { rule: NormRule; label: string; count: number }
export interface NormResult { tex: string; changes: NormChange[] }

const LABEL: Record<NormRule, string> = {
  'left-right': '( ) → \\left( \\right)',
  decimal: '0.5 → 0{,}5',
  dfrac: '\\frac → \\dfrac',
  unicode: 'ký hiệu Unicode → lệnh TeX',
};

const UNI: Record<string, string> = { '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '≈': '\\approx ', '±': '\\pm ', '·': '\\cdot ', '°': '^\\circ ', '−': '-', '×': '\\times ', '∞': '\\infty ' };
/** bên trong "cao" ⇒ ngoặc phải tự giãn */
const TALL = /\\dfrac|\\frac|\\sum|\\int|\\lim|\\prod|\\sqrt\{[^{}]*\\dfrac|\\begin\{(?:array|matrix|pmatrix)/;

/** Bọc \left \right cho cặp ( ) / [ ] cùng tầng { } có bên trong cao. Cặp lệch loại (khoảng nửa mở) thì để nguyên. */
export function stretchBrackets(math: string): { s: string; n: number } {
  type Open = { ch: string; at: number; depth: number };
  const stack: Open[] = [];
  const wraps: { open: number; close: number }[] = [];
  let depth = 0;
  for (let i = 0; i < math.length; i++) {
    const c = math[i];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(math.slice(i));
      const cmd = m ? m[1] : '';
      // \left( \right) \bigl( … đã có cỡ: bỏ qua luôn ký tự ngoặc theo sau
      if (/^(?:left|right|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr)$/.test(cmd)) { i += cmd.length + 1; continue; }
      i += Math.max(cmd.length, 1);
      continue;
    }
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth--; while (stack.length && stack[stack.length - 1].depth > depth) stack.pop(); continue; }
    if (c === '(' || c === '[') { stack.push({ ch: c, at: i, depth }); continue; }
    if (c === ')' || c === ']') {
      const top = stack[stack.length - 1];
      if (!top || top.depth !== depth) continue;
      stack.pop();
      if ((top.ch === '(') !== (c === ')')) { stack.length = 0; continue; } // (a;b] hay [a;b): không đoán
      if (TALL.test(math.slice(top.at + 1, i))) wraps.push({ open: top.at, close: i });
    }
  }
  if (!wraps.length) return { s: math, n: 0 };
  const ins = new Map<number, string>();
  for (const w of wraps) { ins.set(w.open, '\\left'); ins.set(w.close, '\\right'); }
  let out = '';
  for (let i = 0; i < math.length; i++) out += (ins.get(i) ?? '') + math[i];
  return { s: out, n: wraps.length };
}

function normMath(m: string, add: (r: NormRule, n: number) => void): string {
  let s = m;
  s = s.replace(/[≤≥≠≈±·°−×∞]/g, (ch) => { add('unicode', 1); return UNI[ch]; });
  s = s.replace(/\\frac(?![A-Za-z])/g, () => { add('dfrac', 1); return '\\dfrac'; });
  s = s.replace(/(\d)\.(\d)/g, (_x, a: string, b: string) => { add('decimal', 1); return `${a}{,}${b}`; });
  const b = stretchBrackets(s);
  if (b.n) add('left-right', b.n);
  return b.s;
}

/** Chuẩn hoá một khối/đoạn ex_test. */
export function normalizeOcr(tex: string): NormResult {
  const count = new Map<NormRule, number>();
  const add = (r: NormRule, n: number) => count.set(r, (count.get(r) ?? 0) + n);
  // tách: tikzpicture | chú thích | toán $..$, \(..\), \[..\] | chữ thường
  const re = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}|(?<!\\)%[^\n]*|\$\$[\s\S]*?\$\$|(?<!\\)\$(?:\\\$|[^$])*?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g;
  let out = '', last = 0;
  for (const m of tex.matchAll(re)) {
    const seg = m[0], at = m.index ?? 0;
    out += normText(tex.slice(last, at), add);
    if (seg.startsWith('\\begin{tikzpicture}') || seg.startsWith('%')) out += seg;
    else {
      const open = seg.startsWith('$$') ? 2 : seg.startsWith('$') ? 1 : 2;
      out += seg.slice(0, open) + normMath(seg.slice(open, seg.length - open), add) + seg.slice(seg.length - open);
    }
    last = at + seg.length;
  }
  out += normText(tex.slice(last), add);
  const changes = [...count].map(([rule, n]) => ({ rule, label: LABEL[rule], count: n }));
  return { tex: out, changes };
}

/** Ngoài toán chỉ đổi dấu trừ Unicode (chắc chắn); ký hiệu toán Unicode ngoài $ để nguyên cho người duyệt thấy. */
function normText(s: string, add: (r: NormRule, n: number) => void): string {
  return s.replace(/−/g, () => { add('unicode', 1); return '-'; });
}
