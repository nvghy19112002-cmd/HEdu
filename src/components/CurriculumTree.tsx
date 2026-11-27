// Mục lục chương trình kiểu macOS (thay BankTree; mẫu chủ dự án duyệt 26/11/2026).
// Lớp chọn bằng thanh phân đoạn ở đầu; Phân môn là tiêu đề nhóm; nhìn thấy tối đa 3 tầng Chương › Bài › Dạng.
// Thêm: ô lọc tên tìm khắp các lớp (không dấu), ghim mục hay dùng, thanh phân bố mức độ dưới Chương,
// thẻ thống kê khi rê chuột, phím mũi tên kiểu cây thư mục. Chọn một mục = lọc danh sách theo mục đó (như cũ).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { NoIdPick } from '../lib/bankfilter';
import { fullTree, pathKeys, selectedKey, type NodePath, type NodeStat, type TreeNode } from '../lib/banktree';
import type { Taxonomy } from '../lib/types';

const nf = new Intl.NumberFormat('vi-VN');
const LS_OPEN = 'hedu.banktree.open.v1';
const LS_PREF = 'hedu.ctree.pref.v1';
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
const LV = [['nb', 'Nhận biết'], ['th', 'Thông hiểu'], ['vd', 'Vận dụng'], ['vdc', 'Vận dụng cao']] as const;

interface Pref { grade?: string; pins: string[]; hideEmpty: boolean; bars: boolean; closed: string[] }
function loadJSON<T>(k: string, d: T): T { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v ?? d; } catch { return d; } }
function saveJSON(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* chỉ là tiện lợi */ } }

/** "Chương 1. Mệnh đề" → ["1", "Mệnh đề"]; không có số thì ["", tên]. */
export function splitNo(label: string): [string, string] {
  const m = label.match(/^(?:Chương|Chuyên đề|Bài|Dạng)\s*(\d+)\s*[.:]\s*(.*)$/i);
  return m ? [m[1], m[2]] : ['', label];
}

const Ico = ({ d, cls = '' }: { d: ReactNode; cls?: string }) => (
  <svg className={`ct-ico ${cls}`} viewBox="0 0 24 24" aria-hidden="true">{d}</svg>
);
const CHEV = <path d="m9 6 6 6-6 6" />;
const STAR = <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />;
const TRAY = <><path d="M4 13 6.5 5h11L20 13v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></>;
const TAG = <><path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="8.5" r="1.2" /></>;
const SEARCH = <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>;
const MORE = <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>;
const CHECK = <path d="m5 12.5 4.5 4.5L19 7.5" />;
const X = <path d="M6 6l12 12M18 6 6 18" />;

function LvBar({ s, big }: { s?: NodeStat; big?: boolean }) {
  const tot = s ? s.lv.reduce((a, b) => a + b, 0) : 0;
  if (!s || !tot) return null;
  return <span className={`ct-lvbar${big ? ' big' : ''}`} aria-hidden="true">{s.lv.map((v, i) => v ? <i key={i} className={`lv-${LV[i][0]}`} style={{ flex: v }} /> : null)}</span>;
}

interface Props {
  tax: Taxonomy;
  path: NodePath;
  /** số câu từng mục (theo chữ tìm + bộ lọc thuộc tính) */
  counts: ReadonlyMap<string, number>;
  total: number;
  /** thống kê từng mục trên toàn kho: mức độ, thiếu lời giải, đã duyệt */
  stats: ReadonlyMap<string, NodeStat>;
  off?: boolean;
  allOn?: boolean;
  onPick(p: NodePath | null): void;
  noId?: { total: number; sel: NoIdPick; onPick(v: NoIdPick): void };
}

type Row = { n: TreeNode; depth: number };

export function CurriculumTree({ tax, path, counts, total, stats, off, allOn, onPick, noId }: Props) {
  const tree = useMemo(() => fullTree(tax, counts), [tax, counts]);
  const index = useMemo(() => {
    const m = new Map<string, { n: TreeNode; parent: string | null; grade: string }>();
    const walk = (ns: TreeNode[], parent: string | null, grade: string) => ns.forEach((n) => { const g = n.kind === 'grade' ? n.key : grade; m.set(n.key, { n, parent, grade: g }); walk(n.children, n.key, g); });
    walk(tree, null, '');
    return m;
  }, [tree]);
  const sel = selectedKey(path);
  const selPath = useMemo(() => pathKeys(path), [path]);

  const [pref, setPref] = useState<Pref>(() => ({ pins: [], hideEmpty: false, bars: true, closed: [], ...loadJSON<Partial<Pref>>(LS_PREF, {}) }));
  const [open, setOpen] = useState<Set<string>>(() => new Set(loadJSON<string[]>(LS_OPEN, [])));
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [card, setCard] = useState<{ key: string; top: number; left: number } | null>(null);
  const hoverT = useRef<number | undefined>(undefined);
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const upd = (p: Partial<Pref>) => setPref((o) => { const n = { ...o, ...p }; saveJSON(LS_PREF, n); return n; });
  const setOpenS = (s: Set<string>) => { setOpen(s); saveJSON(LS_OPEN, [...s].slice(0, 2000)); };
  const toggle = (k: string) => { const s = new Set(open); if (s.has(k)) s.delete(k); else s.add(k); setOpenS(s); };

  // Lớp đang xem: lớp của mục đang chọn, nếu không thì lớp đã nhớ, rồi lớp đầu tiên
  const selGrade = sel ? index.get(sel)?.grade : undefined;
  const gradeKey = selGrade ?? (pref.grade && index.has(pref.grade) ? pref.grade : tree[0]?.key);
  const grade = tree.find((g) => g.key === gradeKey) ?? tree[0];

  // Mở sẵn đường tới mục đang chọn
  useEffect(() => {
    if (!sel) return;
    const add = [...selPath].filter((k) => k !== sel && !open.has(k));
    if (add.length) setOpenS(new Set([...open, ...add]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);
  useEffect(() => { if (selGrade && selGrade !== pref.grade) upd({ grade: selGrade }); /* nhớ lớp */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selGrade]);

  const fq = fold(q.trim());
  const hit = (n: TreeNode) => !fq || fold(`${n.code} ${n.label}`).includes(fq);
  const anyHit = (n: TreeNode): boolean => hit(n) || n.children.some(anyHit);
  const rowsOf = (ns: TreeNode[], depth: number, out: Row[]): Row[] => {
    for (const n of ns) {
      if (fq && !anyHit(n)) continue;
      if (!fq && pref.hideEmpty && !n.count && !selPath.has(n.key)) continue;
      out.push({ n, depth });
      const isOpen = fq ? n.children.some(anyHit) : open.has(n.key);
      if (n.children.length && isOpen) rowsOf(n.children, depth + 1, out);
    }
    return out;
  };
  /** Nhóm theo Phân môn (nếu lớp có nhiều phân môn) */
  const groupsOf = (g: TreeNode) => g.children.length && g.children[0].kind === 'branch'
    ? g.children.map((b) => ({ b, rows: pref.closed.includes(b.key) && !fq ? [] : rowsOf(b.children, 0, []) }))
    : [{ b: null as TreeNode | null, rows: rowsOf(g.children, 0, []) }];

  const pick = (k: string) => {
    const x = index.get(k); if (!x) return;
    if (x.n.children.length && sel === k && x.n.kind !== 'grade' && x.n.kind !== 'branch') { toggle(k); return; }
    onPick(x.n.path);
  };
  const togglePin = (k: string) => upd({ pins: pref.pins.includes(k) ? pref.pins.filter((p) => p !== k) : [...pref.pins, k] });

  const showCard = (el: HTMLElement, key: string) => {
    window.clearTimeout(hoverT.current);
    hoverT.current = window.setTimeout(() => {
      const rootEl = rootRef.current; if (!rootEl) return;
      const r = el.getBoundingClientRect(), root = rootEl.getBoundingClientRect();
      // toạ độ theo khung mục lục (thẻ đặt absolute ngay bên phải); chia tỉ lệ vì app có thu phóng giao diện
      const z = rootEl.offsetHeight ? root.height / rootEl.offsetHeight : 1;
      setCard({ key, top: Math.max(0, Math.min(rootEl.offsetHeight - 240, (r.top - root.top) / z - 8)), left: 0 });
    }, 550);
  };
  const hideCard = () => { window.clearTimeout(hoverT.current); setCard(null); };
  useEffect(() => () => window.clearTimeout(hoverT.current), []);

  /** Phím trong cây: ↑↓ đi, → mở/vào con, ← đóng/về cha, Enter/Space chọn, P ghim. */
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    hideCard();
    const cur = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
    if (!cur) return;
    const rows = [...(bodyRef.current?.querySelectorAll<HTMLElement>('[data-k]') ?? [])];
    const i = rows.indexOf(cur), k = cur.dataset.k!, x = index.get(k);
    const focusK = (key?: string | null) => { if (key) requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>(`[data-k="${CSS.escape(key)}"]`)?.focus()); };
    switch (e.key) {
      case 'ArrowDown': rows[i + 1]?.focus(); break;
      case 'ArrowUp': if (i === 0) rootRef.current?.querySelector<HTMLInputElement>('.ct-find input')?.focus(); else rows[i - 1]?.focus(); break;
      case 'ArrowRight': if (x?.n.children.length && !open.has(k)) { toggle(k); focusK(k); } else rows[i + 1]?.focus(); break;
      case 'ArrowLeft': if (open.has(k)) { toggle(k); focusK(k); } else focusK(x?.parent); break;
      case 'Enter': case ' ': if (k === 'all') onPick(null); else if (k === 'noid') noId?.onPick('all'); else onPick(x!.n.path); break;
      case 'p': case 'P': if (x) togglePin(k); break;
      default: return;
    }
    e.preventDefault();
  };

  const row = ({ n, depth }: Row) => {
    const kids = n.children.length > 0;
    const isOpen = fq ? n.children.some(anyHit) : open.has(n.key);
    const [no, name] = splitNo(n.label);
    const pinned = pref.pins.includes(n.key);
    const isSel = n.key === sel;
    const s = stats.get(n.key);
    return (
      <div key={n.key} data-k={n.key} role="treeitem" aria-level={depth + 1} aria-selected={isSel} aria-expanded={kids ? isOpen : undefined}
        tabIndex={isSel || (!sel && depth === 0 && n === grade.children[0]) ? 0 : -1}
        className={`ct-row ct-${n.kind}${isSel ? ' sel' : ''}${selPath.has(n.key) && !isSel ? ' anc' : ''}${n.count ? '' : ' is-zero'}`}
        style={{ ['--d' as string]: depth }} title={n.label}
        onClick={() => pick(n.key)} onDoubleClick={() => kids && toggle(n.key)}
        onMouseEnter={(e) => showCard(e.currentTarget, n.key)} onMouseLeave={hideCard}>
        {Array.from({ length: depth }, (_, g) => <i key={g} className="ct-guide" style={{ ['--g' as string]: g }} />)}
        {n.kind !== 'form' && <span className={`ct-tw${kids ? '' : ' leaf'}`} onClick={(e) => { e.stopPropagation(); if (kids) toggle(n.key); }}>{kids && <Ico d={CHEV} cls={isOpen ? 'open' : ''} />}</span>}
        {n.kind === 'chapter' ? <span className="ct-chip">{n.label.startsWith('Chuyên') ? `CĐ${no}` : no || '•'}</span> : no ? <span className="ct-no">{no}.</span> : null}
        <span className="ct-nm"><span className="ct-tx">{mark(name, fq)}</span>{n.kind === 'chapter' && pref.bars && <LvBar s={s} />}</span>
        <button type="button" tabIndex={-1} className={`ct-pin${pinned ? ' on' : ''}`} aria-label={`${pinned ? 'Bỏ ghim' : 'Ghim'} ${n.label}`} onClick={(e) => { e.stopPropagation(); togglePin(n.key); }}><Ico d={STAR} /></button>
        <span className="ct-ct">{nf.format(n.count)}</span>
      </div>
    );
  };

  const shortcut = (key: string, label: string, n: number, icon: ReactNode, on: boolean, act: () => void, warn = false) => (
    <div key={key} data-k={key} role="treeitem" aria-selected={on} tabIndex={-1} className={`ct-row ct-sc${on ? ' sel' : ''}${warn && n ? ' warn' : ''}`} onClick={act}>
      <Ico d={icon} cls="lead" /><span className="ct-nm"><span className="ct-tx">{label}</span></span><span className="ct-ct">{nf.format(n)}</span>
    </div>
  );

  const pins = pref.pins.map((k) => index.get(k)).filter((x): x is NonNullable<typeof x> => !!x);
  const grades = fq ? tree.filter(anyHit) : [grade];
  const cardNode = card ? index.get(card.key)?.n : undefined;
  const cardStat = card ? stats.get(card.key) : undefined;

  return (
    <div className={`ctree${off ? ' is-off' : ''}`} ref={rootRef}>
      <div className="ct-top">
        {tree.length > 1 && (
          <div className="ct-grades" role="tablist" aria-label="Chọn lớp">
            {tree.map((g) => (
              <button key={g.key} type="button" role="tab" aria-selected={g.key === grade.key} onClick={() => { upd({ grade: g.key }); onPick(g.path); }}>
                <span>{g.label}</span><small>{nf.format(g.count)}</small>
              </button>
            ))}
          </div>
        )}
        <div className="ct-find">
          <label><Ico d={SEARCH} /><input value={q} onChange={(e) => { hideCard(); setQ(e.target.value); }} placeholder="Lọc chương, bài, dạng…" aria-label="Lọc mục lục"
            onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); e.stopPropagation(); } if (e.key === 'ArrowDown') { e.preventDefault(); bodyRef.current?.querySelector<HTMLElement>('[data-k]')?.focus(); } }} />
            {q && <button type="button" className="ct-clear" aria-label="Xoá chữ lọc" onClick={() => setQ('')}><Ico d={X} /></button>}</label>
          <button type="button" className="ct-more" aria-label="Tuỳ chọn mục lục" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><Ico d={MORE} /></button>
          {menu && (
            <div className="ct-menu" role="menu" onMouseLeave={() => setMenu(false)}>
              <button type="button" role="menuitem" onClick={() => { setOpenS(new Set([...open, ...grade.children.flatMap((c) => c.kind === 'branch' ? c.children.map((x) => x.key) : [c.key])])); setMenu(false); }}>Mở hết chương</button>
              <button type="button" role="menuitem" onClick={() => { setOpenS(new Set([...selPath])); setMenu(false); }}>Thu gọn tất cả</button>
              <hr />
              <button type="button" role="menuitemcheckbox" aria-checked={pref.hideEmpty} onClick={() => upd({ hideEmpty: !pref.hideEmpty })}><Ico d={CHECK} cls="chk" />Ẩn mục chưa có câu</button>
              <button type="button" role="menuitemcheckbox" aria-checked={pref.bars} onClick={() => upd({ bars: !pref.bars })}><Ico d={CHECK} cls="chk" />Hiện phân bố mức độ</button>
            </div>
          )}
        </div>
      </div>

      <div className="ct-body" ref={bodyRef} role="tree" aria-label="Mục lục chương trình" onKeyDown={onKey} onScroll={hideCard}>
        {off && <p className="ct-note" role="note">Đang tìm trong toàn kho nên mục lục tạm không áp dụng.</p>}
        {!fq && <>
          <div className="ct-sec">Lối tắt</div>
          {shortcut('all', 'Toàn bộ ngân hàng', total, TRAY, !!allOn && !sel && noId?.sel == null, () => onPick(null))}
          {noId && shortcut('noid', 'Chưa có ID', noId.total, TAG, noId.sel != null, () => noId.onPick('all'), true)}
          {pins.length > 0 && <div className="ct-sec">Đã ghim</div>}
          {pins.map(({ n, grade: g }) => (
            <div key={`pin-${n.key}`} data-k={n.key} role="treeitem" aria-selected={n.key === sel} tabIndex={-1} className={`ct-row ct-sc ct-pinrow${n.key === sel ? ' sel' : ''}`} onClick={() => onPick(n.path)} title={n.label}>
              <Ico d={STAR} cls="lead star" />
              <span className="ct-nm"><span className="ct-tx">{n.label}</span><span className="ct-sub">{index.get(g)?.n.label}</span></span>
              <button type="button" tabIndex={-1} className="ct-pin on" aria-label={`Bỏ ghim ${n.label}`} onClick={(e) => { e.stopPropagation(); togglePin(n.key); }}><Ico d={X} /></button>
              <span className="ct-ct">{nf.format(n.count)}</span>
            </div>
          ))}
        </>}
        {grades.map((g) => (
          <div key={g.key}>
            <div className="ct-sec ct-gh"><span className={g.key === sel ? 'gsel' : ''} onClick={() => onPick(g.path)}>{g.label}{fq ? '' : ' · cả lớp'}</span></div>
            {groupsOf(g).map(({ b, rows }) => {
              if (b && (fq ? !rows.length : pref.hideEmpty && !b.count)) return null;
              const closed = b ? pref.closed.includes(b.key) && !fq : false;
              return (
                <section key={b?.key ?? 'all'} className={`ct-branch${b && !b.count ? ' is-zero' : ''}`}>
                  {b && (
                    <div data-k={b.key} role="treeitem" aria-level={0} aria-expanded={!closed} aria-selected={b.key === sel} tabIndex={-1} className={`ct-bh${b.key === sel ? ' sel' : ''}`} onClick={() => onPick(b.path)}>
                      <span className="ct-tw" onClick={(e) => { e.stopPropagation(); upd({ closed: closed ? pref.closed.filter((x) => x !== b.key) : [...pref.closed, b.key] }); }}><Ico d={CHEV} cls={closed ? '' : 'open'} /></span>
                      <span className="ct-bl">{b.label.replace(/ \/ /g, ' · ')}</span><span className="ct-ct">{nf.format(b.count)}</span>
                    </div>
                  )}
                  {rows.map(row)}
                </section>
              );
            })}
          </div>
        ))}
        {fq && !grades.length && <p className="ct-empty">Không có mục nào khớp “{q}”</p>}
      </div>

      <div className="ct-foot" aria-hidden="true">{LV.map(([k, l]) => <span key={k}><i className={`lv-${k}`} />{l}</span>)}</div>

      {card && cardNode && (
        <div className="ct-card" role="tooltip" style={{ top: card.top }}>
          <div className="ct-card-title">{cardNode.label}</div>
          {(() => {
            const tot = cardStat ? cardStat.lv.reduce((a, b) => a + b, 0) : 0;
            if (!tot) return <div className="ct-card-empty">Chưa có câu nào ở mục này.</div>;
            return <>
              <div className="ct-card-total"><b>{nf.format(tot)}</b> câu{cardNode.children.length ? ` · ${cardNode.children.length} ${{ grade: 'mục', branch: 'chương', chapter: 'bài', lesson: 'dạng', form: '' }[cardNode.kind]}` : ''}</div>
              <LvBar s={cardStat} big />
              <div className="ct-card-lv">{LV.map(([k, l], i) => <span key={k}><i className={`lv-${k}`} />{l}<b>{nf.format(cardStat!.lv[i])}</b><em>{Math.round(cardStat!.lv[i] * 100 / tot)}%</em></span>)}</div>
              <div className="ct-card-q">
                <span className={cardStat!.noSol ? 'w' : ''}>Thiếu lời giải<b>{nf.format(cardStat!.noSol)}</b></span>
                <span>Đã duyệt<b>{nf.format(cardStat!.approved)}</b></span>
              </div>
            </>;
          })()}
        </div>
      )}
    </div>
  );
}

function mark(text: string, fq: string): ReactNode {
  if (!fq) return text;
  const i = fold(text).indexOf(fq);
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + fq.length)}</mark>{text.slice(i + fq.length)}</>;
}

