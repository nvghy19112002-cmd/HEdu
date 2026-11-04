// Ảnh xem trước trang đầu của một PDF đã biên dịch (ngăn thông tin của Thư viện đề). Dùng cùng pdf.js đóng gói của trình xem PDF.
// Vẽ một lần rồi nhớ (tối đa 30 ảnh, khoá theo đề + bản + thời điểm biên dịch nên dịch lại là ảnh mới); mỗi lần chỉ dựng một ảnh.
import { useEffect, useState } from 'react';
import { invoke } from '../lib/platform';
import { loadLib } from './PdfViewer';

const cache = new Map<string, string>();
let chain: Promise<unknown> = Promise.resolve();
const serial = <T,>(f: () => Promise<T>): Promise<T> => { const p = chain.then(f, f); chain = p.catch(() => undefined); return p; };

async function render(id: string, mode: string, width: number): Promise<string> {
  const [lib, buf] = await Promise.all([loadLib(), invoke<ArrayBuffer>('exam_pdf_read', { id, mode })]);
  const task = lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useWorkerFetch: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale: (width * dpr) / base.width });
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return cv.toDataURL('image/jpeg', 0.85);
  } finally { void doc.destroy(); }
}

export function PdfThumb({ id, mode, stamp, width = 236, onOpen }: { id: string; mode: string; /** đổi khi biên dịch lại (vd. thời điểm biên dịch) */ stamp: string; width?: number; onOpen?(): void }) {
  const key = `${id}|${mode}|${stamp}|${width}`;
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const hit = cache.get(key);
    if (hit) { setSrc(hit); setErr(false); return; }
    setSrc(null); setErr(false);
    let dead = false;
    serial(() => (dead ? Promise.resolve('') : render(id, mode, width)))
      .then((url) => { if (!url) return; if (cache.size >= 30) cache.delete(cache.keys().next().value as string); cache.set(key, url); if (!dead) setSrc(url); })
      .catch(() => { if (!dead) setErr(true); });
    return () => { dead = true; };
  }, [key, id, mode, width]);
  return (
    <button type="button" className="fx-pthumb" onClick={onOpen} title="Bấm để xem PDF (Space)" aria-label="Xem trước trang đầu của PDF" disabled={!onOpen}>
      {src ? <img src={src} alt="Trang đầu của PDF" width={width} draggable={false} /> : <span className="xl-meta">{err ? 'Không dựng được ảnh xem trước' : 'Đang dựng ảnh xem trước…'}</span>}
    </button>
  );
}
