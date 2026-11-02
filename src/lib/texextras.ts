// Soạn thảo LaTeX kiểu TeXstudio — phần gắn vào CodeMirror (dùng chung ở Biên tập đề và Xử lí TeX):
// gõ \ hiện gợi ý lệnh (kèm ô nhảy Tab), \begin{ gợi ý môi trường và tự thêm \end, Enter sau \begin{…} tự đóng,
// tự đóng ngoặc { [ ( và $, thu gọn khối \begin…\end, phím tắt Ctrl+B/I, Ctrl+Shift+M, Ctrl+/ hoặc Ctrl+T (chú thích), Ctrl+D (nhân đôi dòng).
import { autocompletion, closeBrackets, closeBracketsKeymap, snippet, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { addCursorAbove, addCursorBelow, copyLineDown, deleteGroupForward, deleteLine, indentLess, indentMore, insertTab } from '@codemirror/commands';
import { gotoLine, openSearchPanel } from '@codemirror/search';
import { codeFolding, foldGutter, foldKeymap, foldService } from '@codemirror/language';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { beginAtEnd, docCommands, docEnvs, envBlock, lastOpenEnv, needsEnd, TEX_COMMANDS, TEX_ENVS, toggleCommentLines, uncommentLines } from './texedit';

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

/** Áp `f` lên trọn các dòng có vùng chọn/con trỏ (Ctrl+T, Ctrl+U); giữ vùng chọn phủ các dòng đó. */
const onLines = (f: (lines: readonly string[]) => string[]) => (view: EditorView): boolean => {
  const { state } = view;
  if (state.readOnly) return false;
  const changes: { from: number; to: number; insert: string }[] = [];
  let last = -1;
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from), b = state.doc.lineAt(r.empty || r.to === state.doc.lineAt(r.to).from && r.to > r.from ? Math.max(r.from, r.to - 1) : r.to);
    if (a.number <= last) continue;
    last = b.number;
    const lines: string[] = [];
    for (let n = a.number; n <= b.number; n++) lines.push(state.doc.line(n).text);
    changes.push({ from: a.from, to: b.to, insert: f(lines).join(state.lineBreak) });
  }
  view.dispatch({ changes, userEvent: 'input', scrollIntoView: true });
  return true;
};

/** Chèn chữ tại con trỏ (thay phần đang chọn). */
const insert = (text: string) => (view: EditorView): boolean => {
  if (view.state.readOnly) return false;
  view.dispatch(view.state.replaceSelection(text), { userEvent: 'input', scrollIntoView: true });
  return true;
};

/** Tab: chọn nhiều dòng thì thụt lề cả khối; còn lại chèn ký tự Tab tại con trỏ (như TeXstudio). Ô mẫu / gợi ý đang mở thì phím Tab của chúng được ưu tiên. */
function tabKey(view: EditorView): boolean {
  const { doc } = view.state;
  const multi = view.state.selection.ranges.some((r) => !r.empty && doc.lineAt(r.from).number !== doc.lineAt(r.to).number);
  return multi ? indentMore(view) : insertTab(view);
}

/** Alt+Enter: thêm \end{…} cho môi trường gần nhất còn mở, cùng lề với dòng \begin. */
function closeLastEnv(view: EditorView): boolean {
  const { state } = view;
  const pos = state.selection.main.head;
  const name = lastOpenEnv(state.sliceDoc(0, pos));
  if (!name) return false;
  const line = state.doc.lineAt(pos);
  let indent = '';
  for (let n = line.number; n >= 1; n--) { const t = state.doc.line(n).text; if (t.includes(`\\begin{${name}}`)) { indent = /^\s*/.exec(t)![0]; break; } }
  const blank = !line.text.slice(0, pos - line.from).trim();
  const from = blank ? line.from : pos;
  const ins = `${blank ? '' : '\n'}${indent}\\end{${name}}`;
  view.dispatch({ changes: { from, to: pos, insert: ins }, selection: { anchor: from + ins.length }, scrollIntoView: true, userEvent: 'input' });
  return true;
}

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
      { key: 'Alt-Enter', run: closeLastEnv, preventDefault: true },
      { key: 'Tab', run: tabKey }, { key: 'Shift-Tab', run: indentLess },
      ...closeBracketsKeymap, ...foldKeymap,
      // giống TeXstudio
      { key: 'Mod-b', run: wrap('\\textbf{', '}'), preventDefault: true },
      { key: 'Mod-i', run: wrap('\\textit{', '}'), preventDefault: true },
      { key: 'Mod-Shift-m', run: wrap('$', '$'), preventDefault: true },
      { key: 'Alt-Shift-m', run: wrap('\\[', '\\]'), preventDefault: true },
      { key: 'Mod-Shift-i', run: insert('\\item '), preventDefault: true },
      { key: 'Mod-t', run: onLines(toggleCommentLines), preventDefault: true }, { key: 'Mod-u', run: onLines(uncommentLines), preventDefault: true }, { key: 'Mod-/', run: onLines(toggleCommentLines), preventDefault: true },
      { key: 'Mod-k', run: deleteLine, preventDefault: true }, { key: 'Mod-Shift-k', run: deleteLine, preventDefault: true },
      { key: 'Mod-d', run: copyLineDown, preventDefault: true },
      { key: 'Alt-Delete', run: deleteGroupForward, preventDefault: true },
      { key: 'Mod-Alt-ArrowUp', run: addCursorAbove, preventDefault: true }, { key: 'Mod-Alt-ArrowDown', run: addCursorBelow, preventDefault: true },
      { key: 'Mod-r', run: (v) => { openSearchPanel(v); return true; }, preventDefault: true },
      { key: 'Mod-g', run: gotoLine, preventDefault: true },
      { key: 'Mod-]', run: indentMore, preventDefault: true }, { key: 'Mod-[', run: indentLess, preventDefault: true },
    ]),
  ];
}

/** Bảng phím tắt (nút "Phím tắt" ở góc trình soạn). */
export const TEX_KEYS: readonly [string, string][] = [
  ['\\ rồi gõ chữ', 'Gợi ý lệnh; Enter chọn, Tab nhảy ô'], ['Ctrl+Space', 'Mở gợi ý'], ['\\begin{ + tên', 'Tự thêm \\end{…}'], ['Alt+Enter', 'Đóng môi trường đang mở'],
  ['Ctrl+B / Ctrl+I', '\\textbf / \\textit (bọc chữ đang chọn)'], ['Ctrl+Shift+M', 'Công thức $…$'], ['Alt+Shift+M', 'Công thức \\[ … \\]'], ['Ctrl+Shift+I', '\\item'],
  ['Ctrl+T', 'Bật/tắt chú thích % cho các dòng đang chọn'], ['Ctrl+U', 'Bỏ chú thích'], ['Ctrl+K', 'Xoá dòng'], ['Ctrl+D', 'Nhân đôi dòng'], ['Alt+↑ / Alt+↓', 'Chuyển dòng lên / xuống'],
  ['Tab / Shift+Tab', 'Thụt / lùi lề (khi chọn nhiều dòng)'], ['Ctrl+Alt+↑ / ↓', 'Thêm con trỏ dòng trên / dưới'], ['Alt+Delete', 'Xoá từ / lệnh phía sau'],
  ['Ctrl+F · Ctrl+R (Ctrl+H)', 'Tìm · Thay'], ['Ctrl+G', 'Đến dòng số…'], ['Ctrl+Z / Ctrl+Y', 'Hoàn tác / Làm lại'], ['Ctrl+S', 'Lưu'],
];

/** Dòng nhắc phím tắt ở thanh trạng thái. */
export const TEX_KEYS_HINT = 'Gõ \\ để gợi ý lệnh · Ctrl+T chú thích · Ctrl+B đậm · Ctrl+Shift+M công thức · Alt+Enter đóng môi trường';
