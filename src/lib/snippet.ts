// Trích đoạn chữ ngắn cho hàng gọn trong chế độ Danh sách. KHÔNG dựng công thức/hình (nhanh, không
// parse KaTeX/TikZ hàng loạt) và không để lộ lệnh LaTeX hay dấu {} — chỉ lấy phần chữ đọc được.
const TEXT_CMDS = /\\(?:textbf|textit|emph|underline|mathrm|text|mathbf|boldsymbol)\s*\{([^{}]*)\}/g;

/** Chỉ phần ĐỀ của câu ex_test (bỏ \begin{ex}%[ID], phương án, đáp số, lời giải) — dùng cho danh sách chọn câu. */
export function stemSnippet(latex: string, max = 110): string {
  const body = latex.replace(/^\s*\\begin\{ex\}(?:%[^\n]*)?/, '').replace(/\\end\{ex\}\s*$/, '');
  const cut = body.search(/\\(?:choiceTF|choice|shortans|loigiai)\b/);
  return plainSnippet(cut >= 0 ? body.slice(0, cut) : body, max);
}

export function plainSnippet(src: string, max = 110): string {
  let s = src
    .replace(/%.*$/gm, ' ')                                   // chú thích
    .replace(/\\begin\{(?:tikzpicture|tabular|tabularx|array)\}[\s\S]*?\\end\{(?:tikzpicture|tabular|tabularx|array)\}/g, ' [hình] ')
    .replace(/\\(?:hspace|vspace)\*?\s*\{[^{}]*\}/g, ' ')
    .replace(/\\(?:immini|resizebox|scalebox)\b(\[[^\]]*\])?/g, ' ')
    .replace(TEXT_CMDS, '$1')
    .replace(/\$\$?([^$]*)\$\$?/g, (_m, m: string) => ' ' + mathText(m) + ' ')
    .replace(/\\\\|\\quad|\\qquad|\\,|\\;|\\!|\\ /g, ' ')
    .replace(/\\[a-zA-Z]+\*?/g, ' ')                          // lệnh còn sót
    .replace(/[{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return s;
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺', n: 'ⁿ', x: 'ˣ' };
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', n: 'ₙ', k: 'ₖ' };
/** x^{12} → x¹², u_n → uₙ khi đổi được hết ký tự; không thì x^(…) cho dễ đọc */
const scr = (map: Record<string, string>, mark: string) => (_m: string, a: string | undefined, b: string | undefined) => {
  const t = a ?? b ?? '';
  return [...t].every((c) => c in map) ? [...t].map((c) => map[c]).join('') : t.length > 1 ? `${mark}(${t})` : `${mark}${t}`;
};

/** Công thức → chữ gần đúng: phân số a/b, căn, số mũ/chỉ số nhỏ, ký hiệu thường gặp, bỏ lệnh còn lại. */
/** a/b, √(x): đối số một "từ" thì bỏ ngoặc cho gọn. */
const grp = (x: string) => (/^[\p{L}\p{N}.√⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ]+$/u.test(x.trim()) ? x.trim() : `(${x.trim()})`);
const supOf = (n: string) => ([...n].every((c) => c in SUP) ? [...n].map((c) => SUP[c]).join('') : n);

/** \sqrt[n]{…}, \frac{…}{…} lồng nhau (vd \dfrac{2\sqrt{a}}{b}): thay từ trong ra ngoài, lặp tới khi hết. */
function nested(m: string): string {
  let prev = '';
  for (let k = 0; k < 8 && prev !== m; k++) {
    prev = m;
    m = m
      .replace(/\\sqrt\s*\[([^\]{}]*)\]\s*\{([^{}]*)\}/g, (_x, n: string, a: string) => `${supOf(n.trim())}√${grp(a)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_x, a: string) => `√${grp(a)}`)
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_x, a: string, b: string) => `${grp(a)}/${grp(b)}`);
  }
  return m;
}

function mathText(m: string): string {
  return nested(m)
    .replace(/\\(?:mathbb|mathrm|text)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:vec|overrightarrow)\s*\{([^{}]*)\}/g, '$1⃗')
    .replace(/\\(?:sin|cos|tan|cot|log|ln|lim|max|min|exp)\b/g, (f) => ` ${f.slice(1)} `)
    .replace(/\^\s*(?:\{([^{}]*)\}|([0-9a-zA-Z+-]))/g, scr(SUP, '^'))
    .replace(/_\s*(?:\{([^{}]*)\}|([0-9a-zA-Z]))/g, scr(SUB, '_'))
    .replace(/\\(?:left|right|big|Big)\b/g, '')
    .replace(/\\infty/g, '∞').replace(/\\cup/g, '∪').replace(/\\cap/g, '∩').replace(/\\setminus/g, '\\')
    .replace(/\\(?:le|leq|leqslant)\b/g, '≤').replace(/\\(?:ge|geq|geqslant)\b/g, '≥').replace(/\\neq?\b/g, '≠')
    .replace(/\\(?:to|rightarrow)\b/g, '→').replace(/\\pi\b/g, 'π').replace(/\\cdot\b/g, '·').replace(/\\times\b/g, '×')
    .replace(/\\in\b/g, '∈').replace(/\\(?:Rightarrow|implies)\b/g, '⇒').replace(/\\pm\b/g, '±').replace(/\\alpha\b/g, 'α').replace(/\\gamma\b/g, 'γ').replace(/\\theta\b/g, 'θ').replace(/\\lambda\b/g, 'λ').replace(/\\mu\b/g, 'μ').replace(/\\(?:varphi|phi)\b/g, 'φ').replace(/\\omega\b/g, 'ω').replace(/\\(?:varepsilon|epsilon)\b/g, 'ε').replace(/\\circ\b/g, '°').replace(/\\perp\b/g, '⊥').replace(/\\parallel\b/g, '∥').replace(/\\forall\b/g, '∀').replace(/\\exists\b/g, '∃').replace(/\\beta\b/g, 'β').replace(/\\Delta\b/g, 'Δ').replace(/\\int\b/g, '∫').replace(/\\sum\b/g, '∑')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
