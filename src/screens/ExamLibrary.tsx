// Màn Thư viện đề thi (bố cục giống Ngân hàng): cây mục lục bên trái (Lớp → Ôn tập theo bài học / Đề kiểm tra GK1–CK2 / Đề ôn tập /
// Thi thử, Thư mục riêng) · thanh tìm + bộ lọc + sắp xếp · thống kê trạng thái · lưới thẻ đề bằng nhau · bấm thẻ mở cửa sổ chi tiết.
// Nhập .tex/thư mục/gói (sao chép, tệp gốc không bị đụng), tạo đề trống ngay tại mục đang chọn (điền sẵn lớp/loại/chương/bài),
// sao chép (phiên bản mới), đổi thông tin, chốt đề, Thùng rác đề, sao lưu/khôi phục thư viện đề, Biên tập và xem PDF.
// Bấm thẻ đề = mở đề thành một tab (thanh tab trên cùng: tab Thư viện cố định + tối đa 8 đề; nhớ tab khi tắt app; logic ở examtabs.ts).
// Thông tin đề ở ngăn bên phải; chuột phải vào thẻ mở menu thao tác; Space trên thẻ xem nhanh PDF; kéo-thả tệp .tex/thư mục vào để nhập.
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
import { CAT_LABEL, CAT_NONE, CATS, catOfType, examCounts, examTrail, examTree, filterByNode, matchesCat, movePatch, nodeTrail, placementOf, type ExamCat } from '../lib/examtree';
import { NO_SELECTION, clickSelect, pickedItems, pruneSelection, runBatch, selectAll, stepSelect, type Selection } from '../lib/examselect';
import { createFolder, deleteFolder, folderExamCount, knownFolders, loadFolders, moveFolder, renameFolder, saveFolders, type FolderResult } from '../lib/examfolders';
import { startDrag } from '../lib/examdrag';
import { clickCol, COL_LABEL, COL_ORDER, DEFAULT_COL_SORT, gridTemplate, hiddenClass, parseColVis, serializeColVis, shownCols, FILE_KIND_LABEL, fileRows, inSmart, isStar, parseColSort, SMART_LABEL, sortByCol, withStar, type ColSort, type SmartKey } from '../lib/examcols';
import { exportAllPdf, exportPdf } from '../lib/exampdf';
import { invoke, isDesktop, listen } from '../lib/platform';
import { scanUsage } from '../lib/examusage';
import {
  bundleFolderName, chooseProjectFolder, chooseTexFile, dateText, describeScan, examBundleExport, examBundleImport, examCreate, examDuplicate, examGet, examImport, examList, examMetaUpdate,
  examReveal, examScan, examSearchText, examTrash, examTrashRestore, examVerify, filterExams, formatBytes, needsMainChoice, STATUS_LABEL,
  type ExamManifest, type ExamMetaIn, type ExamScan, type ExamStatus, type ExamSummary, type ExamVerify, type TextHit,
} from '../lib/examlib';
import { ExamWorkspace, type ExamWorkspaceHandle } from './ExamWorkspace';
import { closeTab, cycleTab, keepExisting, loadTabs, MAX_TABS, openTab, saveTabs, type TabsState, type TabStatus } from '../lib/examtabs';
import { ExamExportDialog } from '../components/ExamExportDialog';
import { ExamPackDialog } from '../components/ExamPackDialog';
import { ExamStatsDialog } from '../components/ExamStatsDialog';
import { ExamColumns } from '../components/ExamColumns';
import { PdfThumb } from '../components/PdfThumb';
import { ExamBatchImportDialog } from '../components/ExamBatchImportDialog';
import { batchCandidates, type BatchCandidate } from '../lib/examimportbatch';
import { chooseFolder as chooseSourceFolder, scanSources } from '../lib/importfiles';
import { checkExam, type ExamCheck } from '../lib/examcheck';
import { fileRead } from '../lib/examfiles';
import { UndoStack, undoMessage, type UndoEntry } from '../lib/examundo';
import { hasControlChars } from '../lib/examgen';
import { parseMatrixSpec } from '../lib/exammatrix';
import { exportMatrixXlsx } from '../lib/exampack';
import { useBank } from '../lib/store';

const nf = new Intl.NumberFormat('vi-VN');
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const STATUSES: ExamStatus[] = ['draft', 'needs_review', 'finalized'];
const PER_PAGE = 60;
const PER_PAGE_LIST = 200;
const COLSORT_KEY = 'hedu.examcolsort';
const SIDEW_KEY = 'hedu.examside';
const SIDEW_DEFAULT = 250;
const VIEW_KEY = 'hedu.examview';
type View = 'card' | 'list' | 'cols';
const loadView = (): View => { try { const v = localStorage.getItem(VIEW_KEY); return v === 'card' || v === 'cols' ? v : 'list'; } catch { return 'list'; } };
const COLVIS_KEY = 'hedu.examcolvis';
/** màu thẻ theo nhóm loại đề */
const catTone = (c: ExamCat | null): string => (c === 'gk1' || c === 'gk2' ? 'gk' : c === 'ck1' || c === 'ck2' ? 'ck' : c === 'thi-thu' ? 'tt' : c === 'on-bai' || c === 'on-chuong' || c === 'on-tap' ? 'ot' : c === 'kt-khac' ? 'kt' : 'na');
/** nhóm trung gian và tên loại (đã có ở nhãn màu) không lặp lại ở dòng vị trí của thẻ */
const HIDE_IN_WHERE = new Set<string>(['Đề kiểm tra', 'Ôn tập theo bài học', 'Đề ôn tập', 'Đề thi thử', 'Chưa phân loại', ...Object.values(CAT_LABEL)]);
const typeText = (t: string | null | undefined) => { const c = catOfType(t); return c ? CAT_LABEL[c] : t || 'Chưa phân loại'; };

interface Pending { path: string; scan: ExamScan; name: string; main: string }

/** Khung cửa sổ dùng chung của màn này (Esc đóng, trừ khi đang có hộp xác nhận). */
function Modal({ title, onClose, wide, side, children, foot }: { title: React.ReactNode; onClose(): void; wide?: boolean; /** ngăn trượt bên phải (thông tin đề) thay vì hộp giữa màn */ side?: boolean; children: React.ReactNode; foot?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.cfm') && !document.querySelector(".ew:not(.off), .pv:not(.pv-embedded)")) { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className={`qm-scrim${side ? ' xm-side-scrim' : ''}`} onClick={onClose} />
      <div className={`qm xm${wide ? '' : ' xm-sm'}${side ? ' xm-side' : ''}`} role="dialog" aria-modal="true">
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
  const bank = useBank();
  const qmap = useMemo(() => new Map(bank.questions.map((q) => [q.uid, q] as const)), [bank.questions]);
  const desktop = isDesktop();
  const [items, setItems] = useState<ExamSummary[]>([]);
  const [load, setLoad] = useState<'loading' | 'ok' | 'error'>(desktop ? 'loading' : 'ok');
  const [err, setErr] = useState<string | null>(null);
  const [node, setNode] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<ExamStatus | null>(null);
  const [year, setYear] = useState<string | null>(null);
  /** cột sắp xếp (bấm tiêu đề cột), nhớ theo máy */
  const [colSort, setColSortState] = useState<ColSort>(() => { try { return parseColSort(localStorage.getItem(COLSORT_KEY)); } catch { return DEFAULT_COL_SORT; } });
  const setColSort = (s: ColSort) => { setColSortState(s); try { localStorage.setItem(COLSORT_KEY, JSON.stringify(s)); } catch { /* không nhớ được thì thôi */ } };
  /** kiểu Finder: bấm = chọn (hiện thông tin bên phải), bấm đúp / Enter = mở thành tab */
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const sel = selection.primary;
  const setSel = (id: string | null) => setSelection(id ? { primary: id, picked: new Set([id]), anchor: id } : NO_SELECTION);
  /** lọc theo loại đề (null = mọi loại) */
  const [cat, setCat] = useState<ExamCat | typeof CAT_NONE | null>(null);
  /** thư mục riêng còn trống (chưa có đề), nhớ theo máy */
  const [extras, setExtrasState] = useState<string[]>([]);
  useEffect(() => { if (desktop) loadFolders().then(setExtrasState).catch(() => undefined); }, [desktop]);
  const setExtras = (x: string[]) => { setExtrasState(x); saveFolders(x).catch((e) => toast(`Không lưu được danh sách thư mục: ${msg(e)}`)); };
  /** menu chuột phải trên một thư mục ở cây; hộp thoại tạo/đổi tên/chuyển/xoá thư mục */
  const [fctx, setFctx] = useState<{ path: string; x: number; y: number } | null>(null);
  const [fdlg, setFdlg] = useState<null | { kind: 'new' | 'rename'; path: string; name: string } | { kind: 'move'; path: string; to: string } | { kind: 'delete'; path: string }>(null);
  /** hộp "Chuyển tới…" cho một nhóm đề */
  const [movePick, setMovePick] = useState<{ items: ExamSummary[]; key: string | null } | null>(null);
  /** nhóm đề chờ xác nhận chuyển vào Thùng rác */
  const [askTrashMany, setAskTrashMany] = useState<ExamSummary[] | null>(null);
  /** nhóm đề đang mở hộp "Xuất trọn gói" */
  const [packing, setPacking] = useState<ExamSummary[] | null>(null);
  /** hộp thống kê sau thi của một đề (có hedu-de.json) */
  const [stats, setStats] = useState<{ name: string; spec: NonNullable<ReturnType<typeof parseMatrixSpec>> } | null>(null);
  /** hộp nhập nhiều đề từ một thư mục */
  const [batchImp, setBatchImp] = useState<{ folder: string; items: BatchCandidate[]; truncated: boolean } | null>(null);
  const [smart, setSmart] = useState<SmartKey | null>(null);
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set());
  const [rowFiles, setRowFiles] = useState<ReadonlyMap<string, ExamManifest['files']>>(new Map());
  const [selGoods, setSelGoods] = useState<GoodInfo[]>([]);
  /** độ rộng thanh bên (kéo mép phải để đổi, nhớ theo máy) */
  const [sideW, setSideW] = useState<number>(() => { try { const n = Number(localStorage.getItem(SIDEW_KEY)); return n >= 180 && n <= 460 ? n : SIDEW_DEFAULT; } catch { return SIDEW_DEFAULT; } });
  const startResize = (ev: React.PointerEvent) => {
    ev.preventDefault();
    const x0 = ev.clientX, w0 = sideW;
    let w = w0;
    const mv = (e: PointerEvent) => { w = Math.max(180, Math.min(460, w0 + e.clientX - x0)); setSideW(w); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); try { localStorage.setItem(SIDEW_KEY, String(w)); } catch { /* không nhớ được thì thôi */ } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const resetSide = () => { setSideW(SIDEW_DEFAULT); try { localStorage.removeItem(SIDEW_KEY); } catch { /* bỏ qua */ } };
  /** kiểu xem: thẻ hoặc danh sách (nhớ theo máy) */
  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* không nhớ được thì thôi */ } };
  const perPage = view === 'list' || view === 'cols' ? PER_PAGE_LIST : PER_PAGE;
  /** cột hiện/ẩn của bảng (nhớ theo máy); cửa sổ hẹp tự ẩn các cột phụ */
  const [colVis, setColVisState] = useState(() => { try { return parseColVis(localStorage.getItem(COLVIS_KEY)); } catch { return parseColVis(null); } });
  const setColVis = (v: ReadonlySet<(typeof COL_ORDER)[number]>) => { setColVisState(v); try { localStorage.setItem(COLVIS_KEY, serializeColVis(v)); } catch { /* không nhớ được thì thôi */ } };
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 1280px)').matches);
  useEffect(() => {
    const m = window.matchMedia?.('(max-width: 1280px)');
    if (!m) return;
    const f = () => setNarrow(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  const cols = useMemo(() => shownCols(colVis, narrow), [colVis, narrow]);
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState<null | 'add' | 'tools' | 'filter' | 'export' | 'cols'>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExamManifest | null>(null);
  const [check, setCheck] = useState<ExamVerify | null>(null);
  /** kiểm tra trước khi chốt của đề đang mở hộp Thông tin */
  const [checks, setChecks] = useState<ExamCheck[] | null>(null);
  /** hoàn tác: mỗi mục nhớ thông tin TRƯỚC khi đổi (chỉ trong phiên này) */
  const undoRef = useRef(new UndoStack());
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const rememberUndo = (e: UndoEntry) => { undoRef.current.push(e); setUndoLabel(undoRef.current.peek()?.label ?? null); };
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
  /** đề đang chờ xác nhận chuyển vào Thùng rác */
  const [askTrash, setAskTrash] = useState<ExamSummary | null>(null);
  /** menu chuột phải trên thẻ đề */
  const [ctx, setCtx] = useState<{ e: ExamSummary; x: number; y: number } | null>(null);
  /** xem nhanh PDF (Space trên thẻ) */
  const [peek, setPeek] = useState<{ id: string; name: string; mode: ExamMode } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [newName, setNewName] = useState<string | null>(null);
  /** đổi tên nhanh một đề (chuột phải › Đổi tên, hoặc F2 trên thẻ) */
  const [renaming, setRenaming] = useState<{ e: ExamSummary; name: string } | null>(null);

  const reload = useCallback(async () => {
    try { setItems(await examList()); setLoad('ok'); setErr(null); }
    catch (e) { setLoad('error'); setErr(msg(e)); }
  }, []);
  useEffect(() => { if (desktop) void reload(); }, [desktop, reload]);
  /** số câu của từng đề (đề tạo bằng Tạo đề có danh sách câu nguồn) */
  const [qn, setQn] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => { if (!desktop || !items.length) return; scanUsage().then((u) => setQn(new Map(u.projects.map((p) => [p.id, p.uids.length] as const)))).catch(() => undefined); }, [desktop, items]);

  // PDF đã biên dịch của đề đang chọn (cho nút Xuất PDF, ngăn thông tin, menu chuột phải)
  useEffect(() => {
    setSelGoods([]);
    if (!desktop || !sel) return;
    let dead = false;
    examCompileAll(sel).then((g) => { if (!dead) setSelGoods(g); }).catch(() => undefined);
    return () => { dead = true; };
  }, [desktop, sel, items]);

  useEffect(() => {
    setChecks(null);
    if (!desktop || !activeId || !detail || detail.projectId !== activeId) return;
    let dead = false;
    const run = (spec: ReturnType<typeof parseMatrixSpec>, tex: string | null) => { if (!dead) setChecks(checkExam({
      mainFile: detail.mainFile, warningCount: detail.warnings.length, skippedCount: detail.skipped.length, goods, spec, tex,
      question: (uid) => { const q = qmap.get(uid); return q ? { review: q.review, ctrl: hasControlChars(q) } : undefined; },
    })); };
    const texP = detail.mainFile ? fileRead(activeId, detail.mainFile).then((f) => f.text).catch(() => null) : Promise.resolve<string | null>(null);
    void texP.then((tex) => invoke<string | null>('exam_spec_text', { id: activeId }).then((t) => run(t ? parseMatrixSpec(t) : null, tex)).catch(() => run(null, tex)));
    return () => { dead = true; };
  }, [desktop, activeId, detail, goods, qmap]);
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
  // tìm chữ: khớp tên/thông tin đề HOẶC nội dung các tệp .tex (đọc ở nền, chờ gõ xong)
  const [hits, setHits] = useState<ReadonlyMap<string, TextHit>>(new Map());
  useEffect(() => {
    const q = text.trim();
    if (!desktop || q.length < 2) { setHits((h) => (h.size ? new Map() : h)); return; }
    let dead = false;
    const t = window.setTimeout(() => { examSearchText(q).then((h) => { if (!dead) setHits(new Map(h.map((x) => [x.id, x] as const))); }).catch(() => undefined); }, 350);
    return () => { dead = true; window.clearTimeout(t); };
  }, [desktop, text, items]);
  const base = useMemo(() => {
    const yr = items.filter((e) => !year || e.metadata.schoolYear === year);
    const meta = new Set(filterExams(yr, { text, kind: 'all', status: 'all' }).map((e) => e.id));
    return yr.filter((e) => meta.has(e.id) || (!!text.trim() && hits.has(e.id)));
  }, [items, year, text, hits]);
  const counts = useMemo(() => examCounts(base, tax), [base, tax]);
  const tree = useMemo(() => examTree(tax, counts, base, showEmpty, extras), [tax, counts, base, showEmpty, extras]);
  const inNode = useMemo(() => filterByNode(base, node, tax), [base, node, tax]);
  const nowMs = useMemo(() => Date.now(), [items]); // eslint-disable-line react-hooks/exhaustive-deps
  const inScope = useMemo(() => (smart ? base.filter((e) => inSmart(e, smart, nowMs)) : inNode), [smart, base, inNode, nowMs]);
  const list = useMemo(() => sortByCol(inScope.filter((e) => (!status || e.status === status) && matchesCat(e, cat)), colSort, qn), [inScope, status, cat, colSort, qn]);
  const listIds = useMemo(() => list.map((x) => x.id), [list]);
  const pickedE = useMemo(() => pickedItems(list, selection), [list, selection]);
  const multi = pickedE.length > 1;
  const ctxGroup = ctx && selection.picked.has(ctx.e.id) && pickedE.length > 1 ? pickedE : null;
  const multiStat = useMemo(() => {
    const st = new Map<string, number>(), ty = new Map<string, number>();
    let bytes = 0;
    for (const e of pickedE) { st.set(STATUS_LABEL[e.status], (st.get(STATUS_LABEL[e.status]) ?? 0) + 1); const t = typeText(e.metadata.examType); ty.set(t, (ty.get(t) ?? 0) + 1); bytes += e.totalBytes; }
    const fmt = (m: Map<string, number>) => [...m].map(([k, v]) => `${k} ${v}`).join(' · ');
    return { bytes, status: fmt(st), type: fmt(ty), allStar: pickedE.length > 0 && pickedE.every(isStar) };
  }, [pickedE]);
  // đề không còn hiện (bị lọc mất, đã xoá) thì bỏ khỏi vùng chọn
  useEffect(() => { setSelection((s) => pruneSelection(s, new Set(listIds))); }, [listIds]);
  const smartCounts = useMemo(() => ({ recent: base.filter((e) => inSmart(e, 'recent', nowMs)).length, star: base.filter(isStar).length, review: base.filter((e) => e.status === 'needs_review').length }), [base, nowMs]);
  const selE = items.find((x) => x.id === sel) ?? null;
  const years = useMemo(() => [...new Set(items.map((e) => e.metadata.schoolYear).filter((y): y is string => !!y))].sort().reverse(), [items]);
  const folders = useMemo(() => allFolders(items), [items]);
  const allFolderPaths = useMemo(() => knownFolders(items, extras), [items, extras]);
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const cur = Math.min(page, pages - 1);
  const shown = list.slice(cur * perPage, cur * perPage + perPage);
  useEffect(() => { setPage(0); }, [node, smart, text, status, cat, year, colSort, view]);
  const fullTree = useMemo(() => examTree(tax, counts, base, true, extras), [tax, counts, base, extras]);
  const trail = nodeTrail(fullTree, node);
  const place = placementOf(node);
  const nFilters = (status ? 1 : 0) + (year ? 1 : 0) + (cat ? 1 : 0);
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
  const chooseBatch = () => run(async () => {
    setMenu(null);
    const folder = await chooseSourceFolder();
    if (!folder) return;
    const sc = await scanSources([folder]);
    const r = batchCandidates(folder, sc.files);
    setBatchImp({ folder, items: r.items, truncated: r.truncated || sc.truncated });
  });
  const createBlank = () => run(async () => {
    const s = await placeNew(await examCreate(newName ?? ''));
    setNewName(null);
    await reload();
    setActiveId(s.id);
  });
  const verify = () => run(async () => { if (activeId) setCheck(await examVerify(activeId)); });
  const duplicate = (id: string | null) => run(async () => {
    if (!id) return;
    const s = await examDuplicate(id, null);
    await reload();
    setActiveId(s.id);
    toast(`Đã tạo bản sao “${s.name}” (đang soạn). Đề gốc không đổi.`);
  });
  const exportBundle = (e: { id: string; name: string } | null) => run(async () => {
    if (!e) return;
    const parent = await chooseProjectFolder();
    if (!parent) return;
    const dest = await examBundleExport(e.id, parent, bundleFolderName(e.name));
    toast(`Đã xuất gói: ${dest}`);
  });
  const saveMeta = (m: Parameters<typeof examMetaUpdate>[1]) => run(async () => {
    if (!activeId) return;
    const before = items.find((x) => x.id === activeId);
    if (before && m.status !== 'finalized') rememberUndo({ label: 'Sửa thông tin đề', metas: [{ id: before.id, meta: metaOf(before) }] });
    const s = await examMetaUpdate(activeId, m);
    await reload();
    loadDetail(activeId);
    toast(s.status === 'finalized' && m.status === 'finalized' && detail?.status !== 'finalized' ? `Đã chốt đề “${s.name}”.` : 'Đã lưu thông tin đề.');
  });
  /** hỏi trước khi chuyển vào Thùng rác; đề đang mở ở tab thì nhắc đóng tab trước */
  const askToTrash = (e: ExamSummary | undefined) => {
    if (!e) return;
    if (tabs.ids.includes(e.id)) { toast('Đề này đang mở ở một tab. Đóng tab của đề (dấu × ở thanh trên cùng) rồi mới chuyển vào Thùng rác.'); return; }
    setAskTrash(e);
  };
  const trash = () => run(async () => {
    const e = askTrash;
    if (!e) return;
    await examTrash(e.id);
    rememberUndo({ label: 'Chuyển đề vào Thùng rác', metas: [], trashed: [e.id] });
    setAskTrash(null);
    if (activeId === e.id) setActiveId(null);
    await reload();
    toast('Đã chuyển đề vào Thùng rác đề. Có thể khôi phục ở Công cụ › Thùng rác đề.');
  });
  /** đóng hộp Thông tin; mở từ tab đề thì quay lại đúng tab đó */
  const closeInfo = () => { const back = infoFrom.current; infoFrom.current = null; setActiveId(null); if (back) setTabs((t) => (t.ids.includes(back) ? { ...t, front: back } : t)); };
  /** Space trên thẻ: xem nhanh PDF gần nhất (ưu tiên bản Đề) */
  const quickLook = (e: ExamSummary) => {
    examCompileAll(e.id).then((g) => {
      const m = g.find((x) => x.mode === 'de') ?? g[0];
      if (m) setPeek({ id: e.id, name: e.name, mode: m.mode as ExamMode }); else toast('Đề này chưa có PDF. Mở đề rồi bấm “Biên dịch PDF”.');
    }).catch((err) => toast(msg(err)));
  };
  /** đặt tay "Cần rà soát" / bỏ dấu (đề đã chốt thì không đổi ở đây; chốt đề làm trong hộp Thông tin có xác nhận) */
  const metaOf = (e: ExamSummary, o: Partial<ExamMetaIn> = {}): ExamMetaIn => {
    const m = e.metadata;
    return { name: e.name, folder: e.folder ?? null, grade: m.grade ?? null, schoolYear: m.schoolYear ?? null, examType: m.examType ?? null, tags: m.tags ?? [], status: e.status, chapterId: m.chapterId ?? null, lessonId: m.lessonId ?? null, ...o };
  };
  const markStatus = (e: ExamSummary, status: ExamStatus) => run(async () => {
    rememberUndo({ label: status === 'needs_review' ? 'Đánh dấu cần rà soát' : 'Bỏ dấu cần rà soát', metas: [{ id: e.id, meta: metaOf(e) }] });
    await examMetaUpdate(e.id, metaOf(e, { status }));
    await reload();
    toast(status === 'needs_review' ? `Đã đánh dấu “${e.name}” cần rà soát.` : `Đã bỏ dấu cần rà soát của “${e.name}”.`);
  });
  /** chạy một thao tác cho cả nhóm đề: một đề lỗi không làm dừng cả lô; tải lại một lần; báo gọn kết quả */
  const bulk = (label: string, items: ExamSummary[], f: (e: ExamSummary) => Promise<void>) => run(async () => {
    rememberUndo({ label: `${(l => l.charAt(0).toUpperCase() + l.slice(1))(label.replace(/^Đã /, '').replace(/ \(.*$/, ''))} (${items.length} đề)`, metas: items.map((e) => ({ id: e.id, meta: metaOf(e) })) });
    const r = await runBatch(items, f);
    await reload();
    const bad = r.failed.slice(0, 3).map((x) => `“${x.item.name}” (${x.error})`).join('; ');
    toast(r.failed.length ? `${label}: xong ${r.done.length}/${items.length} đề. Lỗi: ${bad}${r.failed.length > 3 ? '…' : ''}` : `${label}: ${r.done.length} đề.`);
  });
  const setStar = (items: ExamSummary[], on: boolean) => bulk(on ? 'Đã gắn sao' : 'Đã bỏ sao', items, (e) => examMetaUpdate(e.id, metaOf(e, { tags: withStar(e.metadata.tags ?? [], on) })).then(() => undefined));
  const setReview = (items: ExamSummary[], on: boolean) => {
    const ok = items.filter((e) => e.status === (on ? 'draft' : 'needs_review'));
    if (!ok.length) { toast(on ? 'Chỉ đề “Đang soạn” mới đánh dấu cần rà soát được (đề đã chốt giữ nguyên).' : 'Không có đề nào đang ở “Cần rà soát”.'); return Promise.resolve(); }
    const skipped = items.length - ok.length;
    return bulk(`${on ? 'Đã đánh dấu cần rà soát' : 'Đã bỏ dấu cần rà soát'}${skipped ? ` (${skipped} đề khác trạng thái được giữ nguyên)` : ''}`, ok, (e) => examMetaUpdate(e.id, metaOf(e, { status: on ? 'needs_review' : 'draft' })).then(() => undefined));
  };
  /** chuyển nhóm đề tới một mục của cây (cùng quy tắc với kéo-thả một đề) */
  const moveExams = (items: ExamSummary[], key: string) => {
    const todo = items.filter((e) => !!movePatch(e, key));
    if (!todo.length) { toast('Các đề đã chọn đã nằm ở mục này.'); return Promise.resolve(); }
    const where = nodeTrail(fullTree, key).join(' › ') || key;
    return bulk(`Đã chuyển tới ${where}`, todo, (e) => examMetaUpdate(e.id, metaOf(e, movePatch(e, key)!)).then(() => undefined));
  };
  /** hỏi trước khi chuyển nhóm đề vào Thùng rác (đề đang mở ở tab thì bỏ qua và báo) */
  const askToTrashMany = (items: ExamSummary[]) => {
    if (items.length === 1) { askToTrash(items[0]); return; }
    const ok = items.filter((e) => !tabs.ids.includes(e.id));
    if (!ok.length) { toast('Các đề này đang mở ở tab. Đóng tab trước rồi mới chuyển vào Thùng rác.'); return; }
    if (ok.length < items.length) toast(`${items.length - ok.length} đề đang mở ở tab sẽ được giữ lại.`);
    setAskTrashMany(ok);
  };
  const trashMany = () => run(async () => {
    const items = askTrashMany;
    if (!items) return;
    const r = await runBatch(items, (e) => examTrash(e.id));
    rememberUndo({ label: `Chuyển ${r.done.length} đề vào Thùng rác`, metas: [], trashed: r.done.map((e) => e.id) });
    setAskTrashMany(null);
    if (activeId && r.done.some((e) => e.id === activeId)) setActiveId(null);
    await reload();
    toast(r.failed.length ? `Đã chuyển ${r.done.length}/${items.length} đề vào Thùng rác. Lỗi: ${r.failed.slice(0, 2).map((x) => `“${x.item.name}” (${x.error})`).join('; ')}` : `Đã chuyển ${r.done.length} đề vào Thùng rác đề. Khôi phục ở Công cụ › Thùng rác đề.`);
  });
  /** áp kết quả thao tác thư mục: ghi lại nhãn của các đề bên trong rồi lưu danh sách thư mục trống */
  const applyFolder = (r: FolderResult, from: string | null, done: string) => run(async () => {
    if (!r.ok) { toast(r.error); return; }
    const byId = new Map(items.map((e) => [e.id, e] as const));
    rememberUndo({ label: 'Thao tác thư mục', metas: r.patches.flatMap((pt) => { const e = byId.get(pt.id); return e ? [{ id: e.id, meta: metaOf(e) }] : []; }), extras: [...extras] });
    const res = await runBatch(r.patches, async (pt) => { const e = byId.get(pt.id); if (e) await examMetaUpdate(e.id, metaOf(e, { folder: pt.folder })); });
    await reload();
    if (res.failed.length) { toast(`Chỉ ghi được ${res.done.length}/${r.patches.length} đề (${res.failed[0].error}). Thư mục chưa đổi hết, hãy thử lại.`); return; }
    setExtras(r.extras);
    setFdlg(null);
    if (from !== null && node && (node === `f:${from}` || node.startsWith(`f:${from}/`))) setNode(r.path === null ? null : `f:${r.path}${node.slice(`f:${from}`.length)}`);
    toast(done);
  });
  /** Hoàn tác thao tác gần nhất: ghi lại thông tin cũ của từng đề, khôi phục từ Thùng rác, trả danh sách thư mục trống. */
  const undo = () => run(async () => {
    const e = undoRef.current.pop();
    setUndoLabel(undoRef.current.peek()?.label ?? null);
    if (!e) { toast('Không còn gì để hoàn tác.'); return; }
    const a = await runBatch(e.metas, (m) => examMetaUpdate(m.id, m.meta).then(() => undefined));
    const b = await runBatch(e.trashed ?? [], (id) => examTrashRestore(id).then(() => undefined));
    if (e.extras) setExtras(e.extras);
    await reload();
    toast(undoMessage(e, a.failed.length + b.failed.length));
  });
  const renameExam = () => run(async () => {
    const r = renaming;
    if (!r) return;
    const name = r.name.replace(/\s+/g, ' ').trim();
    if (!name) { toast('Tên đề không được để trống.'); return; }
    if (name === r.e.name) { setRenaming(null); return; }
    rememberUndo({ label: 'Đổi tên đề', metas: [{ id: r.e.id, meta: metaOf(r.e) }] });
    await examMetaUpdate(r.e.id, metaOf(r.e, { name }));
    setRenaming(null);
    await reload();
    toast(`Đã đổi tên thành “${name}”.`);
  });
  /** kéo thẻ/hàng đề vào một mục của cây: ghi lớp, loại, chương, bài hoặc thư mục theo mục đó */
  const moveExam = (e: ExamSummary, key: string) => moveExams([e], key);
  const exportMatrix = (e: ExamSummary) => run(async () => {
    const r = await exportMatrixXlsx(e, tax, (uid) => qmap.get(uid));
    if (r === 'none') toast('Đề này soạn tay (không tạo từ ngân hàng) nên không có ma trận để xuất.');
    else if (r) toast(`Đã xuất ma trận Excel: ${r}`);
  });
  const openStats = (e: ExamSummary) => run(async () => {
    const t = await invoke<string | null>('exam_spec_text', { id: e.id });
    const spec = t ? parseMatrixSpec(t) : null;
    if (!spec || !spec.perCode.length) { toast('Thống kê sau thi cần đáp án từng mã đề, chỉ có với đề tạo từ ngân hàng (Tạo đề).'); return; }
    setStats({ name: e.name, spec });
  });
  const reveal = (id: string) => void examReveal(id).catch((err) => toast(msg(err)));
  const exportOne = (e: ExamSummary, mode: ExamMode) => run(async () => {
    const dest = await exportPdf(e.id, e.name, mode);
    if (dest) toast(`Đã xuất PDF “${modeLabel(mode)}”: ${dest}`);
  });
  const exportEvery = (e: ExamSummary) => run(async () => {
    const r = await exportAllPdf(e.id, e.name, selGoods.map((g) => g.mode as ExamMode));
    if (r) toast(`Đã xuất ${r.n} bản PDF vào ${r.dir}`);
  });
  const toggleStar = (e: ExamSummary) => run(async () => {
    rememberUndo({ label: isStar(e) ? 'Bỏ gắn sao' : 'Gắn sao', metas: [{ id: e.id, meta: metaOf(e) }] });
    await examMetaUpdate(e.id, metaOf(e, { tags: withStar(e.metadata.tags ?? [], !isStar(e)) }));
    await reload();
  });
  /** mở/gập cây tệp bên trong một đề (đọc danh sách tệp khi mở lần đầu) */
  const toggleRow = (e: ExamSummary) => {
    setOpenRows((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; });
    if (!rowFiles.has(e.id)) examGet(e.id).then((m) => setRowFiles((o) => new Map(o).set(e.id, m.files))).catch((err) => toast(`Không đọc được danh sách tệp: ${msg(err)}`));
  };
  /** phím trong danh sách: ↑↓ chọn, Enter mở, Space xem nhanh, F2 đổi tên, Delete vào Thùng rác */
  // Ctrl+Z hoàn tác thao tác gần nhất ở tab Thư viện (không khi đang gõ trong ô nhập hoặc đang mở hộp thoại)
  const undoKey = useRef<() => void>(() => undefined);
  undoKey.current = () => { if (!tabs.front && !busyRef.current && !document.querySelector('.qm, .cfm, .pv:not(.pv-embedded)') && undoRef.current.size) void undo(); };
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.shiftKey || ev.altKey || ev.key.toLowerCase() !== 'z') return;
      if ((ev.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"], .cm-editor')) return;
      ev.preventDefault();
      undoKey.current();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  const onListKey = (ev: React.KeyboardEvent<HTMLElement>) => {
    if ((ev.target as HTMLElement).closest('input, textarea, select')) return;
    const ids = shown.map((x) => x.id);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const ns = stepSelect(selection, ids, ev.key === 'ArrowDown' ? 1 : -1, ev.shiftKey);
      setSelection(ns);
      if (ns.primary) document.querySelector(`[data-xid="${ns.primary}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a') {
      ev.preventDefault();
      setSelection(selectAll(listIds));
    } else if (ev.key === 'Escape' && multi) {
      ev.preventDefault(); ev.stopPropagation();
      setSel(selection.primary);
    } else if (ev.key === 'Delete' && pickedE.length) {
      ev.preventDefault(); askToTrashMany(pickedE);
    } else if (selE) {
      if (ev.key === 'Enter') { ev.preventDefault(); openDoc(selE); }
      else if (ev.key === ' ') { ev.preventDefault(); quickLook(selE); }
      else if (ev.key === 'F2') { ev.preventDefault(); setRenaming({ e: selE, name: selE.name }); }
      else if (ev.key === 'ContextMenu' || (ev.shiftKey && ev.key === 'F10')) { ev.preventDefault(); const r = document.querySelector(`[data-xid="${selE.id}"]`)?.getBoundingClientRect(); setCtx({ e: selE, x: (r?.left ?? 200) + 24, y: (r?.top ?? 200) + 24 }); }
    }
  };
  // menu chuột phải: bấm ra ngoài / Esc / cuộn thì đóng
  useEffect(() => {
    if (!ctx) return;
    const h = (ev: MouseEvent) => { if (!(ev.target as HTMLElement).closest?.('.xl-cmenu')) setCtx(null); };
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); setCtx(null); } };
    const sc = () => setCtx(null);
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k, true); window.addEventListener('scroll', sc, true); window.addEventListener('resize', sc);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k, true); window.removeEventListener('scroll', sc, true); window.removeEventListener('resize', sc); };
  }, [ctx]);
  // menu chuột phải của thư mục: bấm ra ngoài / Esc / cuộn thì đóng
  useEffect(() => {
    if (!fctx) return;
    const h = (ev: MouseEvent) => { if (!(ev.target as HTMLElement).closest?.('.xl-cmenu')) setFctx(null); };
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); setFctx(null); } };
    const sc = () => setFctx(null);
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k, true); window.addEventListener('scroll', sc, true); window.addEventListener('resize', sc);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k, true); window.removeEventListener('scroll', sc, true); window.removeEventListener('resize', sc); };
  }, [fctx]);
  const submitFolder = () => {
    const d = fdlg;
    if (!d) return;
    if (d.kind === 'new') { const r = createFolder(items, extras, d.path, d.name); void applyFolder(r, null, r.ok ? `Đã tạo thư mục “${r.path}”.` : ''); }
    else if (d.kind === 'rename') { const r = renameFolder(items, extras, d.path, d.name); void applyFolder(r, d.path, r.ok ? `Đã đổi tên thành “${r.path}”${r.patches.length ? ` (${r.patches.length} đề)` : ''}.` : ''); }
    else if (d.kind === 'move') { const r = moveFolder(items, extras, d.path, d.to); void applyFolder(r, d.path, r.ok ? `Đã chuyển thư mục tới “${r.path}”${r.patches.length ? ` (${r.patches.length} đề)` : ''}.` : ''); }
    else { const n = folderExamCount(items, d.path); void applyFolder(deleteFolder(items, extras, d.path), d.path, `Đã xoá thư mục “${d.path}”${n ? `; ${n} đề được giữ lại` : ''}.`); }
  };
  // kéo-thả tệp .tex / thư mục từ Explorer vào Thư viện để nhập (sự kiện kéo-thả của cửa sổ Tauri; chỉ khi đang ở tab Thư viện, không có hộp thoại)
  const dropOk = useRef<() => boolean>(() => false);
  dropOk.current = () => !tabs.front && !pending && !busyRef.current && !document.querySelector('.qm, .cfm, .pv:not(.pv-embedded)');
  const dropScan = useRef<(p: string) => void>(() => undefined);
  dropScan.current = (path: string) => void run(async () => { const scan = await examScan(path); setPending({ path, scan, name: scan.name, main: scan.mainFile ?? '' }); });
  useEffect(() => {
    if (!desktop) return;
    const offs: Promise<() => void>[] = [
      listen<unknown>('tauri://drag-enter', () => setDragOver(dropOk.current())),
      listen<unknown>('tauri://drag-leave', () => setDragOver(false)),
      listen<{ paths?: string[] }>('tauri://drag-drop', (p) => {
        setDragOver(false);
        const paths = p?.paths ?? [];
        if (!paths.length || !dropOk.current()) return;
        if (paths.length > 1) toast(`Kéo vào ${paths.length} mục: HEdu nhập từng đề một, đang nhập “${paths[0].split(/[\\/]/).pop()}”. Đề nhiều tệp thì kéo cả thư mục.`);
        dropScan.current(paths[0]);
      }),
    ];
    return () => { for (const o of offs) void o.then((f) => f()).catch(() => undefined); };
  }, [desktop, toast]);
  const clearAll = () => { setText(''); setStatus(null); setYear(null); setCat(null); setNode(null); setSmart(null); };

  /** thao tác chung của thẻ và hàng: bấm = chọn, bấm đúp = mở tab, chuột phải = menu, kéo vào mục ở cây = chuyển đề */
  const itemProps = (e: ExamSummary) => ({
    onClick: (ev: React.MouseEvent) => setSelection((s) => clickSelect(s, e.id, listIds, { ctrl: ev.ctrlKey || ev.metaKey, shift: ev.shiftKey })),
    onDoubleClick: (ev: React.MouseEvent) => { if (!ev.ctrlKey && !ev.metaKey && !ev.shiftKey) openDoc(e); },
    onPointerDown: (ev: React.PointerEvent<HTMLElement>) => {
      if (!desktop || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      // kéo một đề đang nằm trong nhóm đã chọn thì kéo cả nhóm
      const group = selection.picked.has(e.id) && pickedE.length > 1 ? pickedE : [e];
      startDrag(ev.nativeEvent, group.length > 1 ? `${group.length} đề` : e.name, (k) => group.some((x) => !!movePatch(x, k)), (k) => { void moveExams(group, k); });
    },
    onContextMenu: (ev: React.MouseEvent) => { ev.preventDefault(); if (!selection.picked.has(e.id)) setSel(e.id); setCtx({ e, x: ev.clientX, y: ev.clientY }); },
    title: `Bấm: chọn · Ctrl+bấm: chọn thêm · Shift+bấm: chọn cả đoạn · Bấm đúp hoặc Enter: mở thành tab · Space: xem nhanh PDF · F2: đổi tên · Chuột phải: thao tác khác · Kéo vào mục ở cây: chuyển đề${tabs.ids.includes(e.id) ? ' · Đề này đang mở' : ''}`,
  });
  const stop = { onClick: (ev: React.MouseEvent) => ev.stopPropagation(), onDoubleClick: (ev: React.MouseEvent) => ev.stopPropagation(), onPointerDown: (ev: React.PointerEvent) => ev.stopPropagation() };
  /** một hàng của bảng (kèm các hàng tệp bên trong đề khi đã mở) */
  const fxRows = (e: ExamSummary): React.ReactNode[] => {
    const c = catOfType(e.metadata.examType);
    const open = openRows.has(e.id);
    const warn = (e.warningCount > 0 ? e.warningCount : 0) + (!e.mainFile ? 1 : 0);
    const out: React.ReactNode[] = [
      <div key={e.id} data-xid={e.id} role="row" aria-selected={selection.picked.has(e.id)} className={`fx-row tone-${catTone(c)}${selection.picked.has(e.id) ? ' sel' : ''}${ctx?.e.id === e.id ? ' ctx-on' : ''}`} {...itemProps(e)}>
        <span className="fx-cell c-name">
          <button type="button" className={`fx-tw${open ? ' open' : ''}`} aria-label={open ? 'Thu gọn tệp của đề' : 'Xem tệp bên trong đề'} aria-expanded={open} {...stop} onClick={(ev) => { ev.stopPropagation(); toggleRow(e); }}>▸</button>
          <svg className="fx-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={open ? 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2H19.5A1.5 1.5 0 0 1 21 8.5V9H6.2a1.5 1.5 0 0 0-1.43 1.05L3 15.7z M4.4 19 6.6 11.3A1 1 0 0 1 7.56 10.6H21.4a.8.8 0 0 1 .77 1.02L20.1 18.3a1 1 0 0 1-.96.7z' : 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2H19.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z'} /></svg>
          <span className="fx-nm" title={e.name}>{tabs.ids.includes(e.id) && <span className="xc-open" title="Đang mở ở một tab">● </span>}{e.name}</span>
          {text.trim() && hits.has(e.id) && <span className="fx-hit" title={`Khớp trong nội dung: ${hits.get(e.id)!.file}, dòng ${hits.get(e.id)!.line} (${hits.get(e.id)!.matches} dòng khớp) — ${hits.get(e.id)!.snippet}`}>trong nội dung</span>}
          {warn > 0 && <span className="xr-warn" title={!e.mainFile ? 'Chưa chọn tệp chính' : `${e.warningCount} cảnh báo`}>⚠</span>}
          <button type="button" className={`fx-star${isStar(e) ? ' on' : ''}`} title={isStar(e) ? 'Bỏ gắn sao' : 'Gắn sao'} aria-label={isStar(e) ? 'Bỏ gắn sao' : 'Gắn sao'} aria-pressed={isStar(e)} {...stop} onClick={(ev) => { ev.stopPropagation(); void toggleStar(e); }}>★</button>
        </span>
        <span className="fx-cell c-type"><span className={`xc-type tone-${catTone(c)}`}>{typeText(e.metadata.examType)}</span></span>
        <span className="fx-cell c-grade">{e.metadata.grade ?? ''}</span>
        <span className="fx-cell c-year">{e.metadata.schoolYear ?? ''}</span>
        <span className="fx-cell c-status"><span className={`xc-st st-${e.status}`}>{STATUS_LABEL[e.status]}</span></span>
        <span className="fx-cell c-count" title="Số câu (đề tạo từ ngân hàng)">{qn.get(e.id) ?? ''}</span>
        <span className="fx-cell c-files">{e.fileCount}</span>
        <span className="fx-cell c-size">{formatBytes(e.totalBytes)}</span>
        <span className="fx-cell c-updated" title={dateText(e.updatedAt)}>{dateText(e.updatedAt).split(' ')[0]}</span>
      </div>,
    ];
    if (open) {
      const fs = rowFiles.get(e.id);
      if (!fs) out.push(<div key={`${e.id}#load`} className="fx-row fx-child"><span className="fx-cell c-name">Đang đọc danh sách tệp…</span></div>);
      else {
        const { rows, hidden } = fileRows(fs);
        for (const f of rows) {
          out.push(
            <div key={`${e.id}#${f.rel}`} role="row" className={`fx-row fx-child${sel === e.id ? ' of-sel' : ''}`} title={`${f.rel} · bấm đúp để mở đề`} onClick={() => setSel(e.id)} onDoubleClick={() => openDoc(e)}>
              <span className="fx-cell c-name"><span className={`fx-fk k-${f.kind}`} aria-hidden="true">{FILE_KIND_LABEL[f.kind]}</span><span className="fx-nm">{f.dir && <span className="fx-dir">{f.dir}/</span>}{f.name}{f.rel === e.mainFile && <span className="fx-main"> · tệp chính</span>}</span></span>
              <span className="fx-cell c-type">{FILE_KIND_LABEL[f.kind]}</span><span className="fx-cell c-grade" /><span className="fx-cell c-year" /><span className="fx-cell c-status" /><span className="fx-cell c-count" /><span className="fx-cell c-files" />
              <span className="fx-cell c-size">{formatBytes(f.bytes)}</span><span className="fx-cell c-updated" />
            </div>,
          );
        }
        if (hidden > 0) out.push(<div key={`${e.id}#more`} className="fx-row fx-child"><span className="fx-cell c-name xl-meta">…và {hidden} tệp khác</span></div>);
      }
    }
    return out;
  };

  const card = (e: ExamSummary) => {
    const c = catOfType(e.metadata.examType);
    const at = examTrail(e, tax);
    const flags = [!e.mainFile && 'Chưa chọn tệp chính', e.skippedCount > 0 && `${e.skippedCount} mục không chép`, e.warningCount > 0 && `${e.warningCount} cảnh báo`].filter(Boolean) as string[];
    return (
      <button key={e.id} type="button" data-xid={e.id} className={`xc tone-${catTone(c)}${selection.picked.has(e.id) ? ' sel' : ''}${ctx?.e.id === e.id ? ' ctx-on' : ''}`} {...itemProps(e)}>
        <span className="xc-top">
          <span className={`xc-type tone-${catTone(c)}`}>{typeText(e.metadata.examType)}</span>
          <span className={`xc-st st-${e.status}`}>{STATUS_LABEL[e.status]}</span>
        </span>
        <span className="xc-name">{tabs.ids.includes(e.id) && <span className="xc-open" title="Đang mở ở một tab">● </span>}{e.name}</span>
        <span className="xc-where">{at.length ? at.filter((x) => !HIDE_IN_WHERE.has(x)).join(' › ') : 'Chưa xếp lớp'}{e.folder ? ` · 📁 ${e.folder}` : ''}</span>
        <span className="xc-foot">
          {e.metadata.schoolYear && <span title="Năm học">{e.metadata.schoolYear}</span>}
          <span title={`${e.fileCount} tệp · ${formatBytes(e.totalBytes)}`}>{qn.get(e.id) ? `${qn.get(e.id)} câu` : e.fileCount > 1 ? `${e.fileCount} tệp` : 'Soạn tay'}</span>
          <span title={dateText(e.updatedAt)}>Sửa {dateText(e.updatedAt).split(' ')[0]}</span>
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
      <div className="fx">
        <div className="fx-bar">
          <div className="fx-crumb" title="Vị trí đang xem">
            <b>{smart ? SMART_LABEL[smart] : trail.length ? trail.join(' › ') : 'Tất cả đề'}</b>
            {place && !smart && <button type="button" className="btn btn-sm btn-ghost" disabled={!desktop || busy} onClick={() => setNewName('')} title="Tạo một đề trống ngay trong mục này">+ Đề trống tại đây</button>}
          </div>
          <span className="fx-sp" />
          <span className="xl-seg" role="group" aria-label="Kiểu xem">
            <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách</button>
            <button type="button" className={view === 'card' ? 'on' : ''} aria-pressed={view === 'card'} onClick={() => setView('card')}>Biểu tượng</button>
            <button type="button" className={view === 'cols' ? 'on' : ''} aria-pressed={view === 'cols'} onClick={() => setView('cols')}>Cột</button>
          </span>
          {view === 'list' && (
            <span className="more-wrap" style={{ position: 'relative' }}>
              <button type="button" className="btn btn-sm" aria-haspopup="menu" aria-expanded={menu === 'cols'} onClick={() => setMenu(menu === 'cols' ? null : 'cols')} title="Chọn các cột hiện trong bảng">Cột ▾</button>
              {menu === 'cols' && (
                <span className="more-menu xl-pop" role="group" aria-label="Cột hiện trong bảng">
                  {COL_ORDER.map((k) => (
                    <label key={k} className="sw" style={{ display: 'flex', gap: 8, padding: '3px 8px' }}>
                      <input type="checkbox" checked={colVis.has(k)} disabled={k === 'name'} onChange={(e) => { const n = new Set(colVis); if (e.target.checked) n.add(k); else n.delete(k); setColVis(n); }} />{COL_LABEL[k]}
                    </label>
                  ))}
                  <button type="button" className="btn btn-sm" onClick={() => setColVis(parseColVis(null))}>Hiện đủ cột</button>
                </span>
              )}
            </span>
          )}
          {view !== 'list' && (
            <label className="qsel" title="Sắp xếp">
              <select value={colSort.key} onChange={(e) => setColSort({ key: e.target.value as ColSort['key'], dir: colSort.dir })} aria-label="Sắp xếp theo">
                {COL_ORDER.map((k) => <option key={k} value={k}>{COL_LABEL[k]}</option>)}
              </select>
            </label>
          )}
          <label className="search sm fx-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <span className="sr-only">Tìm đề</span>
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tìm đề…" />
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
                <label>Loại đề
                  <select className="xl-in" value={cat ?? ''} onChange={(e) => setCat((e.target.value || null) as ExamCat | typeof CAT_NONE | null)}>
                    <option value="">Mọi loại đề</option>{CATS.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}<option value={CAT_NONE}>Chưa phân loại</option>
                  </select>
                </label>
                <label>Trạng thái
                  <select className="xl-in" value={status ?? ''} onChange={(e) => setStatus((e.target.value || null) as ExamStatus | null)}>
                    <option value="">Mọi trạng thái</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
                <button type="button" className="btn btn-sm" disabled={!nFilters && !text && !node && !smart} onClick={() => { clearAll(); setMenu(null); }}>Xoá mọi bộ lọc</button>
              </span>
            )}
          </span>
          <span className="xl-menu">
            <button type="button" className="btn btn-sm" disabled={!desktop || !selE || busy} aria-haspopup="menu" aria-expanded={menu === 'export'} onClick={() => setMenu(menu === 'export' ? null : 'export')} title={selE ? `Xuất PDF của “${selE.name}”` : 'Chọn một đề để xuất PDF'}>Xuất PDF ▾</button>
            {menu === 'export' && selE && (
              <span className="more-menu xl-pop" role="menu">
                {selGoods.length === 0 && <span className="xl-meta" style={{ padding: '8px 12px', display: 'block', maxWidth: 260 }}>Đề này chưa có PDF đã biên dịch. Mở đề rồi bấm “Biên dịch”; biên dịch thành công là xuất được.</span>}
                {selGoods.map((g) => <button key={g.mode} type="button" role="menuitem" onClick={() => { setMenu(null); void exportOne(selE, g.mode as ExamMode); }}><b>{modeLabel(g.mode)}…</b><small>{g.pages ?? '?'} trang · {dateText(g.at)}</small></button>)}
                {selGoods.length > 1 && <><hr /><button type="button" role="menuitem" onClick={() => { setMenu(null); void exportEvery(selE); }}><b>Xuất tất cả các bản…</b><small>Vào một thư mục</small></button></>}
              </span>
            )}
          </span>
          <span className="xl-menu">
            <button type="button" className="btn btn-sm" disabled={!desktop || busy || !undoLabel} onClick={() => void undo()} title={undoLabel ? `Hoàn tác: ${undoLabel} (Ctrl+Z)` : 'Chưa có gì để hoàn tác'}>↶ Hoàn tác</button>
            <button type="button" className="btn btn-sm" disabled={!desktop} aria-haspopup="menu" aria-expanded={menu === 'tools'} onClick={() => setMenu(menu === 'tools' ? null : 'tools')}>Công cụ ▾</button>
            {menu === 'tools' && (
              <span className="more-menu xl-pop" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setFdlg({ kind: 'new', path: node?.startsWith('f:') ? node.slice(2) : '', name: '' }); }}><b>Thư mục mới…</b><small>{node?.startsWith('f:') ? `Tạo trong “${node.slice(2)}”` : 'Thư mục riêng để gom đề theo ý bạn'}</small></button>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setPanel('trash'); }}><b>Thùng rác đề</b><small>Khôi phục đề đã xoá</small></button>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setPanel('backup'); }}><b>Sao lưu / khôi phục thư viện</b><small>Bản sao toàn bộ đề, riêng với ngân hàng câu hỏi</small></button>
              </span>
            )}
          </span>
          <span className="xl-menu">
            <button type="button" className="btn btn-sm btn-accent" disabled={!desktop || busy} aria-haspopup="menu" aria-expanded={menu === 'add'} onClick={() => setMenu(menu === 'add' ? null : 'add')}>+ Thêm đề ▾</button>
            {menu === 'add' && (
              <span className="more-menu xl-pop" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(null); go({ screen: 'exam' }); }}><b>Tạo đề từ ngân hàng</b><small>Chọn câu theo ma trận, trộn mã đề</small></button>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setNewName(''); }}><b>Tạo đề trống{place ? ' tại mục này' : ''}</b><small>{place ? trail.join(' › ') : 'Soạn LaTeX trực tiếp'}</small></button>
                <hr />
                <button type="button" role="menuitem" onClick={() => pick(chooseTexFile)}><b>Nhập file .tex</b><small>Sao chép vào thư viện, tệp gốc giữ nguyên</small></button>
                <button type="button" role="menuitem" onClick={() => pick(chooseProjectFolder)}><b>Nhập thư mục dự án</b><small>Đề nhiều tệp (hình, gói riêng…)</small></button>
                <button type="button" role="menuitem" onClick={chooseBatch}><b>Nhập nhiều đề từ thư mục</b><small>Mỗi tệp .tex hoặc thư mục con là một đề</small></button>
                <button type="button" role="menuitem" onClick={importBundle}><b>Nhập gói đề HEdu</b><small>Gói xuất từ máy khác</small></button>
              </span>
            )}
          </span>
        </div>

        {!desktop && <div className="note warn xl-note" role="status"><div className="note-body"><b>Chỉ có trên app Windows</b><span>Thư viện đề lưu tệp trên máy nên không dùng được ở bản xem thử trên trình duyệt.</span></div></div>}
        {load === 'error' && <div className="note bad xl-note" role="alert"><div className="note-body"><b>Chưa đọc được thư viện đề</b><span>{err} Tệp của bạn trong thư viện không bị xoá.</span></div></div>}

        <div className="fx-main">
          <aside className="fx-side" aria-label="Cây đề thi" style={{ flexBasis: sideW, width: sideW }}>
            <div className="fs-scroll">
              <ExamTree tree={tree} total={base.length} sel={smart ? `smart:${smart}` : node} showEmpty={showEmpty} onShowEmpty={setShowEmpty} onPick={(k) => { setSmart(null); setNode(k); }}
                smart={[{ key: 'recent', label: SMART_LABEL.recent, count: smartCounts.recent, icon: 'clock' }, { key: 'star', label: SMART_LABEL.star, count: smartCounts.star, icon: 'star' }, { key: 'review', label: SMART_LABEL.review, count: smartCounts.review, icon: 'flag' }]}
                onSmart={(k) => { setNode(null); setSmart(k as SmartKey); }}
                onNodeContext={(k, x, y) => setFctx({ path: k === 'f' ? '' : k.slice(2), x, y })} />
            </div>
          </aside>
          <div className="fx-resize" role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng thanh bên (bấm đúp: về mặc định)" title="Kéo để đổi độ rộng · bấm đúp: về mặc định" onPointerDown={startResize} onDoubleClick={resetSide} />

          <section className="fx-list" aria-label="Danh sách đề" tabIndex={0} onKeyDown={onListKey} onClick={(ev) => { if (ev.target === ev.currentTarget) setSel(null); }}>
            {load === 'loading' && <p className="aid-wait" role="status">Đang đọc thư viện đề…</p>}
            {load === 'ok' && desktop && items.length === 0 && (
              <div className="empty" role="status">
                <b>Thư viện đề chưa có đề nào.</b>
                <span>Tạo đề từ ngân hàng câu hỏi, tạo đề trống, hoặc nhập file .tex / thư mục / gói đề có sẵn bằng nút “+ Thêm đề”. Hoặc kéo tệp .tex / thư mục vào đây.</span>
              </div>
            )}
            {items.length > 0 && list.length === 0 && (
              <div className="empty" role="status">
                <b>{nFilters || text ? 'Không có đề nào khớp bộ lọc.' : smart ? 'Chưa có đề nào ở đây.' : 'Mục này chưa có đề.'}</b>
                {smart === 'star' && <span>Bấm ngôi sao ★ ở đầu hàng để gắn sao đề hay dùng.</span>}
                {place && !smart && <span>Bấm “+ Đề trống tại đây”, hoặc “+ Thêm đề” để nhập đề vào đúng mục này.</span>}
                {(nFilters > 0 || !!text) && <button type="button" className="btn btn-sm" onClick={clearAll}>Xoá bộ lọc</button>}
              </div>
            )}
            {shown.length > 0 && view === 'list' && (
              <div className={`fx-table ${hiddenClass(cols)}`} style={{ ['--fx-cols' as string]: gridTemplate(cols) }} role="treegrid" aria-label="Đề thi">
                <div className="fx-head" role="row">
                  {COL_ORDER.map((k) => (
                    <button key={k} type="button" className={`fx-h c-${k}${colSort.key === k ? ' on' : ''}`} aria-sort={colSort.key === k ? (colSort.dir === 1 ? 'ascending' : 'descending') : 'none'} onClick={() => setColSort(clickCol(colSort, k))} title={`Sắp xếp theo ${COL_LABEL[k].toLowerCase()}`}>
                      {COL_LABEL[k]}{colSort.key === k && <i aria-hidden="true">{colSort.dir === 1 ? '▲' : '▼'}</i>}
                    </button>
                  ))}
                </div>
                {shown.flatMap(fxRows)}
              </div>
            )}
            {shown.length > 0 && view === 'card' && <div className="xc-grid">{shown.map(card)}</div>}
            {view === 'cols' && load !== 'loading' && <ExamColumns tree={tree} node={node} exams={shown} picked={selection.picked} rowProps={itemProps} onNode={(k) => { setSmart(null); setNode(k); }} tabIds={tabs.ids} renderMeta={(e) => (qn.get(e.id) ? `${qn.get(e.id)} câu` : '')} />}
            {pages > 1 && (
              <nav className="pager" aria-label="Phân trang">
                <button type="button" className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹ Trước</button>
                <span>Trang <b>{cur + 1}</b> / {nf.format(pages)}</span>
                <button type="button" className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Sau ›</button>
              </nav>
            )}
          </section>

          {multi && (
            <aside className="fx-insp" aria-label="Các đề đang chọn">
              <div className="fx-insp-h"><b>{pickedE.length} đề đang chọn</b></div>
              <dl className="fx-kv">
                <div><dt>Loại</dt><dd>{multiStat.type}</dd></div>
                <div><dt>Trạng thái</dt><dd>{multiStat.status}</dd></div>
                <div><dt>Dung lượng</dt><dd>{formatBytes(multiStat.bytes)}</dd></div>
              </dl>
              <ul className="fx-multi-list">
                {pickedE.slice(0, 8).map((e) => <li key={e.id} title={e.name}>{e.name}</li>)}
                {pickedE.length > 8 && <li className="xl-meta">… và {pickedE.length - 8} đề nữa</li>}
              </ul>
              <div className="fx-acts">
                <button type="button" className="btn btn-sm btn-accent" disabled={busy} onClick={() => setMovePick({ items: pickedE, key: null })}>Chuyển tới…</button>
                <button type="button" className="btn btn-sm" disabled={!desktop || busy} onClick={() => setPacking(pickedE)}>Xuất trọn gói…</button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void setStar(pickedE, !multiStat.allStar)}>{multiStat.allStar ? '★ Bỏ gắn sao' : '☆ Gắn sao'}</button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void setReview(pickedE, true)}>Đánh dấu cần rà soát</button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void setReview(pickedE, false)}>Bỏ dấu rà soát</button>
                <button type="button" className="btn btn-sm btn-danger-soft" disabled={busy} onClick={() => askToTrashMany(pickedE)}>Chuyển vào Thùng rác…</button>
                <button type="button" className="btn btn-sm" onClick={() => setSel(selection.primary)}>Bỏ chọn</button>
              </div>
              <p className="xl-meta">Ctrl+bấm: chọn thêm · Shift+bấm: chọn cả đoạn · Ctrl+A: chọn hết · kéo cả nhóm vào một mục ở cây để chuyển.</p>
            </aside>
          )}
          {selE && !multi && (
            <aside className="fx-insp" aria-label="Thông tin đề đang chọn">
              <div className="fx-insp-h">
                <span className={`xc-type tone-${catTone(catOfType(selE.metadata.examType))}`}>{typeText(selE.metadata.examType)}</span>
                <span className={`xc-st st-${selE.status}`}>{STATUS_LABEL[selE.status]}</span>
              </div>
              <div className="fx-insp-name">{selE.name}</div>
              <dl className="fx-kv">
                <div><dt>Vị trí</dt><dd>{examTrail(selE, tax).filter((x) => !HIDE_IN_WHERE.has(x)).join(' › ') || 'Chưa xếp lớp'}{selE.folder ? ` · 📁 ${selE.folder}` : ''}</dd></div>
                <div><dt>Năm học</dt><dd>{selE.metadata.schoolYear ?? '—'}</dd></div>
                <div><dt>Tệp chính</dt><dd>{selE.mainFile ? <code>{selE.mainFile}</code> : 'chưa chọn'}</dd></div>
                <div><dt>Nội dung</dt><dd>{qn.get(selE.id) ? `${qn.get(selE.id)} câu · ` : ''}{selE.fileCount} tệp · {formatBytes(selE.totalBytes)}</dd></div>
                <div><dt>Tạo lúc</dt><dd>{dateText(selE.createdAt)}</dd></div>
                <div><dt>Sửa lúc</dt><dd>{dateText(selE.updatedAt)}</dd></div>
                {selE.warningCount > 0 && <div><dt>Cảnh báo</dt><dd>{selE.warningCount}</dd></div>}
              </dl>
              {selGoods.length > 0 && (() => { const g = selGoods.find((x) => x.mode === 'de' || x.mode === 'de-in') ?? selGoods[0]; return <PdfThumb id={selE.id} mode={g.mode} stamp={g.at} onOpen={() => quickLook(selE)} />; })()}
              <div className="fx-pdfs">
                <b>PDF đã biên dịch</b>
                {selGoods.length === 0 && <span className="xl-meta">Chưa có. Mở đề, bấm “Biên dịch”; biên dịch thành công thì xuất PDF được ở đây.</span>}
                {selGoods.map((g) => (
                  <div key={g.mode} className="fx-pdf">
                    <span><b>{modeLabel(g.mode)}</b> · {g.pages ?? '?'} trang · {g.engine}<br /><small className="xl-meta">{dateText(g.at)}</small></span>
                    <span className="fx-pdf-b">
                      <button type="button" className="btn btn-sm" onClick={() => setPeek({ id: selE.id, name: selE.name, mode: g.mode as ExamMode })}>Xem</button>
                      <button type="button" className="btn btn-sm btn-accent" disabled={busy} onClick={() => void exportOne(selE, g.mode as ExamMode)}>Xuất…</button>
                    </span>
                  </div>
                ))}
                {selGoods.length > 1 && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void exportEvery(selE)}>Xuất tất cả các bản…</button>}
              </div>
              <div className="fx-acts">
                <button type="button" className="btn btn-sm btn-accent" onClick={() => openDoc(selE)}>Mở đề</button>
                <button type="button" className="btn btn-sm" onClick={() => { infoFrom.current = null; setActiveId(selE.id); }}>Thông tin…</button>
                <button type="button" className="btn btn-sm" onClick={() => setRenaming({ e: selE, name: selE.name })}>Đổi tên</button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void toggleStar(selE)}>{isStar(selE) ? '★ Bỏ gắn sao' : '☆ Gắn sao'}</button>
                <button type="button" className="btn btn-sm" disabled={!desktop || busy} title="Ma trận đề ra Excel (đề tạo từ ngân hàng)" onClick={() => void exportMatrix(selE)}>Xuất ma trận Excel…</button>
                <button type="button" className="btn btn-sm" disabled={!desktop || busy} title="Dán bài làm của học sinh để xem điểm, độ khó, độ phân biệt từng câu (đề tạo từ ngân hàng)" onClick={() => void openStats(selE)}>Thống kê sau thi…</button>
                <button type="button" className="btn btn-sm" onClick={() => reveal(selE.id)}>Hiện trong Explorer</button>
              </div>
            </aside>
          )}
        </div>

        <div className="fx-status" role="status">
          <span>{nf.format(list.length)} đề{pickedE.length ? ` · ${pickedE.length} đang chọn` : ''}{status ? ` · lọc: ${STATUS_LABEL[status]}` : ''}{cat ? ` · loại: ${cat === CAT_NONE ? 'chưa phân loại' : CAT_LABEL[cat]}` : ''}</span>
          <span className="fx-status-path">{smart ? SMART_LABEL[smart] : trail.length ? trail.join(' › ') : 'Tất cả đề'}</span>
          <span>{formatBytes(list.reduce((s, e) => s + e.totalBytes, 0))}</span>
        </div>
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

      {renaming && (
        <Modal title={<b>Đổi tên đề</b>} onClose={() => setRenaming(null)} foot={<span className="qm-nav">
          <button type="button" className="btn btn-outline" onClick={() => setRenaming(null)}>Huỷ</button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={renameExam}>Lưu tên</button>
        </span>}>
          <label className="xm-field">Tên đề <input className="xl-in" value={renaming.name} autoFocus maxLength={120} onFocus={(ev) => ev.currentTarget.select()} onChange={(ev) => setRenaming({ ...renaming, name: ev.target.value })} onKeyDown={(ev) => { if (ev.key === 'Enter') void renameExam(); }} /></label>
          <p className="xl-meta">Chỉ đổi tên hiển thị trong thư viện; tên tệp trong đề không đổi.</p>
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
        <Modal wide side onClose={closeInfo} title={detail ? <>
          <span className={`xc-type tone-${catTone(catOfType(detail.metadata.examType))}`}>{typeText(detail.metadata.examType)}</span>
          <b className="xm-name">{detail.name}</b>
          <span className={`xc-st st-${detail.status}`}>{STATUS_LABEL[detail.status]}</span>
        </> : <b>Đang đọc…</b>} foot={detail && <>
          <button type="button" className="btn btn-sm btn-danger-soft" disabled={busy} onClick={() => askToTrash(activeSum)}>Chuyển vào Thùng rác…</button>
          <span className="qm-nav">
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => activeId && void examReveal(activeId).catch((e) => toast(msg(e)))}>Hiện trong Explorer</button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => exportBundle(activeId ? { id: activeId, name: detail.name } : null)}>Xuất gói…</button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => duplicate(activeId)}>Sao chép thành đề mới</button>
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
              <ExamInfoForm detail={detail} folders={folders} busy={busy} hasPdf={goods.length > 0} checks={checks} onSave={saveMeta} open />
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
        <ExamWorkspace key={e.id} ref={(h) => { if (h) wsRefs.current.set(e.id, h); else wsRefs.current.delete(e.id); }} id={e.id} name={e.name} mainFile={e.mainFile} schoolYear={e.metadata.schoolYear}
          hidden={tabs.front !== e.id} onStatus={onTabStatus}
          onLibrary={() => setTabs((t) => ({ ...t, front: null }))}
          onInfo={() => { infoFrom.current = e.id; setTabs((t) => ({ ...t, front: null })); setActiveId(e.id); }}
          onClose={() => closeDoc(e.id)} />
      ))}
      {panel === 'trash' && <ExamTrashPanel toast={toast} onClose={() => setPanel(null)} onChanged={(rid) => { void reload().then(() => { if (rid) setActiveId(rid); }); }} />}
      {panel === 'backup' && <ExamBackupPanel toast={toast} onClose={() => setPanel(null)} onChanged={() => void reload()} />}
      {peek && <PdfViewer id={peek.id} title={peek.name} stale={false} mode={peek.mode} note={`Xem nhanh: ${modeLabel(peek.mode)}.${MODE_NOTE[peek.mode] ? ' ' + MODE_NOTE[peek.mode] : ''}`} onClose={() => setPeek(null)} />}
      {ctx && (
        <span className="more-menu xl-cmenu" role="menu" aria-label={`Thao tác với đề ${ctx.e.name}`} style={{ left: Math.min(ctx.x, window.innerWidth - 250), top: Math.min(ctx.y, window.innerHeight - 520) }}>
          {ctxGroup ? (<>
            <button type="button" role="menuitem" autoFocus disabled={busy} onClick={() => { setCtx(null); setMovePick({ items: ctxGroup, key: null }); }}><b>Chuyển {ctxGroup.length} đề tới…</b><small>Lớp, loại đề, thư mục</small></button>
            <button type="button" role="menuitem" disabled={busy} onClick={() => { setCtx(null); setPacking(ctxGroup); }}><b>Xuất trọn gói…</b><small>PDF, ma trận, đáp án, danh mục</small></button>
            <button type="button" role="menuitem" disabled={busy} onClick={() => { setCtx(null); void setStar(ctxGroup, !ctxGroup.every(isStar)); }}><b>{ctxGroup.every(isStar) ? 'Bỏ gắn sao' : 'Gắn sao'}</b></button>
            <button type="button" role="menuitem" disabled={busy} onClick={() => { setCtx(null); void setReview(ctxGroup, true); }}><b>Đánh dấu cần rà soát</b></button>
            <button type="button" role="menuitem" disabled={busy} onClick={() => { setCtx(null); void setReview(ctxGroup, false); }}><b>Bỏ dấu cần rà soát</b></button>
            <hr />
            <button type="button" role="menuitem" className="xl-cmenu-danger" onClick={() => { setCtx(null); askToTrashMany(ctxGroup); }}><b>Chuyển {ctxGroup.length} đề vào Thùng rác…</b></button>
          </>) : (<>
          <button type="button" role="menuitem" autoFocus onClick={() => { setCtx(null); openDoc(ctx.e); }}><b>Mở đề</b><small>{tabs.ids.includes(ctx.e.id) ? 'Đang mở: chuyển sang tab của đề' : 'Biên tập, biên dịch trong một tab'}</small></button>
          <button type="button" role="menuitem" onClick={() => { setCtx(null); quickLook(ctx.e); }}><b>Xem nhanh PDF</b><small>Phím Space</small></button>
          {ctx.e.id === sel && selGoods.map((g) => <button key={g.mode} type="button" role="menuitem" disabled={busy} onClick={() => { setCtx(null); void exportOne(ctx.e, g.mode as ExamMode); }}><b>Xuất PDF: {modeLabel(g.mode)}…</b><small>{g.pages ?? '?'} trang</small></button>)}
          {(ctx.e.id !== sel || selGoods.length === 0) && <button type="button" role="menuitem" disabled><b>Xuất PDF…</b><small>Chưa có bản đã biên dịch</small></button>}
          <button type="button" role="menuitem" disabled={busy} onClick={() => { setCtx(null); void toggleStar(ctx.e); }}><b>{isStar(ctx.e) ? 'Bỏ gắn sao' : 'Gắn sao'}</b></button>
          <button type="button" role="menuitem" onClick={() => { setCtx(null); setRenaming({ e: ctx.e, name: ctx.e.name }); }}><b>Đổi tên…</b><small>Phím F2</small></button>
          <button type="button" role="menuitem" onClick={() => { setCtx(null); infoFrom.current = null; setActiveId(ctx.e.id); }}><b>Thông tin…</b><small>Tên, lớp, loại đề, chốt đề, tệp</small></button>
          {ctx.e.status === 'draft' && <button type="button" role="menuitem" disabled={busy} onClick={() => { setCtx(null); void markStatus(ctx.e, 'needs_review'); }}><b>Đánh dấu cần rà soát</b></button>}
          {ctx.e.status === 'needs_review' && <button type="button" role="menuitem" disabled={busy} onClick={() => { setCtx(null); void markStatus(ctx.e, 'draft'); }}><b>Bỏ dấu cần rà soát</b><small>Trở về đang soạn</small></button>}
          <hr />
          <button type="button" role="menuitem" disabled={busy} onClick={() => { setCtx(null); duplicate(ctx.e.id); }}><b>Sao chép thành đề mới</b></button>
          <button type="button" role="menuitem" onClick={() => { setCtx(null); reveal(ctx.e.id); }}><b>Hiện trong Explorer</b></button>
          <button type="button" role="menuitem" disabled={busy} onClick={() => { setCtx(null); exportBundle(ctx.e); }}><b>Xuất gói…</b></button>
          <button type="button" role="menuitem" disabled={busy} onClick={() => { setCtx(null); void exportMatrix(ctx.e); }}><b>Xuất ma trận Excel…</b><small>Đề tạo từ ngân hàng</small></button>
          <hr />
          <button type="button" role="menuitem" className="xl-cmenu-danger" onClick={() => { setCtx(null); askToTrash(ctx.e); }}><b>Chuyển vào Thùng rác…</b></button>
          </>)}
        </span>
      )}
      {fctx && (
        <span className="more-menu xl-cmenu" role="menu" aria-label="Thao tác với thư mục" style={{ left: Math.min(fctx.x, window.innerWidth - 250), top: Math.min(fctx.y, window.innerHeight - 260) }}>
          <button type="button" role="menuitem" autoFocus onClick={() => { const f = fctx; setFctx(null); setFdlg({ kind: 'new', path: f.path, name: '' }); }}><b>{fctx.path ? 'Thư mục con mới…' : 'Thư mục mới…'}</b></button>
          {fctx.path && <>
            <button type="button" role="menuitem" onClick={() => { const f = fctx; setFctx(null); setFdlg({ kind: 'rename', path: f.path, name: f.path.split('/').pop()! }); }}><b>Đổi tên…</b></button>
            <button type="button" role="menuitem" onClick={() => { const f = fctx; setFctx(null); setFdlg({ kind: 'move', path: f.path, to: f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '' }); }}><b>Chuyển vào…</b><small>Sang thư mục khác</small></button>
            <hr />
            <button type="button" role="menuitem" className="xl-cmenu-danger" onClick={() => { const f = fctx; setFctx(null); setFdlg({ kind: 'delete', path: f.path }); }}><b>Xoá thư mục…</b><small>Đề bên trong được giữ lại</small></button>
          </>}
        </span>
      )}
      {movePick && (
        <Modal title={<b>Chuyển {movePick.items.length} đề tới…</b>} onClose={() => setMovePick(null)} foot={<span className="qm-nav">
          <button type="button" className="btn btn-outline" onClick={() => setMovePick(null)}>Huỷ</button>
          <button type="button" className="btn btn-accent" disabled={busy || !movePick.key || !movePick.items.some((e) => !!movePatch(e, movePick.key))} onClick={() => { const m = movePick; setMovePick(null); if (m.key) void moveExams(m.items, m.key); }}>Chuyển</button>
        </span>}>
          <div style={{ maxHeight: '52vh', overflow: 'auto' }}>
            <ExamTree tree={fullTree} total={base.length} sel={movePick.key} showEmpty onShowEmpty={() => undefined} emptySwitch={false} allLabel="Tất cả đề (chọn một mục bên dưới)" treeLabel="Chọn nơi chuyển đến" onPick={(k) => setMovePick({ ...movePick, key: k })} />
          </div>
          <p className="xl-meta">{movePick.key
            ? (() => { const n = movePick.items.filter((e) => !!movePatch(e, movePick.key)).length; return n ? `Sẽ chuyển ${n}/${movePick.items.length} đề tới: ${nodeTrail(fullTree, movePick.key).join(' › ')}.` : 'Các đề đã chọn đã nằm ở mục này hoặc mục này không nhận đề.'; })()
            : 'Chọn lớp, loại đề, chương/bài hoặc thư mục riêng. Chọn lớp/loại chỉ đổi lớp/loại; chọn thư mục chỉ đổi thư mục.'}</p>
        </Modal>
      )}
      {batchImp && <ExamBatchImportDialog folder={batchImp.folder} candidates={batchImp.items} truncated={batchImp.truncated} place={place ? trail.join(' › ') : ''} placeNew={placeNew} onClose={() => { setBatchImp(null); void reload(); }} onDone={(m) => { toast(m); void reload(); }} />}
      {stats && <ExamStatsDialog name={stats.name} spec={stats.spec} onClose={() => setStats(null)} onToast={toast} />}
      {packing && <ExamPackDialog exams={packing} qn={qn} tax={tax} question={(uid) => qmap.get(uid)} onClose={() => setPacking(null)} onToast={toast} />}
      {askTrashMany && (
        <ConfirmDialog title={`Chuyển ${askTrashMany.length} đề vào Thùng rác?`} confirmLabel="Chuyển vào Thùng rác" cancelLabel="Giữ lại" busy={busy} onCancel={() => setAskTrashMany(null)} onConfirm={trashMany}>
          <p>{askTrashMany.length} đề sẽ rời khỏi thư viện nhưng KHÔNG bị xoá: khôi phục được ở Công cụ › Thùng rác đề.</p>
          <ul className="fx-multi-list">{askTrashMany.slice(0, 6).map((e) => <li key={e.id}>{e.name}</li>)}{askTrashMany.length > 6 && <li className="xl-meta">… và {askTrashMany.length - 6} đề nữa</li>}</ul>
        </ConfirmDialog>
      )}
      {fdlg && (fdlg.kind === 'new' || fdlg.kind === 'rename') && (
        <Modal title={<b>{fdlg.kind === 'new' ? (fdlg.path ? `Thư mục con mới trong “${fdlg.path}”` : 'Thư mục mới') : 'Đổi tên thư mục'}</b>} onClose={() => setFdlg(null)} foot={<span className="qm-nav">
          <button type="button" className="btn btn-outline" onClick={() => setFdlg(null)}>Huỷ</button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={submitFolder}>{fdlg.kind === 'new' ? 'Tạo' : 'Lưu tên'}</button>
        </span>}>
          <label className="xm-field">Tên thư mục <input className="xl-in" value={fdlg.name} autoFocus maxLength={60} onFocus={(ev) => ev.currentTarget.select()} onChange={(ev) => setFdlg({ ...fdlg, name: ev.target.value })} onKeyDown={(ev) => { if (ev.key === 'Enter') submitFolder(); }} /></label>
          <p className="xl-meta">{fdlg.kind === 'rename' ? 'Chỉ đổi nhãn thư mục của các đề bên trong; không đụng tới tệp của đề.' : 'Thư mục riêng chỉ là nhãn để gom đề; tạo xong có thể kéo đề vào.'}</p>
        </Modal>
      )}
      {fdlg?.kind === 'move' && (
        <Modal title={<b>Chuyển thư mục “{fdlg.path}”</b>} onClose={() => setFdlg(null)} foot={<span className="qm-nav">
          <button type="button" className="btn btn-outline" onClick={() => setFdlg(null)}>Huỷ</button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={submitFolder}>Chuyển</button>
        </span>}>
          <label className="xm-field">Vào thư mục
            <select className="xl-in" value={fdlg.to} onChange={(ev) => setFdlg({ ...fdlg, to: ev.target.value })}>
              <option value="">(Ngoài cùng)</option>
              {allFolderPaths.filter((f) => f !== fdlg.path && !f.startsWith(`${fdlg.path}/`)).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        </Modal>
      )}
      {fdlg?.kind === 'delete' && (
        <ConfirmDialog title="Xoá thư mục?" confirmLabel="Xoá thư mục" cancelLabel="Giữ lại" busy={busy} onCancel={() => setFdlg(null)} onConfirm={submitFolder}>
          <p>Thư mục “{fdlg.path}” sẽ bị xoá. {folderExamCount(items, fdlg.path) ? `${folderExamCount(items, fdlg.path)} đề bên trong KHÔNG bị xoá, được đưa lên ${fdlg.path.includes('/') ? `“${fdlg.path.slice(0, fdlg.path.lastIndexOf('/'))}”` : 'ngoài cùng'}.` : 'Thư mục đang trống.'}</p>
        </ConfirmDialog>
      )}
      {dragOver && !tabs.front && <div className="xl-drop" aria-hidden="true"><b>Thả vào đây để nhập đề</b><span>Tệp .tex hoặc thư mục dự án · tệp gốc giữ nguyên{place ? ` · vào mục ${trail.join(' › ')}` : ''}</span></div>}
      {askTrash && (
        <ConfirmDialog title="Chuyển vào Thùng rác đề?" confirmLabel="Chuyển vào Thùng rác" cancelLabel="Giữ lại" busy={busy} onCancel={() => setAskTrash(null)} onConfirm={trash}>
          <p>Đề “{askTrash.name}” sẽ rời khỏi thư viện nhưng KHÔNG bị xoá: bạn khôi phục được ở Công cụ › Thùng rác đề.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
