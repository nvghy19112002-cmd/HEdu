// Sinh mã bảng biến thiên / bảng xét dấu bằng gói tkz-tab (thuần, có kiểm thử).
// Cách viết theo đúng các hình đã có trong kho MathHub (\tkzTabInit … \tkzTabLine … \tkzTabVar …) nên lưu vào Kho hình / chèn vào câu
// cùng kiểu với hình cũ. Chiều mũi tên của hàng biến thiên được SUY RA từ dấu của y' (không phải gõ tay từng mũi tên).

export type Sign = '+' | '-';
/** z = y'=0 (hoặc giá trị bằng 0), d = không xác định (hai vạch kép), t = chỉ vạch chấm */
export type Mark = 'z' | 'd' | 't';

export interface BbtNode {
  /** giá trị x, viết LaTeX: -\infty, 1, \frac{1}{2}… (không cần dấu $) */
  x: string;
  /** dấu hiệu của y' tại nút (nút đầu và cuối không dùng) */
  mark: Mark;
  /** giá trị hàm số tại nút (LaTeX). Nút gián đoạn (d): giá trị bên trái */
  y: string;
  /** chỉ nút gián đoạn: giá trị bên phải (bỏ trống = lấy bằng giá trị trái) */
  yRight?: string;
}

export interface BbtInput {
  xName: string;
  /** tên hàm ở hàng biến thiên, vd "y" hoặc "f(x)" */
  yName: string;
  /** tên hàng đạo hàm, vd "y'" hoặc "f'(x)"; null = không có hàng đạo hàm/xét dấu */
  derivName: string | null;
  nodes: BbtNode[];
  /** dấu của y' trên từng khoảng giữa hai nút liên tiếp: độ dài = nodes.length - 1 */
  signs: Sign[];
  nocadre: boolean;
  /** độ rộng cột nhãn, khoảng cách giữa các nút */
  lgt: number;
  espcl: number;
}

export const DEFAULT_BBT: BbtInput = {
  xName: 'x', yName: 'y', derivName: "y'",
  nodes: [{ x: '-\infty', mark: 't', y: '-\infty' }, { x: '-1', mark: 'z', y: '3' }, { x: '1', mark: 'z', y: '-1' }, { x: '+\infty', mark: 't', y: '+\infty' }],
  signs: ['+', '-', '+'],
  nocadre: true, lgt: 1.2, espcl: 2.5,
};

const wrap = (s: string) => `$${s.trim().replace(/\\frac/g, '\\dfrac')}$`;

/** Dấu mặc định của các nút giữa: đổi dấu ⇒ y'=0 (z); giữ nguyên dấu ⇒ gián đoạn (d). Nút đầu/cuối: t. */
export function autoMarks(signs: readonly Sign[]): Mark[] {
  const n = signs.length + 1;
  return Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 't' : signs[i - 1] !== signs[i] ? 'z' : 'd'));
}

/** Vị trí (cao '+' / thấp '-') của nút `i` suy từ dấu hai khoảng kề nó. */
export function nodePos(i: number, nodes: readonly BbtNode[], signs: readonly Sign[]): { left: '+' | '-'; right: '+' | '-'; kind: 'end' | 'break' | 'peak' | 'flat' } {
  const n = nodes.length;
  if (i === 0) return { left: signs[0] === '+' ? '-' : '+', right: signs[0] === '+' ? '-' : '+', kind: 'end' };
  if (i === n - 1) return { left: signs[n - 2] === '+' ? '+' : '-', right: signs[n - 2] === '+' ? '+' : '-', kind: 'end' };
  const sl = signs[i - 1], sr = signs[i];
  if (nodes[i].mark === 'd') return { left: sl === '+' ? '+' : '-', right: sr === '+' ? '-' : '+', kind: 'break' };
  if (sl !== sr) { const p = sl === '+' ? '+' : '-'; return { left: p, right: p, kind: 'peak' }; }
  return { left: sl === '+' ? '+' : '-', right: sl === '+' ? '+' : '-', kind: 'flat' };
}

/** Các điều không hợp lệ cần báo cho người dùng trước khi sinh mã (rỗng = ổn). */
export function bbtIssues(i: BbtInput): string[] {
  const out: string[] = [];
  if (i.nodes.length < 2) out.push('Cần ít nhất 2 giá trị x.');
  if (i.signs.length !== i.nodes.length - 1) out.push('Số dấu của y\' phải bằng số khoảng (số giá trị x trừ 1).');
  i.nodes.forEach((n, k) => { if (!n.x.trim()) out.push(`Giá trị x thứ ${k + 1} đang trống.`); });
  if (i.derivName !== null) i.nodes.forEach((n, k) => { if (!n.y.trim()) out.push(`Giá trị hàm số tại x thứ ${k + 1} đang trống.`); });
  return out;
}

const num = (n: number) => String(Math.round(n * 100) / 100);

/** Mã tkz-tab. Gọi `bbtIssues` trước; mã có thể sai nếu còn lỗi. */
export function bbtCode(i: BbtInput): string {
  const n = i.nodes.length;
  const hasFrac = i.nodes.some((x) => /\\d?frac/.test(x.y + (x.yRight ?? '')));
  const rows = [`${wrap(i.xName)}/0.7`];
  if (i.derivName !== null) rows.push(`${wrap(i.derivName)}/0.7`, `${wrap(i.yName)}/${hasFrac ? '2.5' : '2'}`);
  const L: string[] = [];
  L.push('\\begin{tikzpicture}');
  L.push(`  \\tkzTabInit[nocadre=${i.nocadre ? 'true' : 'false'}, lgt=${num(i.lgt)}, espcl=${num(i.espcl)}, deltacl=0.5]`);
  L.push(`  {${rows.join(',')}}`);
  L.push(`  {${i.nodes.map((x) => wrap(x.x)).join(',')}}`);
  if (i.derivName !== null) {
    const toks: string[] = [''];
    for (let k = 0; k < n - 1; k++) { toks.push(i.signs[k]); if (k < n - 2) toks.push(i.nodes[k + 1].mark); }
    toks.push('');
    L.push(`  \\tkzTabLine{${toks.join(',')}}`);
    const v = i.nodes.map((nd, k) => {
      const p = nodePos(k, i.nodes, i.signs);
      if (p.kind === 'break') return `${p.left}D${p.right}/${wrap(nd.y)}/${wrap(nd.yRight?.trim() ? nd.yRight : nd.y)}`;
      if (p.kind === 'flat') return 'R';
      return `${p.left}/${wrap(nd.y)}`;
    });
    L.push(`  \\tkzTabVar{${v.join(',')}}`);
  }
  L.push('\\end{tikzpicture}');
  return L.join('\n');
}

// ---------- bảng xét dấu nhiều hàng (không có hàng biến thiên) ----------
export interface SignRow { label: string; /** dấu từng khoảng */ signs: Sign[]; /** vạch tại các nút giữa (độ dài = số nút - 2) */ marks: Mark[] }
export interface SignTableInput { xName: string; xs: string[]; rows: SignRow[]; nocadre: boolean; lgt: number; espcl: number }

export function signTableIssues(i: SignTableInput): string[] {
  const out: string[] = [];
  if (i.xs.length < 2) out.push('Cần ít nhất 2 giá trị x.');
  if (!i.rows.length) out.push('Cần ít nhất một hàng xét dấu.');
  i.rows.forEach((r, k) => {
    if (r.signs.length !== i.xs.length - 1) out.push(`Hàng ${k + 1}: cần ${i.xs.length - 1} dấu.`);
    if (r.marks.length !== Math.max(0, i.xs.length - 2)) out.push(`Hàng ${k + 1}: cần ${Math.max(0, i.xs.length - 2)} vạch ở các giá trị giữa.`);
  });
  return out;
}

export function signTableCode(i: SignTableInput): string {
  const L: string[] = ['\\begin{tikzpicture}'];
  L.push(`  \\tkzTabInit[nocadre=${i.nocadre ? 'true' : 'false'}, lgt=${num(i.lgt)}, espcl=${num(i.espcl)}, deltacl=0.5]`);
  L.push(`  {${[`${wrap(i.xName)}/0.7`, ...i.rows.map((r) => `${wrap(r.label)}/0.7`)].join(',')}}`);
  L.push(`  {${i.xs.map(wrap).join(',')}}`);
  for (const r of i.rows) {
    const toks: string[] = [''];
    for (let k = 0; k < r.signs.length; k++) { toks.push(r.signs[k]); if (k < r.signs.length - 1) toks.push(r.marks[k] ?? 't'); }
    toks.push('');
    L.push(`  \\tkzTabLine{${toks.join(',')}}`);
  }
  L.push('\\end{tikzpicture}');
  return L.join('\n');
}
