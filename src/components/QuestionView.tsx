// Hiển thị một câu hỏi đã đọc từ LaTeX: đề, phương án, ý đúng/sai, đáp số, lời giải.
import { useMemo } from 'react';
import type { ParsedQuestion } from '../lib/extest';
import { renderParts } from '../lib/render';
import { TikzFigure } from './TikzFigure';

const LETTERS = ['A', 'B', 'C', 'D'];
const TF = ['a', 'b', 'c', 'd'];

function Tex({ src, as: As = 'span', className, defs = '' }: { src: string; as?: 'span' | 'p' | 'div'; className?: string; defs?: string }) {
  const parts = useMemo(() => renderParts(src), [src]);
  return (
    <As className={className}>
      {parts.map((p, i) => (p.kind === 'html'
        ? <span key={i} dangerouslySetInnerHTML={{ __html: p.html }} />
        : <TikzFigure key={i} code={p.code} defs={defs} label={p.label} />))}
    </As>
  );
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
}

export function QuestionView({ p, number, order, variant = 'paper', showAnswer = true, showSolution = true }: QuestionViewProps) {
  const ord = order ?? p.options.map((_, i) => i);
  const cls = variant === 'paper' ? 'q' : `q ${variant}`;
  if (!p.stem && !p.options.length) return <p className="empty-q">Đề bài sẽ hiện ở đây khi bạn gõ bên trái.</p>;
  return (
    <div className={cls}>
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
      {p.type === 'tln' && showAnswer && p.shortAnswer != null && (
        <span className="short">Đáp án: <b><Tex src={p.shortAnswer.includes('$') ? p.shortAnswer : `$${p.shortAnswer.replace(/,/g, '{,}')}$`} /></b></span>
      )}
      {showSolution && p.solution && (
        <div className="sol">
          <span className="sol-t">Lời giải</span>
          <Tex as="div" src={p.solution} defs={p.defs} />
        </div>
      )}
    </div>
  );
}

export { Tex };
