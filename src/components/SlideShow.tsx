// Trình chiếu câu hỏi: hộp chọn (chiếu ngay / lưu thành bộ / thêm vào bộ / các bộ đã lưu) và màn chiếu toàn màn hình nền tối.
// Phím: ← → chuyển câu · Space/Enter hiện đáp án · G lời giải · T đồng hồ · F toàn màn hình · + − cỡ chữ · Esc thoát.
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseExTest } from '../lib/extest';
import { addToDeck, createDeck, deleteDeck, loadDecks, renameDeck, useDecks, type DeckItem } from '../lib/slidedeck';
import { clampZoom, clock, closeSlides, DEFAULT_PLAY, loadPlayOpts, shuffled, useSlideRequest, ZOOM_DEFAULT, ZOOM_STEP, type PlayOpts } from '../lib/slideshow';
import { QuestionView } from './QuestionView';

const ZKEY = 'hedu.slides.zoom';
const readZoom = () => { try { const v = Number(localStorage.getItem(ZKEY)); return v ? clampZoom(v) : ZOOM_DEFAULT; } catch { return ZOOM_DEFAULT; } };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function SlideShow({ title, items: items0, onClose, opts, start = 0 }: { title: string; items: DeckItem[]; onClose(): void; /** bắt đầu từ câu thứ mấy (từ 0) */ start?: number; /** cách chiếu (đếm ngược, trộn, cho xem lời giải) */ opts?: PlayOpts }) {
  const o = opts ?? DEFAULT_PLAY;
  // trộn một lần lúc bắt đầu chiếu; bộ đã lưu không đổi
  const items = useMemo(() => (o.shuffle ? shuffled(items0) : items0), [items0]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(() => Math.max(0, Math.min(start, items0.length - 1)));
  const [slideAt, setSlideAt] = useState(() => Date.now());
  const [ans, setAns] = useState(false);
  const [sol, setSol] = useState(false);
  const [zoom, setZoom] = useState(readZoom);
  const [timer, setTimer] = useState<number | null>(null); // mốc bắt đầu (ms) hoặc tắt
  const [now, setNow] = useState(Date.now());
  const root = useRef<HTMLDivElement>(null);
  // thanh điều khiển tự ẩn khi không rê chuột 2,5 giây
  const [idle, setIdle] = useState(false);
  const idleT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = () => { setIdle(false); if (idleT.current) clearTimeout(idleT.current); idleT.current = setTimeout(() => setIdle(true), 2500); };
  useEffect(() => { wake(); return () => { if (idleT.current) clearTimeout(idleT.current); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const n = items.length;
  const p = useMemo(() => (items[i] ? parseExTest(items[i].latex) : null), [items, i]);

  const go = (k: number) => { const j = Math.min(n - 1, Math.max(0, k)); if (j !== i) { setI(j); setAns(false); setSol(false); setSlideAt(Date.now()); setNow(Date.now()); } };
  const limit = o.countdown && p ? o.secs[p.type] : null;
  const left = limit === null ? null : Math.max(0, Math.ceil(limit - (now - slideAt) / 1000));
  const setZ = (z: number) => { const v = clampZoom(z); setZoom(v); try { localStorage.setItem(ZKEY, String(v)); } catch { /* tiện lợi */ } };
  const full = () => { const el = root.current; if (!document.fullscreenElement) void el?.requestFullscreen?.().catch(() => undefined); else void document.exitFullscreen().catch(() => undefined); };
  const close = () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onClose(); };

  useEffect(() => { root.current?.focus(); }, []);
  useEffect(() => { if (timer === null && !o.countdown) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [timer, o.countdown]);
  // hết giờ: tự hiện đáp án (nếu bật)
  useEffect(() => { if (left === 0 && o.autoAnswer && !ans) setAns(true); }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const key = e.key;
      const map: Record<string, () => void> = {
        ArrowRight: () => go(i + 1), PageDown: () => go(i + 1), ArrowDown: () => go(i + 1),
        ArrowLeft: () => go(i - 1), PageUp: () => go(i - 1), ArrowUp: () => go(i - 1),
        Home: () => go(0), End: () => go(n - 1),
        ' ': () => setAns((a) => !a), Enter: () => setAns((a) => !a),
        g: () => { if (o.allowSolution) setSol((s) => !s); }, G: () => { if (o.allowSolution) setSol((s) => !s); },
        t: () => { setTimer((x) => (x === null ? Date.now() : null)); setNow(Date.now()); }, T: () => { setTimer((x) => (x === null ? Date.now() : null)); setNow(Date.now()); },
        f: full, F: full,
        '+': () => setZ(zoom + ZOOM_STEP), '=': () => setZ(zoom + ZOOM_STEP), '-': () => setZ(zoom - ZOOM_STEP),
        Escape: close,
      };
      const f = map[key];
      if (!f || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); e.stopPropagation(); f();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });

  return (
    <div className={`sld theme-${o.theme}${ans ? ' show-ans' : ''}${idle ? ' idle' : ''}`} ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Trình chiếu: ${title}`} onMouseMove={wake}>
      <div className="sld-top">
        <span className="sld-title"><b>{title}</b></span>
        <span className="sld-count" aria-live="polite"><b>{n ? i + 1 : 0}</b> / {n}</span>
        <span className="sld-pills">
          {ans && <span className="sld-pill ok">Đang hiện đáp án</span>}
          {left !== null && <span className={`sld-pill${left <= 10 ? ' warn' : ''}`} title="Thời gian còn lại của câu này">⏳ {clock(left)}</span>}
          {timer !== null && <span className="sld-pill">⏱ {clock((now - timer) / 1000)}</span>}
          <button type="button" className="sld-x" onClick={close} aria-label="Thoát trình chiếu (Esc)">✕</button>
        </span>
      </div>
      <div className="sld-stage" onClick={(e) => { if ((e.target as HTMLElement).closest('button, a, input')) return; go(i + 1); }}>
        <div className="sld-q" style={{ zoom }}>
          {p ? <QuestionView p={p} number={i + 1} raw={items[i].latex} showAnswer={ans} showSolution={sol} /> : <p>Bộ này chưa có câu nào.</p>}
        </div>
      </div>
      <div className="sld-bar" aria-hidden="true"><i style={{ width: n ? `${((i + 1) / n) * 100}%` : 0 }} /></div>
      {limit !== null && left !== null && <div className="sld-tbar" aria-hidden="true"><i className={left <= 10 ? 'warn' : undefined} style={{ width: `${(left / limit) * 100}%` }} /></div>}
      <div className="sld-bot">
        <span className="sld-keys"><kbd>←</kbd><kbd>→</kbd> chuyển câu · <kbd>Space</kbd> đáp án · <kbd>G</kbd> lời giải · <kbd>T</kbd> đồng hồ · <kbd>F</kbd> toàn màn hình · <kbd>Esc</kbd> thoát</span>
        <span className="sld-acts">
          <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Câu trước">‹</button>
          <button type="button" onClick={() => setAns((a) => !a)}>{ans ? 'Ẩn đáp án' : 'Đáp án'}</button>
          {o.allowSolution && <button type="button" onClick={() => setSol((s) => !s)}>{sol ? 'Ẩn lời giải' : 'Lời giải'}</button>}
          <button type="button" onClick={() => go(i + 1)} disabled={i >= n - 1} aria-label="Câu sau">›</button>
          <button type="button" onClick={() => setZ(zoom - ZOOM_STEP)} aria-label="Chữ nhỏ hơn">A−</button>
          <button type="button" onClick={() => setZ(zoom + ZOOM_STEP)} aria-label="Chữ to hơn">A+</button>
        </span>
      </div>
    </div>
  );
}

/** Hộp "Trình chiếu": chiếu ngay các câu vừa chọn, lưu thành bộ, thêm vào bộ có sẵn, hoặc mở một bộ đã lưu. */
function SlideDialog({ source, items, onPlay }: { source: string; items: DeckItem[]; onPlay(title: string, items: DeckItem[]): void }) {
  const decks = useDecks();
  const [name, setName] = useState(source);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ren, setRen] = useState<{ id: string; name: string } | null>(null);
  const [askDel, setAskDel] = useState<string | null>(null);
  useEffect(() => { void loadDecks(); }, []);
  useEffect(() => { if (!target && decks[0]) setTarget(decks[0].id); }, [decks, target]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeSlides(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, []);
  const run = async (f: () => Promise<string>) => { setBusy(true); setErr(null); setNote(null); try { setNote(await f()); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };

  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) closeSlides(); }} />
      <div className="cfm sld-dlg" role="dialog" aria-modal="true" aria-label="Trình chiếu câu hỏi">
        <h3>Trình chiếu câu hỏi</h3>
        <div className="cfm-body">
          {items.length > 0 && (
            <div className="fb-rowbox">
              <b>{items.length} câu từ {source}</b>
              <div className="sld-row"><button type="button" className="btn btn-dark" autoFocus onClick={() => onPlay(source, items)}>Chiếu ngay</button></div>
              <div className="sld-row">
                <input className="xl-in" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="Tên bộ mới" placeholder="Tên bộ trình chiếu" />
                <button type="button" className="btn btn-sm" disabled={busy || !name.trim()} onClick={() => void run(async () => { const d = await createDeck(name, items); return `Đã lưu bộ “${d.name}” (${d.items.length} câu).`; })}>Lưu thành bộ mới</button>
              </div>
              {decks.length > 0 && (
                <div className="sld-row">
                  <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Bộ có sẵn">{decks.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.items.length} câu)</option>)}</select>
                  <button type="button" className="btn btn-sm" disabled={busy || !target} onClick={() => void run(async () => { const r = await addToDeck(target, items); return `Đã thêm ${r.added} câu${r.skipped ? `, bỏ qua ${r.skipped} câu đã có (hoặc quá 300 câu)` : ''}.`; })}>Thêm vào bộ này</button>
                </div>
              )}
            </div>
          )}
          {note && <p className="okmark" role="status">{note}</p>}
          {err && <p className="te-bad" role="alert">{err}</p>}
          <b className="sld-h">Bộ đã lưu</b>
          {decks.length === 0 ? <p className="sys-hint">Chưa có bộ nào. Chọn câu ở Ngân hàng, Thư viện đề hoặc Xử lí TeX rồi bấm Trình chiếu để lưu.</p> : (
            <ul className="sld-list">
              {decks.map((d) => (
                <li key={d.id}>
                  {ren?.id === d.id ? (
                    <span className="sld-row">
                      <input className="xl-in" value={ren.name} autoFocus maxLength={120} onChange={(e) => setRen({ id: d.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void run(async () => { await renameDeck(d.id, ren.name); setRen(null); return 'Đã đổi tên.'; }); }} aria-label="Tên mới" />
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(async () => { await renameDeck(d.id, ren.name); setRen(null); return 'Đã đổi tên.'; })}>Lưu</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRen(null)}>Huỷ</button>
                    </span>
                  ) : (
                    <>
                      <span className="sld-name"><b>{d.name}</b> <small>{d.items.length} câu · {new Date(d.updatedAt).toLocaleDateString('vi-VN')}</small></span>
                      <button type="button" className="btn btn-sm btn-dark" disabled={!d.items.length} onClick={() => onPlay(d.name, d.items)}>Chiếu</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRen({ id: d.id, name: d.name })}>Đổi tên</button>
                      {askDel === d.id
                        ? <><button type="button" className="btn btn-sm danger" disabled={busy} onClick={() => void run(async () => { await deleteDeck(d.id); setAskDel(null); return `Đã xoá bộ “${d.name}”.`; })}>Xoá hẳn</button><button type="button" className="btn btn-sm btn-ghost" onClick={() => setAskDel(null)}>Không</button></>
                        : <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAskDel(d.id)}>Xoá…</button>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="sys-hint">Bộ trình chiếu chụp lại nội dung câu lúc lưu; sửa câu ở ngân hàng sau đó không làm đổi bộ. Xoá bộ không xoá câu nào trong ngân hàng.</p>
        </div>
        <div className="cfm-acts"><button type="button" className="btn" onClick={closeSlides} disabled={busy}>Đóng</button></div>
      </div>
    </>
  );
}

/** Gắn một lần ở App: hiện hộp Trình chiếu khi có màn gọi openSlides(). */
export function SlideHost() {
  const req = useSlideRequest();
  const [play, setPlay] = useState<{ title: string; items: DeckItem[] } | null>(null);
  useEffect(() => { if (!req) setPlay(null); }, [req]);
  if (!req) return null;
  if (play) return <SlideShow title={play.title} items={play.items} opts={loadPlayOpts()} onClose={() => setPlay(null)} />;
  return <SlideDialog source={req.source} items={req.items} onPlay={(title, items) => setPlay({ title, items })} />;
}
