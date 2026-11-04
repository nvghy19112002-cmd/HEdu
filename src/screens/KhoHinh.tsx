// Màn Kho hình TikZ (bước 2): cây Lớp › Chương › Bài, ô tìm không dấu, lọc loại/lớp/trạng thái dịch, lưới ảnh thu nhỏ vẽ khi cuộn tới,
// cửa sổ xem hình (mã, sao chép, sửa, xoá vào thùng rác/khôi phục), thêm hình mới, quản lý mục cây.
// Dữ liệu ở tệp riêng kho-hinh.db (Rust khohinh.rs), tách khỏi ngân hàng câu hỏi. Nguồn MathHub chỉ nằm trên máy.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExamTree } from '../components/ExamTree';
import { KhoHinhPanel } from '../components/KhoHinhPanel';
import { KhoThumb, type ThumbResult } from '../components/KhoThumb';
import { KhoHinhGiong, KhoQuetNen } from '../components/KhoCongCu';
import { IcPlus } from '../components/Icons';
import {
  KHO_LOAI, khoCay, khoDatTrangThai, khoLay, khoNutDoiTen, khoNutThem, khoNutXoa, khoSua, khoThem, khoTim, khoTrangThai, khoXoa, loaiText,
  type KhoHinh, type KhoKetQua, type KhoMuc, type KhoNut, type KhoTrangThai,
} from '../lib/khohinh';
import { isDesktop } from '../lib/platform';
import type { ExamNode } from '../lib/examtree';

const nf = new Intl.NumberFormat('vi-VN');
const msg = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e));
const PER_PAGE = 48;
const LOP = ['10', '11', '12'];
const STATUS_TEXT: Record<string, string> = { chua: 'Chưa dịch', ok: 'Dịch được', loi: 'Dịch lỗi' };

/** Cây phẳng từ Rust → cây hiển thị. Gốc duy nhất (tên thư viện) được bỏ qua; mục sâu từ cấp 3 coi như "bài". */
function buildTree(ns: readonly KhoNut[]): { tree: ExamNode[]; rootId: string | null } {
  const kids = new Map<string | null, KhoNut[]>();
  for (const n of ns) { const k = n.parent_id ?? null; const a = kids.get(k); if (a) a.push(n); else kids.set(k, [n]); }
  const build = (n: KhoNut, depth: number): ExamNode => ({
    key: n.id, label: n.name, kind: depth === 0 ? 'grade' : depth === 1 ? 'chapter' : 'lesson', count: n.dem,
    children: (kids.get(n.id) ?? []).map((c) => build(c, depth + 1)),
  });
  const roots = kids.get(null) ?? [];
  if (roots.length === 1) return { tree: (kids.get(roots[0].id) ?? []).map((c) => build(c, 0)), rootId: roots[0].id };
  return { tree: roots.map((r) => build(r, 0)), rootId: null };
}

/** Danh sách mục dạng phẳng có thụt đầu dòng (cho ô chọn mục). */
function flat(tree: readonly ExamNode[], depth = 0): { id: string; label: string }[] {
  return tree.flatMap((n) => [{ id: n.key, label: `${' '.repeat(depth)}${n.label}` }, ...flat(n.children, depth + 1)]);
}

function Modal({ title, onClose, wide, children, foot }: { title: React.ReactNode; onClose(): void; wide?: boolean; children: React.ReactNode; foot?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.cfm')) { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="qm-scrim" onClick={onClose} />
      <div className={`qm xm${wide ? '' : ' xm-sm'}`} role="dialog" aria-modal="true">
        <div className="qm-head"><div className="xm-title">{title}</div><button type="button" className="btn btn-sm qm-x" aria-label="Đóng (Esc)" onClick={onClose}>✕</button></div>
        <div className="qm-body">{children}</div>
        {foot && <div className="qm-foot">{foot}</div>}
      </div>
    </>
  );
}

/** Xem / sửa một hình, hoặc thêm hình mới (id = null). */
function HinhDialog({ id, nodes, defaultNode, onClose, onChanged }: { id: string | null; nodes: { id: string; label: string }[]; defaultNode: string | null; onClose(): void; onChanged(): void }) {
  const { toast } = useApp();
  const moi = id === null;
  const [h, setH] = useState<KhoHinh | null>(null);
  const [f, setF] = useState({ title: '', code: '', extra: '', grades: '', topics: '', kind: '', node: defaultNode ?? nodes[0]?.id ?? '' });
  const [shown, setShown] = useState({ code: '', extra: '' });
  const [again, setAgain] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<ThumbResult | null>(null);

  useEffect(() => {
    if (id === null) return;
    khoLay(id).then((x) => {
      if (!x) { setErr('Hình này không còn trong kho.'); return; }
      setH(x);
      setF({ title: x.title, code: x.code, extra: x.extra_preamble, grades: x.grades, topics: x.topics, kind: x.kind, node: x.node_id });
      setShown({ code: x.code, extra: x.extra_preamble });
    }).catch((e) => setErr(msg(e)));
  }, [id]);

  const dirty = moi ? !!f.code.trim() : !!h && (f.title !== h.title || f.code !== h.code || f.extra !== h.extra_preamble || f.grades !== h.grades || f.topics !== h.topics || f.kind !== h.kind || f.node !== h.node_id);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    if (moi) {
      await khoThem({ node_id: f.node, title: f.title, code: f.code, extra_preamble: f.extra, grades: f.grades, topics: f.topics, kind: f.kind || null });
      toast('Đã thêm hình vào kho.');
    } else if (id) {
      await khoSua(id, { title: f.title, code: f.code, extra_preamble: f.extra, grades: f.grades, topics: f.topics, kind: f.kind, node_id: f.node });
      toast('Đã lưu hình.');
    }
    onChanged(); onClose();
  });
  const del = (xoa: boolean) => run(async () => {
    if (!id) return;
    await khoXoa([id], xoa);
    toast(xoa ? 'Đã chuyển hình vào thùng rác của kho. Khôi phục được ở nút “Thùng rác”.' : 'Đã khôi phục hình.');
    onChanged(); onClose();
  });
  const copy = async () => {
    try { await navigator.clipboard.writeText(f.code); toast('Đã sao chép mã hình.'); } catch { toast('Không sao chép được tự động. Bôi đen mã rồi Ctrl+C.'); }
  };
  const draw = () => { setShown({ code: f.code, extra: f.extra }); setAgain((n) => n + 1); };

  return (
    <Modal wide onClose={onClose} title={<b>{moi ? 'Thêm hình vào kho' : h ? h.title : 'Đang đọc…'}</b>}
      foot={<>
        {!moi && h && (h.da_xoa
          ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => del(false)}>Khôi phục từ thùng rác</button>
          : <button type="button" className="btn btn-sm btn-danger-soft" disabled={busy} onClick={() => del(true)}>Chuyển vào thùng rác</button>)}
        <span className="qm-nav">
          <button type="button" className="btn btn-sm" onClick={() => void copy()}>Sao chép mã</button>
          <button type="button" className="btn btn-sm btn-accent" disabled={busy || !dirty || (!moi && !!h?.da_xoa)} onClick={() => void save()}>{moi ? 'Thêm vào kho' : 'Lưu thay đổi'}</button>
        </span>
      </>}>
      {err && <div className="note bad" role="alert"><div className="note-body">{err}</div></div>}
      {(moi || h) && (
        <div className="kh-dlg">
          <div className="kh-dlg-view">
            {shown.code.trim()
              ? <KhoThumb key={`${id ?? 'moi'}`} id={id ?? 'moi'} code={shown.code} defs={shown.extra} big again={again} onResult={setRes} />
              : <div className="kh-thumb big"><span className="kh-thumb-wait">Dán mã TikZ rồi bấm “Vẽ thử”</span></div>}
            <div className="head-actions">
              <button type="button" className="btn btn-sm" disabled={!f.code.trim()} onClick={draw}>Vẽ thử</button>
              {res && <span className={`kh-chip ${res.ok ? 'ok' : 'bad'}`}>{res.ok ? 'Dịch được' : 'Dịch lỗi'}</span>}
              {!moi && h && <span className="xl-meta">{h.nguon === 'nguoi-dung' ? 'Hình bạn thêm' : 'Từ kho MathHub'}{h.edited ? ' · đã sửa' : ''}{h.da_xoa ? ' · đang ở thùng rác' : ''}</span>}
            </div>
          </div>
          <div className="kh-dlg-form">
            <label className="xm-field">Tên hình <input className="xl-in" value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
            <label className="xm-field">Mục
              <select className="xl-in" value={f.node} onChange={(e) => setF({ ...f, node: e.target.value })}>
                {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </label>
            <div className="kh-row2">
              <label className="xm-field">Loại
                <select className="xl-in" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                  {moi && <option value="">Tự nhận theo mã</option>}
                  {Object.entries(KHO_LOAI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="xm-field">Lớp <input className="xl-in" value={f.grades} placeholder="10, 11, 12" maxLength={40} onChange={(e) => setF({ ...f, grades: e.target.value })} /></label>
            </div>
            <label className="xm-field">Chủ đề (cách nhau bằng dấu phẩy) <input className="xl-in" value={f.topics} onChange={(e) => setF({ ...f, topics: e.target.value })} /></label>
            <label className="xm-field">Mã TikZ
              <textarea className="xl-in kh-code" value={f.code} spellCheck={false} rows={11} onChange={(e) => setF({ ...f, code: e.target.value })} />
            </label>
            <details>
              <summary>Khai báo bổ sung (gói, thư viện TikZ riêng của hình){f.extra.trim() ? ' · có' : ''}</summary>
              <textarea className="xl-in kh-code" value={f.extra} spellCheck={false} rows={4} onChange={(e) => setF({ ...f, extra: e.target.value })} />
            </details>
            {!moi && h && h.err && <p className="xl-meta">Lần dịch trước báo: {h.err}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Thêm mục con hoặc đổi tên một mục. */
function NutDialog({ mode, name, onClose, onSave }: { mode: 'them' | 'ten'; name: string; onClose(): void; onSave(name: string): Promise<void> }) {
  const [v, setV] = useState(name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => { if (busy) return; setBusy(true); setErr(null); try { await onSave(v); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  return (
    <Modal onClose={onClose} title={<b>{mode === 'them' ? 'Thêm mục' : 'Đổi tên mục'}</b>} foot={<span className="qm-nav">
      <button type="button" className="btn btn-outline" onClick={onClose}>Huỷ</button>
      <button type="button" className="btn btn-accent" disabled={busy || !v.trim()} onClick={() => void go()}>{mode === 'them' ? 'Thêm mục' : 'Lưu tên'}</button>
    </span>}>
      <label className="xm-field">Tên mục <input className="xl-in" autoFocus value={v} maxLength={120} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void go(); }} /></label>
      {err && <p className="xl-meta" role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
    </Modal>
  );
}

export function KhoHinhScreen() {
  const { toast } = useApp();
  const desktop = isDesktop();
  const [st, setSt] = useState<KhoTrangThai | null>(null);
  const [cay, setCay] = useState<KhoNut[]>([]);
  const [node, setNode] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [lop, setLop] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [trash, setTrash] = useState(false);
  const [page, setPage] = useState(0);
  const [res, setRes] = useState<KhoKetQua>({ tong: 0, muc: [] });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<{ id: string | null } | null>(null);
  const [nutDlg, setNutDlg] = useState<null | 'them' | 'ten'>(null);
  const [askNut, setAskNut] = useState(false);
  const [menu, setMenu] = useState(false);
  const [tool, setTool] = useState<null | 'quet' | 'giong'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [codes, setCodes] = useState<ReadonlyMap<string, { code: string; defs: string }>>(new Map());

  const { tree, rootId } = useMemo(() => buildTree(cay), [cay]);
  const nodes = useMemo(() => flat(tree), [tree]);
  const nodeName = useMemo(() => cay.find((n) => n.id === node)?.name ?? null, [cay, node]);

  const reloadMeta = useCallback(() => {
    khoTrangThai().then(setSt).catch((e) => setErr(msg(e)));
    khoCay().then(setCay).catch((e) => setErr(msg(e)));
  }, []);
  useEffect(() => { if (desktop) reloadMeta(); }, [desktop, reloadMeta]);
  // ô tìm: chờ ngừng gõ 250 ms
  useEffect(() => { const t = window.setTimeout(() => setQ(text), 250); return () => window.clearTimeout(t); }, [text]);
  useEffect(() => { setPage(0); }, [q, node, kind, lop, status, trash]);

  const seq = useRef(0);
  const load = useCallback(() => {
    if (!desktop) return;
    const my = ++seq.current;
    setLoading(true);
    khoTim({ q, node, kind, lop, status, thungRac: trash, offset: page * PER_PAGE, limit: PER_PAGE })
      .then((r) => { if (my === seq.current) { setRes(r); setErr(null); } })
      .catch((e) => { if (my === seq.current) setErr(msg(e)); })
      .finally(() => { if (my === seq.current) setLoading(false); });
  }, [desktop, q, node, kind, lop, status, trash, page]);
  useEffect(() => { load(); }, [load]);

  // mã của các hình đang hiện (ảnh thu nhỏ cần mã đầy đủ; danh sách tìm chỉ trả thông tin nhẹ)
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

  // kết quả dịch thử ghi về kho theo lô (mỗi 1,5 giây)
  const pend = useRef(new Map<string, { status: 'ok' | 'loi'; err: string }>());
  const timer = useRef<number | null>(null);
  const flush = useCallback(() => {
    timer.current = null;
    const items = [...pend.current].map(([id, v]) => ({ id, status: v.status, err: v.err }));
    pend.current.clear();
    if (items.length) void khoDatTrangThai(items).catch(() => undefined);
  }, []);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); flush(); }, [flush]);
  const onThumb = useCallback((r: ThumbResult) => {
    pend.current.set(r.id, { status: r.ok ? 'ok' : 'loi', err: r.err });
    setRes((o) => ({ ...o, muc: o.muc.map((m) => (m.id === r.id ? { ...m, status: r.ok ? 'ok' : 'loi' } : m)) }));
    if (!timer.current) timer.current = window.setTimeout(flush, 1500);
  }, [flush]);

  const changed = () => { reloadMeta(); load(); };
  const pages = Math.max(1, Math.ceil(res.tong / PER_PAGE));
  const cur = Math.min(page, pages - 1);
  const nFilters = (kind ? 1 : 0) + (lop ? 1 : 0) + (status ? 1 : 0);
  const clearAll = () => { setText(''); setKind(null); setLop(null); setStatus(null); setNode(null); };
  const empty = st && !st.co;

  const addNode = async (name: string) => { await khoNutThem(node ?? rootId, name); setNutDlg(null); reloadMeta(); toast('Đã thêm mục.'); };
  const renameNode = async (name: string) => { if (!node) return; await khoNutDoiTen(node, name); setNutDlg(null); reloadMeta(); load(); toast('Đã đổi tên mục.'); };
  const delNode = async () => {
    setAskNut(false);
    if (!node) return;
    try { await khoNutXoa(node); setNode(null); reloadMeta(); toast('Đã xoá mục.'); } catch (e) { toast(msg(e)); }
  };

  return (
    <>
      <header className="page-head bank-head">
        <h1>Kho hình TikZ</h1>
        <div className="head-actions">
          <button type="button" className={`btn btn-outline${trash ? ' on' : ''}`} aria-pressed={trash} disabled={!desktop || !st || (st.thung_rac === 0 && !trash)} onClick={() => setTrash(!trash)}>
            {trash ? '← Về kho hình' : `Thùng rác${st && st.thung_rac ? ` (${nf.format(st.thung_rac)})` : ''}`}
          </button>
          <span className="xl-menu">
            <button type="button" className="btn btn-outline" disabled={!desktop || !st?.co} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>Mục ▾</button>
            {menu && (
              <span className="more-menu xl-pop" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setNutDlg('them'); }}><b>Thêm mục{nodeName ? ' con' : ''}</b><small>{nodeName ? `Trong “${nodeName}”` : 'Ở cấp ngoài cùng'}</small></button>
                <button type="button" role="menuitem" disabled={!node} onClick={() => { setMenu(false); setNutDlg('ten'); }}><b>Đổi tên mục đang chọn</b></button>
                <button type="button" role="menuitem" disabled={!node} onClick={() => { setMenu(false); setAskNut(true); }}><b>Xoá mục đang chọn</b><small>Chỉ xoá được mục trống</small></button>
                <hr />
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setTool('quet'); }}><b>Quét nền: dịch thử cả kho</b><small>Ghi Dịch được / Dịch lỗi cho mọi hình chưa dịch</small></button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setTool('giong'); }}><b>Tìm hình giống nhau</b><small>Chỉ khác số liệu, khoảng trắng, chú thích</small></button>
              </span>
            )}
          </span>
          <button type="button" className="btn btn-accent" disabled={!desktop || !st?.co || nodes.length === 0} onClick={() => setOpen({ id: null })}><IcPlus /> Thêm hình</button>
        </div>
      </header>

      {!desktop && <div className="note warn xl-note" role="status"><div className="note-body"><b>Chỉ có trên app Windows</b><span>Kho hình lưu tệp riêng trên máy và dịch hình bằng TeX Live nên không dùng được ở bản xem thử trên trình duyệt.</span></div></div>}
      {err && <div className="note bad xl-note" role="alert"><div className="note-body"><b>Chưa đọc được kho hình</b><span>{err}</span></div></div>}

      {desktop && empty && (
        <div className="body-row"><div style={{ flex: 1, maxWidth: 760 }}>
          <div className="empty" role="status"><b>Kho hình chưa có hình nào.</b><span>Nạp kho hình MathHub (tệp .db) một lần là có đủ để tìm và dùng. Tệp gốc chỉ được đọc, không bị sửa.</span></div>
          <KhoHinhPanel />
        </div></div>
      )}

      {desktop && st?.co && (
        <div className="body-row">
          <aside className="fside" aria-label="Mục lục kho hình">
            <div className="fs-top"><h2>Mục lục</h2></div>
            <div className="fs-scroll">
              <ExamTree tree={tree} total={st.hinh} sel={node} showEmpty onShowEmpty={() => undefined} onPick={setNode} allLabel="Tất cả hình" emptySwitch={false} treeLabel="Cây kho hình" />
            </div>
          </aside>

          <section className="qlist" aria-label="Danh sách hình">
            <div className="qbar">
              <label className="search sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <span className="sr-only">Tìm hình</span>
                <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tìm theo tên, chủ đề, chương (không cần gõ dấu)…" />
              </label>
              <label className="qsel" title="Lớp">
                <select value={lop ?? ''} onChange={(e) => setLop(e.target.value || null)} aria-label="Lớp">
                  <option value="">Mọi lớp</option>{LOP.map((l) => <option key={l} value={l}>Lớp {l}</option>)}
                </select>
              </label>
              <label className="qsel" title="Trạng thái dịch (kết quả ghi nhận khi hình được vẽ)">
                <select value={status ?? ''} onChange={(e) => setStatus(e.target.value || null)} aria-label="Trạng thái dịch">
                  <option value="">Mọi trạng thái</option>{Object.entries(STATUS_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>

            <div className="kh-kinds" role="group" aria-label="Loại hình">
              <button type="button" className={kind === null ? 'on' : ''} aria-pressed={kind === null} onClick={() => setKind(null)}>Tất cả</button>
              {Object.entries(KHO_LOAI).map(([k, v]) => <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>{v}</button>)}
            </div>

            <div className="xl-crumb">
              <b>{trash ? 'Thùng rác của kho hình' : nodeName ?? 'Tất cả hình'}</b>
              <span className="xl-meta" role="status">{loading ? 'Đang tìm…' : `${nf.format(res.tong)} hình`}</span>
            </div>

            {!loading && res.tong === 0 && (
              <div className="empty" role="status">
                <b>{trash ? 'Thùng rác trống.' : nFilters || q || node ? 'Không có hình nào khớp.' : 'Chưa có hình nào.'}</b>
                {(nFilters > 0 || !!q || !!node) && <button type="button" className="btn btn-sm" onClick={clearAll}>Xoá bộ lọc</button>}
              </div>
            )}
            {res.muc.length > 0 && (
              <div className="kh-grid">
                {res.muc.map((m: KhoMuc) => {
                  const c = codes.get(m.id);
                  return (
                    <button key={m.id} type="button" className="kh-card" onClick={() => setOpen({ id: m.id })} title={m.title}>
                      {c ? <KhoThumb id={m.id} code={c.code} defs={c.defs} onResult={trash ? undefined : onThumb} /> : <div className="kh-thumb"><span className="kh-thumb-wait" /></div>}
                      <span className="kh-card-b">
                        <span className="kh-title">{m.title}</span>
                        <span className="kh-meta">
                          <span className="kh-chip">{loaiText(m.kind)}</span>
                          {m.grades && <span className="kh-chip">Lớp {m.grades.replace(/\s+/g, '')}</span>}
                          {m.status === 'loi' && <span className="kh-chip bad">Dịch lỗi</span>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {pages > 1 && (
              <nav className="pager" aria-label="Phân trang">
                <button type="button" className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹ Trước</button>
                <span>Trang <b>{cur + 1}</b> / {nf.format(pages)}</span>
                <button type="button" className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Sau ›</button>
              </nav>
            )}
          </section>
        </div>
      )}

      {open && <HinhDialog id={open.id} nodes={nodes} defaultNode={node && nodes.some((n) => n.id === node) ? node : null} onClose={() => setOpen(null)} onChanged={changed} />}
      {nutDlg === 'them' && <NutDialog mode="them" name="" onClose={() => setNutDlg(null)} onSave={addNode} />}
      {nutDlg === 'ten' && <NutDialog mode="ten" name={nodeName ?? ''} onClose={() => setNutDlg(null)} onSave={renameNode} />}
      {askNut && (
        <ConfirmDialog title="Xoá mục này?" confirmLabel="Xoá mục" cancelLabel="Giữ lại" onCancel={() => setAskNut(false)} onConfirm={() => void delNode()}>
          <p>Mục “{nodeName}” chỉ xoá được khi không còn mục con và không còn hình nào (kể cả trong thùng rác). Nếu còn, HEdu sẽ báo và không xoá gì.</p>
        </ConfirmDialog>
      )}
      {tool === 'quet' && <KhoQuetNen onClose={() => setTool(null)} onChanged={changed} />}
      {tool === 'giong' && <KhoHinhGiong onClose={() => setTool(null)} onChanged={changed} />}
    </>
  );
}
