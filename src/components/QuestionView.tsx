// Hiển thị một câu hỏi đã đọc từ LaTeX: đề, phương án, ý đúng/sai, đáp số, lời giải.
import { Fragment, useMemo, type ReactNode } from 'react';
import type { ParsedQuestion } from '../lib/extest';
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
  if (!p.stem && !p.options.length) return <p className="empty-q">Đề bài sẽ hiện ở đây khi bạn gõ bên trái.</p>;

  const main = (
    <>
      <p>
        {number != null && <span className="q-no">Câu {number}.</span>}
        <Tex src={p.stem} defs={p.defs} />
      </p>
      {p.type === 'tn' && (
        <div className={`opts ${optCols(p.options.map((o) => o.text))}`}>
          {ord.map((k, i) => {
            const o = p.options[k];
            if (!o) return null;
            const right = showAnswer && o.correct;
            return (
              <span key={i} className={`opt${right ? (variant === 'paper' ? ' right ring' : ' right') : ''}`}>
                <b>{LETTERS[i]}.</b> <Tex src={o.text} defs={p.defs} />
              </span>
            );
          })}
        </div>
      )}
      {p.type === 'ds' && (
        <ol className="tf">
          {ord.map((k, i) => {
            const o = p.options[k];
            if (!o) return null;
            return (
              <li key={i}>
                <b>{TF[i]})</b> <Tex src={o.text} defs={p.defs} />
                {showAnswer && <span className={`mark ${o.correct ? 'd' : 's'}`}>{o.correct ? 'Đ' : 'S'}</span>}
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
        <span className="short">Đáp án: <b><Tex src={p.shortAnswer.includes('$') ? p.shortAnswer : `$${p.shortAnswer.replace(/,/g, '{,}')}$`} /></b></span>
      )}
      {showSolution && p.solution && (
        <div className="sol">
          <span className="sol-t">Lời giải</span>
          <Tex as="div" src={p.solution} defs={p.defs} />
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
