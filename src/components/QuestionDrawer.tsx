// Ngăn sửa câu hỏi bên phải (Ngân hàng): rộng khoảng 70% màn hình, hẹp thì phủ toàn màn hình.
// Danh sách, bộ lọc, trang đang xem, câu đã chọn, vị trí cuộn của Ngân hàng giữ nguyên bên dưới.
// Là hộp thoại “modal”: bấm ra ngoài, Esc, nút Đóng đều đi qua cùng một câu hỏi “bỏ thay đổi chưa lưu?”.
import { useEffect, useRef } from 'react';
import type { Question } from '../lib/types';
import { QuestionEditor } from './QuestionEditor';

export function QuestionDrawer({ q, onClose, onDirty }: { q: Question; onClose: () => void; onDirty: (d: boolean) => void }) {
  const leaveRef = useRef<((proceed: () => void) => boolean) | null>(null);
  const root = useRef<HTMLElement>(null);
  const opener = useRef<Element | null>(document.activeElement);

  const tryClose = () => { const l = leaveRef.current; if (l) l(onClose); else onClose(); };

  useEffect(() => {
    const prev = opener.current as HTMLElement | null;
    root.current?.focus();
    return () => { prev?.focus?.(); };
  }, []);

  // Esc đóng ngăn (các hộp nhỏ bên trong tự bắt Esc trước và chặn lại)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); tryClose(); }
      if (e.key === 'Tab' && root.current) {
        const f = [...root.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <div className="drw-scrim" onMouseDown={tryClose} aria-hidden="true" />
      <aside className="drw" role="dialog" aria-modal="true" aria-label="Sửa câu hỏi" tabIndex={-1} ref={root}>
        <QuestionEditor key={q.uid} editing={q} variant="drawer" onDirty={onDirty} onClose={tryClose} leaveRef={leaveRef} />
      </aside>
    </>
  );
}
