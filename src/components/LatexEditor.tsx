// Trình soạn LaTeX nền bảng đen: tô màu cú pháp, số dòng, chèn ký hiệu tại con trỏ.
// Làm bằng textarea + lớp tô màu phía sau để nhẹ và giữ được Ctrl+Z.
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';

export interface LatexEditorHandle {
  /** Chèn đoạn mã; ký tự '|' trong đoạn là vị trí đặt con trỏ sau khi chèn */
  insert(snippet: string, opts?: { wrapMath?: boolean }): void;
  focus(): void;
}

interface Props {
  value: string;
  onChange(v: string): void;
  onCursor?(line: number, col: number): void;
  label?: string;
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Tô màu: lệnh (\begin, \choice…), ngoặc, công thức $…$, chú thích % */
function highlight(src: string, curLine: number): string {
  const lines = src.split('\n');
  let inMath = false;
  const out: string[] = [];
  lines.forEach((line, li) => {
    let h = '';
    let i = 0;
    let mathBuf = '';
    const flushMath = () => { if (mathBuf) { h += `<span class="mt">${esc(mathBuf)}</span>`; mathBuf = ''; } };
    while (i < line.length) {
      const ch = line[i];
      if (ch === '%' && line[i - 1] !== '\\') {
        flushMath();
        h += `<span class="c">${esc(line.slice(i))}</span>`;
        i = line.length;
        break;
      }
      if (ch === '$') {
        if (inMath) { mathBuf += ch; flushMath(); inMath = false; }
        else { inMath = true; mathBuf = ch; }
        i++;
        continue;
      }
      if (inMath) { mathBuf += ch; if (ch === '\\' && i + 1 < line.length) { mathBuf += line[i + 1]; i++; } i++; continue; }
      if (ch === '\\') {
        const m = /^\\([A-Za-z]+|.)/.exec(line.slice(i));
        const tok = m ? m[0] : '\\';
        h += `<span class="k">${esc(tok)}</span>`;
        i += tok.length;
        continue;
      }
      if (ch === '{' || ch === '}' || ch === '[' || ch === ']') { h += `<span class="b">${ch}</span>`; i++; continue; }
      h += esc(ch);
      i++;
    }
    flushMath();
    out.push(`<div class="ln${li === curLine ? ' cur' : ''}" data-n="${li + 1}">${h || ' '}</div>`);
  });
  return out.join('');
}

function inMathAt(src: string, pos: number): boolean {
  let n = 0;
  for (let i = 0; i < pos; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === '%') { const nl = src.indexOf('\n', i); if (nl < 0 || nl >= pos) break; i = nl; continue; }
    if (src[i] === '$') n++;
  }
  return n % 2 === 1;
}

export const LatexEditor = forwardRef<LatexEditorHandle, Props>(function LatexEditor({ value, onChange, onCursor, label }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const hl = useRef<HTMLPreElement>(null);
  const [cur, setCur] = useState(0);

  const html = useMemo(() => highlight(value, cur), [value, cur]);

  const report = () => {
    const el = ta.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const line = before.split('\n').length - 1;
    const col = el.selectionStart - before.lastIndexOf('\n');
    setCur(line);
    onCursor?.(line + 1, col);
  };

  const sync = () => {
    const el = ta.current;
    if (!el) return;
    if (hl.current) hl.current.scrollTop = el.scrollTop;
  };

  const insertText = (text: string) => {
    const el = ta.current;
    if (!el) return;
    el.focus();
    // execCommand giữ được lịch sử hoàn tác (Ctrl+Z); nếu không có thì chèn tay.
    const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
    if (!ok) {
      const s = el.selectionStart, e = el.selectionEnd;
      const next = el.value.slice(0, s) + text + el.value.slice(e);
      onChange(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + text.length; });
    }
  };

  useImperativeHandle(ref, () => ({
    focus: () => ta.current?.focus(),
    insert(snippet, opts) {
      const el = ta.current;
      if (!el) return;
      let s = snippet;
      if (opts?.wrapMath !== false && !inMathAt(el.value, el.selectionStart)) s = `$${s}$`;
      const caret = s.indexOf('|');
      const text = s.replace('|', '');
      const start = el.selectionStart;
      insertText(text);
      requestAnimationFrame(() => {
        const p = start + (caret >= 0 ? caret : text.length);
        el.selectionStart = el.selectionEnd = p;
        report();
      });
    },
  }));

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); insertText('  '); }
  };

  return (
    <div className="ed">
      <pre className="ed-hl" ref={hl} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
      <textarea
        ref={ta}
        className="ed-ta"
        aria-label={label ?? 'Mã LaTeX của câu hỏi'}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => { onChange(e.target.value); report(); }}
        onKeyUp={report}
        onClick={report}
        onSelect={report}
        onKeyDown={onKeyDown}
        onScroll={sync}
      />
    </div>
  );
});
