// Khung nội dung có chiều cao tối đa: câu dài thì mờ dần ở đáy và có nút "Xem hết" (không cắt ngang dòng mà không báo).
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function ClampBox({ max = 340, children }: { max?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTall(el.scrollHeight > max + 24);
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [max]);
  const clamped = tall && !open;
  return (
    <div className={`clamp${clamped ? ' is-clamped' : ''}`}>
      <div ref={ref} className="clamp-in" style={clamped ? { maxHeight: max } : undefined}>{children}</div>
      {tall && <button type="button" className="clamp-btn linkbtn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Thu gọn ▲' : 'Xem hết ▼'}</button>}
    </div>
  );
}
