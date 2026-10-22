// Trích đoạn chữ ngắn cho hàng gọn trong chế độ Danh sách. KHÔNG dựng công thức/hình (nhanh, không
// parse KaTeX/TikZ hàng loạt) và không để lộ lệnh LaTeX hay dấu {} — chỉ lấy phần chữ đọc được.
const TEXT_CMDS = /\\(?:textbf|textit|emph|underline|mathrm|text|mathbf|boldsymbol)\s*\{([^{}]*)\}/g;

export function plainSnippet(src: string, max = 110): string {
  let s = src
    .replace(/%.*$/gm, ' ')                                   // chú thích
    .replace(/\\begin\{(?:tikzpicture|tabular|tabularx|array)\}[\s\S]*?\\end\{(?:tikzpicture|tabular|tabularx|array)\}/g, ' [hình] ')
    .replace(/\\(?:hspace|vspace)\*?\s*\{[^{}]*\}/g, ' ')
    .replace(/\\(?:immini|resizebox|scalebox)\b(\[[^\]]*\])?/g, ' ')
    .replace(TEXT_CMDS, '$1')
    .replace(/\$\$?([^$]*)\$\$?/g, (_m, m: string) => ' ' + mathText(m) + ' ')
    .replace(/\\\\|\\quad|\\qquad|\\,|\;|\\!|\\ /g, ' ')
    .replace(/\\[a-zA-Z]+\*?/g, ' ')                          // lệnh còn sót
    .replace(/[{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return s;
}

/** Công thức → chữ gần đúng: phân số a/b, căn, mũ/chỉ số giữ lại, bỏ lệnh. */
function mathText(m: string): string {
  return m
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
    .replace(/\\(?:left|right|big|Big)\b/g, '')
    .replace(/\\infty/g, '∞').replace(/\\cup/g, '∪').replace(/\\cap/g, '∩').replace(/\\setminus/g, '\\')
    .replace(/\\(?:le|leq|leqslant)\b/g, '≤').replace(/\\(?:ge|geq|geqslant)\b/g, '≥').replace(/\\neq?\b/g, '≠')
    .replace(/\\(?:to|rightarrow)\b/g, '→').replace(/\\pi\b/g, 'π').replace(/\\cdot\b/g, '·').replace(/\\times\b/g, '×')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
