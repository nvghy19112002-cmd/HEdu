// Kiểm tra một câu hỏi trước khi nhập vào ngân hàng.
// Mục tiêu: không để câu nào vào ngân hàng mà xem trước bị vỡ mà người dùng không biết.
// Ba nhóm vấn đề:
//   'loi'    — chắc chắn sai, xem trước sẽ hỏng (công thức KaTeX không dịch được, ngoặc lệch…)
//   'canh'   — đáng ngờ, vẫn nhập được nhưng nên xem lại (thiếu \True, thiếu lời giải…)
//   'tin'    — chỉ để biết (câu có hình TikZ nên xem trước hiện khung giữ chỗ)
import katex from 'katex';
import type { ParsedQuestion } from './extest';
import { cleanForDisplay, MACROS, quietly, segments } from './render';

export type IssueLevel = 'loi' | 'canh' | 'tin';

export interface Issue {
  level: IssueLevel;
  message: string;
  /** đoạn mã gây lỗi, cắt ngắn để hiện trong danh sách */
  detail?: string;
}

const cut = (s: string, n = 90) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

/** Đếm ngoặc nhọn, bỏ qua \{ \} và phần bên trong \verb. */
export function braceBalance(src: string): number {
  let n = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') n++;
    else if (c === '}') n--;
    if (n < 0) return n;
  }
  return n;
}

/** Kiểm tra \begin{X} … \end{X} khớp nhau và đúng thứ tự. */
export function envProblems(src: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  const re = /\\(begin|end)\s*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1] === 'begin') stack.push(m[2]);
    else {
      const top = stack.pop();
      if (top === undefined) out.push(`Có \\end{${m[2]}} mà không có \\begin{${m[2]}}.`);
      else if (top !== m[2]) out.push(`\\begin{${top}} lại đóng bằng \\end{${m[2]}}.`);
    }
  }
  for (const left of stack) out.push(`\\begin{${left}} chưa có \\end{${left}}.`);
  return out;
}

/** Thử dịch từng công thức bằng đúng bộ dịch mà màn xem trước dùng. */
export function mathProblems(src: string): Issue[] {
  const out: Issue[] = [];
  const text = cleanForDisplay(src).replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, ' ');
  for (const seg of segments(text)) {
    if (seg.kind !== 'math') continue;
    try {
      quietly(() => katex.renderToString(seg.value, { displayMode: seg.display, throwOnError: true, strict: false, macros: { ...MACROS } }));
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      out.push({ level: 'loi', message: 'Công thức không dịch được: ' + raw.replace(/^KaTeX parse error:\s*/, ''), detail: cut('$' + seg.value + '$') });
    }
  }
  return out;
}

/** Nhãn ngắn cho loại hình, để báo cho người dùng biết câu có hình gì. */
function figureKinds(src: string): string[] {
  const kinds: string[] = [];
  if (/\\tkzTab/.test(src)) kinds.push('bảng biến thiên (tkz-tab)');
  if (/tdplot/.test(src)) kinds.push('hình không gian (tikz-3dplot)');
  if (/\\begin\{axis\}|pgfplots/.test(src)) kinds.push('đồ thị (pgfplots)');
  if (!kinds.length && /\\begin\{tikzpicture\}/.test(src)) kinds.push('hình TikZ');
  return kinds;
}

/** Toàn bộ các vấn đề của một câu đã đọc. */
export function checkQuestion(p: ParsedQuestion, raw?: string): Issue[] {
  const out: Issue[] = [];
  const whole = raw ?? '';
  const parts: [string, string][] = [
    ['đề bài', p.stem],
    ...p.options.map((o, i) => [`phương án ${i + 1}`, o.text] as [string, string]),
    ['lời giải', p.solution ?? ''],
    ['hình', p.figure ?? ''],
  ];

  // 1. Lỗi cấu trúc do bộ đọc phát hiện
  for (const s of p.issues) out.push({ level: /trống|Thiếu \\begin|lẻ/.test(s) ? 'loi' : 'canh', message: s });

  // 2. Ngoặc nhọn
  for (const [name, text] of parts) {
    if (!text) continue;
    const b = braceBalance(text);
    if (b !== 0) out.push({ level: 'loi', message: `Phần ${name}: ngoặc nhọn lệch ${b > 0 ? `thiếu ${b} dấu }` : `thừa ${-b} dấu }`}.`, detail: cut(text) });
  }

  // 3. Môi trường \begin … \end
  for (const msg of envProblems(whole || parts.map(([, t]) => t).join('\n'))) out.push({ level: 'loi', message: msg });

  // 4. Công thức toán
  for (const [name, text] of parts) {
    if (!text || name === 'hình') continue;
    for (const issue of mathProblems(text)) out.push({ ...issue, message: `Phần ${name}: ${issue.message}` });
  }

  // 5. Hình vẽ
  const figSrc = (p.figure ?? '') + '\n' + p.stem + '\n' + (p.solution ?? '');
  const kinds = figureKinds(figSrc);
  if (kinds.length) out.push({ level: 'tin', message: `Có ${kinds.join(', ')} — xem trước hiện khung giữ chỗ, bản in LaTeX vẫn đủ mã hình.` });

  // 6. Vài điều nên nhắc
  if (!p.solution) out.push({ level: 'canh', message: 'Câu chưa có \\loigiai{…}.' });
  if ((p.type === 'tn' || p.type === 'ds') && p.options.some((o) => !o.text.trim())) out.push({ level: 'canh', message: 'Có phương án để trống.' });

  return out;
}

export function worstLevel(issues: Issue[]): IssueLevel | null {
  if (issues.some((i) => i.level === 'loi')) return 'loi';
  if (issues.some((i) => i.level === 'canh')) return 'canh';
  if (issues.length) return 'tin';
  return null;
}

export const LEVEL_TEXT: Record<IssueLevel, string> = { loi: 'Lỗi', canh: 'Cần xem lại', tin: 'Ghi chú' };
