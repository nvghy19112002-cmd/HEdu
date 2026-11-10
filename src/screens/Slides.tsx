// Màn "Trình chiếu": giống phần mềm trình chiếu.
//  - Trái: các bộ trình chiếu (như danh sách bài giảng).
//  - Giữa: lưới "slide" xem trước từng câu đúng như khi chiếu; bấm một slide là chiếu từ câu đó; đổi chỗ / bỏ câu khi rê chuột.
//  - Phải: cách chiếu (công tắc), nền Tối/Sáng (ô xem mẫu), phím tắt.
// Thêm câu: hộp "Thêm câu" (dán LaTeX, mở tệp .tex, hoặc chọn ở Ngân hàng). Bộ chụp nội dung câu lúc lưu; sửa/xoá bộ không đụng ngân hàng.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { QuestionView } from '../components/QuestionView';
import { SlideShow } from '../components/SlideShow';
import { parseExTest, splitExBlocks } from '../lib/extest';
import { addToDeck, createDeck, deleteDeck, loadDecks, moveItem, removeItem, renameDeck, useDecks, type Deck, type DeckItem } from '../lib/slidedeck';
import { clock, estimateSecs, loadPlayOpts, savePlayOpts, type PlayOpts } from '../lib/slideshow';
import { exportSlidesPdf } from '../lib/slidepdf';
import { chooseProjectFolder } from '../lib/examlib';
import { isDesktop } from '../lib/platform';
import type { QType } from '../lib/types';

const LAST_KEY = 'hedu.slides.last';
const TYPE_SHORT: Record<QType, string> = { tn: 'Trắc nghiệm', ds: 'Đúng/Sai', tln: 'Trả lời ngắn', tl: 'Tự luận' };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const readLast = () => { try { return localStorage.getItem(LAST_KEY) ?? ''; } catch { return ''; } };
const dateVi = (ms: number) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}`; };
/** bề rộng "thật" của một slide khi dựng ảnh thu nhỏ (px); ảnh thu nhỏ = slide này thu theo bề rộng ô */
const THUMB_W = 520;

/** Một slide thu nhỏ: dựng câu y như lúc chiếu (chưa hiện đáp án). */
const Thumb = memo(function Thumb({ item, n, total, type, secs, theme, onPlay, onUp, onDown, onDel }: {
  item: DeckItem; n: number; total: number; type: QType; secs: number | null; theme: PlayOpts['theme'];
  onPlay(): void; onUp(): void; onDown(): void; onDel(): void;
}) {
  const p = useMemo(() => parseExTest(item.latex), [item.latex]);
  return (
    <li className="slt">
      <button type="button" className={`slt-frame theme-${theme}`} onClick={onPlay} title={`Chiếu từ câu ${n}`} aria-label={`Chiếu từ câu ${n}`}>
        <span className="slt-q"><QuestionView p={p} number={n} raw={item.latex} showAnswer={false} showSolution={false} /></span>
        <span className="slt-play" aria-hidden="true">▶</span>
      </button>
      <div className="slt-foot">
        <span className="slt-n">{n}</span>
        <span className="slt-type">{TYPE_SHORT[type]}{secs !== null ? ` · ${clock(secs)}` : ''}</span>
        <span className="slt-acts">
          <button type="button" disabled={n === 1} onClick={onUp} aria-label={`Đưa câu ${n} lên trước`} title="Lên trước">←</button>
          <button type="button" disabled={n === total} onClick={onDown} aria-label={`Đưa câu ${n} ra sau`} title="Ra sau">→</button>
          <button type="button" className="danger" onClick={onDel} aria-label={`Bỏ câu ${n} khỏi bộ`} title="Bỏ khỏi bộ (câu trong ngân hàng không bị xoá)">✕</button>
        </span>
      </div>
    </li>
  );
});

function Switch({ on, label, hint, disabled, onChange }: { on: boolean; label: string; hint?: string; disabled?: boolean; onChange(v: boolean): void }) {
  return (
    <label className={`sl-sw${disabled ? ' is-off' : ''}`}>
      <span className="sl-sw-t"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

export function SlidesScreen() {
  const { toast, go } = useApp();
  const decks = useDecks();
  const [sel, setSel] = useState(readLast);
  const [opts, setOptsState] = useState<PlayOpts>(loadPlayOpts);
  const [playing, setPlaying] = useState<number | null>(null);
  const [ren, setRen] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [askDel, setAskDel] = useState(false);
  const [adding, setAdding] = useState<null | { forNew: boolean }>(null);
  useEffect(() => { void loadDecks().catch((e) => toast(`Không đọc được bộ trình chiếu: ${msg(e)}`)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deck: Deck | undefined = decks.find((d) => d.id === sel) ?? decks[0];
  useEffect(() => { if (deck && deck.id !== sel) setSel(deck.id); }, [deck, sel]);
  useEffect(() => { try { if (deck) localStorage.setItem(LAST_KEY, deck.id); } catch { /* tiện lợi */ } }, [deck]);
  const setOpts = (o: PlayOpts) => { setOptsState(o); savePlayOpts(o); };

  const types = useMemo(() => (deck?.items ?? []).map((it) => parseExTest(it.latex).type), [deck]);
  const secs = estimateSecs(types, opts);
  const run = async (f: () => Promise<unknown>, ok?: string) => { try { await f(); if (ok) toast(ok); } catch (e) { toast(msg(e)); } };
  /** Xuất bộ ra PDF khổ 16:9 (mỗi câu một trang), dịch bằng TeX Live trên máy. */
  const pdfOut = async (d: Deck, solution: boolean) => {
    const dir = await chooseProjectFolder();
    if (!dir) return;
    toast(`Đang dịch PDF “${d.name}” (${d.items.length} câu)…`);
    try { toast(`Đã xuất PDF: ${await exportSlidesPdf(d.name, d.items, solution, dir)}`); } catch (e) { toast(`Không xuất được PDF: ${msg(e)}`); }
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'F5' && playing === null && deck?.items.length && !adding) { e.preventDefault(); setPlaying(0); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [playing, deck, adding]);
  useEffect(() => { if (!menu) return; const off = () => setMenu(false); window.addEventListener('click', off); return () => window.removeEventListener('click', off); }, [menu]);

  const n = deck?.items.length ?? 0;
  // ảnh thu nhỏ: đo bề rộng ô, đặt hệ số thu --tz cho cả lưới
  const gridRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const g = gridRef.current;
    if (!g) return;
    const set = () => { const f = g.querySelector<HTMLElement>('.slt-frame'); if (f) g.style.setProperty('--tz', String(Math.max(0.2, f.clientWidth / THUMB_W))); };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(g);
    return () => ro.disconnect();
  }, [n, deck?.id]);
  return (
    <div className="sl2">
      <aside className="sl2-decks" aria-label="Các bộ trình chiếu">
        <div className="sl2-dh"><h1>Trình chiếu</h1><button type="button" className="btn btn-sm" title="Tạo bộ trình chiếu mới" onClick={() => setAdding({ forNew: true })}>+ Mới</button></div>
        {decks.length === 0 ? <p className="sl2-none">Chưa có bộ nào.</p> : (
          <ul>
            {decks.map((d) => (
              <li key={d.id}>
                <button type="button" className={d.id === deck?.id ? 'on' : undefined} aria-current={d.id === deck?.id ? 'true' : undefined} onClick={() => { setSel(d.id); setAskDel(false); }}>
                  <span className="sl2-dn">{d.name}</span>
                  <span className="sl2-dm">{d.items.length} câu · {dateVi(d.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main className="sl2-main">
        {!deck ? (
          <div className="sl2-hero">
            <h2>Tạo bộ trình chiếu đầu tiên</h2>
            <p>Chọn cách đưa câu hỏi vào. Câu hiện theo đúng thứ tự, chiếu toàn màn hình bằng phím F5.</p>
            <div className="sl2-ways">
              <button type="button" onClick={() => setAdding({ forNew: true })}><b>Dán mã LaTeX</b><span>Các khối \begin&#123;ex&#125;…\end&#123;ex&#125;</span></button>
              <button type="button" onClick={() => setAdding({ forNew: true })}><b>Mở tệp .tex</b><span>Một hoặc nhiều tệp đề</span></button>
              <button type="button" onClick={() => go({ screen: 'bank' })}><b>Chọn ở Ngân hàng</b><span>Tick câu rồi bấm Trình chiếu</span></button>
            </div>
          </div>
        ) : (
          <>
            <header className="sl2-head">
              <div className="sl2-title">
                {ren !== null
                  ? <input className="xl-in" value={ren} autoFocus maxLength={120} aria-label="Tên bộ" onChange={(e) => setRen(e.target.value)} onBlur={() => { const v = ren; setRen(null); if (v.trim() && v !== deck.name) void run(() => renameDeck(deck.id, v)); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRen(null); }} />
                  : <h2><button type="button" onClick={() => setRen(deck.name)} title="Bấm để đổi tên">{deck.name}</button></h2>}
                <span className="sl2-meta">{n} câu{n ? ` · khoảng ${Math.max(1, Math.round(secs / 60))} phút` : ''} · sửa {dateVi(deck.updatedAt)}</span>
              </div>
              <div className="sl2-acts">
                <button type="button" className="btn" onClick={() => setAdding({ forNew: false })}>+ Thêm câu</button>
                <span className="sl2-more">
                  <button type="button" className="btn btn-ghost" aria-haspopup="menu" aria-expanded={menu} aria-label="Thêm thao tác" onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}>⋯</button>
                  {menu && (
                    <span className="more-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => { setMenu(false); setRen(deck.name); }}>Đổi tên bộ</button>
                      <button type="button" role="menuitem" onClick={() => { setMenu(false); go({ screen: 'bank' }); }}>Thêm câu từ Ngân hàng</button>
                      {isDesktop() && deck.items.length > 0 && <>
                        <button type="button" role="menuitem" onClick={() => { setMenu(false); void pdfOut(deck, false); }}>Xuất PDF trình chiếu…</button>
                        <button type="button" role="menuitem" onClick={() => { setMenu(false); void pdfOut(deck, true); }}>Xuất PDF kèm lời giải…</button>
                      </>}
                      <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); setAskDel(true); }}>Xoá bộ này…</button>
                    </span>
                  )}
                </span>
                <button type="button" className="btn btn-accent sl2-play" disabled={!n} onClick={() => setPlaying(0)}>▶ Chiếu<kbd>F5</kbd></button>
              </div>
            </header>
            {askDel && (
              <div className="note warn sl2-del" role="alert"><div className="note-body">
                <span>Xoá hẳn bộ “{deck.name}”? Các câu trong ngân hàng không bị ảnh hưởng.</span>
                <span className="head-actions"><button type="button" className="btn btn-sm btn-ghost" onClick={() => setAskDel(false)}>Không</button><button type="button" className="btn btn-sm danger" onClick={() => { setAskDel(false); void run(() => deleteDeck(deck.id), `Đã xoá bộ “${deck.name}”.`); }}>Xoá bộ</button></span>
              </div></div>
            )}
            {n === 0 ? (
              <div className="sl2-hero sl2-hero-sm">
                <h2>Bộ này chưa có câu nào</h2>
                <div className="sl2-ways">
                  <button type="button" onClick={() => setAdding({ forNew: false })}><b>Dán LaTeX hoặc mở .tex</b><span>Câu vào theo đúng thứ tự</span></button>
                  <button type="button" onClick={() => go({ screen: 'bank' })}><b>Chọn ở Ngân hàng</b><span>Tick câu → Trình chiếu → Thêm vào bộ</span></button>
                </div>
              </div>
            ) : (
              <ol className="sl2-grid" aria-label="Các slide" ref={gridRef}>
                {deck.items.map((it, k) => (
                  <Thumb key={`${k}-${it.latex.length}-${it.uid ?? ''}`} item={it} n={k + 1} total={n} type={types[k]} secs={opts.countdown ? opts.secs[types[k]] : null} theme={opts.theme}
                    onPlay={() => setPlaying(k)} onUp={() => void run(() => moveItem(deck.id, k, k - 1))} onDown={() => void run(() => moveItem(deck.id, k, k + 1))} onDel={() => void run(() => removeItem(deck.id, k))} />
                ))}
                <li className="slt slt-add"><button type="button" onClick={() => setAdding({ forNew: false })}><b>+</b><span>Thêm câu</span></button></li>
              </ol>
            )}
          </>
        )}
      </main>

      <aside className="sl2-set" aria-label="Cách chiếu">
        <h3>Cách chiếu</h3>
        <Switch on={opts.countdown} label="Đếm ngược mỗi câu" hint="Thời gian theo loại câu" onChange={(v) => setOpts({ ...opts, countdown: v })} />
        {opts.countdown && (
          <div className="sl2-secs">
            {(['tn', 'ds', 'tln', 'tl'] as const).map((t) => (
              <label key={t}><span>{TYPE_SHORT[t]}</span><input className="xl-in" type="number" min={5} max={3600} step={5} value={opts.secs[t]} onChange={(e) => setOpts({ ...opts, secs: { ...opts.secs, [t]: Math.max(5, Math.min(3600, Number(e.target.value) || 5)) } })} /><small>giây</small></label>
            ))}
          </div>
        )}
        <Switch on={opts.autoAnswer} disabled={!opts.countdown} label="Hết giờ tự hiện đáp án" onChange={(v) => setOpts({ ...opts, autoAnswer: v })} />
        <Switch on={opts.shuffle} label="Trộn thứ tự câu" hint="Bộ đã lưu không đổi" onChange={(v) => setOpts({ ...opts, shuffle: v })} />
        <Switch on={opts.allowSolution} label="Cho xem lời giải" hint="Phím G khi chiếu" onChange={(v) => setOpts({ ...opts, allowSolution: v })} />
        <h3>Nền khi chiếu</h3>
        <div className="sl2-themes" role="radiogroup" aria-label="Nền khi chiếu">
          {(['dark', 'light'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={opts.theme === t} className={`sl2-th th-${t}${opts.theme === t ? ' on' : ''}`} onClick={() => setOpts({ ...opts, theme: t })}>
              <span className="sl2-th-mini"><i /><i /><i className="ok" /></span>
              <b>{t === 'dark' ? 'Tối' : 'Sáng'}</b><small>{t === 'dark' ? 'Phòng tối, TV' : 'Máy chiếu phòng sáng'}</small>
            </button>
          ))}
        </div>
        <details className="sl2-keys">
          <summary>Phím tắt khi chiếu</summary>
          <dl>
            <div><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Chuyển câu</dd></div>
            <div><dt><kbd>Space</kbd></dt><dd>Hiện / ẩn đáp án</dd></div>
            <div><dt><kbd>G</kbd></dt><dd>Lời giải</dd></div>
            <div><dt><kbd>T</kbd></dt><dd>Đồng hồ</dd></div>
            <div><dt><kbd>F</kbd></dt><dd>Toàn màn hình</dd></div>
            <div><dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>Cỡ chữ</dd></div>
            <div><dt><kbd>Esc</kbd></dt><dd>Thoát</dd></div>
          </dl>
        </details>
      </aside>

      {adding && <AddDialog deck={adding.forNew ? null : deck ?? null} onClose={() => setAdding(null)} onDone={(id, m) => { setAdding(null); if (id) setSel(id); toast(m); }} onBank={() => { setAdding(null); go({ screen: 'bank' }); }} />}
      {playing !== null && deck && <SlideShow title={deck.name} items={deck.items} opts={opts} start={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}

/** Hộp "Thêm câu": dán LaTeX hoặc mở tệp .tex; tách các khối \begin{ex}…\end{ex} theo đúng thứ tự. */
function AddDialog({ deck, onClose, onDone, onBank }: { deck: Deck | null; onClose(): void; onDone(id: string | null, m: string): void; onBank(): void }) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const found = useMemo(() => splitExBlocks(text), [text]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [onClose]);
  const openTex = async (files: FileList | null) => {
    if (!files?.length) return;
    const texts = await Promise.all([...files].map((f) => f.text()));
    setText((p) => [p, ...texts].filter((x) => x.trim()).join('\n\n'));
    if (!name) setName(files[0].name.replace(/\.[^.]+$/, ''));
  };
  const save = async () => {
    if (!found.length) return;
    setBusy(true); setErr(null);
    try {
      const items = found.map((latex) => ({ latex }));
      if (deck) { const r = await addToDeck(deck.id, items); onDone(null, `Đã thêm ${r.added} câu vào “${deck.name}”${r.skipped ? `; bỏ qua ${r.skipped} câu đã có (hoặc quá 300 câu)` : ''}.`); }
      else { const d = await createDeck(name.trim() || `Bộ mới ${dateVi(Date.now())}`, items); onDone(d.id, `Đã tạo bộ “${d.name}” với ${d.items.length} câu.`); }
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm sl2-add" role="dialog" aria-modal="true" aria-label={deck ? `Thêm câu vào “${deck.name}”` : 'Bộ trình chiếu mới'}>
        <h3>{deck ? <>Thêm câu vào “{deck.name}”</> : 'Bộ trình chiếu mới'}</h3>
        <div className="cfm-body">
          {!deck && <label className="sl2-name">Tên bộ<input className="xl-in" value={name} maxLength={120} placeholder="vd: Ôn tập Cực trị · 12A3" onChange={(e) => setName(e.target.value)} autoFocus /></label>}
          <textarea className="xl-in" value={text} spellCheck={false} rows={10} aria-label="Mã LaTeX các câu" autoFocus={!!deck}
            placeholder={'Dán các khối câu hỏi vào đây, ví dụ:\n\\begin{ex}\n  Hàm số y = x^3 - 3x đạt cực đại tại\n  \\choice{x=1}{\\True x=-1}{x=3}{x=0}\n\\end{ex}'}
            onChange={(e) => setText(e.target.value)} />
          <div className="sl2-add-r">
            <input ref={fileIn} type="file" accept=".tex,.txt" multiple hidden onChange={(e) => { void openTex(e.target.files); e.target.value = ''; }} />
            <button type="button" className="btn btn-sm" onClick={() => fileIn.current?.click()}>Mở tệp .tex…</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onBank}>Chọn ở Ngân hàng →</button>
            <span className={`sl2-found${text.trim() && !found.length ? ' bad' : ''}`}>{!text.trim() ? '' : found.length ? `Tìm thấy ${found.length} câu` : 'Chưa thấy khối \\begin{ex}…\\end{ex}'}</span>
          </div>
          {err && <p className="te-bad" role="alert">{err}</p>}
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Huỷ</button>
          <button type="button" className="btn btn-accent" disabled={busy || !found.length} onClick={() => void save()}>{deck ? `Thêm ${found.length || ''} câu` : `Tạo bộ${found.length ? ` (${found.length} câu)` : ''}`}</button>
        </div>
      </div>
    </>
  );
}
