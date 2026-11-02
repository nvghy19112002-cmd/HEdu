// Soạn thảo LaTeX kiểu TeXstudio — phần gắn vào CodeMirror (dùng chung ở Biên tập đề và Xử lí TeX):
// gõ \ hiện gợi ý lệnh (kèm ô nhảy Tab), \begin{ gợi ý môi trường và tự thêm \end, Enter sau \begin{…} tự đóng,
// tự đóng ngoặc { [ ( và $, thu gọn khối \begin…\end, phím tắt Ctrl+B/I, Ctrl+Shift+M, Ctrl+/ hoặc Ctrl+T (chú thích), Ctrl+D (nhân đôi dòng).
import { autocompletion, closeBrackets, closeBracketsKeymap, snippet, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { copyLineDown, deleteLine, indentLess, indentMore, toggleComment } from '@codemirror/commands';
import { codeFolding, foldGutter, foldKeymap, foldService } from '@codemirror/language';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { beginAtEnd, docCommands, docEnvs, envBlock, needsEnd, TEX_COMMANDS, TEX_ENVS } from './texedit';

/** Áp mẫu (có ô Tab) thay đoạn from..to; nếu ngay sau là dấu } do tự đóng ngoặc thì nuốt luôn. */
const applyTpl = (tpl: string, eatBrace: boolean) => (view: EditorView, c: Completion, from: number, to: number) => {
  const end = eatBrace && view.state.sliceDoc(to, to + 1) === '}' ? to + 1 : to;
  snippet(tpl)(view, c, from, end);
};

function texCompletions(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  if (/(?<!\\)%/.test(before)) return null; // trong chú thích
  const env = /\\(begin|end)\{([A-Za-z*@]*)$/.exec(before);
  const text = ctx.state.doc.toString();
  if (env) {
    const from = ctx.pos - env[2].length;
    const names = new Map(TEX_ENVS.map((e) => [e.name, e] as const));
    for (const n of docEnvs(text.slice(0, from) + text.slice(ctx.pos))) if (!names.has(n)) names.set(n, { name: n, detail: 'có trong tệp' });
    const isBegin = env[1] === 'begin';
    return {
      from, validFor: /^[A-Za-z*@]*$/,
      options: [...names.values()].map((e) => ({
        label: e.name, detail: e.detail, type: 'type',
        apply: isBegin ? applyTpl(`${e.name}}${e.args ?? ''}\n\t\${0}\n\\end{${e.name}}`, true) : applyTpl(`${e.name}}`, true),
      })),
    };
  }
  const cmd = /\\([A-Za-z@]*)$/.exec(before);
  if (!cmd || (!ctx.explicit && cmd[1].length === 0 && before.endsWith('\\\\'))) return null; // "\\" (xuống dòng) thì không gợi ý
  const from = ctx.pos - cmd[0].length;
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const k of TEX_COMMANDS) {
    seen.add(k.name);
    options.push({ label: `\\${k.name}`, detail: k.detail, type: 'keyword', boost: 1, apply: k.tpl ? applyTpl(k.tpl, false) : `\\${k.name}` });
  }
  // lệnh có trong tệp, bỏ chính chữ đang gõ dở
  for (const n of docCommands(text.slice(0, from) + text.slice(ctx.pos))) if (!seen.has(n)) options.push({ label: `\\${n}`, detail: 'có trong tệp', type: 'variable' });
  return { from, validFor: /^\\[A-Za-z@]*$/, options };
}

/** Enter ngay sau \begin{name}… mà môi trường còn thiếu \end ⇒ tự thêm \end{name}, con trỏ ở dòng giữa (thụt vào). */
function enterCloseEnv(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length > 1) return false;
  const line = state.doc.lineAt(sel.head);
  const name = beginAtEnd(line.text.slice(0, sel.head - line.from));
  if (!name || line.text.slice(sel.head - line.from).trim() || !needsEnd(state.doc.toString(), name)) return false;
  const indent = /^\s*/.exec(line.text)![0];
  const ins = `\n${indent}\t\n${indent}\\end{${name}}`;
  view.dispatch({ changes: { from: sel.head, insert: ins }, selection: { anchor: sel.head + 2 + indent.length }, scrollIntoView: true, userEvent: 'input' });
  return true;
}

/** Bọc phần đang chọn bằng before…after (không chọn gì thì đặt con trỏ ở giữa). */
const wrap = (before: string, after: string) => (view: EditorView): boolean => {
  if (view.state.readOnly) return false;
  view.dispatch(view.state.changeByRange((r) => ({
    changes: [{ from: r.from, insert: before }, { from: r.to, insert: after }],
    range: r.empty ? EditorSelection.cursor(r.from + before.length) : EditorSelection.range(r.from + before.length, r.to + before.length),
  })), { userEvent: 'input', scrollIntoView: true });
  return true;
};

/** thu gọn \begin{…}…\end{…}: giữ dòng \begin, ẩn tới hết dòng trước \end */
const envFold = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  if (!line.text.includes('\\begin{')) return null;
  const lines: string[] = [];
  for (let i = line.number; i <= Math.min(state.doc.lines, line.number + 5000); i++) lines.push(state.doc.line(i).text);
  const b = envBlock(lines, 0);
  if (!b || b.end < 1) return null;
  const endLine = state.doc.line(line.number + b.end);
  return { from: line.to, to: endLine.from - 1 > line.to ? endLine.from - 1 : line.to };
});

export function texExtras(): Extension[] {
  return [
    EditorState.languageData.of(() => [{ commentTokens: { line: '%' }, closeBrackets: { brackets: ['{', '[', '(', '$'] } }]),
    closeBrackets(),
    autocompletion({ override: [texCompletions], icons: false, maxRenderedOptions: 60, activateOnTypingDelay: 0 }), // phím của gợi ý (Enter chọn, Esc đóng, Ctrl+Space mở) ưu tiên cao nhất
    codeFolding({ placeholderText: '…' }), foldGutter({ openText: '▾', closedText: '▸' }), envFold,
    keymap.of([
      { key: 'Enter', run: enterCloseEnv },
      ...closeBracketsKeymap, ...foldKeymap,
      { key: 'Mod-b', run: wrap('\\textbf{', '}'), preventDefault: true },
      { key: 'Mod-i', run: wrap('\\textit{', '}'), preventDefault: true },
      { key: 'Mod-Shift-m', run: wrap('$', '$'), preventDefault: true },
      { key: 'Mod-/', run: toggleComment, preventDefault: true }, { key: 'Mod-t', run: toggleComment, preventDefault: true },
      { key: 'Mod-d', run: copyLineDown, preventDefault: true }, { key: 'Mod-Shift-k', run: deleteLine, preventDefault: true },
      { key: 'Mod-]', run: indentMore, preventDefault: true }, { key: 'Mod-[', run: indentLess, preventDefault: true },
    ]),
  ];
}

/** Dòng nhắc phím tắt ở thanh trạng thái. */
export const TEX_KEYS_HINT = 'Gõ \\ để gợi ý lệnh · Tab nhảy ô · Ctrl+B đậm · Ctrl+I nghiêng · Ctrl+Shift+M công thức · Ctrl+/ chú thích · Ctrl+D nhân đôi dòng';
