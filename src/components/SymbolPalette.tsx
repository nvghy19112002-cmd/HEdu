// Bảng ký hiệu: một nút “Chèn ký hiệu” mở ra hộp nhỏ, chọn xong chèn vào vị trí con trỏ.
import { useEffect, useRef, useState, type ReactNode } from 'react';

const BBT = String.raw`\begin{center}
\begin{tikzpicture}
  \tkzTabInit[nocadre=false,lgt=1.2,espcl=2]{$x$/1,$y'$/1,$y$/2}{$-\infty$,$x_1$,$x_2$,$+\infty$}
  \tkzTabLine{,+,0,-,0,+,}
  \tkzTabVar{-/$-\infty$,+/$y_1$,-/$y_2$,+/$+\infty$}
\end{tikzpicture}
\end{center}
|`;

const SYMBOLS: { label: ReactNode; aria: string; snippet: string; raw?: boolean; cls?: string }[] = [
  { label: <><i>a</i>/<i>b</i></>, aria: 'Phân số', snippet: '\\dfrac{|}{}' },
  { label: '√', aria: 'Căn bậc hai', snippet: '\\sqrt{|}' },
  { label: '∫', aria: 'Tích phân', snippet: '\\displaystyle\\int_{|}^{} \\,\\mathrm{d}x' },
  { label: 'Σ', aria: 'Tổng', snippet: '\\sum_{|}^{}' },
  { label: 'lim', aria: 'Giới hạn', snippet: '\\lim\\limits_{x \\to |}', cls: 'sm' },
  { label: '∞', aria: 'Vô cực', snippet: '\\infty' },
  { label: '≤', aria: 'Nhỏ hơn hoặc bằng', snippet: '\\le ' },
  { label: '≥', aria: 'Lớn hơn hoặc bằng', snippet: '\\ge ' },
  { label: '⇔', aria: 'Tương đương', snippet: '\\Leftrightarrow ' },
  { label: '∈', aria: 'Thuộc', snippet: '\\in ' },
  { label: 'ℝ', aria: 'Tập số thực', snippet: '\\mathbb{R}' },
  { label: '→', aria: 'Vectơ', snippet: '\\overrightarrow{|}' },
  { label: '{', aria: 'Hệ phương trình', snippet: '\\heva{&|\\\\&}' },
  { label: '[ ]', aria: 'Ma trận', snippet: '\\begin{bmatrix} | & \\\\ & \\end{bmatrix}', cls: 'sm' },
  { label: 'BBT', aria: 'Bảng biến thiên', snippet: BBT, raw: true, cls: 'txt' },
];

export function SymbolPalette({ onPick }: { onPick: (snippet: string, raw: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  return (
    <div className="symp" ref={box}>
      <button type="button" className="btn btn-sm" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>Chèn ký hiệu ▾</button>
      {open && (
        <div className="symp-pop" role="group" aria-label="Ký hiệu toán học">
          <span className="symp-hint">Bấm để chèn vào vị trí con trỏ</span>
          <div className="syms">
            {SYMBOLS.map((s) => (
              <button key={s.aria} type="button" className={`sym ${s.cls === 'txt' ? 'txt' : ''}`} style={s.cls === 'sm' ? { fontSize: 14 } : undefined} aria-label={s.aria} title={s.aria}
                onClick={() => { onPick(s.snippet, !!s.raw); setOpen(false); }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
