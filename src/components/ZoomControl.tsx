import { useEffect, useState, useSyncExternalStore } from 'react';
import { FIG_MAX, FIG_MIN, getFigPrefs, setFigPrefs, subscribeFig } from '../lib/figscale';
import { getZoom, resetZoom, setZoom, stepZoom, subscribeZoom, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN } from '../lib/zoom';

export const useZoom = (): number => useSyncExternalStore(subscribeZoom, getZoom, getZoom);
const pct = (z: number) => `${Math.round(z * 100)}%`;

/** Hiện mức zoom vài giây sau mỗi lần đổi; bấm vào để về 100%. */
export function ZoomIndicator() {
  const z = useZoom();
  const [shown, setShown] = useState(false);
  const [first, setFirst] = useState(true);
  useEffect(() => {
    if (first) { setFirst(false); return; }
    setShown(true);
    const t = setTimeout(() => setShown(false), 1800);
    return () => clearTimeout(t);
  }, [z]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  return (
    <div className="zoom-ind" role="status" aria-live="polite">
      <b>{pct(z)}</b>
      {z !== ZOOM_DEFAULT && <button type="button" className="btn btn-sm" onClick={resetZoom}>Về 100%</button>}
    </div>
  );
}

/** Khối điều chỉnh trong màn Hệ thống. */
export function ZoomPanel() {
  const z = useZoom();
  return (
    <section className="panel" aria-label="Cỡ hiển thị">
      <h2>Cỡ hiển thị</h2>
      <span className="sys-hint">Phóng to hoặc thu nhỏ toàn bộ giao diện (80–150%). Ctrl + lăn chuột, chụm hai ngón trên bàn di chuột, hoặc phím Ctrl + / Ctrl − / Ctrl 0. Mức này chỉ lưu cho máy này, không ảnh hưởng ngân hàng câu hỏi.</span>
      <div className="head-actions zoom-row">
        <button type="button" className="btn btn-sm" aria-label="Thu nhỏ" disabled={z <= ZOOM_MIN} onClick={() => setZoom(stepZoom(z, -1))}>−</button>
        <b className="zoom-val" aria-live="polite">{pct(z)}</b>
        <button type="button" className="btn btn-sm" aria-label="Phóng to" disabled={z >= ZOOM_MAX} onClick={() => setZoom(stepZoom(z, 1))}>+</button>
        <button type="button" className="btn btn-sm" disabled={z === ZOOM_DEFAULT} onClick={resetZoom}>Đặt lại 100%</button>
      </div>
    </section>
  );
}

/** Cỡ hình TikZ trong xem nhanh: cân bằng cho các hình không quá to/quá nhỏ so với nhau. */
export function FigScalePanel() {
  const p = useSyncExternalStore(subscribeFig, getFigPrefs, getFigPrefs);
  return (
    <section className="panel" aria-label="Cỡ hình trong xem trước">
      <h2>Cỡ hình trong xem trước</h2>
      <span className="sys-hint">Hình TikZ có kích thước rất khác nhau. “Cân bằng” kéo các hình về gần một cỡ chung (giữ nguyên tỉ lệ, hình đã đặt \resizebox thì giữ theo mã). Chỉ đổi cách hiển thị, không đổi mã LaTeX; “Xem chuẩn” luôn là kích thước thật.</span>
      <div className="head-actions zoom-row">
        <button type="button" className={`btn btn-sm${p.mode === 'auto' ? ' btn-accent' : ''}`} aria-pressed={p.mode === 'auto'} onClick={() => setFigPrefs({ mode: 'auto' })}>Cân bằng</button>
        <button type="button" className={`btn btn-sm${p.mode === 'raw' ? ' btn-accent' : ''}`} aria-pressed={p.mode === 'raw'} onClick={() => setFigPrefs({ mode: 'raw' })}>Giữ nguyên</button>
        <label className="zoom-row">Thu/phóng hình
          <input type="range" min={FIG_MIN * 100} max={FIG_MAX * 100} step={5} value={Math.round(p.scale * 100)} onChange={(e) => setFigPrefs({ scale: Number(e.target.value) / 100 })} aria-label="Tỉ lệ hình" />
          <b className="zoom-val">{Math.round(p.scale * 100)}%</b>
        </label>
        <button type="button" className="btn btn-sm" disabled={p.mode === 'auto' && p.scale === 1} onClick={() => setFigPrefs({ mode: 'auto', scale: 1 })}>Mặc định</button>
      </div>
    </section>
  );
}
