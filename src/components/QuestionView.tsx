// Hiển thị một câu hỏi đã đọc từ LaTeX: đề, phương án, ý đúng/sai, đáp số, lời giải.
import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ParsedQuestion } from '../lib/extest';
import { barePathProblems } from '../lib/srcdiag';
import { previewProblems, renderPartsEx, type Part } from '../lib/render';
import { TikzFigure } from './TikzFigure';

const LETTERS = ['A', 'B', 'C', 'D'];
const TF = ['a', 'b', 'c', 'd'];

/** Dựng cây từ danh sách mảnh phẳng: dấu mở/đóng khối thành <span class="tx-blk …">. */
function build(parts: Part[], defs: string): ReactNode[] {
  const root: ReactNode[] = [];
  const stack: { cls: string; kids: ReactNode[] }[] = [];
  const cur = () => (stack.length ? stack[stack.length - 1].kids : root);
  parts.forEach((p, i) => {
    if (p.kind === 'open') stack.push({ cls: p.cls, kids: [] });
    else if (p.kind === 'close') {
      const top = stack.pop();
      if (top) cur().push(<span key={i} className={`tx-blk ${top.cls}`}>{top.kids}</span>);
    } else if (p.kind === 'html') cur().push(<span key={i} dangerouslySetInnerHTML={{ __html: p.html }} />);
    else cur().push(<TikzFigure key={i} code={p.code} defs={defs} label={p.label} size={p.size} />);
  });
  while (stack.length) {
    const top = stack.pop()!;
    cur().push(<span key={`x${stack.length}`} className={`tx-blk ${top.cls}`}>{top.kids}</span>);
  }
  return root;
}

function Tex({ src, as: As = 'span', className, defs = '' }: { src: string; as?: 'span' | 'p' | 'div'; className?: string; defs?: string }) {
  const nodes = useMemo(() => build(renderPartsEx(src).parts, defs), [src, defs]);
  return <As className={className}><Fragment>{nodes}</Fragment></As>;
}

/** Ước lượng độ dài để chọn 4 cột, 2 cột hay 1 cột cho phương án */
function optCols(texts: string[]): string {
  const len = Math.max(...texts.map((t) => t.replace(/\\[a-zA-Z]+|[{}$]/g, '').length), 0);
  if (/tikzpicture/.test(texts.join(''))) return 'c1';
  if (len <= 18) return '';
  if (len <= 42) return 'c2';
  return 'c1';
}

/**
 * Đáp án trắc nghiệm xếp 4 / 2 / 1 cột giống ex_test: đo bề rộng thật của đáp án dài nhất
 * (đã dựng công thức) rồi chọn số cột mà mọi đáp án còn nằm gọn một dòng.
 */
function Choices({ items, defs, rightIdx, ring }: { items: { text: string; letter: string }[]; defs: string; rightIdx: Set<number>; ring: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const meas = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState<number>(() => (optCols(items.map((i) => i.text)) === 'c1' ? 1 : optCols(items.map((i) => i.text)) === 'c2' ? 2 : 4));
  const hasFig = items.some((i) => /tikzpicture/.test(i.text));
  useLayoutEffect(() => {
    if (hasFig) { setCols(1); return; }
    const el = box.current, m = meas.current;
    if (!el || !m) return;
    const GAP = 20, PAD = 14; // PAD = đệm hai bên của đáp án (không còn viền)
    const calc = () => {
      const avail = el.clientWidth;
      if (!avail) return;
      let max = 0;
      m.querySelectorAll<HTMLElement>('.opt-m').forEach((n) => { max = Math.max(max, n.getBoundingClientRect().width); });
      max += PAD;
      const next = max * 4 + GAP * 3 <= avail ? 4 : max * 2 + GAP <= avail ? 2 : 1;
      setCols((c) => (c === next ? c : next));
    };
    calc();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calc) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [items, defs, hasFig]);
  return (
    <div className={`opts-wrap${cols === 4 ? '' : ` c${cols}`}`} ref={box}>
      <div className="opts-measure" ref={meas} aria-hidden="true">
        {items.map((o, i) => <span key={i} className="opt-m"><b>{o.letter}</b><Tex src={o.text} defs={defs} /></span>)}
      </div>
      <div className={`opts${cols === 4 ? '' : ` c${cols}`}`}>
        {items.map((o, i) => (
          <span key={i} className={`opt${rightIdx.has(i) ? (ring ? ' right ring' : ' right') : ''}`}>
            <b>{o.letter}</b>
            <span className="opt-body"><Tex src={o.text} defs={defs} /></span>
          </span>
        ))}
      </div>
    </div>
  );
}

export interface QuestionViewProps {
  p: ParsedQuestion;
  number?: number;
  order?: number[];
  variant?: 'paper' | 'compact' | 'exam';
  showAnswer?: boolean;
  showSolution?: boolean;
  /** mã LaTeX gốc của câu, để đối chiếu số hình; không có cũng được */
  raw?: string;
}

export function QuestionView({ p, number, order, variant = 'paper', showAnswer = true, showSolution = true, raw }: QuestionViewProps) {
  const ord = order ?? p.options.map((_, i) => i);
  const cls = variant === 'paper' ? 'q' : `q ${variant}`;
  const problems = useMemo(() => previewProblems(p, raw), [p, raw]);
  const srcNotes = useMemo(() => (raw ? barePathProblems(raw) : []), [raw]);
  if (!p.stem && !p.options.length) return <p className="empty-q">Đề bài sẽ hiện ở đây khi bạn gõ bên trái.</p>;

  const main = (
    <>
      <p>
        {number != null && <span className="q-no">Câu {number}.</span>}
        <Tex src={p.stem} defs={p.defs} />
      </p>
      {p.type === 'tn' && (
        <Choices
          items={ord.flatMap((k, i) => (p.options[k] ? [{ text: p.options[k].text, letter: LETTERS[i] }] : []))}
          defs={p.defs}
          rightIdx={new Set(showAnswer ? ord.flatMap((k, i) => (p.options[k]?.correct ? [i] : [])) : [])}
          ring={variant === 'paper'}
        />
      )}
      {p.type === 'ds' && (
        <ol className="tf">
          {ord.map((k, i) => {
            const o = p.options[k];
            if (!o) return null;
            return (
              <li key={i}>
                <b className="tf-l">{TF[i]})</b>
                <span className="tf-body"><Tex src={o.text} defs={p.defs} /></span>
                {showAnswer && <span className={`mark ${o.correct ? 'd' : 's'}`} aria-label={o.correct ? 'Đúng' : 'Sai'}>{o.correct ? 'Đ' : 'S'}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );

  return (
    <div className={cls}>
      {p.figure ? (
        <div className="q-immini">
          <div className="q-col">{main}</div>
          <div className="q-col q-fig"><Tex as="div" src={p.figure} defs={p.defs} /></div>
        </div>
      ) : main}
      {p.tail && <Tex as="div" className="q-tail" src={p.tail} defs={p.defs} />}
      {p.type === 'tln' && showAnswer && p.shortAnswer != null && (
        <div className="ans-box" role="note">
          <span className="ans-box-t">Đáp án</span>
          <span className="ans-box-v"><Tex src={p.shortAnswer.includes('$') ? p.shortAnswer : `$${p.shortAnswer.replace(/,/g, '{,}')}$`} /></span>
        </div>
      )}
      {showSolution && p.solution && (
        <div className="sol">
          <span className="sol-t">Lời giải</span>
          <Tex as="div" src={p.solution} defs={p.defs} />
        </div>
      )}
      {srcNotes.length > 0 && (
        <div className="q-warn src" role="note">
          <b>Lưu ý mã nguồn.</b> {srcNotes.map((s) => `${s.message} (dòng ${s.line}: ${s.snippet})`).join(' ')} HEdu vẽ đúng như TeX nên chỗ này cũng không có nét.
        </div>
      )}
      {problems.length > 0 && (
        <div className="q-warn" role="note">
          <b>Xem trước chưa dựng chuẩn.</b> {problems.join(' ')} Mã LaTeX gốc vẫn nguyên vẹn; chỗ này chỉ là bản xem trước.
        </div>
      )}
    </div>
  );
}

export { Tex };
