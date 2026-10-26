// Trình soạn LaTeX nhiều tệp (E3) dùng CodeMirror 6: số dòng, tô màu LaTeX, đánh cặp ngoặc, tìm/thay, hoàn tác riêng từng tệp, di chuyển dòng.
// CM6 chỉ dựng phần đang nhìn thấy nên mở tệp lớn không đứng. Mỗi tệp giữ trạng thái (kèm lịch sử hoàn tác) riêng, đổi tab không mất.
// Component này KHÔNG đọc/ghi đĩa; việc mã hoá byte, xung đột và ghi tệp do Rust (examfiles.rs) và ExamWorkspace lo.
import { defaultKeymap, history, historyKeymap, moveLineDown, moveLineUp } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension, Text } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

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
  text(key: string): string | null;
  drop(key: string): void;
  jump(key: string, line: number): void;
  focus(): void;
  find(): void;
}

interface Props {
  onDirty(key: string, dirty: boolean): void;
  onSave(): void;
  onChangeText(key: string, text: string): void;
  label: string;
}

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
  '.cm-activeLine': { backgroundColor: 'var(--hover)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--hover)' },
  '&.cm-focused': { outline: '2px solid var(--pri)', outlineOffset: '-2px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--pri-soft)' },
  '.cm-panels': { backgroundColor: 'var(--paper-2)', color: 'var(--ink)', borderColor: 'var(--line-2)' },
  '.cm-searchMatch': { backgroundColor: 'var(--warn-bg)', outline: '1px solid var(--warn-line)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--pri-soft)' },
});

export const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor({ onDirty, onSave, onChangeText, label }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const origin = useRef(new Map<string, Text>());
  const current = useRef<string | null>(null);
  const cb = useRef({ onDirty, onSave, onChangeText });
  cb.current = { onDirty, onSave, onChangeText };

  const extensions = (key: string, readOnly: boolean): Extension[] => [
    lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), history(), drawSelection(), bracketMatching(), highlightSelectionMatches(), search({ top: true }),
    StreamLanguage.define(stex), syntaxHighlighting(hl), EditorView.lineWrapping, theme,
    EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
    keymap.of([
      { key: 'Mod-s', run: () => { cb.current.onSave(); return true; }, preventDefault: true },
      { key: 'Mod-h', run: (v) => { openSearchPanel(v); return true; }, preventDefault: true },
      { key: 'Alt-ArrowUp', run: moveLineUp }, { key: 'Alt-ArrowDown', run: moveLineDown },
      ...searchKeymap, ...historyKeymap, ...defaultKeymap,
    ]),
    EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
    EditorView.updateListener.of((u) => {
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
    focus() { view.current?.focus(); },
    find() { if (view.current) openSearchPanel(view.current); },
  }), [label]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="ce" ref={host} />;
});
