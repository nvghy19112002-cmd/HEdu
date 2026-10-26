// Màn Thư viện đề thi: cây thư mục ảo + bộ lọc · danh sách đề · chi tiết. Nhập .tex/thư mục/gói (sao chép, tệp gốc không bị đụng), tạo đề trống,
// sao chép (phiên bản mới), đổi thông tin, chốt đề, Thùng rác đề, sao lưu/khôi phục thư viện đề, mở Biên tập và xem PDF.
// Biên dịch/soạn tệp nằm ở không gian Biên tập (ExamWorkspace). Thiết kế: claude/thiet-ke-de-thi.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExamBackupPanel, ExamTrashPanel } from '../components/ExamAdminPanels';
import { ExamInfoForm } from '../components/ExamInfoForm';
import { PdfViewer } from '../components/PdfViewer';
import { RAW_MODE_NOTE, examCompileLast, type GoodInfo } from '../lib/examcompile';
import { allFolders, applyFacets, EMPTY_SEL, facets, folderTree, isEmptySel, type FacetSel, type FolderNode } from '../lib/examfacets';
import { isDesktop } from '../lib/platform';
import {
  bundleFolderName, chooseProjectFolder, chooseTexFile, DEFAULT_EXAM_FILTER, dateText, describeScan, examBundleExport, examBundleImport, examCreate, examDuplicate, examGet, examImport, examList, examMetaUpdate,
  examReveal, examScan, examTrash, examVerify, filterExams, formatBytes, KIND_LABEL, needsMainChoice, SORT_LABEL, sortExams, STATUS_LABEL,
  type ExamFilter, type ExamKind, type ExamManifest, type ExamScan, type ExamSort, type ExamStatus, type ExamSummary, type ExamVerify,
} from '../lib/examlib';
import { ExamWorkspace } from './ExamWorkspace';

const nf = new Intl.NumberFormat('vi-VN');
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Pending { path: string; scan: ExamScan; name: string; main: string }

export function ExamLibraryScreen() {
  const { toast } = useApp();
  const desktop = isDesktop();
  const [items, setItems] = useState<ExamSummary[]>([]);
  const [load, setLoad] = useState<'loading' | 'ok' | 'error'>(desktop ? 'loading' : 'ok');
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<ExamFilter>(DEFAULT_EXAM_FILTER);
  const [sel, setSel] = useState<FacetSel>(EMPTY_SEL);
  const [sort, setSort] = useState<ExamSort>('updated');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExamManifest | null>(null);
  const [check, setCheck] = useState<ExamVerify | null>(null);
  const [good, setGood] = useState<GoodInfo | null>(null);
  const [viewing, setViewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<null | 'trash' | 'backup'>(null);
  const [ask, setAsk] = useState<null | 'trash'>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [newName, setNewName] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setItems(await examList()); setLoad('ok'); setErr(null); }
    catch (e) { setLoad('error'); setErr(msg(e)); }
  }, []);
  useEffect(() => { if (desktop) void reload(); }, [desktop, reload]);

  const loadDetail = useCallback((id: string) => {
    examGet(id).then(setDetail).catch((e) => toast(`Không đọc được dự án: ${msg(e)}`));
    examCompileLast(id).then(setGood).catch(() => undefined);
  }, [toast]);

  useEffect(() => {
    setDetail(null); setCheck(null); setGood(null); setViewing(false); setEditing(false);
    if (activeId) loadDetail(activeId);
  }, [activeId, loadDetail]);

  const facetList = useMemo(() => facets(items, sel), [items, sel]);
  const tree = useMemo(() => folderTree(items, sel), [items, sel]);
  const folders = useMemo(() => allFolders(items), [items]);
  const shown = useMemo(() => sortExams(filterExams(applyFacets(items, sel), filter), sort), [items, sel, filter, sort]);
  const filtered = filter.text.trim() !== '' || filter.kind !== 'all' || filter.status !== 'all' || !isEmptySel(sel);

  const run = async (f: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await f(); } catch (e) { toast(msg(e)); } finally { busyRef.current = false; setBusy(false); }
  };

  const pick = (choose: () => Promise<string | null>) => run(async () => {
    const path = await choose();
    if (!path) return;
    const scan = await examScan(path);
    setPending({ path, scan, name: scan.name, main: scan.mainFile ?? '' });
  });

  const confirmImport = () => run(async () => {
    if (!pending) return;
    if (needsMainChoice(pending.scan) && pending.scan.candidates.length > 1 && !pending.main) { toast('Hãy chọn tệp chính trước khi nhập.'); return; }
    const s = await examImport(pending.path, pending.name, pending.main || null);
    setPending(null);
    await reload();
    setActiveId(s.id);
    toast(`Đã nhập “${s.name}” vào thư viện. Tệp gốc không bị thay đổi.`);
  });

  const importBundle = () => run(async () => {
    const path = await chooseProjectFolder();
    if (!path) return;
    const s = await examBundleImport(path);
    await reload();
    setActiveId(s.id);
    toast(`Đã nhập gói thành đề mới “${s.name}”. Từng tệp được đối chiếu với sổ của gói.`);
  });

  const createBlank = () => run(async () => {
    const s = await examCreate(newName ?? '');
    setNewName(null);
    await reload();
    setActiveId(s.id);
  });

  const verify = () => run(async () => { if (activeId) setCheck(await examVerify(activeId)); });

  const duplicate = () => run(async () => {
    if (!activeId) return;
    const s = await examDuplicate(activeId, null);
    await reload();
    setActiveId(s.id);
    toast(`Đã tạo bản sao “${s.name}” (đang soạn). Đề gốc không đổi.`);
  });

  const exportBundle = () => run(async () => {
    if (!activeId || !detail) return;
    const parent = await chooseProjectFolder();
    if (!parent) return;
    const dest = await examBundleExport(activeId, parent, bundleFolderName(detail.name));
    toast(`Đã xuất gói: ${dest}`);
  });

  const saveMeta = (m: Parameters<typeof examMetaUpdate>[1]) => run(async () => {
    if (!activeId) return;
    const s = await examMetaUpdate(activeId, m);
    await reload();
    loadDetail(activeId);
    toast(s.status === 'finalized' && m.status === 'finalized' && detail?.status !== 'finalized' ? `Đã chốt đề “${s.name}”.` : 'Đã lưu thông tin đề.');
  });

  const trash = () => run(async () => {
    if (!activeId) return;
    await examTrash(activeId);
    setAsk(null); setActiveId(null);
    await reload();
    toast('Đã chuyển đề vào Thùng rác đề. Có thể khôi phục ở nút “Thùng rác đề”.');
  });

  const folderNode = (n: FolderNode, depth: number): React.ReactNode => (
    <li key={n.path}>
      <button type="button" className={`xl-fnode${sel.folder === n.path ? ' on' : ''}`} style={{ paddingLeft: 8 + depth * 12 }} aria-pressed={sel.folder === n.path} onClick={() => setSel({ ...sel, folder: sel.folder === n.path ? null : n.path })}>
        {n.name} <span className="xl-meta">({n.count})</span>
      </button>
      {n.children.length > 0 && <ul className="xl-ftree">{n.children.map((c) => folderNode(c, depth + 1))}</ul>}
    </li>
  );
  const facetBtns = <T extends string | number>(label: string, key: 'grade' | 'year' | 'type' | 'tag' | 'status', vals: { value: T; count: number }[], show: (v: T) => string) => vals.length > 0 && (
    <div className="xl-facet" role="group" aria-label={label}>
      <b>{label}</b>
      {vals.map((v) => (
        <button key={String(v.value)} type="button" className={`xl-fnode${sel[key] === v.value ? ' on' : ''}`} aria-pressed={sel[key] === v.value} onClick={() => setSel({ ...sel, [key]: sel[key] === v.value ? null : v.value })}>
          {show(v.value)} <span className="xl-meta">({v.count})</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Thư viện đề thi</h1>
          <span className="sys-hint">Đề được SAO CHÉP vào thư viện của HEdu; tệp gốc của bạn không bị sửa. Thư viện đề có Thùng rác và sao lưu RIÊNG.</span>
        </div>
        <div className="xl-actions">
          <button type="button" className="btn btn-sm" disabled={!desktop || busy} onClick={() => pick(chooseTexFile)}>Nhập .tex</button>
          <button type="button" className="btn btn-sm" disabled={!desktop || busy} onClick={() => pick(chooseProjectFolder)}>Nhập thư mục</button>
          <button type="button" className="btn btn-sm" disabled={!desktop || busy} onClick={importBundle}>Nhập gói</button>
          <button type="button" className="btn btn-sm" disabled={!desktop || busy} onClick={() => setNewName('')}>Tạo đề trống</button>
          <button type="button" className="btn btn-sm" disabled={!desktop} onClick={() => setPanel('trash')}>Thùng rác đề</button>
          <button type="button" className="btn btn-sm" disabled={!desktop} onClick={() => setPanel('backup')}>Sao lưu thư viện</button>
        </div>
      </header>
      <div className="simple xl-wrap">
        {!desktop && <div className="note warn" role="status"><div className="note-body"><b>Chỉ có trên app Windows</b><span>Thư viện đề lưu tệp trên máy nên không dùng được ở bản xem thử trên trình duyệt.</span></div></div>}
        {load === 'error' && <div className="note bad" role="alert"><div className="note-body"><b>Chưa đọc được thư viện đề</b><span>{err} Tệp của bạn trong thư viện không bị xoá.</span></div></div>}

        {newName !== null && (
          <div className="xl-box" role="group" aria-label="Tạo đề trống">
            <label>Tên đề <input className="xl-in" value={newName} autoFocus maxLength={120} placeholder="Ví dụ: Đề HKI Toán 12" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void createBlank(); }} /></label>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={createBlank}>Tạo</button>
            <button type="button" className="btn btn-sm" onClick={() => setNewName(null)}>Huỷ</button>
          </div>
        )}

        {pending && (
          <div className="xl-box xl-col" role="group" aria-label="Xác nhận nhập đề">
            <b>Nhập vào thư viện: {pending.path}</b>
            <ul className="xl-lines">{describeScan(pending.scan).map((l, i) => <li key={i}>{l}</li>)}</ul>
            {pending.scan.skipped.length > 0 && (
              <details open><summary>Các mục không được chép ({pending.scan.skipped.length})</summary>
                <ul className="xl-lines">{pending.scan.skipped.slice(0, 50).map((k, i) => <li key={i}><code>{k.rel}</code>: {k.reason}</li>)}{pending.scan.skipped.length > 50 && <li>…và {pending.scan.skipped.length - 50} mục khác.</li>}</ul>
              </details>
            )}
            <label>Tên đề <input className="xl-in" value={pending.name} maxLength={120} onChange={(e) => setPending({ ...pending, name: e.target.value })} /></label>
            {pending.scan.kind === 'multi' && (
              <label>Tệp chính
                <select className="xl-in" value={pending.main} onChange={(e) => setPending({ ...pending, main: e.target.value })}>
                  <option value="">{pending.scan.candidates.length ? '— chọn tệp chính —' : '— chọn sau —'}</option>
                  {(pending.scan.candidates.length ? pending.scan.candidates : pending.scan.files.filter((f) => f.rel.toLowerCase().endsWith('.tex')).map((f) => f.rel)).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            )}
            <div className="xl-actions">
              <button type="button" className="btn btn-sm btn-primary" disabled={busy || pending.scan.truncated} onClick={confirmImport}>{busy ? 'Đang chép…' : 'Nhập vào thư viện'}</button>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setPending(null)}>Huỷ</button>
            </div>
          </div>
        )}

        <div className="xl-bar">
          <input className="xl-in xl-search" type="search" aria-label="Tìm đề" placeholder="Tìm theo tên, tệp chính, nhãn, năm học, lớp…" value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
          <select className="xl-in" aria-label="Loại dự án" value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value as ExamKind | 'all' })}>
            <option value="all">Mọi loại</option>{(Object.keys(KIND_LABEL) as ExamKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <select className="xl-in" aria-label="Sắp xếp" value={sort} onChange={(e) => setSort(e.target.value as ExamSort)}>
            {(Object.keys(SORT_LABEL) as ExamSort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
          <b className="xl-count" aria-live="polite">{nf.format(shown.length)} / {nf.format(items.length)} đề</b>
        </div>

        {load === 'loading' && <p className="aid-wait" role="status">Đang đọc thư viện đề…</p>}
        {load === 'ok' && items.length === 0 && desktop && (
          <div className="empty" role="status"><b>Thư viện đề chưa có đề nào.</b><span>Nhập một tệp .tex, một thư mục dự án hoặc gói, hay tạo đề trống để bắt đầu.</span></div>
        )}

        {items.length > 0 && (
          <div className="xl-main">
            <nav className="xl-side" aria-label="Thư mục và bộ lọc">
              <div className="xl-facet" role="group" aria-label="Thư mục">
                <b>Thư mục</b>
                <button type="button" className={`xl-fnode${sel.folder === null ? ' on' : ''}`} aria-pressed={sel.folder === null} onClick={() => setSel({ ...sel, folder: null })}>Tất cả <span className="xl-meta">({tree.total})</span></button>
                <ul className="xl-ftree">{tree.roots.map((n) => folderNode(n, 0))}</ul>
                {tree.unfiled > 0 && <button type="button" className={`xl-fnode${sel.folder === '' ? ' on' : ''}`} aria-pressed={sel.folder === ''} onClick={() => setSel({ ...sel, folder: sel.folder === '' ? null : '' })}>Chưa xếp thư mục <span className="xl-meta">({tree.unfiled})</span></button>}
              </div>
              {facetBtns('Lớp', 'grade', facetList.grades, (v) => `Lớp ${v}`)}
              {facetBtns('Năm học', 'year', facetList.years, (v) => v)}
              {facetBtns('Loại đề', 'type', facetList.types, (v) => v)}
              {facetBtns('Trạng thái', 'status', facetList.statuses, (v) => STATUS_LABEL[v as ExamStatus])}
              {facetBtns('Nhãn', 'tag', facetList.tags, (v) => v)}
              {filtered && <button type="button" className="btn btn-sm" onClick={() => { setSel(EMPTY_SEL); setFilter(DEFAULT_EXAM_FILTER); }}>Xoá bộ lọc</button>}
            </nav>

            <div className="xl-split">
              {shown.length === 0 ? (
                <div className="empty" role="status"><b>Không có đề nào khớp.</b><button type="button" className="btn btn-sm" onClick={() => { setSel(EMPTY_SEL); setFilter(DEFAULT_EXAM_FILTER); }}>Xoá bộ lọc</button></div>
              ) : (
                <ul className="xl-list" aria-label="Danh sách đề">
                  {shown.map((e) => (
                    <li key={e.id}>
                      <button type="button" className="xl-row" aria-pressed={e.id === activeId} onClick={() => setActiveId(e.id === activeId ? null : e.id)}>
                        <span className="xl-name">{e.name}</span>
                        <span className="xl-meta">{e.folder ? `${e.folder} · ` : ''}{KIND_LABEL[e.kind]} · {e.fileCount} tệp · {formatBytes(e.totalBytes)} · {STATUS_LABEL[e.status]} · sửa {dateText(e.updatedAt)}</span>
                        {(e.warningCount > 0 || e.skippedCount > 0 || !e.mainFile) && (
                          <span className="xl-flags">{!e.mainFile && 'Chưa chọn tệp chính. '}{e.skippedCount > 0 && `${e.skippedCount} mục không chép. `}{e.warningCount > 0 && `${e.warningCount} cảnh báo.`}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {activeId && (
                <aside className="xl-detail" aria-label="Chi tiết đề">
                  {!detail ? <p className="aid-wait">Đang đọc…</p> : (
                    <>
                      <h2>{detail.name}</h2>
                      <p className="xl-meta">Tệp chính: <b>{detail.mainFile ?? 'chưa chọn'}</b> · tạo {dateText(detail.createdAt)}{detail.folder ? ` · thư mục ${detail.folder}` : ''}</p>
                      <p className="xl-meta">Nguồn: {detail.source.mode === 'created' ? 'tạo trong HEdu' : detail.source.mode === 'duplicated' ? detail.source.originalPathDisplay : detail.source.mode === 'restored' ? `khôi phục từ ${detail.source.originalPathDisplay}` : `đã chép từ ${detail.source.originalPathDisplay}`}</p>
                      <div className="xl-actions">
                        <button type="button" className="btn btn-sm btn-primary" disabled={!desktop || !detail.mainFile} onClick={() => setEditing(true)}>Biên tập</button>
                        {good && desktop && <button type="button" className="btn btn-sm" onClick={() => setViewing(true)}>Xem PDF</button>}
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={duplicate}>Sao chép</button>
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={exportBundle}>Xuất gói…</button>
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => activeId && void examReveal(activeId).catch((e) => toast(msg(e)))}>Hiện trong Explorer</button>
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setAsk('trash')}>Chuyển vào Thùng rác…</button>
                      </div>
                      {good && <p className="xl-meta">PDF gần nhất: {good.pages ?? '?'} trang · {good.engine} · {dateText(good.at)}</p>}
                      <ExamInfoForm detail={detail} folders={folders} busy={busy} hasPdf={!!good} onSave={saveMeta} />
                      {detail.warnings.length > 0 && <div className="note warn"><div className="note-body">{detail.warnings.map((w, i) => <span key={i}>{w}</span>)}</div></div>}
                      {detail.skipped.length > 0 && <details><summary>{detail.skipped.length} mục không được chép</summary><ul className="xl-lines">{detail.skipped.map((k, i) => <li key={i}><code>{k.rel}</code>: {k.reason}</li>)}</ul></details>}
                      <details><summary>{detail.files.length} tệp</summary>
                        <ul className="xl-lines">{detail.files.slice(0, 300).map((f) => <li key={f.rel}><code>{f.rel}</code> <span className="xl-meta">{formatBytes(f.bytes)}</span></li>)}{detail.files.length > 300 && <li>…và {detail.files.length - 300} tệp khác.</li>}</ul>
                      </details>
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={verify}>Kiểm tra tệp trong thư viện</button>
                      {check && (
                        <div className={`note ${check.ok && check.extra.length === 0 ? 'ok' : 'warn'}`} role="status"><div className="note-body">
                          {check.ok && check.extra.length === 0 ? <b>Mọi tệp khớp với sổ.</b> : <b>Có khác biệt so với sổ</b>}
                          {check.changed.length > 0 && <span>Đã bị sửa: {check.changed.join(', ')}</span>}
                          {check.missing.length > 0 && <span>Bị mất: {check.missing.join(', ')}</span>}
                          {check.blocked.length > 0 && <span>Bị chặn vì là liên kết/junction hoặc không đọc an toàn được (HEdu không đi theo): {check.blocked.join(', ')}</span>}
                          {check.extra.length > 0 && <span>Tệp thêm ngoài HEdu: {check.extra.join(', ')}</span>}
                        </div></div>
                      )}
                    </>
                  )}
                </aside>
              )}
            </div>
          </div>
        )}
      </div>
      {viewing && activeId && detail && <PdfViewer id={activeId} title={detail.name} stale={false} note={RAW_MODE_NOTE} onClose={() => setViewing(false)} />}
      {editing && activeId && detail && <ExamWorkspace id={activeId} name={detail.name} mainFile={detail.mainFile} onClose={() => { setEditing(false); void reload(); loadDetail(activeId); }} />}
      {panel === 'trash' && <ExamTrashPanel toast={toast} onClose={() => setPanel(null)} onChanged={(rid) => { void reload().then(() => { if (rid) setActiveId(rid); }); }} />}
      {panel === 'backup' && <ExamBackupPanel toast={toast} onClose={() => setPanel(null)} onChanged={() => void reload()} />}
      {ask === 'trash' && detail && (
        <ConfirmDialog title="Chuyển vào Thùng rác đề?" confirmLabel="Chuyển vào Thùng rác" cancelLabel="Giữ lại" busy={busy} onCancel={() => setAsk(null)} onConfirm={trash}>
          <p>Đề “{detail.name}” sẽ rời khỏi thư viện nhưng KHÔNG bị xoá: bạn khôi phục được ở nút “Thùng rác đề”.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
