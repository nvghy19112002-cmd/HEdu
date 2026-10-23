// Nút lọc dạng thả xuống: hiện tên bộ lọc + tóm tắt lựa chọn; bấm mở bảng chứa các nút lọc (có số câu).
// Chọn nhiều giá trị thì bảng vẫn mở; bấm ra ngoài hoặc Esc để đóng.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function FilterMenu({ label, summary, active, children }: { label: string; summary: string; active: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="fmenu" ref={root}>
      <button type="button" className={`fmenu-btn${active ? ' on' : ''}`} aria-haspopup="true" title={`${label}: ${summary}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="fmenu-l">{label}</span>
        {active && <span className="fmenu-v">{summary}</span>}
        <span aria-hidden="true">▾</span>
      </button>
      {open && <div className="fmenu-pop" role="group" aria-label={label}>{children}</div>}
    </div>
  );
}
