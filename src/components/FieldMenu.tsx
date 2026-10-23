// Ô chọn của thanh Mục lục & Bộ lọc: nhãn nằm TRONG ô, bấm mở hộp có số câu từng mục.
// - chọn một giá trị (Chương, Bài, Dạng, Hình, Kiểm duyệt): chọn xong đóng hộp;
// - chọn nhiều giá trị (Mức độ, Loại câu): hộp giữ mở, có ô tích.
// Hộp vẽ bằng position:fixed qua portal nên không bị vùng cuộn của thanh bên cắt.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export interface FieldOption { id: string; label: string; count?: number; hint?: string; /** chữ chỉ dùng để tìm (vd mã) */ search?: string }

interface Base {
  label: string;
  summary: string;
  options: FieldOption[];
  /** đang lọc (viền xanh) */
  active?: boolean;
  disabled?: boolean;
  /** lý do khi vô hiệu, hiện thay cho tóm tắt */
  disabledText?: string;
  /** số hiện bên phải ô */
  count?: number;
  allLabel?: string;
  allCount?: number;
  /** hiện ô tìm trong hộp (dùng khi danh sách dài) */
  searchable?: boolean;
  hint?: string;
  /** có nút ✕ bỏ lọc ngay trên ô (khi đang lọc) */
  onReset?: () => void;
}
type Single = Base & { multi?: false; selected: string | null; onPick: (id: string | null) => void };
type Multi = Base & { multi: true; selected: ReadonlySet<string>; onToggle: (id: string) => void; onClear: () => void };
export type FieldMenuProps = Single | Multi;

const nf = new Intl.NumberFormat('vi-VN');
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

export function FieldMenu(props: FieldMenuProps) {
  const { label, summary, options, active, disabled, disabledText, count, allLabel = 'Tất cả', allCount, searchable, hint, onReset } = props;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<CSSProperties>({});
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const close = (refocus: boolean) => { setOpen(false); setQ(''); if (refocus) btn.current?.focus(); };

  const place = () => {
    const b = btn.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 180 && above > below;
    const maxH = Math.max(140, Math.min(340, up ? above : below));
    setPos(up
      ? { left: r.left, width: Math.max(r.width, 240), bottom: window.innerHeight - r.top + 4, maxHeight: maxH }
      : { left: r.left, width: Math.max(r.width, 240), top: r.bottom + 4, maxHeight: maxH });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || btn.current?.contains(t)) return;
      close(false);
    };
    const move = () => place();
    document.addEventListener('mousedown', down);
    window.addEventListener('resize', move);
    window.addEventListener('scroll', move, true);
    // đưa focus vào hộp: ô tìm nếu có, không thì mục đang chọn / mục đầu
    const t = window.setTimeout(() => {
      const root = pop.current;
      if (!root) return;
      const target = root.querySelector<HTMLElement>('input.fm-search') ?? root.querySelector<HTMLElement>('[aria-selected="true"]') ?? root.querySelector<HTMLElement>('[role="option"]');
      target?.focus();
    }, 0);
    return () => {
      document.removeEventListener('mousedown', down);
      window.removeEventListener('resize', move);
      window.removeEventListener('scroll', move, true);
      window.clearTimeout(t);
    };
  }, [open]);

  const shown = useMemo(() => {
    const f = fold(q.trim());
    return f ? options.filter((o) => fold(`${o.label} ${o.hint ?? ''} ${o.search ?? ''}`).includes(f)) : options;
  }, [options, q]);

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') { close(false); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const found = pop.current?.querySelectorAll<HTMLElement>('[role="option"]');
    const items: HTMLElement[] = found ? Array.from(found) : [];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i <= 0 ? 0 : i - 1);
    items[n].focus();
  };

  const isOn = (id: string) => (props.multi ? props.selected.has(id) : props.selected === id);
  const allOn = props.multi ? props.selected.size === 0 || props.selected.size >= options.length : props.selected == null;
  const pickAll = () => { if (props.multi) props.onClear(); else { props.onPick(null); close(true); } };
  const pickOne = (id: string) => { if (props.multi) props.onToggle(id); else { props.onPick(id === props.selected ? null : id); close(true); } };

  const pickFirst = () => { if (shown.length) { if (props.multi) props.onToggle(shown[0].id); else pickOne(shown[0].id); } };

  return (
    <div className={`fm${onReset && active && !disabled ? ' has-x' : ''}`}>
      <button
        ref={btn} type="button" className={`fm-btn${active ? ' on' : ''}`} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} title={hint ?? `${label}: ${disabled && disabledText ? disabledText : summary}`}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          const printable = searchable && !disabled && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ';
          if (open) {
            if (printable) { e.preventDefault(); setQ((x) => x + e.key); }
            else if (e.key === 'Enter' && q.trim() && shown.length) { e.preventDefault(); pickFirst(); }
            return;
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); return; }
          // gõ chữ ngay trên ô: mở hộp và đưa chữ vào ô tìm (Tab tới ô, gõ 12, Enter)
          if (printable) { e.preventDefault(); setQ(e.key); setOpen(true); }
        }}
      >
        <span className="fm-l">{label}</span>
        <span className="fm-v">{disabled && disabledText ? disabledText : summary}</span>
        {count != null && !disabled && <span className="fm-c">{nf.format(count)}</span>}
        <span className="fm-car" aria-hidden="true">▾</span>
      </button>
      {onReset && active && !disabled && (
        <button type="button" className="fm-x" aria-label={`Bỏ lọc ${label}`} title={`Bỏ lọc ${label}`} onClick={onReset}>✕</button>
      )}
      {open && createPortal(
        <div ref={pop} className="fm-pop" style={pos} role="listbox" aria-label={label} aria-multiselectable={props.multi ? true : undefined} onKeyDown={onKey}>
          {searchable && <input className="fm-search" type="search" value={q} placeholder="Tìm tên hoặc mã…" aria-label={`Tìm trong ${label}`} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && shown.length) { e.preventDefault(); pickFirst(); } }} />}
          <div className="fm-list">
            {!q && (
              <button type="button" role="option" aria-selected={allOn} className={`fm-opt${allOn ? ' on' : ''}`} onClick={pickAll}>
                <span className={`fm-box ${props.multi ? 'chk' : 'rad'}${allOn ? ' on' : ''}`} aria-hidden="true" />
                <span className="fm-ol">{allLabel}</span>
                {allCount != null && <span className="fm-oc">{nf.format(allCount)}</span>}
              </button>
            )}
            {shown.map((o) => (
              <button key={o.id} type="button" role="option" aria-selected={isOn(o.id)} title={o.label} className={`fm-opt${isOn(o.id) ? ' on' : ''}${o.count === 0 ? ' zero' : ''}`} onClick={() => pickOne(o.id)}>
                <span className={`fm-box ${props.multi ? 'chk' : 'rad'}${isOn(o.id) ? ' on' : ''}`} aria-hidden="true" />
                {o.hint && <span className="fm-oh">{o.hint}</span>}
                <span className="fm-ol">{o.label}</span>
                {o.count != null && <span className="fm-oc">{nf.format(o.count)}</span>}
              </button>
            ))}
            {!shown.length && <div className="fm-empty">Không có mục nào khớp “{q.trim()}”.</div>}
          </div>
          {props.multi && <p className="fm-note">Chọn đủ cả {options.length} = {allLabel} (không tính là đang lọc).</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
