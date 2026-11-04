// Hai hộp dùng Kho hình từ các màn soạn: "Chèn hình từ Kho" (chọn một hình rồi chèn vào chỗ con trỏ) và
// "Lưu hình vào Kho" (lấy hình TikZ có sẵn trong câu đang soạn đưa vào Kho). Chỉ có ở bản cài Windows (Kho nằm trên máy).
import { useEffect, useMemo, useRef, useState } from 'react';
import { khoCay, khoLay, khoThem, khoTim, khoTrangThai, KHO_LOAI, loaiText, type KhoMuc, type KhoNut, type KhoTrangThai } from '../lib/khohinh';
import { defsOf, suggestTitle, tikzBlocks } from '../lib/khochen';
import { KhoThumb } from './KhoThumb';

const PER = 24;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Danh sách mục dạng phẳng có thụt đầu dòng (bỏ gốc duy nhất là tên thư viện). */
function flatNodes(ns: readonly KhoNut[]): { id: string; label: string }[] {
  const kids = new Map<string | null, KhoNut[]>();
  for (const n of ns) { const k = n.parent_id ?? null; const a = kids.get(k); if (a) a.push(n); else kids.set(k, [n]); }
  const walk = (p: string | null, d: number): { id: string; label: string }[] => (kids.get(p) ?? []).flatMap((n) => [{ id: n.id, label: `${'  '.repeat(d)}${n.name}` }, ...walk(n.id, d + 1)]);
  const roots = kids.get(null) ?? [];
  return roots.length === 1 ? walk(roots[0].id, 0) : walk(null, 0);
}

function Frame({ title, onClose, foot, children }: { title: string; onClose(): void; foot: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: 860, width: 'min(860px, 94vw)' }}>
        <h3>{title}</h3>
        <div className="cfm-body">{children}</div>
        <div className="cfm-acts">{foot}</div>
      </div>
    </>
  );
}

export interface KhoPicked { title: string; code: string; extra_preamble: string }

/** Chọn một hình trong Kho. Gọi `onPick` với mã đầy đủ khi bấm "Chèn hình này". */
export function KhoPicker({ onPick, onClose }: { onPick(h: KhoPicked): void; onClose(): void }) {
  const [st, setSt] = useState<KhoTrangThai | null>(null);
  const [cay, setCay] = useState<KhoNut[]>([]);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [node, setNode] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(0);
  const [res, setRes] = useState<{ tong: number; muc: KhoMuc[] }>({ tong: 0, muc: [] });
  const [codes, setCodes] = useState<ReadonlyMap<string, { code: string; defs: string }>>(new Map());
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const nodes = useMemo(() => flatNodes(cay), [cay]);

  useEffect(() => { khoTrangThai().then(setSt).catch((e) => setErr(msg(e))); khoCay().then(setCay).catch(() => undefined); }, []);
  useEffect(() => { const t = window.setTimeout(() => setQ(text), 250); return () => window.clearTimeout(t); }, [text]);
  useEffect(() => { setPage(0); }, [q, node, kind]);
  useEffect(() => {
    if (!st?.co) return;
    const my = ++seq.current;
    khoTim({ q, node: node || null, kind: kind || null, offset: page * PER, limit: PER })
      .then((r) => { if (my === seq.current) { setRes(r); setErr(null); } })
      .catch((e) => { if (my === seq.current) setErr(msg(e)); });
  }, [st, q, node, kind, page]);
  // mã đầy đủ của các hình đang hiện (danh sách tìm chỉ trả thông tin nhẹ)
  useEffect(() => {
    let dead = false;
    const need = res.muc.filter((m) => !codes.has(m.id));
    if (!need.length) return;
    Promise.all(need.map((m) => khoLay(m.id))).then((hs) => {
      if (dead) return;
      setCodes((old) => { const n = new Map(old); for (const h of hs) if (h) n.set(h.id, { code: h.code, defs: h.extra_preamble }); return n; });
    }).catch(() => undefined);
    return () => { dead = true; };
  }, [res, codes]);

  const pages = Math.max(1, Math.ceil(res.tong / PER));
  const chosen = res.muc.find((m) => m.id === sel) ?? null;
  const insert = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const h = await khoLay(chosen.id);
      if (!h) { setErr('Hình không còn trong Kho.'); return; }
      onPick({ title: h.title, code: h.code, extra_preamble: h.extra_preamble });
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };

  return (
    <Frame title="Chèn hình từ Kho hình" onClose={onClose} foot={<>
      <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>
      <button type="button" className="btn btn-accent" disabled={!chosen || busy} onClick={() => { void insert(); }}>{chosen ? `Chèn “${chosen.title.slice(0, 40)}”` : 'Chọn một hình'}</button>
    </>}>
      {err && <p className="te-bad" role="alert">{err}</p>}
      {st && !st.co && <p>Kho hình chưa có hình nào. Nạp kho ở Cài đặt › Dữ liệu và sao lưu › Kho hình TikZ, hoặc thêm hình ở màn Kho hình.</p>}
      {(!st || st.co) && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input className="xl-in" style={{ flex: '1 1 220px' }} type="search" placeholder="Tìm hình (không cần gõ dấu)…" value={text} autoFocus onChange={(e) => setText(e.target.value)} aria-label="Tìm hình" />
            <select className="xl-in" value={node} onChange={(e) => setNode(e.target.value)} aria-label="Mục">
              <option value="">Mọi mục</option>{nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
            <select className="xl-in" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Loại hình">
              <option value="">Mọi loại</option>{Object.keys(KHO_LOAI).map((k) => <option key={k} value={k}>{loaiText(k)}</option>)}
            </select>
          </div>
          <div className="kh-grid" style={{ maxHeight: '52vh', overflow: 'auto' }} role="listbox" aria-label="Kết quả tìm hình">
            {res.muc.map((m) => {
              const c = codes.get(m.id);
              return (
                <button key={m.id} type="button" role="option" aria-selected={sel === m.id} className={`kh-card${sel === m.id ? ' sel' : ''}`} onClick={() => setSel(m.id)} onDoubleClick={() => { setSel(m.id); }} title={m.title}>
                  {c ? <KhoThumb id={m.id} code={c.code} defs={c.defs} /> : <div className="kh-thumb"><span className="kh-thumb-wait" /></div>}
                  <span className="kh-title">{m.title}</span>
                </button>
              );
            })}
            {!res.muc.length && st?.co && <p className="xl-meta">Không có hình nào khớp.</p>}
          </div>
          <nav className="pager" aria-label="Phân trang" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-sm" disabled={page <= 0} onClick={() => setPage(page - 1)}>‹ Trước</button>
            <span>Trang <b>{page + 1}</b> / {pages} · {res.tong.toLocaleString('vi-VN')} hình</span>
            <button type="button" className="btn btn-sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Sau ›</button>
          </nav>
        </>
      )}
    </Frame>
  );
}

/** Lưu một hình TikZ có trong `latex` vào Kho (người dùng chọn hình, tên, mục). Kho tự báo nếu hình đã có. */
export function KhoSaveDialog({ latex, stem, seq, onClose, onDone }: { latex: string; stem: string; seq?: number; onClose(): void; onDone(msg: string): void }) {
  const blocks = useMemo(() => tikzBlocks(latex), [latex]);
  const defs = useMemo(() => defsOf(latex), [latex]);
  const [cay, setCay] = useState<KhoNut[]>([]);
  const [pick, setPick] = useState(0);
  const [title, setTitle] = useState(() => suggestTitle(stem, seq));
  const [node, setNode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nodes = useMemo(() => flatNodes(cay), [cay]);
  useEffect(() => { khoCay().then((c) => { setCay(c); const f = flatNodes(c); setNode((n) => n || f[0]?.id || ''); }).catch((e) => setErr(msg(e))); }, []);

  const save = async () => {
    const b = blocks[pick];
    if (!b || !node || !title.trim()) return;
    setBusy(true); setErr(null);
    try {
      await khoThem({ node_id: node, title: title.trim(), code: b.code, extra_preamble: defs });
      onDone(`Đã lưu hình “${title.trim()}” vào Kho hình.`);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };

  return (
    <Frame title="Lưu hình vào Kho hình" onClose={onClose} foot={<>
      <button type="button" className="btn btn-outline" onClick={onClose}>Huỷ</button>
      <button type="button" className="btn btn-accent" disabled={busy || !blocks.length || !node || !title.trim()} onClick={() => { void save(); }}>Lưu vào Kho</button>
    </>}>
      {err && <p className="te-bad" role="alert">{err}</p>}
      {!blocks.length && <p>Câu này chưa có hình TikZ (khối <code>\begin{'{tikzpicture}'}</code>) để lưu.</p>}
      {blocks.length > 0 && (
        <>
          {blocks.length > 1 && (
            <div role="radiogroup" aria-label="Chọn hình" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {blocks.map((b, i) => <label key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" name="khoblk" checked={pick === i} onChange={() => setPick(i)} />Hình {i + 1} (dòng {b.line})</label>)}
            </div>
          )}
          <div style={{ maxHeight: 240, overflow: 'auto', marginBottom: 10 }}><KhoThumb key={pick} id={`save-${pick}`} code={blocks[pick].code} defs={defs} big /></div>
          <label className="xm-field">Tên hình <input className="xl-in" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="xm-field">Lưu vào mục
            <select className="xl-in" value={node} onChange={(e) => setNode(e.target.value)}>{nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select>
          </label>
          <p className="te-note">Hình (kèm các khai báo \def/\newcommand đi cùng) được chép vào Kho; câu hỏi không bị đổi. Nếu hình đã có trong Kho, HEdu báo và không thêm bản trùng.</p>
        </>
      )}
    </Frame>
  );
}
