// Trình xem PDF nhiều trang (E2b), dùng pdf.js đóng gói OFFLINE (dist/pdf.mjs + dist/pdf.worker.mjs, chép từ node_modules lúc build).
// Cố ý không cần eval, không tải font/wasm qua mạng, không CDN, để chạy đúng chính sách bảo mật (CSP) của app.
// Vẽ từng trang theo yêu cầu (chỉ trang đang nhìn thấy ± đệm, tối đa vài trang cùng lúc) nên PDF dài không ngốn bộ nhớ.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '../lib/platform';
import { canvasShrink, clampZoom, currentPage, fitPage, fitWidth, layoutPages, matchPages, nextMatch, pagesToRelease, scrollTopFor, stepZoom, visibleRange } from '../lib/pdfview';

interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void>; cancel(): void };
  getTextContent(): Promise<{ items: { str?: string }[] }>;
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }
interface PdfLib {
  getDocument(o: object): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
  GlobalWorkerOptions: { workerSrc: string };
}

let libPromise: Promise<PdfLib> | null = null;
/** Nạp pdf.js lúc cần (không làm nặng lúc mở app). Đường dẫn tương đối với trang gốc nên chạy được cả bản dev và bản cài. */
function loadLib(): Promise<PdfLib> {
  libPromise ??= import(/* @vite-ignore */ new URL('./pdf.mjs', document.baseURI).href).then((m: PdfLib) => {
    m.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.mjs', document.baseURI).href;
    return m;
  });
  libPromise.catch(() => { libPromise = null; });
  return libPromise;
}

type Fit = 'width' | 'page' | number;
const GAP = 12;

interface Props { id: string; title: string; /** lần biên dịch gần nhất KHÔNG thành công: đây là bản cũ */ stale: boolean; note: string; onClose(): void }

export function PdfViewer({ id, title, stale, note, onClose }: Props) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [fit, setFit] = useState<Fit>('width');
  const [box, setBox] = useState({ w: 800, h: 600 });
  const [cur, setCur] = useState(0);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<number[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const holders = useRef<(HTMLDivElement | null)[]>([]);
  const rendered = useRef(new Map<number, { canvas: HTMLCanvasElement; cancel(): void }>());
  const pending = useRef(new Set<number>());
  const gen = useRef(0);
  const texts = useRef<string[] | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // nạp PDF
  useEffect(() => {
    let live = true;
    let d: PdfDoc | null = null;
    (async () => {
      try {
        const [lib, buf] = await Promise.all([loadLib(), invoke<ArrayBuffer>('exam_pdf_read', { id })]);
        const task = lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useWorkerFetch: false, disableFontFace: true, verbosity: 0 });
        d = await task.promise;
        const dims: { w: number; h: number }[] = [];
        for (let i = 1; i <= d.numPages; i++) { const vp = (await d.getPage(i)).getViewport({ scale: 1 }); dims.push({ w: vp.width, h: vp.height }); }
        if (!live) { void d.destroy(); return; }
        setDoc(d); setSizes(dims);
      } catch (e) { if (live) setErr(e instanceof Error ? e.message : String(e)); }
    })();
    return () => { live = false; void d?.destroy(); };
  }, [id]);

  useEffect(() => { root.current?.focus(); }, []);

  // đo khung
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [doc]);

  const scale = useMemo(() => {
    const w = sizes[0]?.w ?? 595, h = sizes[0]?.h ?? 842;
    return fit === 'width' ? fitWidth(box.w, w) : fit === 'page' ? fitPage(box.w, box.h, w, h) : clampZoom(fit);
  }, [fit, box, sizes]);
  const layout = useMemo(() => layoutPages(sizes.map((s) => s.h * scale), GAP), [sizes, scale]);

  const release = useCallback((i: number) => {
    const r = rendered.current.get(i);
    if (!r) return;
    r.cancel();
    r.canvas.width = 0; r.canvas.height = 0;
    r.canvas.remove();
    rendered.current.delete(i);
  }, []);

  const paint = useCallback(async (i: number, g: number) => {
    if (!doc || rendered.current.has(i) || pending.current.has(i)) return;
    pending.current.add(i);
    try {
      const page = await doc.getPage(i + 1);
      if (g !== gen.current) return;
      const dpr = window.devicePixelRatio || 1;
      const vp0 = page.getViewport({ scale });
      const k = canvasShrink(vp0.width * dpr, vp0.height * dpr);
      const vp = page.getViewport({ scale: scale * dpr * k });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(vp.width)); canvas.height = Math.max(1, Math.floor(vp.height));
      canvas.style.width = `${vp0.width}px`; canvas.style.height = `${vp0.height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const task = page.render({ canvasContext: ctx, viewport: vp });
      rendered.current.set(i, { canvas, cancel: () => task.cancel() });
      await task.promise;
      if (g !== gen.current) { release(i); return; }
      holders.current[i]?.replaceChildren(canvas);
    } catch (e) {
      rendered.current.delete(i);
      const name = (e as { name?: string })?.name;
      if (name !== 'RenderingCancelledException') setMsg(`Không vẽ được trang ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    } finally { pending.current.delete(i); }
  }, [doc, scale, release]);

  const refresh = useCallback(() => {
    const el = scroller.current;
    if (!el || !doc) return;
    const vis = visibleRange(layout, el.scrollTop, el.clientHeight);
    const c = currentPage(layout, el.scrollTop, el.clientHeight);
    setCur(c);
    for (const i of vis) void paint(i, gen.current);
    for (const i of pagesToRelease([...rendered.current.keys()], c)) release(i);
  }, [doc, layout, paint, release]);

  // đổi tỉ lệ/khung ⇒ vẽ lại từ đầu
  useEffect(() => {
    gen.current++;
    for (const i of [...rendered.current.keys()]) release(i);
    pending.current.clear();
    for (const h of holders.current) h?.replaceChildren();
    refresh();
  }, [scale, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { for (const i of [...rendered.current.keys()]) release(i); }, [release]);

  const raf = useRef(0);
  const onScroll = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(refresh); };
  const goto = (i: number) => { const el = scroller.current; if (el) el.scrollTop = scrollTopFor(layout, i, GAP); };

  const doSearch = async () => {
    if (!doc || !query.trim()) { setMatches(null); return; }
    setSearching(true);
    try {
      if (!texts.current) {
        const all: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) all.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str ?? '').join(' '));
        texts.current = all;
      }
      const m = matchPages(texts.current, query);
      setMatches(m);
      const first = nextMatch(m, cur - 1, 1);
      if (first !== null) goto(first);
    } finally { setSearching(false); }
  };

  const save = async () => {
    setMsg(null);
    try {
      const dlg = window.__TAURI__?.dialog;
      const dest = await dlg?.save({ title: 'Lưu bản sao PDF', defaultPath: `${title.replace(/[\\/:*?"<>|]/g, '-')}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (!dest) return;
      await invoke<void>('exam_pdf_export', { id, dest });
      setMsg(`Đã lưu bản sao: ${dest}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  const external = async () => {
    setMsg(null);
    try { await invoke<void>('exam_pdf_open_external', { id }); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) { e.preventDefault(); setFit(stepZoom(scale, 1)); }
    else if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); setFit(stepZoom(scale, -1)); }
  };
  const n = sizes.length;

  return (
    <div className="pv" role="dialog" aria-modal="true" aria-label={`Xem PDF: ${title}`} ref={root} tabIndex={-1} onKeyDown={key}>
      <div className="pv-bar">
        <b className="pv-title">{title}</b>
        <span className="pv-grp">
          <button type="button" className="btn btn-sm" aria-label="Trang trước" disabled={cur <= 0} onClick={() => goto(cur - 1)}>‹</button>
          <input className="xl-in pv-page-in" aria-label="Số trang" inputMode="numeric" value={n ? cur + 1 : ''} onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 1 && v <= n) goto(v - 1); }} />
          <span className="xl-meta">/ {n || '…'}</span>
          <button type="button" className="btn btn-sm" aria-label="Trang sau" disabled={cur >= n - 1} onClick={() => goto(cur + 1)}>›</button>
        </span>
        <span className="pv-grp">
          <button type="button" className="btn btn-sm" aria-label="Thu nhỏ" onClick={() => setFit(stepZoom(scale, -1))}>−</button>
          <select className="xl-in" aria-label="Mức phóng" value={typeof fit === 'number' ? 'custom' : fit} onChange={(e) => setFit(e.target.value === 'width' ? 'width' : e.target.value === 'page' ? 'page' : scale)}>
            <option value="width">Vừa chiều rộng</option><option value="page">Vừa trang</option>
            {typeof fit === 'number' && <option value="custom">{Math.round(scale * 100)}%</option>}
          </select>
          <button type="button" className="btn btn-sm" aria-label="Phóng to" onClick={() => setFit(stepZoom(scale, 1))}>+</button>
          <span className="xl-meta">{Math.round(scale * 100)}%</span>
        </span>
        <form className="pv-grp" onSubmit={(e) => { e.preventDefault(); void doSearch(); }}>
          <input className="xl-in" type="search" aria-label="Tìm trong PDF" placeholder="Tìm chữ…" value={query} onChange={(e) => { setQuery(e.target.value); setMatches(null); }} />
          <button type="submit" className="btn btn-sm" disabled={searching || !doc}>{searching ? 'Đang tìm…' : 'Tìm'}</button>
          {matches && <>
            <span className="xl-meta" aria-live="polite">{matches.length ? `${matches.length} trang có chữ này` : 'Không thấy'}</span>
            <button type="button" className="btn btn-sm" aria-label="Kết quả trước" disabled={!matches.length} onClick={() => { const m = nextMatch(matches, cur, -1); if (m !== null) goto(m); }}>↑</button>
            <button type="button" className="btn btn-sm" aria-label="Kết quả sau" disabled={!matches.length} onClick={() => { const m = nextMatch(matches, cur, 1); if (m !== null) goto(m); }}>↓</button>
          </>}
        </form>
        <span className="pv-grp pv-right">
          <button type="button" className="btn btn-sm" onClick={save}>Lưu bản sao…</button>
          <button type="button" className="btn btn-sm" onClick={external}>Mở bằng ứng dụng khác</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={onClose}>Đóng</button>
        </span>
      </div>
      {stale && <div className="note warn pv-note" role="status"><div className="note-body"><b>BẢN CŨ</b><span>Lần biên dịch gần nhất không thành công; đây là PDF tốt gần nhất trước đó.</span></div></div>}
      <div className="note warn pv-note" role="note"><div className="note-body"><span>{note}</span></div></div>
      {msg && <div className="note bad pv-note" role="alert"><div className="note-body"><span>{msg}</span></div></div>}
      {err && <div className="note bad pv-note" role="alert"><div className="note-body"><b>Không mở được PDF</b><span>{err}</span></div></div>}
      {!doc && !err && <p className="aid-wait" role="status">Đang mở PDF…</p>}
      <div className="pv-scroll" ref={scroller} onScroll={onScroll} tabIndex={0} aria-label="Các trang PDF">
        <div className="pv-pages" style={{ height: layout.total, width: Math.max(...sizes.map((s) => s.w * scale), 0) + 2 * GAP }}>
          {sizes.map((s, i) => (
            <div key={i} className="pv-page" style={{ top: layout.tops[i], width: s.w * scale, height: s.h * scale }} ref={(el) => { holders.current[i] = el; }} role="img" aria-label={`Trang ${i + 1}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
