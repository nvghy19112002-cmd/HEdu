// Màn "Trình chiếu" (Giai đoạn 3 · bước 5): một bộ trình chiếu ở giữa (thứ tự câu, đổi chỗ, bỏ câu),
// bên phải: cách chiếu (đếm ngược, tự hiện đáp án, trộn, cho xem lời giải) + các bộ khác + phím khi chiếu.
// Bộ chụp nội dung câu lúc lưu; sửa/xoá bộ không đụng ngân hàng.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { SlideShow } from '../components/SlideShow';
import { parseExTest } from '../lib/extest';
import { plainSnippet } from '../lib/snippet';
import { createDeck, deleteDeck, loadDecks, moveItem, removeItem, renameDeck, useDecks, type Deck } from '../lib/slidedeck';
import { clock, estimateSecs, loadPlayOpts, savePlayOpts, type PlayOpts } from '../lib/slideshow';
import type { QType } from '../lib/types';

const LAST_KEY = 'hedu.slides.last';
const TYPE_SHORT: Record<QType, string> = { tn: 'TN', ds: 'Đ/S', tln: 'TLN', tl: 'TL' };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const readLast = () => { try { return localStorage.getItem(LAST_KEY) ?? ''; } catch { return ''; } };

export function SlidesScreen() {
  const { toast, go } = useApp();
  const decks = useDecks();
  const [sel, setSel] = useState(readLast);
  const [opts, setOptsState] = useState<PlayOpts>(loadPlayOpts);
  const [playing, setPlaying] = useState(false);
  const [ren, setRen] = useState<string | null>(null);
  const [askDel, setAskDel] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  useEffect(() => { void loadDecks().catch((e) => toast(`Không đọc được bộ trình chiếu: ${msg(e)}`)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deck: Deck | undefined = decks.find((d) => d.id === sel) ?? decks[0];
  useEffect(() => { if (deck && deck.id !== sel) setSel(deck.id); }, [deck, sel]);
  useEffect(() => { try { if (deck) localStorage.setItem(LAST_KEY, deck.id); } catch { /* tiện lợi */ } }, [deck]);
  const setOpts = (o: PlayOpts) => { setOptsState(o); savePlayOpts(o); };

  const rows = useMemo(() => (deck?.items ?? []).map((it) => { const p = parseExTest(it.latex); return { it, type: p.type, text: plainSnippet(p.stem, 160) }; }), [deck]);
  const secs = estimateSecs(rows.map((r) => r.type), opts);
  const run = async (f: () => Promise<unknown>, ok?: string) => { try { await f(); if (ok) toast(ok); } catch (e) { toast(msg(e)); } };

  // F5: chiếu
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'F5' && !playing && deck?.items.length) { e.preventDefault(); setPlaying(true); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [playing, deck]);

  return (
    <div className="sl-page">
      <header className="page-head sl-head">
        <div className="sl-crumb">
          <h1>Trình chiếu</h1>
          {deck && <><span className="tsx-sep">/</span>
            {ren !== null
              ? <input className="xl-in sl-ren" value={ren} autoFocus maxLength={120} aria-label="Tên bộ" onChange={(e) => setRen(e.target.value)} onBlur={() => { const n = ren; setRen(null); if (n.trim() && n !== deck.name) void run(() => renameDeck(deck.id, n)); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRen(null); }} />
              : <button type="button" className="tsx-draft" title="Bấm để đổi tên bộ" onClick={() => setRen(deck.name)}>{deck.name}</button>}
            <span className="sl-n">{deck.items.length} câu</span></>}
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-sm" onClick={() => go({ screen: 'bank' })} title="Chọn câu ở Ngân hàng (hoặc Đề thi, Soạn TeX) rồi bấm Trình chiếu › Thêm vào bộ">Thêm câu từ Ngân hàng</button>
          <button type="button" className="btn btn-sm" onClick={() => setNewName('')}>Bộ mới…</button>
          <button type="button" className="btn btn-sm btn-accent" disabled={!deck?.items.length} onClick={() => setPlaying(true)}>▶ Chiếu<kbd className="tsx-kb">F5</kbd></button>
        </div>
      </header>

      <div className="sl-body">
        <section className="sl-main" aria-label="Các câu trong bộ">
          {!deck ? (
            <div className="sl-empty">
              <b>Chưa có bộ trình chiếu nào</b>
              <p>Chọn câu ở <b>Ngân hàng</b>, <b>Đề thi</b> hoặc <b>Soạn TeX</b>, bấm <b>Trình chiếu</b> rồi “Lưu thành bộ mới”. Hoặc tạo bộ trống ở nút <b>Bộ mới…</b>.</p>
              <button type="button" className="btn btn-accent" onClick={() => go({ screen: 'bank' })}>Mở Ngân hàng</button>
            </div>
          ) : rows.length === 0 ? (
            <div className="sl-empty"><b>Bộ này chưa có câu nào</b><p>Chọn câu ở Ngân hàng, bấm Trình chiếu rồi chọn “Thêm vào bộ này”.</p></div>
          ) : (
            <ol className="sl-list">
              {rows.map((r, k) => (
                <li key={k} className="sl-item">
                  <span className="sl-no">{k + 1}</span>
                  <span className="sl-text"><b>Câu {k + 1}.</b> {r.text || '…'}</span>
                  <span className="sl-meta">{TYPE_SHORT[r.type]}{opts.countdown ? ` · ${clock(opts.secs[r.type])}` : ''}</span>
                  <span className="sl-acts">
                    <button type="button" className="btn btn-sm btn-ghost" disabled={k === 0} aria-label={`Đưa câu ${k + 1} lên`} onClick={() => void run(() => moveItem(deck.id, k, k - 1))}>↑</button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={k === rows.length - 1} aria-label={`Đưa câu ${k + 1} xuống`} onClick={() => void run(() => moveItem(deck.id, k, k + 1))}>↓</button>
                    <button type="button" className="btn btn-sm btn-ghost" aria-label={`Bỏ câu ${k + 1} khỏi bộ`} title="Bỏ khỏi bộ (không xoá câu trong ngân hàng)" onClick={() => void run(() => removeItem(deck.id, k))}>✕</button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="sl-side" aria-label="Cách chiếu">
          <section className="sl-box">
            <h3>Cách chiếu</h3>
            <label className="sw"><input type="checkbox" checked={opts.countdown} onChange={(e) => setOpts({ ...opts, countdown: e.target.checked })} />Đếm ngược mỗi câu</label>
            <label className="sw"><input type="checkbox" checked={opts.autoAnswer} disabled={!opts.countdown} onChange={(e) => setOpts({ ...opts, autoAnswer: e.target.checked })} />Hết giờ tự hiện đáp án</label>
            <label className="sw"><input type="checkbox" checked={opts.shuffle} onChange={(e) => setOpts({ ...opts, shuffle: e.target.checked })} />Trộn thứ tự câu khi chiếu</label>
            <label className="sw"><input type="checkbox" checked={opts.allowSolution} onChange={(e) => setOpts({ ...opts, allowSolution: e.target.checked })} />Cho xem lời giải (phím G)</label>
            {opts.countdown && (
              <div className="sl-secs">
                {(['tn', 'ds', 'tln', 'tl'] as const).map((t) => (
                  <label key={t}>{TYPE_SHORT[t]} <input className="xl-in" type="number" min={5} max={3600} step={5} value={opts.secs[t]} onChange={(e) => setOpts({ ...opts, secs: { ...opts.secs, [t]: Math.max(5, Math.min(3600, Number(e.target.value) || 5)) } })} /> giây</label>
                ))}
              </div>
            )}
          </section>
          <section className="sl-box">
            <h3>Các bộ</h3>
            {decks.length === 0 ? <p className="sys-hint">Chưa có bộ nào.</p> : (
              <ul className="sl-decks">
                {decks.map((d) => <li key={d.id}><button type="button" className={d.id === deck?.id ? 'on' : undefined} onClick={() => { setSel(d.id); setAskDel(false); }}><span>{d.name}</span><b>{d.items.length}</b></button></li>)}
              </ul>
            )}
            {deck && (askDel
              ? <p className="sl-del">Xoá hẳn bộ “{deck.name}”? Câu trong ngân hàng không bị ảnh hưởng. <button type="button" className="btn btn-sm danger" onClick={() => { setAskDel(false); void run(() => deleteDeck(deck.id), `Đã xoá bộ “${deck.name}”.`); }}>Xoá bộ</button> <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAskDel(false)}>Không</button></p>
              : <button type="button" className="linkbtn sl-delbtn" onClick={() => setAskDel(true)}>Xoá bộ này…</button>)}
          </section>
          <section className="sl-box sl-keys">
            <h3>Phím khi chiếu</h3>
            <p><kbd>←</kbd> <kbd>→</kbd> chuyển câu · <kbd>Space</kbd> đáp án · <kbd>G</kbd> lời giải · <kbd>T</kbd> đồng hồ · <kbd>F</kbd> toàn màn hình · <kbd>+</kbd> <kbd>−</kbd> cỡ chữ · <kbd>Esc</kbd> thoát</p>
          </section>
        </aside>
      </div>

      <footer className="qe-status sl-status">
        <span className="qs">{rows.length} câu{opts.countdown && rows.length ? ` · ước tính ${Math.max(1, Math.round(secs / 60))} phút` : ''}</span>
        <span className="tsx-sp" />
        <span className="qs idle">Bộ chụp nội dung câu lúc lưu; sửa câu ở ngân hàng không đổi bộ</span>
      </footer>

      {newName !== null && (
        <>
          <div className="cfm-scrim" onClick={() => setNewName(null)} />
          <div className="cfm" role="dialog" aria-modal="true" aria-label="Bộ trình chiếu mới">
            <h3>Bộ trình chiếu mới</h3>
            <div className="cfm-body"><input className="xl-in" value={newName} autoFocus maxLength={120} placeholder="vd: Ôn tập Cực trị · 12A3" aria-label="Tên bộ" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { const n = newName; setNewName(null); void run(async () => { const d = await createDeck(n, []); setSel(d.id); }); } if (e.key === 'Escape') setNewName(null); }} /></div>
            <div className="cfm-acts">
              <button type="button" className="btn" onClick={() => setNewName(null)}>Huỷ</button>
              <button type="button" className="btn btn-accent" disabled={!newName.trim()} onClick={() => { const n = newName; setNewName(null); void run(async () => { const d = await createDeck(n, []); setSel(d.id); }); }}>Tạo bộ</button>
            </div>
          </div>
        </>
      )}
      {playing && deck && <SlideShow title={deck.name} items={deck.items} opts={opts} onClose={() => setPlaying(false)} />}
    </div>
  );
}
