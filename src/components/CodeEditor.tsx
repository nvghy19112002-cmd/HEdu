// Trình soạn LaTeX nhiều tệp (E3) dùng CodeMirror 6: số dòng, tô màu LaTeX, đánh cặp ngoặc, tìm/thay, hoàn tác riêng từng tệp, di chuyển dòng.
// CM6 chỉ dựng phần đang nhìn thấy nên mở tệp lớn không đứng. Mỗi tệp giữ trạng thái (kèm lịch sử hoàn tác) riêng, đổi tab không mất.
// Component này KHÔNG đọc/ghi đĩa; việc mã hoá byte, xung đột và ghi tệp do Rust (examfiles.rs) và ExamWorkspace lo.
import { defaultKeymap, history, historyKeymap, moveLineDown, moveLineUp } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension, RangeSetBuilder, StateEffect, StateField, Text } from '@codemirror/state';
import { Decoration, type DecorationSet, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { TEX_KEYS, texExtras } from '../lib/texextras';

export interface CodeEditorHandle {
  /** Hiện tệp `key`. Lần đầu dùng `text`; lần sau dùng trạng thái đã giữ (kèm hoàn tác). */
  open(key: string, text: string, readOnly: boolean): void;
  /** Thay toàn bộ nội dung (vd. nạp lại bản ngoài) và coi đây là bản gốc mới (không bẩn). */
  reset(key: string, text: string): void;
  /** Coi `text` (nội dung đã thực sự ghi xuống đĩa) là bản đã lưu. Nếu người dùng đã gõ thêm trong lúc lưu thì tệp vẫn "bẩn". */
  markSaved(key: string, text: string): void;
  /** Thay nội dung bằng `text` nhưng GIỮ mốc đã lưu: tệp thành "chưa lưu" (dùng khi khôi phục bản nháp). Hoàn tác được. */
  replaceDoc(key: string, text: string): void;
  /** Chèn `text` tại con trỏ (thay vùng đang chọn). false nếu tệp không đang mở/không sửa được. */
  insertAtCursor(key: string, text: string): boolean;
  /** Thay MỘT lần xuất hiện nguyên văn của `from` bằng `to`. false nếu không thấy đúng nguyên văn (không đoán). */
  replaceText(key: string, from: string, to: string): boolean;
  /** Thay đoạn `from` bắt đầu ĐÚNG ở vị trí `pos` bằng `to` (một bước, Ctrl+Z hoàn tác được). false nếu ở đó không còn nguyên văn `from`. */
  replaceAt(key: string, pos: number, from: string, to: string): boolean;
  text(key: string): string | null;
  drop(key: string): void;
  jump(key: string, line: number): void;
  /** Dòng (từ 1) và cột (từ 0) của con trỏ trong tệp `key` (null nếu tệp không đang mở). */
  cursor(key: string): { line: number; col: number } | null;
  /** Tô nền một khối dòng (vd khối \\begin{ex}…\\end{ex} của câu đang chọn) và tô đỏ các dòng lỗi. Dòng đếm từ 1. */
  mark(key: string, m: { block: [number, number] | null; errs: number[] }): void;
  focus(): void;
  find(): void;
}

interface Props {
  onDirty(key: string, dirty: boolean): void;
  onSave(): void;
  onChangeText(key: string, text: string): void;
  /** con trỏ đổi dòng (dòng từ 1) */
  onCursor?(key: string, line: number): void;
  label: string;
}

// ——— tô khối câu đang chọn + dòng lỗi ———
const setMarks = StateEffect.define<{ block: [number, number] | null; errs: number[] }>();
const blkLine = Decoration.line({ class: 'cm-blk' });
const blkFirst = Decoration.line({ class: 'cm-blk cm-blk-first' });
const blkLast = Decoration.line({ class: 'cm-blk cm-blk-last' });
const blkOne = Decoration.line({ class: 'cm-blk cm-blk-first cm-blk-last' });
const errLine = Decoration.line({ class: 'cm-errline' });
function buildMarks(doc: Text, m: { block: [number, number] | null; errs: number[] }): DecorationSet {
  const n = doc.lines;
  const errs = new Set(m.errs.filter((x) => x >= 1 && x <= n));
  const [a, b] = m.block ? [Math.max(1, m.block[0]), Math.min(n, m.block[1])] : [0, -1];
  const b2 = new RangeSetBuilder<Decoration>();
  const lines = [...new Set([...errs, ...(a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [])])].sort((x, y) => x - y);
  for (const ln of lines) {
    const from = doc.line(ln).from;
    if (ln >= a && ln <= b) b2.add(from, from, a === b ? blkOne : ln === a ? blkFirst : ln === b ? blkLast : blkLine);
    if (errs.has(ln)) b2.add(from, from, errLine);
  }
  return b2.finish();
}
const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(v, tr) {
    let out = v.map(tr.changes);
    for (const e of tr.effects) if (e.is(setMarks)) out = buildMarks(tr.state.doc, e.value);
    return out;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const hl = HighlightStyle.define([
  { tag: tags.keyword, class: 'cm-hl-k' },
  { tag: [tags.bracket, tags.squareBracket, tags.brace], class: 'cm-hl-b' },
  { tag: [tags.number, tags.atom, tags.tagName, tags.string], class: 'cm-hl-m' },
  { tag: tags.comment, class: 'cm-hl-c' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--paper)', color: 'var(--ink)' },
  '.cm-scroller': { fontFamily: 'var(--f-code)', fontSize: '13px', lineHeight: '1.55', overflow: 'auto' },
  '.cm-gutters': { backgroundColor: 'var(--paper-2)', color: 'var(--ink-3)', borderRight: '1px solid var(--line-2)' },
  // nền dòng đang soạn phải trong suốt: lớp tô vùng chọn nằm BÊN DƯỚI chữ, nền đặc sẽ che mất vùng bôi đen
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--hover) 55%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--hover)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-gutterElement': { padding: '0 6px 0 8px' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer', color: 'var(--ink-3)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--pri-soft)', border: '1px solid var(--pri-line)', color: 'var(--pri-ink)', borderRadius: '4px', padding: '0 6px', margin: '0 4px' },
  '.cm-tooltip': { backgroundColor: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: '8px', boxShadow: '0 10px 28px color-mix(in srgb, var(--ink) 16%, transparent)', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--f-code)', fontSize: '12.5px', maxHeight: '16em' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px !important', display: 'flex', gap: '12px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--pri)', color: 'var(--on-dark)' },
  '.cm-completionDetail': { marginLeft: 'auto', fontFamily: 'var(--f-ui)', fontStyle: 'normal', fontSize: '12px', opacity: 0.75 },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: 700 },
  '.cm-snippetField': { backgroundColor: 'var(--pri-soft)', borderRadius: '2px' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--ok-bg)', outline: '1px solid var(--ok-line)' },
  '.cm-selectionLayer .cm-selectionBackground': { background: 'color-mix(in srgb, var(--pri) 22%, transparent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { background: 'color-mix(in srgb, var(--pri) 32%, transparent)' },
  '.cm-panels': { backgroundColor: 'var(--paper-2)', color: 'var(--ink)', borderColor: 'var(--line-2)' },
  '.cm-searchMatch': { backgroundColor: 'var(--warn-bg)', outline: '1px solid var(--warn-line)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--pri-soft)' },
});

export const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor({ onDirty, onSave, onChangeText, onCursor, label }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const origin = useRef(new Map<string, Text>());
  const current = useRef<string | null>(null);
  const cb = useRef({ onDirty, onSave, onChangeText, onCursor });
  cb.current = { onDirty, onSave, onChangeText, onCursor };

  const extensions = (key: string, readOnly: boolean): Extension[] => [
    ...(readOnly ? [] : texExtras()), // soạn kiểu TeXstudio: gợi ý lệnh, tự đóng, thu gọn khối, phím tắt (đặt trước để phím tắt riêng được ưu tiên)
    lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), history(), drawSelection(), bracketMatching(), highlightSelectionMatches(), search({ top: true }),
    StreamLanguage.define(stex), syntaxHighlighting(hl), EditorView.lineWrapping, theme, marksField,
    EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
    keymap.of([
      { key: 'Mod-s', run: () => { cb.current.onSave(); return true; }, preventDefault: true },
      { key: 'Mod-h', run: (v) => { openSearchPanel(v); return true; }, preventDefault: true },
      { key: 'Alt-ArrowUp', run: moveLineUp }, { key: 'Alt-ArrowDown', run: moveLineDown },
      ...searchKeymap, ...historyKeymap, ...defaultKeymap,
    ]),
    EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
    EditorView.updateListener.of((u) => {
      if (u.selectionSet && cb.current.onCursor) {
        const ln = u.state.doc.lineAt(u.state.selection.main.head).number;
        const old = u.startState.doc.lineAt(Math.min(u.startState.selection.main.head, u.startState.doc.length)).number;
        if (ln !== old || u.docChanged) cb.current.onCursor(key, ln);
      }
      if (!u.docChanged) return;
      const o = origin.current.get(key);
      cb.current.onDirty(key, o ? !u.state.doc.eq(o) : true);
      cb.current.onChangeText(key, u.state.doc.toString());
    }),
  ];

  useEffect(() => {
    const v = new EditorView({ parent: host.current ?? undefined, state: EditorState.create({ doc: '' }) });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
  }, []);

  const stash = () => { const v = view.current; if (v && current.current) states.current.set(current.current, v.state); };

  useImperativeHandle(ref, () => ({
    open(key, text, readOnly) {
      const v = view.current;
      if (!v) return;
      stash();
      let st = states.current.get(key);
      if (!st) {
        st = EditorState.create({ doc: text, extensions: extensions(key, readOnly) });
        origin.current.set(key, st.doc);
      }
      current.current = key;
      v.setState(st);
    },
    reset(key, text) {
      const v = view.current;
      if (!v) return;
      const st = EditorState.create({ doc: text, extensions: extensions(key, false) });
      origin.current.set(key, st.doc);
      states.current.set(key, st);
      if (current.current === key) v.setState(st);
      cb.current.onDirty(key, false);
    },
    markSaved(key, text) {
      const v = view.current;
      const st = current.current === key ? v?.state : states.current.get(key);
      const saved = Text.of(text.split('\n'));
      origin.current.set(key, saved);
      cb.current.onDirty(key, st ? !st.doc.eq(saved) : false);
    },
    replaceDoc(key, text) {
      const v = view.current;
      if (!v || current.current !== key) return;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
    },
    insertAtCursor(key, text) {
      const v = view.current;
      if (!v || current.current !== key || v.state.readOnly) return false;
      v.dispatch(v.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input.paste' });
      v.focus();
      return true;
    },
    replaceText(key, from, to) {
      const v = view.current;
      if (!v || current.current !== key || v.state.readOnly) return false;
      const doc = v.state.doc.toString();
      const i = doc.indexOf(from);
      if (i < 0) return false;
      v.dispatch({ changes: { from: i, to: i + from.length, insert: to }, scrollIntoView: true });
      return true;
    },
    replaceAt(key, pos, from, to) {
      const v = view.current;
      if (!v || current.current !== key || v.state.readOnly) return false;
      if (pos < 0 || pos + from.length > v.state.doc.length || v.state.doc.sliceString(pos, pos + from.length) !== from) return false;
      v.dispatch({ changes: { from: pos, to: pos + from.length, insert: to }, selection: { anchor: pos }, scrollIntoView: true });
      return true;
    },
    text(key) {
      const v = view.current;
      if (current.current === key && v) return v.state.doc.toString();
      return states.current.get(key)?.doc.toString() ?? null;
    },
    drop(key) {
      states.current.delete(key); origin.current.delete(key);
      if (current.current === key) { current.current = null; view.current?.setState(EditorState.create({ doc: '' })); }
    },
    jump(key, line) {
      const v = view.current;
      if (!v || current.current !== key) return;
      const n = Math.min(Math.max(1, line), v.state.doc.lines);
      const pos = v.state.doc.line(n).from;
      v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
      v.focus();
    },
    cursor(key) {
      const v = view.current;
      if (!v || current.current !== key) return null;
      const head = v.state.selection.main.head;
      const ln = v.state.doc.lineAt(head);
      return { line: ln.number, col: head - ln.from };
    },
    mark(key, m) {
      const v = view.current;
      if (!v || current.current !== key) return;
      v.dispatch({ effects: setMarks.of(m) });
    },
    focus() { view.current?.focus(); },
    find() { if (view.current) openSearchPanel(view.current); },
  }), [label]); // eslint-disable-line react-hooks/exhaustive-deps

  const [keys, setKeys] = useState(false);
  return (
    <div className="ce-wrap">
      <div className="ce" ref={host} />
      <button type="button" className="ce-keys-btn" aria-expanded={keys} onClick={() => setKeys((k) => !k)} title="Phím tắt soạn LaTeX (giống TeXstudio)">⌨ Phím tắt</button>
      {keys && (
        <div className="ce-keys" role="dialog" aria-label="Phím tắt soạn LaTeX" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setKeys(false); view.current?.focus(); } }}>
          <div className="ce-keys-head"><b>Phím tắt (giống TeXstudio)</b><button type="button" className="btn btn-sm btn-ghost" autoFocus aria-label="Đóng" onClick={() => { setKeys(false); view.current?.focus(); }}>✕</button></div>
          <dl>{TEX_KEYS.map(([k, d]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>)}</dl>
        </div>
      )}
    </div>
  );
});
