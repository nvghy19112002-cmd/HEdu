// Hộp xác nhận dùng chung (thay đổi dữ liệu hàng loạt, chọn rất nhiều câu, xuất file lớn).
// Esc = huỷ. Với việc nguy hiểm, ô "Giữ lại / Huỷ" được focus sẵn để Enter không vô tình xác nhận.
import { useEffect, useRef, type ReactNode } from 'react';

export interface ConfirmProps {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** tắt nút xác nhận (đang chạy, hoặc chưa đủ điều kiện) */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Huỷ', danger, busy, onConfirm, onCancel }: ConfirmProps) {
  const ok = useRef<HTMLButtonElement>(null);
  const no = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (danger ? no.current : ok.current)?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy) onCancel(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [danger, busy, onCancel]);
  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onCancel(); }} />
      <div className={`cfm${danger ? ' is-danger' : ''}`} role="alertdialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {children && <div className="cfm-body">{children}</div>}
        <div className="cfm-acts">
          <button ref={no} type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button ref={ok} type="button" className={`btn ${danger ? 'btn-danger' : 'btn-accent'}`} disabled={busy} onClick={onConfirm}>{busy ? 'Đang xử lý…' : confirmLabel}</button>
        </div>
      </div>
    </>
  );
}
