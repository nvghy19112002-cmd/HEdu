// Màn Thư viện đề thi (bố cục giống Ngân hàng): cây mục lục bên trái (Lớp → Ôn tập theo bài học / Đề kiểm tra GK1–CK2 / Đề ôn tập /
// Thi thử, Thư mục riêng) · thanh tìm + bộ lọc + sắp xếp · thống kê trạng thái · lưới thẻ đề bằng nhau · bấm thẻ mở cửa sổ chi tiết.
// Nhập .tex/thư mục/gói (sao chép, tệp gốc không bị đụng), tạo đề trống ngay tại mục đang chọn (điền sẵn lớp/loại/chương/bài),
// sao chép (phiên bản mới), đổi thông tin, chốt đề, Thùng rác đề, sao lưu/khôi phục thư viện đề, Biên tập và xem PDF.
// Bấm thẻ đề = mở đề thành một tab (thanh tab trên cùng: tab Thư viện cố định + tối đa 8 đề; nhớ tab khi tắt app; logic ở examtabs.ts).
// Biên dịch/soạn tệp nằm ở không gian Biên tập (ExamWorkspace). Thiết kế: claude/thiet-ke-de-thi.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExamBackupPanel, ExamTrashPanel } from '../components/ExamAdminPanels';
import { ExamInfoForm } from '../components/ExamInfoForm';
import { ExamTree } from '../components/ExamTree';
import { PdfViewer } from '../components/PdfViewer';
import { useTaxonomy } from '../lib/curriculum';
import { examCompileAll, MODE_NOTE, modeLabel, type ExamMode, type GoodInfo } from '../lib/examcompile';
import { allFolders } from '../lib/examfacets';
import { CAT_LABEL, catOfType, examCounts, examTrail, examTree, filterByNode, nodeTrail, placementOf, type ExamCat } from '../lib/examtree';
import { isDesktop } from '../lib/platform';
import { scanUsage } from '../lib/examusage';
import {
  bundleFolderName, chooseProjectFolder, chooseTexFile, dateText, describeScan, examBundleExport, examBundleImport, examCreate, examDuplicate, examGet, examImport, examList, examMetaUpdate,
  examReveal, examScan, examTrash, examVerify, filterExams, formatBytes, needsMainChoice, SORT_LABEL, sortExams, STATUS_LABEL,
  type ExamManifest, type ExamScan, type ExamSort, type ExamStatus, type ExamSummary, type ExamVerify,
} from '../lib/examlib';
import { ExamWorkspace, type ExamWorkspaceHandle } from './ExamWorkspace';
import { closeTab, cycleTab, keepExisting, loadTabs, MAX_TABS, openTab, saveTabs, type TabsState, type TabStatus } from '../lib/examtabs';
import { ExamExportDialog } from '../components/ExamExportDialog';

const nf = new Intl.NumberFormat('vi-VN');
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const STATUSES: ExamStatus[] = ['draft', 'needs_review', 'finalized'];
const PER_PAGE = 24;
/** màu thẻ theo nhóm loại đề */
const catTone = (c: ExamCat | null): string => (c === 'gk1' || c === 'gk2' ? 'gk' : c === 'ck1' || c === 'ck2' ? 'ck' : c === 'thi-thu' ? 'tt' : c === 'on-bai' || c === 'on-chuong' || c === 'on-tap' ? 'ot' : c === 'kt-khac' ? 'kt' : 'na');
/** nhóm trung gian và tên loại (đã có ở nhãn màu) không lặp lại ở dòng vị trí của thẻ */
const HIDE_IN_WHERE = new Set<string>(['Đề kiểm tra', 'Ôn tập theo bài học', 'Đề ôn tập', 'Đề thi thử', 'Chưa phân loại', ...Object.values(CAT_LABEL)]);
const typeText = (t: string | null | undefined) => { const c = catOfType(t); return c ? CAT_LABEL[c] : t || 'Chưa phân loại'; };

interface Pending { path: string; scan: ExamScan; name: string; main: string }

/** Khung cửa sổ dùng chung của màn này (Esc đóng, trừ khi đang có hộp xác nhận). */
function Modal({ title, onClose, wide, children, foot }: { title: React.ReactNode; onClose(): void; wide?: boolean; children: React.ReactNode; foot?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.cfm') && !document.querySelector(".ew:not(.off), .pv:not(.pv-embedded)")) { e.stopPropagation(); onClose(); } };
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

export function ExamLibraryScreen() {
  const { toast, go } = useApp();
  const { tax } = useTaxonomy();
  const desktop = isDesktop();
  const [items, setItems] = useState<ExamSummary[]>([]);
  const [load, setLoad] = useState<'loading' | 'ok' | 'error'>(desktop ? 'loading' : 'ok');
  const [err, setErr] = useState<string | null>(null);
  const [node, setNode] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<ExamStatus | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [sort, setSort] = useState<ExamSort>('updated');
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState<null | 'add' | 'tools' | 'filter'>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExamManifest | null>(null);
  const [check, setCheck] = useState<ExamVerify | null>(null);
  const [goods, setGoods] = useState<GoodInfo[]>([]);
  const [viewing, setViewing] = useState<ExamMode | null>(null);
  /** các đề đang mở thành tab + tab đang xem (null = Thư viện) */
  const [tabs, setTabs] = useState<TabsState>(loadTabs);
  const [tabStat, setTabStat] = useState<ReadonlyMap<string, TabStatus>>(new Map());
  const wsRefs = useRef(new Map<string, ExamWorkspaceHandle>());
  /** hộp Thông tin mở từ một tab đề: đóng hộp thì quay lại tab đó */
  const infoFrom = useRef<string | null>(null);
  const [exportingCodes, setExportingCodes] = useState(false);
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
  /** số câu của từng đề (đề tạo bằng Tạo đề có danh sách câu nguồn) */
  const [qn, setQn] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => { if (!desktop || !items.length) return; scanUsage().then((u) => setQn(new Map(u.projects.map((p) => [p.id, p.uids.length] as const)))).catch(() => undefined); }, [desktop, items]);

  const loadDetail = useCallback((id: string) => {
    examGet(id).then(setDetail).catch((e) => toast(`Không đọc được đề: ${msg(e)}`));
    examCompileAll(id).then(setGoods).catch(() => undefined);
  }, [toast]);
  useEffect(() => {
    setDetail(null); setCheck(null); setGoods([]); setViewing(null);
    if (activeId) loadDetail(activeId);
  }, [activeId, loadDetail]);
  // nhớ tab khi tắt app / rời màn; đề không còn trong thư viện thì bỏ tab
  useEffect(() => { saveTabs(tabs); }, [tabs]);
  useEffect(() => { if (load === 'ok' && desktop) setTabs((t) => keepExisting(t, (id) => items.some((x) => x.id === id && !!x.mainFile))); }, [items, load, desktop]);
  const onTabStatus = useCallback((id: string, st: TabStatus) => setTabStat((m) => { const o = m.get(id); if (o && o.dirty === st.dirty && o.compile === st.compile) return m; const n = new Map(m); n.set(id, st); return n; }), []);
  /** bấm thẻ đề: mở thành tab (đã mở thì chuyển sang) */
  const openDoc = (e: ExamSummary) => {
    if (!desktop || !e.mainFile) {
      setActiveId(e.id);
      toast(desktop ? 'Đề này chưa chọn tệp chính nên chưa biên tập được. Đây là hộp Thông tin của đề.' : 'Biên tập đề chỉ có ở bản cài trên Windows. Đây là hộp Thông tin của đề.');
      return;
    }
    const n = openTab(tabs, e.id);
    if (n === 'full') { toast(`Đang mở ${MAX_TABS} đề (tối đa). Đóng bớt một tab ở thanh trên cùng rồi mở đề này.`); return; }
    setTabs(n);
  };
  /** đóng tab đề: chuyển sang tab đó trước để hộp "Có tệp chưa lưu" (nếu có) hiện đúng chỗ */
  const askCloseDoc = (id: string) => { setTabs((t) => ({ ...t, front: id })); window.setTimeout(() => wsRefs.current.get(id)?.requestClose(), 0); };
  const closeDoc = (id: string) => { setTabs((t) => closeTab(t, id)); setTabStat((m) => { const n = new Map(m); n.delete(id); return n; }); void reload(); };
  // phím tắt thanh tab: Ctrl+Tab / Ctrl+Shift+Tab (hoặc Ctrl+PageDown/PageUp) đổi tab, Ctrl+W đóng tab đề đang xem
  useEffect(() => {
    if (!tabs.ids.length) return;
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (document.querySelector('.cfm, .qm, .pv:not(.pv-embedded)')) return; // đang có hộp thoại
      const key = e.key.toLowerCase();
      if (key === 'tab' || key === 'pagedown' || key === 'pageup') { e.preventDefault(); e.stopPropagation(); setTabs((t) => cycleTab(t, key === 'pageup' || (key === 'tab' && e.shiftKey) ? -1 : 1)); }
      else if (key === 'w' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); if (tabs.front) askCloseDoc(tabs.front); }
    };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [tabs]); // eslint-disable-line react-hooks/exhaustive-deps
  // menu thả xuống: bấm ra ngoài / Esc thì đóng
  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('.xl-menu')) setMenu(null); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [menu]);

  // lọc theo năm học/chữ trước (cây đếm theo kết quả này), rồi theo mục cây, rồi theo trạng thái (thống kê đếm theo mục)
  const base = useMemo(() => filterExams(items.filter((e) => !year || e.metadata.schoolYear === year), { text, kind: 'all', status: 'all' }), [items, year, text]);
  const counts = useMemo(() => examCounts(base, tax), [base, tax]);
  const tree = useMemo(() => examTree(tax, counts, base, showEmpty), [tax, counts, base, showEmpty]);
  const inNode = useMemo(() => filterByNode(base, node, tax), [base, node, tax]);
  const byStatus = useMemo(() => { const m = new Map<ExamStatus, number>(); for (const e of inNode) m.set(e.status, (m.get(e.status) ?? 0) + 1); return m; }, [inNode]);
  const list = useMemo(() => sortExams(status ? inNode.filter((e) => e.status === status) : inNode, sort), [inNode, status, sort]);
  const years = useMemo(() => [...new Set(items.map((e) => e.metadata.schoolYear).filter((y): y is string => !!y))].sort().reverse(), [items]);
  const folders = useMemo(() => allFolders(items), [items]);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = list.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);
  useEffect(() => { setPage(0); }, [node, text, status, year, sort]);
  const trail = nodeTrail(examTree(tax, counts, base, true), node);
  const place = placementOf(node);
  const nFilters = (status ? 1 : 0) + (year ? 1 : 0);
  const activeSum = items.find((x) => x.id === activeId);

  const run = async (f: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await f(); } catch (e) { toast(msg(e)); } finally { busyRef.current = false; setBusy(false); }
  };
  const pick = (choose: () => Promise<string | null>) => run(async () => {
    setMenu(null);
    const path = await choose();
    if (!path) return;
    const scan = await examScan(path);
    setPending({ path, scan, name: scan.name, main: scan.mainFile ?? '' });
  });
  /** đặt đề vừa thêm vào mục đang chọn (lớp, loại, chương, bài, thư mục) */
  const placeNew = async (s: ExamSummary): Promise<ExamSummary> => {
    if (!place) return s;
    return examMetaUpdate(s.id, { name: s.name, folder: place.folder, grade: place.grade, schoolYear: null, examType: place.examType, tags: [], status: 'draft', chapterId: place.chapterId, lessonId: place.lessonId });
  };
  const confirmImport = () => run(async () => {
    if (!pending) return;
    if (needsMainChoice(pending.scan) && pending.scan.candidates.length > 1 && !pending.main) { toast('Hãy chọn tệp chính trước khi nhập.'); return; }
    const s = await placeNew(await examImport(pending.path, pending.name, pending.main || null));
    setPending(null);
    await reload();
    setActiveId(s.id);
    toast(`Đã nhập “${s.name}” vào thư viện${place ? ` (${trail.join(' › ')})` : ''}. Tệp gốc không bị thay đổi.`);
  });
  const importBundle = () => run(async () => {
    setMenu(null);
    const path = await chooseProjectFolder();
    if (!path) return;
    const s = await examBundleImport(path);
    await reload();
    setActiveId(s.id);
    toast(`Đã nhập gói thành đề mới “${s.name}”. Từng tệp được đối chiếu với sổ của gói.`);
  });
  const createBlank = () => run(async () => {
    const s = await placeNew(await examCreate(newName ?? ''));
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
    if (tabs.ids.includes(activeId)) { setAsk(null); toast('Đề này đang mở ở một tab. Đóng tab của đề (dấu × ở thanh trên cùng) rồi mới chuyển vào Thùng rác.'); return; }
    await examTrash(activeId);
    setAsk(null); setActiveId(null);
    await reload();
    toast('Đã chuyển đề vào Thùng rác đề. Có thể khôi phục ở Công cụ › Thùng rác đề.');
  });
  /** đóng hộp Thông tin; mở từ tab đề thì quay lại đúng tab đó */
  const closeInfo = () => { const back = infoFrom.current; infoFrom.current = null; setActiveId(null); if (back) setTabs((t) => (t.ids.includes(back) ? { ...t, front: back } : t)); };
  const clearAll = () => { setText(''); setStatus(null); setYear(null); setNode(null); };

  const card = (e: ExamSummary) => {
    const c = catOfType(e.metadata.examType);
    const at = examTrail(e, tax);
    const flags = [!e.mainFile && 'Chưa chọn tệp chính', e.skippedCount > 0 && `${e.skippedCount} mục không chép`, e.warningCount > 0 && `${e.warningCount} cảnh báo`].filter(Boolean) as string[];
    return (
      <button key={e.id} type="button" className={`xc tone-${catTone(c)}`} onClick={() => openDoc(e)} title={`Bấm để mở đề thành một tab (biên tập, biên dịch). Thông tin và thao tác khác: nút “Thông tin…” trong màn biên tập${tabs.ids.includes(e.id) ? '. Đề này đang mở.' : ''}`}>
        <span className="xc-top">
          <span className={`xc-type tone-${catTone(c)}`}>{typeText(e.metadata.examType)}</span>
          <span className={`xc-st st-${e.status}`}>{STATUS_LABEL[e.status]}</span>
        </span>
        <span className="xc-name">{tabs.ids.includes(e.id) && <span className="xc-open" title="Đang mở ở một tab">● </span>}{e.name}</span>
        <span className="xc-where">{at.length ? at.filter((x) => !HIDE_IN_WHERE.has(x)).join(' › ') : 'Chưa xếp lớp'}{e.folder ? ` · 📁 ${e.folder}` : ''}</span>
        <span className="xc-foot">
          <span title="Năm học">{e.metadata.schoolYear ?? '—'}</span>
          <span title={`${e.fileCount} tệp · ${formatBytes(e.totalBytes)}`}>{qn.get(e.id) ? `${qn.get(e.id)} câu` : e.fileCount > 1 ? `${e.fileCount} tệp` : 'Đề soạn tay'}</span>
          <span>Sửa {dateText(e.updatedAt).split(' ')[0]}</span>
        </span>
        {flags.length > 0 && <span className="xc-flag">⚠ {flags.join(' · ')}</span>}
      </button>
    );
  };

  const docTabs = tabs.ids.map((id) => items.find((x) => x.id === id)).filter((x): x is ExamSummary => !!x && !!x.mainFile && desktop);
  const tabBar = docTabs.length > 0 && (
    <div className={`xt-bar${tabs.front ? ' over' : ''}`} role="tablist" aria-label="Đề đang mở (Ctrl+Tab đổi tab, Ctrl+W đóng)">
      <button type="button" role="tab" aria-selected={!tabs.front} className={`xt-tab xt-lib${!tabs.front ? ' on' : ''}`} onClick={() => setTabs((t) => ({ ...t, front: null }))}>Thư viện</button>
      {docTabs.map((e) => {
        const st = tabStat.get(e.id);
        const c = st?.compile;
        return (
          <span key={e.id} className={`xt-tab${tabs.front === e.id ? ' on' : ''}`} title={e.name} onAuxClick={(ev) => { if (ev.button === 1) { ev.preventDefault(); askCloseDoc(e.id); } }}>
            <button type="button" role="tab" aria-selected={tabs.front === e.id} className="xt-name" onClick={() => setTabs((t) => ({ ...t, front: e.id }))}>
              {c === 'running' && <span className="xt-st run" aria-label="đang biên dịch" title="Đang biên dịch">⟳</span>}
              {c === 'waiting' && <span className="xt-st wait" aria-label="chờ lượt biên dịch" title="Chờ lượt biên dịch">⏳</span>}
              {c === 'failed' && <span className="xt-st bad" aria-label="biên dịch lỗi" title="Biên dịch lỗi">!</span>}
              <span className="xt-text">{e.name}</span>
              {st?.dirty && <span className="xt-dot" aria-label="chưa lưu" title="Có tệp chưa lưu">●</span>}
            </button>
            <button type="button" className="xt-x" aria-label={`Đóng ${e.name}`} title="Đóng (Ctrl+W)" onClick={() => askCloseDoc(e.id)}>×</button>
          </span>
        );
      })}
      <span className="xt-count xl-meta" title={`Mở tối đa ${MAX_TABS} đề cùng lúc`}>{docTabs.length}/{MAX_TABS}</span>
    </div>
  );

  return (
    <>
      {tabBar}
      <header className="page-head bank-head">
        <h1>Thư viện đề thi</h1>
        <div className="head-actions">
          <span className="xl-menu">
            <button type="button" className="btn btn-outline" disabled={!desktop} aria-haspopup="menu" aria-expanded={menu === 'tools'} onClick={() => setMenu(menu === 'tools' ? null : 'tools')}>Công cụ ▾</button>
            {menu === 'tools' && (
              <span className="more-menu xl-pop" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setPanel('trash'); }}><b>Thùng rác đề</b><small>Khôi phục đề đã xoá</small></button>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setPanel('backup'); }}><b>Sao lưu / khôi phục thư viện</b><small>Bản sao toàn bộ đề, riêng với ngân hàng câu hỏi</small></button>
              </span>
            )}
          </span>
          <span className="xl-menu">
            <button type="button" className="btn btn-accent" disabled={!desktop || busy} aria-haspopup="menu" aria-expanded={menu === 'add'} onClick={() => setMenu(menu === 'add' ? null : 'add')}>+ Thêm đề ▾</button>
            {menu === 'add' && (
              <span className="more-menu xl-pop" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(null); go({ screen: 'exam' }); }}><b>Tạo đề từ ngân hàng</b><small>Chọn câu theo ma trận, trộn mã đề</small></button>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setNewName(''); }}><b>Tạo đề trống{place ? ' tại mục này' : ''}</b><small>{place ? trail.join(' › ') : 'Soạn LaTeX trực tiếp'}</small></button>
                <hr />
                <button type="button" role="menuitem" onClick={() => pick(chooseTexFile)}><b>Nhập file .tex</b><small>Sao chép vào thư viện, tệp gốc giữ nguyên</small></button>
                <button type="button" role="menuitem" onClick={() => pick(chooseProjectFolder)}><b>Nhập thư mục dự án</b><small>Đề nhiều tệp (hình, gói riêng…)</small></button>
                <button type="button" role="menuitem" onClick={importBundle}><b>Nhập gói đề HEdu</b><small>Gói xuất từ máy khác</small></button>
              </span>
            )}
          </span>
        </div>
      </header>

      {!desktop && <div className="note warn xl-note" role="status"><div className="note-body"><b>Chỉ có trên app Windows</b><span>Thư viện đề lưu tệp trên máy nên không dùng được ở bản xem thử trên trình duyệt.</span></div></div>}
      {load === 'error' && <div className="note bad xl-note" role="alert"><div className="note-body"><b>Chưa đọc được thư viện đề</b><span>{err} Tệp của bạn trong thư viện không bị xoá.</span></div></div>}

      <div className="body-row">
        <aside className="fside" aria-label="Cây đề thi">
          <div className="fs-top"><h2>Cây mục lục</h2></div>
          <div className="fs-scroll">
            <ExamTree tree={tree} total={base.length} sel={node} showEmpty={showEmpty} onShowEmpty={setShowEmpty} onPick={setNode} />
          </div>
        </aside>

        <section className="qlist" aria-label="Danh sách đề">
          <div className="qbar">
            <label className="search sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <span className="sr-only">Tìm đề</span>
              <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tìm theo tên đề, nhãn, năm học, tệp chính…" />
            </label>
            <span className="xl-menu">
              <button type="button" className={`btn btn-sm fs-open${nFilters ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={menu === 'filter'} onClick={() => setMenu(menu === 'filter' ? null : 'filter')}>Bộ lọc ▾{nFilters > 0 && <em className="fs-badge">{nFilters}</em>}</button>
              {menu === 'filter' && (
                <span className="more-menu xl-pop xl-filter" role="dialog" aria-label="Bộ lọc">
                  <label>Năm học
                    <select className="xl-in" value={year ?? ''} onChange={(e) => setYear(e.target.value || null)}>
                      <option value="">Mọi năm học</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </label>
                  <label>Trạng thái
                    <select className="xl-in" value={status ?? ''} onChange={(e) => setStatus((e.target.value || null) as ExamStatus | null)}>
                      <option value="">Mọi trạng thái</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn btn-sm" disabled={!nFilters && !text && !node} onClick={() => { clearAll(); setMenu(null); }}>Xoá mọi bộ lọc</button>
                </span>
              )}
            </span>
            <label className="qsel" title="Sắp xếp">
              <select value={sort} onChange={(e) => setSort(e.target.value as ExamSort)} aria-label="Sắp xếp">
                {(Object.keys(SORT_LABEL) as ExamSort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
              </select>
            </label>
          </div>

          <div className="xl-crumb">
            <b>{trail.length ? trail.join(' › ') : 'Tất cả đề'}</b>
            {place && <button type="button" className="btn btn-sm" disabled={!desktop || busy} onClick={() => setNewName('')}>+ Tạo đề trống tại đây</button>}
          </div>

          {inNode.length > 0 && (
            <div className="qstats" role="group" aria-label="Thống kê trạng thái (bấm để lọc)">
              <span className="qs-title">Thống kê</span>
              <div className="qs-grp">
                <span className="qs-col qs-head"><span>Trạng thái</span><span>Số đề</span></span>
                {STATUSES.map((s) => (
                  <button key={s} type="button" className={`qs-col qs-btn xs-${s}`} aria-pressed={status === s} title={`${STATUS_LABEL[s]}: bấm để lọc (bấm lần nữa để bỏ)`} onClick={() => setStatus(status === s ? null : s)}>
                    <span>{STATUS_LABEL[s]}</span><span>{nf.format(byStatus.get(s) ?? 0)}</span>
                  </button>
                ))}
              </div>
              <div className="qs-grp qs-end">
                {status
                  ? <button type="button" className="qs-col qs-btn qs-sum" title="Bỏ lọc trạng thái" onClick={() => setStatus(null)}><span>Bỏ lọc ✕</span><span>{nf.format(list.length)}</span></button>
                  : <span className="qs-col qs-sum"><span>Tổng</span><span>{nf.format(list.length)}</span></span>}
              </div>
            </div>
          )}

          {load === 'loading' && <p className="aid-wait" role="status">Đang đọc thư viện đề…</p>}
          {load === 'ok' && desktop && items.length === 0 && (
            <div className="empty" role="status">
              <b>Thư viện đề chưa có đề nào.</b>
              <span>Tạo đề từ ngân hàng câu hỏi, tạo đề trống, hoặc nhập file .tex / thư mục / gói đề có sẵn bằng nút “+ Thêm đề”.</span>
            </div>
          )}
          {items.length > 0 && list.length === 0 && (
            <div className="empty" role="status">
              <b>{nFilters || text ? 'Không có đề nào khớp bộ lọc.' : 'Mục này chưa có đề.'}</b>
              {place && <span>Bấm “+ Tạo đề trống tại đây”, hoặc “+ Thêm đề” để nhập đề vào đúng mục này.</span>}
              {(nFilters > 0 || !!text) && <button type="button" className="btn btn-sm" onClick={clearAll}>Xoá bộ lọc</button>}
            </div>
          )}
          {shown.length > 0 && <div className="xc-grid">{shown.map(card)}</div>}
          {pages > 1 && (
            <nav className="pager" aria-label="Phân trang">
              <button type="button" className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹ Trước</button>
              <span>Trang <b>{cur + 1}</b> / {nf.format(pages)}</span>
              <button type="button" className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Sau ›</button>
            </nav>
          )}
        </section>
      </div>

      {newName !== null && (
        <Modal title={<b>Tạo đề trống</b>} onClose={() => setNewName(null)} foot={<span className="qm-nav">
          <button type="button" className="btn btn-outline" onClick={() => setNewName(null)}>Huỷ</button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={createBlank}>Tạo đề</button>
        </span>}>
          <label className="xm-field">Tên đề <input className="xl-in" value={newName} autoFocus maxLength={120} placeholder="Ví dụ: Đề giữa kỳ 1 Toán 12 — 2026" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void createBlank(); }} /></label>
          <p className="xl-meta">{place ? <>Đề sẽ nằm ở: <b>{trail.join(' › ')}</b>. Đổi được sau trong Thông tin đề.</> : 'Đề chưa được xếp vào mục nào; chọn lớp, loại đề trong Thông tin đề sau khi tạo (hoặc chọn một mục ở cây trước khi tạo).'}</p>
        </Modal>
      )}

      {pending && (
        <Modal title={<b>Nhập đề vào thư viện</b>} onClose={() => setPending(null)} foot={<span className="qm-nav">
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setPending(null)}>Huỷ</button>
          <button type="button" className="btn btn-accent" disabled={busy || pending.scan.truncated} onClick={confirmImport}>{busy ? 'Đang chép…' : 'Nhập vào thư viện'}</button>
        </span>}>
          <p className="xl-meta"><code>{pending.path}</code></p>
          <ul className="xl-lines">{describeScan(pending.scan).map((l, i) => <li key={i}>{l}</li>)}</ul>
          {pending.scan.skipped.length > 0 && (
            <details open><summary>Các mục không được chép ({pending.scan.skipped.length})</summary>
              <ul className="xl-lines">{pending.scan.skipped.slice(0, 50).map((k, i) => <li key={i}><code>{k.rel}</code>: {k.reason}</li>)}{pending.scan.skipped.length > 50 && <li>…và {pending.scan.skipped.length - 50} mục khác.</li>}</ul>
            </details>
          )}
          <label className="xm-field">Tên đề <input className="xl-in" value={pending.name} maxLength={120} onChange={(e) => setPending({ ...pending, name: e.target.value })} /></label>
          {pending.scan.kind === 'multi' && (
            <label className="xm-field">Tệp chính
              <select className="xl-in" value={pending.main} onChange={(e) => setPending({ ...pending, main: e.target.value })}>
                <option value="">{pending.scan.candidates.length ? '— chọn tệp chính —' : '— chọn sau —'}</option>
                {(pending.scan.candidates.length ? pending.scan.candidates : pending.scan.files.filter((f) => f.rel.toLowerCase().endsWith('.tex')).map((f) => f.rel)).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          )}
          <p className="xl-meta">{place ? <>Đề sẽ nằm ở: <b>{trail.join(' › ')}</b>.</> : 'Đề chưa được xếp vào mục nào (chọn lớp, loại đề sau trong Thông tin đề).'}</p>
        </Modal>
      )}

      {activeId && !viewing && (
        <Modal wide onClose={closeInfo} title={detail ? <>
          <span className={`xc-type tone-${catTone(catOfType(detail.metadata.examType))}`}>{typeText(detail.metadata.examType)}</span>
          <b className="xm-name">{detail.name}</b>
          <span className={`xc-st st-${detail.status}`}>{STATUS_LABEL[detail.status]}</span>
        </> : <b>Đang đọc…</b>} foot={detail && <>
          <button type="button" className="btn btn-sm btn-danger-soft" disabled={busy} onClick={() => setAsk('trash')}>Chuyển vào Thùng rác…</button>
          <span className="qm-nav">
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => activeId && void examReveal(activeId).catch((e) => toast(msg(e)))}>Hiện trong Explorer</button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={exportBundle}>Xuất gói…</button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={duplicate}>Sao chép thành đề mới</button>
          </span>
        </>}>
          {!detail ? <p className="aid-wait">Đang đọc…</p> : (
            <>
              <div className="xm-acts">
                <button type="button" className="btn btn-accent" disabled={!desktop || !detail.mainFile} onClick={() => { const e = items.find((x) => x.id === activeId); infoFrom.current = null; setActiveId(null); if (e) openDoc(e); }}>Biên tập & biên dịch</button>
                {goods.map((g) => <button key={g.mode} type="button" className="btn btn-outline" onClick={() => setViewing(g.mode as ExamMode)}>Xem PDF: {modeLabel(g.mode)}</button>)}
                <button type="button" className="btn btn-outline" disabled={!desktop || busy} title="PDF từng mã đề, gói giáo viên hoặc học sinh, Excel đáp án (đề tạo bằng Tạo đề)" onClick={() => setExportingCodes(true)}>Xuất từng mã đề…</button>
              </div>
              <dl className="xm-facts">
                <div><dt>Vị trí</dt><dd>{(activeSum && examTrail(activeSum, tax).join(' › ')) || 'Chưa xếp lớp'}{detail.folder ? ` · Thư mục: ${detail.folder}` : ''}</dd></div>
                <div><dt>Năm học</dt><dd>{detail.metadata.schoolYear ?? '—'}</dd></div>
                <div><dt>Tệp chính</dt><dd><code>{detail.mainFile ?? 'chưa chọn'}</code></dd></div>
                <div><dt>Nguồn</dt><dd>{detail.source.mode === 'created' ? 'Tạo trong HEdu' : detail.source.mode === 'duplicated' ? detail.source.originalPathDisplay : detail.source.mode === 'restored' ? `Khôi phục từ ${detail.source.originalPathDisplay}` : `Chép từ ${detail.source.originalPathDisplay}`}</dd></div>
                <div><dt>Tạo lúc</dt><dd>{dateText(detail.createdAt)}</dd></div>
                <div><dt>Sửa lúc</dt><dd>{dateText(detail.updatedAt)}</dd></div>
                {goods.map((g) => <div key={g.mode}><dt>PDF {modeLabel(g.mode)}</dt><dd>{g.pages ?? '?'} trang · {g.engine} · {dateText(g.at)}</dd></div>)}
              </dl>
              <ExamInfoForm detail={detail} folders={folders} busy={busy} hasPdf={goods.length > 0} onSave={saveMeta} open />
              {detail.warnings.length > 0 && <div className="note warn"><div className="note-body">{detail.warnings.map((w, i) => <span key={i}>{w}</span>)}</div></div>}
              {detail.skipped.length > 0 && <details><summary>{detail.skipped.length} mục không được chép</summary><ul className="xl-lines">{detail.skipped.map((k, i) => <li key={i}><code>{k.rel}</code>: {k.reason}</li>)}</ul></details>}
              <details><summary>{detail.files.length} tệp trong đề</summary>
                <ul className="xl-lines">{detail.files.slice(0, 300).map((f) => <li key={f.rel}><code>{f.rel}</code> <span className="xl-meta">{formatBytes(f.bytes)}</span></li>)}{detail.files.length > 300 && <li>…và {detail.files.length - 300} tệp khác.</li>}</ul>
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
              </details>
            </>
          )}
        </Modal>
      )}

      {viewing && activeId && detail && <PdfViewer id={activeId} title={detail.name} stale={false} mode={viewing} note={MODE_NOTE[viewing]} onClose={() => setViewing(null)} />}
      {exportingCodes && activeId && detail && <ExamExportDialog id={activeId} name={detail.name} onToast={toast} onClose={() => setExportingCodes(false)} />}
      {docTabs.map((e) => (
        <ExamWorkspace key={e.id} ref={(h) => { if (h) wsRefs.current.set(e.id, h); else wsRefs.current.delete(e.id); }} id={e.id} name={e.name} mainFile={e.mainFile}
          hidden={tabs.front !== e.id} onStatus={onTabStatus}
          onLibrary={() => setTabs((t) => ({ ...t, front: null }))}
          onInfo={() => { infoFrom.current = e.id; setTabs((t) => ({ ...t, front: null })); setActiveId(e.id); }}
          onClose={() => closeDoc(e.id)} />
      ))}
      {panel === 'trash' && <ExamTrashPanel toast={toast} onClose={() => setPanel(null)} onChanged={(rid) => { void reload().then(() => { if (rid) setActiveId(rid); }); }} />}
      {panel === 'backup' && <ExamBackupPanel toast={toast} onClose={() => setPanel(null)} onChanged={() => void reload()} />}
      {ask === 'trash' && detail && (
        <ConfirmDialog title="Chuyển vào Thùng rác đề?" confirmLabel="Chuyển vào Thùng rác" cancelLabel="Giữ lại" busy={busy} onCancel={() => setAsk(null)} onConfirm={trash}>
          <p>Đề “{detail.name}” sẽ rời khỏi thư viện nhưng KHÔNG bị xoá: bạn khôi phục được ở Công cụ › Thùng rác đề.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
