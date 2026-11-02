// Kéo một đề thả vào mục của cây. Dùng sự kiện con trỏ, không dùng HTML5 drag-drop: cửa sổ Tauri trên Windows đã nhận tệp kéo từ ngoài
// (tauri://drag-drop nhập đề) nên chặn drag-drop của trang. Mục nhận đề là phần tử có data-node="<khoá nút>".
const THRESHOLD = 6;

/** Bắt đầu theo dõi từ một lần nhấn chuột; chỉ thành kéo khi di chuyển quá ngưỡng (bấm thường vẫn là bấm). */
export function startDrag(down: PointerEvent, label: string, canDrop: (key: string) => boolean, onDrop: (key: string) => void): void {
  const x0 = down.clientX, y0 = down.clientY;
  let ghost: HTMLElement | null = null;
  let target: HTMLElement | null = null;
  let key: string | null = null;
  let on = false;
  const clear = () => { target?.classList.remove('drop-on'); target = null; key = null; };
  const pick = (x: number, y: number) => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-node]') ?? null;
    const k = el?.dataset.node ?? null;
    const ok = !!el && !!k && canDrop(k);
    if (ok && el === target) return;
    clear();
    if (ok && el) { el.classList.add('drop-on'); target = el; key = k; }
    ghost?.classList.toggle('ok', ok);
  };
  const move = (e: PointerEvent) => {
    if (!on) {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < THRESHOLD) return;
      on = true;
      ghost = document.createElement('div');
      ghost.className = 'xdrag-ghost';
      ghost.textContent = label;
      document.body.appendChild(ghost);
      document.body.classList.add('xdragging');
    }
    if (ghost) { ghost.style.left = `${e.clientX + 14}px`; ghost.style.top = `${e.clientY + 10}px`; }
    pick(e.clientX, e.clientY);
  };
  const end = (drop: boolean) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', esc, true);
    const k = key;
    ghost?.remove();
    clear();
    document.body.classList.remove('xdragging');
    if (!on) return;
    // nuốt cú click sinh ra ngay sau khi thả để không mở đề / đổi mục
    const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', stop, true), 0);
    if (drop && k) onDrop(k);
  };
  const up = () => end(true);
  const cancel = () => end(false);
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); end(false); } };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', esc, true);
}
