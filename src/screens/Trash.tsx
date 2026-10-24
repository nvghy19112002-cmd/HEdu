// Màn Thùng rác (độc lập): danh sách tìm/lọc/chọn nhiều + khung xem câu, khôi phục / xoá hẳn / xuất .tex qua các hàm an toàn.
// Câu trong Thùng rác là BẢN SNAPSHOT tại lúc bị xoá — màn hình chỉ đọc, không sửa nội dung, không tự gán vị trí khác.
// Xử lý xung đột chi tiết, chọn lại vị trí, dọn sạch: PR-4.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportChoiceDialog } from '../components/ExportChoiceDialog';
import { TrashViewer } from '../components/TrashViewer';
import { decisionsLoaded, isDecisionsWritable, loadDecisions, TRASH_CAP, trashList, useDecisions } from '../lib/dupdecisions';
import { parseExTest } from '../lib/extest';
import { seqLabel } from '../lib/id';
import { addMany, pageState, removeMany, selCounts, toggleOne } from '../lib/selection';
import { plainSnippet } from '../lib/snippet';
import { useBank } from '../lib/store';
import { verbatimTex } from '../lib/texproject';
import { isTrashBusy, locationProblem, purgeAllTrash, purgeFromTrash, restoreBlockOf, restoreFromTrash, RESTORE_BLOCK_TEXT, type RestoreBlock } from '../lib/trashflow';
import { afterRemoval, buildRows, capacityNote, dateText, DATE_LABEL, DEFAULT_FILTER, filterRows, isDefaultFilter, pageOf, PAGE_SIZES, SORT_LABEL, STATUS_LABEL, type DateFilter, type SortMode, type StatusFilter, type TrashFilter, type TrashRow } from '../lib/trashview';
import { TYPE_LABEL, TYPES, type QType, type Question } from '../lib/types';

const nf = new Intl.NumberFormat('vi-VN');
type Load = 'loading' | 'ok' | 'error';
/** Dưới độ rộng này khung xem thay hẳn danh sách (ngăn toàn màn hình, có nút "← Về Thùng rác"). */
const WIDE = 1100;

export function TrashScreen() {
  const { toast, go, showFile } = useApp();
  const { questions } = useBank();
  const ver = useDecisions();
  const [load, setLoad] = useState<Load>(decisionsLoaded() ? 'ok' : 'loading');
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<TrashFilter>(DEFAULT_FILTER);
  const [typed, setTyped] = useState('');
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [ask, setAsk] = useState<null | { kind: 'purge'; uids: string[] } | { kind: 'restore'; uids: string[] } | { kind: 'purgeAll'; step: 1 | 2 }>(null);
  const [cmp, setCmp] = useState<TrashRow | null>(null);
  const [menu, setMenu] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const [exportQs, setExportQs] = useState<Question[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < WIDE);
  const busyRef = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<string | null>(null);

  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < WIDE);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  useEffect(() => {
    if (decisionsLoaded()) { setLoad(isDecisionsWritable() ? 'ok' : 'error'); if (!isDecisionsWritable()) setLoadErr('Tệp Thùng rác không đọc được nên HEdu chỉ cho xem, không ghi để tránh làm mất dữ liệu.'); return; }
    let live = true;
    void loadDecisions().then((r) => { if (!live) return; if (r.ok) setLoad('ok'); else { setLoad('error'); setLoadErr(r.error ?? 'Không đọc được tệp Thùng rác.'); } });
    return () => { live = false; };
  }, []);

  // ô tìm: debounce để gõ trong 1.000 câu không dựng lại danh sách mỗi phím
  useEffect(() => { const t = setTimeout(() => { setFilter((f) => (f.text === typed ? f : { ...f, text: typed })); setPage(0); }, 200); return () => clearTimeout(t); }, [typed]);

  const items = useMemo(() => trashList(), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => buildRows(items, questions, locationProblem), [items, questions]);
  const results = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const pg = pageOf(results, page, size);
  const resultUids = useMemo(() => new Set(results.map((r) => r.q.uid)), [results]);
  const pageUids = pg.items.map((r) => r.q.uid);
  const total = items.length;
  const counts = selCounts(sel, pageUids, resultUids);
  const allResultsSelected = results.length > 0 && results.every((r) => sel.has(r.q.uid));
  const ps = pageState(sel, pageUids);
  const note = capacityNote(total, TRASH_CAP);
  const readOnly = load === 'error';
  const bankByUid = useMemo(() => new Map(questions.map((q) => [q.uid, q] as const)), [questions]);
  const blockOf = (r: TrashRow): RestoreBlock | null => restoreBlockOf(r.q, bankByUid.get(r.q.uid));
  const active = useMemo(() => (activeUid ? rows.find((r) => r.q.uid === activeUid) ?? null : null), [rows, activeUid]);

  // bỏ khỏi ô chọn những câu không còn trong Thùng rác (đã khôi phục / xoá hẳn)
  useEffect(() => {
    const have = new Set(items.map((t) => t.q.uid));
    setSel((s) => { const keep = [...s].filter((u) => have.has(u)); return keep.length === s.size ? s : new Set(keep); });
  }, [items]);
  // câu đang xem rời Thùng rác ⇒ chuyển sang câu liền sau (hoặc liền trước), hết thì đóng khung xem
  useEffect(() => {
    if (activeUid && !items.some((t) => t.q.uid === activeUid)) {
      const n = nextRef.current;
      setActiveUid(n && items.some((t) => t.q.uid === n) ? n : null);
      nextRef.current = null;
    }
  }, [items, activeUid]);

  const setF = (p: Partial<TrashFilter>) => { setFilter((f) => ({ ...f, ...p })); setPage(0); };
  const clearFilter = () => { setTyped(''); setFilter(DEFAULT_FILTER); setPage(0); };
  const goPage = (p: number) => { setPage(p); topRef.current?.scrollIntoView({ block: 'start' }); };

  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setMsg(null);
    try { await fn(); } finally { busyRef.current = false; setBusy(false); }
  };

  const restore = (uids: string[]) => run(async () => {
    if (activeUid && uids.includes(activeUid)) nextRef.current = afterRemoval(results, activeUid);
    const r = await restoreFromTrash(uids);
    const lines = [r.message];
    for (const b of r.blocked.slice(0, 3)) lines.push(`${seqLabel(b.seq)}: ${RESTORE_BLOCK_TEXT[b.reason]}`);
    if (r.blocked.length > 3) lines.push(`… và ${r.blocked.length - 3} câu khác cần xử lý.`);
    setMsg({ ok: r.ok && r.blocked.length === 0 && r.strayInTrash.length === 0, text: lines.join(' ') });
    if (r.ok) toast(r.message);
  });
  const purge = (uids: string[]) => run(async () => {
    setAsk(null);
    if (activeUid && uids.includes(activeUid)) nextRef.current = afterRemoval(results, activeUid);
    const r = await purgeFromTrash(uids);
    if (r.ok) { setMsg({ ok: true, text: `Đã xoá vĩnh viễn ${nf.format(r.purged)} câu khỏi Thùng rác.` }); toast(`Đã xoá hẳn ${nf.format(r.purged)} câu khỏi Thùng rác.`); }
    else setMsg({ ok: false, text: r.message });
  });

  const purgeAll = () => run(async () => {
    setAsk(null);
    const r = await purgeAllTrash();
    if (r.ok) { setActiveUid(null); setSel(new Set()); setMsg({ ok: true, text: `Đã dọn sạch Thùng rác: xoá vĩnh viễn ${nf.format(r.purged)} câu. Ngân hàng không bị ảnh hưởng.` }); toast(`Đã dọn sạch Thùng rác (${nf.format(r.purged)} câu).`); }
    else setMsg({ ok: false, text: r.message });
  });
  /** Khôi phục nhiều câu: hỏi trước, nói rõ bao nhiêu câu làm được / bao nhiêu câu cần xử lý (giữ nguyên trong Thùng rác). */
  const restorePlan = (uids: readonly string[]) => {
    const set = new Set(uids);
    const rs = rows.filter((r) => set.has(r.q.uid));
    const blocked = rs.filter((r) => blockOf(r) !== null).length;
    return { total: rs.length, ready: rs.length - blocked, blocked };
  };
  const anyBusy = (uids: readonly string[]) => busy || uids.some((u) => isTrashBusy(u));
  const selectedQs = (): Question[] => rows.filter((r) => sel.has(r.q.uid)).map((r) => r.q).sort((a, b) => a.seq - b.seq);
  const runFileOnly = () => {
    const qs = exportQs ?? [];
    setExportQs(null);
    showFile({ title: qs.length === 1 ? `Câu ${seqLabel(qs[0].seq)} (từ Thùng rác)` : `${qs.length} câu từ Thùng rác`, name: qs.length === 1 ? `thung-rac-${seqLabel(qs[0].seq).slice(1)}.tex` : 'thung-rac-cau-hoi.tex', text: verbatimTex(qs), mime: 'application/x-tex' });
  };

  const conflictPanel = (r: TrashRow) => {
    const why = blockOf(r);
    if (!why) return r.seqTaken ? <p className="sys-hint tr-conf-note">Số {seqLabel(r.q.seq)} đã có câu khác dùng: khi khôi phục, câu này sẽ được cấp số mới (nội dung và mã nội bộ giữ nguyên).</p> : null;
    return (
      <div className="note warn tr-conflict" role="status">
        <div className="note-body">
          <b>Cần xử lý trước khi khôi phục</b>
          <span>{RESTORE_BLOCK_TEXT[why]}</span>
          <span className="tr-conf-acts">
            {why !== 'bad-location' && <button type="button" className="btn btn-sm" onClick={() => go({ screen: 'bank', openUid: r.q.uid })}>Đến câu trong Ngân hàng</button>}
            {why === 'exists-different' && <button type="button" className="btn btn-sm" onClick={() => setCmp(r)}>So sánh hai bản</button>}
            {why === 'exists-same' && <button type="button" className="btn btn-sm btn-outline tr-danger" disabled={readOnly || busy} onClick={() => setAsk({ kind: 'purge', uids: [r.q.uid] })}>Xoá bản sao trong Thùng rác…</button>}
            {why === 'bad-location' && <span className="sys-hint">Bạn vẫn có thể Xuất .tex để giữ nội dung. Việc chọn vị trí mới cho câu sẽ được bổ sung sau khi bạn duyệt cách làm.</span>}
          </span>
        </div>
      </div>
    );
  };

  const viewer = active && (
    <TrashViewer
      row={active} list={results} extra={conflictPanel(active)} busy={anyBusy([active.q.uid])} readOnly={readOnly}
      onNav={setActiveUid} onClose={() => setActiveUid(null)} onToast={toast}
      onRestore={() => { void restore([active.q.uid]); }}
      onPurge={() => setAsk({ kind: 'purge', uids: [active.q.uid] })}
      onExport={() => setExportQs([active.q])}
    />
  );

  return (
    <>
      <header className="page-head" ref={topRef}>
        <div>
          <h1>Thùng rác</h1>
          <span className="sys-hint">Câu đã xoá vẫn được giữ cho tới khi bạn chủ động xoá hẳn. HEdu không tự xoá vĩnh viễn.</span>
        </div>
        <div className="tr-head-r">
          <b className="tr-count" aria-live="polite">{nf.format(total)} / {nf.format(TRASH_CAP)} câu</b>
          {total > 0 && (
            <span className="tr-menu-wrap">
              <button ref={menuBtn} type="button" className="btn btn-sm" aria-haspopup="menu" aria-expanded={menu} aria-label="Thêm thao tác cho cả Thùng rác" onClick={() => setMenu((v) => !v)}>⋯</button>
              {menu && (
                <div className="more-menu" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(false); menuBtn.current?.focus(); } }}>
                  <button type="button" role="menuitem" disabled={readOnly || busy} onClick={() => { setMenu(false); setAsk({ kind: 'restore', uids: items.map((t) => t.q.uid) }); }}>Khôi phục tất cả…</button>
                  <button type="button" role="menuitem" className="tr-danger" disabled={readOnly || busy} onClick={() => { setMenu(false); setAsk({ kind: 'purgeAll', step: 1 }); }}>Dọn sạch Thùng rác…</button>
                </div>
              )}
            </span>
          )}
        </div>
      </header>
      <div className={`simple tr-wrap${active && !narrow ? ' is-split' : ''}`}>
        {narrow && viewer ? viewer : (
          <>
            {note && <div className={`note ${note.level === 'full' ? 'bad' : 'warn'}`} role="status"><div className="note-body"><span>{note.text}</span></div></div>}
            {load === 'loading' && <p className="aid-wait" role="status">Đang đọc Thùng rác…</p>}
            {load === 'error' && <div className="note bad" role="alert"><div className="note-body"><b>Chưa đọc được Thùng rác</b><span>{loadErr} Các nút khôi phục và xoá hẳn đang tắt. Hãy tạo file sao lưu rồi kiểm tra tệp dữ liệu.</span></div></div>}

            {load !== 'loading' && total === 0 && !readOnly && (
              <div className="tr-empty" role="status">
                <b>Thùng rác chưa có câu nào.</b>
                <span>Câu bạn xoá khỏi Ngân hàng hoặc Kiểm tra trùng sẽ xuất hiện tại đây.</span>
                <button type="button" className="btn btn-sm" onClick={() => go({ screen: 'bank' })}>Đi đến Ngân hàng</button>
              </div>
            )}

            {load !== 'loading' && total > 0 && (
              <>
                <div className="qbar tr-bar" role="search">
                  <label className="search sm" style={{ flex: '1 1 260px' }}>
                    <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Tìm đề, số #, ID, LaTeX…" aria-label="Tìm trong Thùng rác" />
                  </label>
                  <label className="qsel">Lớp
                    <select value={String(filter.grade)} onChange={(e) => setF({ grade: e.target.value === 'all' ? 'all' : Number(e.target.value) })}>
                      <option value="all">Tất cả</option>
                      {[...new Set(items.map((t) => t.q.grade))].sort((a, b) => a - b).map((g) => <option key={g} value={g}>Lớp {g}</option>)}
                    </select>
                  </label>
                  <label className="qsel">Loại
                    <select value={filter.type} onChange={(e) => setF({ type: e.target.value as QType | 'all' })}>
                      <option value="all">Tất cả</option>
                      {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                    </select>
                  </label>
                  <label className="qsel">Ngày xoá
                    <select value={filter.date} onChange={(e) => setF({ date: e.target.value as DateFilter })}>
                      {(Object.keys(DATE_LABEL) as DateFilter[]).map((d) => <option key={d} value={d}>{DATE_LABEL[d]}</option>)}
                    </select>
                  </label>
                  <label className="qsel">Trạng thái
                    <select value={filter.status} onChange={(e) => setF({ status: e.target.value as StatusFilter })}>
                      {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </label>
                  <label className="qsel">Sắp xếp
                    <select value={filter.sort} onChange={(e) => setF({ sort: e.target.value as SortMode })}>
                      {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn btn-sm" disabled={isDefaultFilter(filter) && typed === ''} onClick={clearFilter}>Xoá bộ lọc</button>
                </div>

                <div className="selbar tr-sel" role="region" aria-label="Chọn nhiều câu trong Thùng rác">
                  <span className="selbar-n">
                    <b>Đã chọn {nf.format(counts.total)} / {nf.format(total)} câu</b>
                    <small>{nf.format(results.length)} câu khớp bộ lọc{counts.outScope > 0 ? ` · ${nf.format(counts.outScope)} câu đã chọn nằm ngoài kết quả lọc` : ''}</small>
                  </span>
                  <div className="selbar-grp">
                    <button type="button" className="btn btn-sm" disabled={pageUids.length === 0} onClick={() => setSel(ps === 'all' ? removeMany(sel, pageUids) : addMany(sel, pageUids))}>{ps === 'all' ? 'Bỏ chọn trang' : `Chọn trang (${pageUids.length})`}</button>
                    <button type="button" className="btn btn-sm" disabled={results.length === 0 || allResultsSelected} onClick={() => setSel(addMany(sel, resultUids))}>Chọn tất cả {nf.format(results.length)} câu khớp lọc</button>
                    <button type="button" className="btn btn-sm" disabled={sel.size === 0} onClick={() => setSel(new Set())}>Bỏ chọn tất cả</button>
                    <span className="selbar-sep" aria-hidden="true" />
                    <button type="button" className="btn btn-sm btn-accent" disabled={readOnly || sel.size === 0 || anyBusy([...sel])} onClick={() => setAsk({ kind: 'restore', uids: [...sel] })}>Khôi phục đã chọn</button>
                    <button type="button" className="btn btn-sm" disabled={sel.size === 0} onClick={() => setExportQs(selectedQs())}>Xuất .tex</button>
                    <button type="button" className="btn btn-sm btn-outline tr-danger" disabled={readOnly || sel.size === 0 || anyBusy([...sel])} onClick={() => setAsk({ kind: 'purge', uids: [...sel] })}>Xoá hẳn đã chọn…</button>
                  </div>
                </div>

                {msg && <div className={`note ${msg.ok ? 'ok' : 'warn'}`} role="status"><div className="note-body"><span>{msg.text}</span></div></div>}

                <div className={active && !narrow ? 'tr-split' : undefined}>
                  <div className="tr-left">
                    {results.length === 0 ? (
                      <div className="tr-empty" role="status">
                        <b>Không có câu nào khớp bộ lọc.</b>
                        <button type="button" className="btn btn-sm" onClick={clearFilter}>Xoá bộ lọc</button>
                      </div>
                    ) : (
                      <>
                        <div className="list-head"><span><b className="lh-title">{nf.format(results.length)} câu</b> · đang xem {nf.format(pg.from)}–{nf.format(pg.to)}</span>
                          <label className="qsel">Mỗi trang
                            <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n} câu</option>)}</select>
                          </label>
                        </div>
                        <ul className="trash-list tr-list" aria-label="Các câu trong Thùng rác">
                          {pg.items.map((r) => <Row key={r.q.uid} r={r} on={sel.has(r.q.uid)} isActive={r.q.uid === activeUid} busy={readOnly || anyBusy([r.q.uid])} onToggle={() => setSel(toggleOne(sel, r.q.uid))} onOpen={() => setActiveUid(r.q.uid)} onRestore={() => { void restore([r.q.uid]); }} onPurge={() => setAsk({ kind: 'purge', uids: [r.q.uid] })} />)}
                        </ul>
                        <nav className="pager" aria-label="Phân trang">
                          <button type="button" className="btn btn-sm" disabled={pg.page === 0} onClick={() => goPage(pg.page - 1)}>‹ Trước</button>
                          <span>Trang <b>{pg.page + 1}</b> / {nf.format(pg.pages)}</span>
                          <button type="button" className="btn btn-sm" disabled={pg.page >= pg.pages - 1} onClick={() => goPage(pg.page + 1)}>Sau ›</button>
                        </nav>
                      </>
                    )}
                  </div>
                  {active && !narrow && <aside className="tr-right">{viewer}</aside>}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {ask?.kind === 'restore' && (() => {
        const pl = restorePlan(ask.uids);
        return (
          <ConfirmDialog
            title={`Khôi phục ${nf.format(pl.total)} câu về Ngân hàng?`}
            confirmLabel={pl.ready > 0 ? `Khôi phục ${nf.format(pl.ready)} câu` : 'Đóng'}
            cancelLabel="Chưa khôi phục"
            busy={busy}
            onConfirm={() => { const uids = ask.uids; setAsk(null); if (pl.ready > 0) void restore(uids); }}
            onCancel={() => setAsk(null)}
          >
            <p><b>{nf.format(pl.ready)}</b> câu khôi phục được{pl.blocked > 0 ? <>, <b>{nf.format(pl.blocked)}</b> câu cần xử lý (đã có trong Ngân hàng hoặc vị trí cũ không còn) — những câu này được giữ nguyên trong Thùng rác, không câu nào bị bỏ lặng lẽ.</> : '.'}</p>
            <p className="sys-hint">Câu nào trùng số thứ tự với câu khác sẽ được cấp số mới.</p>
          </ConfirmDialog>
        );
      })()}
      {ask?.kind === 'purgeAll' && (
        <ConfirmDialog
          danger
          title={ask.step === 1 ? 'Dọn sạch cả Thùng rác?' : `Chắc chắn xoá vĩnh viễn ${nf.format(total)} câu?`}
          confirmLabel={ask.step === 1 ? 'Tiếp tục…' : `Xoá hẳn ${nf.format(total)} câu`}
          cancelLabel={`Giữ lại ${nf.format(total)} câu`}
          busy={busy}
          onConfirm={() => { if (ask.step === 1) setAsk({ kind: 'purgeAll', step: 2 }); else void purgeAll(); }}
          onCancel={() => setAsk(null)}
        >
          {ask.step === 1 ? (
            <>
              <p>Thao tác này bỏ toàn bộ {nf.format(total)} câu trong Thùng rác. Câu trong Ngân hàng không bị ảnh hưởng.</p>
              <p>Nên làm trước: chọn tất cả rồi <b>Xuất .tex</b>, hoặc tạo file sao lưu ở mục Cài đặt.</p>
            </>
          ) : (
            <>
              <p>{nf.format(total)} câu này sẽ không thể khôi phục bằng HEdu sau thao tác.</p>
              <p className="sys-hint">Nếu bạn đã tạo file sao lưu trước đây, bản này có thể vẫn nằm trong file sao lưu đó (không chắc chắn).</p>
            </>
          )}
        </ConfirmDialog>
      )}
      {cmp && (
        <ConfirmDialog title={`So sánh câu ${seqLabel(cmp.q.seq)}: Thùng rác và Ngân hàng`} confirmLabel="Đóng" cancelLabel="Đóng" onConfirm={() => setCmp(null)} onCancel={() => setCmp(null)}>
          <div className="tr-cmp">
            <div><b>Bản trong Thùng rác</b><pre className="tr-pre" tabIndex={0}>{cmp.q.latex}</pre></div>
            <div><b>Bản đang trong Ngân hàng</b><pre className="tr-pre" tabIndex={0}>{bankByUid.get(cmp.q.uid)?.latex ?? '(câu này không còn trong Ngân hàng)'}</pre></div>
          </div>
          <p className="sys-hint">Chỉ xem, HEdu chưa ghi đè bản nào. Muốn giữ bản Thùng rác, hãy Xuất .tex rồi sửa trong Ngân hàng.</p>
        </ConfirmDialog>
      )}
      {ask?.kind === 'purge' && (
        <ConfirmDialog
          danger
          title={ask.uids.length === 1 ? 'Xoá vĩnh viễn câu này khỏi Thùng rác?' : `Xoá vĩnh viễn ${nf.format(ask.uids.length)} câu đã chọn khỏi Thùng rác?`}
          confirmLabel={ask.uids.length === 1 ? 'Xoá hẳn câu này' : `Xoá hẳn ${nf.format(ask.uids.length)} câu`}
          cancelLabel={ask.uids.length === 1 ? 'Giữ lại câu này' : `Giữ lại ${nf.format(ask.uids.length)} câu`}
          busy={busy}
          onConfirm={() => { void purge(ask.uids); }}
          onCancel={() => setAsk(null)}
        >
          <p>{ask.uids.length === 1 ? 'Câu này' : `${nf.format(ask.uids.length)} câu này`} sẽ không thể khôi phục bằng Thùng rác sau thao tác. Câu trong Ngân hàng không bị ảnh hưởng.</p>
          <p className="sys-hint">Nếu bạn đã tạo file sao lưu trước đây, bản này có thể vẫn nằm trong file sao lưu đó (không chắc chắn).</p>
        </ConfirmDialog>
      )}
      {exportQs && <ExportChoiceDialog qs={exportQs} onFileOnly={runFileOnly} onClose={() => setExportQs(null)} onToast={toast} />}
    </>
  );
}

function Row({ r, on, isActive, busy, onToggle, onOpen, onRestore, onPurge }: { r: TrashRow; on: boolean; isActive: boolean; busy: boolean; onToggle(): void; onOpen(): void; onRestore(): void; onPurge(): void }) {
  const stem = plainSnippet(parseExTest(r.q.latex).stem, 160) || '(câu chưa có đề bài)';
  return (
    <li className={`${on ? 'is-checked' : ''}${isActive ? ' is-active' : ''}`}>
      <input type="checkbox" checked={on} onChange={onToggle} aria-label={`Chọn câu ${seqLabel(r.q.seq)}`} />
      <span className="mono tr-seq">{seqLabel(r.q.seq)}</span>
      <span className="code-tag">{r.id6}</span>
      <span className={`pill t-${r.q.type}`}>{TYPE_LABEL[r.q.type]}</span>
      <button type="button" className="trash-t tr-open" title={stem} aria-current={isActive ? 'true' : undefined} onClick={onOpen}>{stem}</button>
      <span className="tr-flags">
        {r.inBank && <span className="chk-tag loi">Đã có trong Ngân hàng</span>}
        {r.seqTaken && <span className="chk-tag canh">Số đã được dùng</span>}
        {r.locationGone && <span className="chk-tag loi">Vị trí cũ không còn</span>}
      </span>
      <span className="muted sm tr-date">{dateText(r.at)}</span>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={onRestore}>Khôi phục</button>
      <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={onPurge}>Xoá hẳn…</button>
    </li>
  );
}
