// Màn hình Ngân hàng câu hỏi.
// Bố cục: thanh trái "Mục lục & bộ lọc" (Lớp → Phân môn → Chương → Bài → Dạng; Mức độ, Loại, Hình, Kiểm duyệt); cột phải tìm kiếm và xem câu.
// Mọi lựa chọn đều hiện sẵn số câu (đếm theo chiều) để biết chỗ nào đang thiếu.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { featureOn } from '../lib/features';
import { QuestionView } from '../components/QuestionView';
import { QuestionDrawer } from '../components/QuestionDrawer';
import { loadPerPage, loadSort, PER_PAGE_CHOICES, savePerPage, saveSort, type PerPage } from '../lib/bankview';
import { loadSession, saveSession } from '../lib/banksession';
import { IcCopy, IcEdit, IcMore, IcSearch, IcTrash } from '../components/Icons';
import { parseExTest } from '../lib/extest';
import { place, useTaxonomy } from '../lib/curriculum';
import { gradeLabel, shortName } from '../lib/taxonomy';
import { LEVEL_LETTER, questionCode, seqLabel } from '../lib/id';
import { duplicateQuestion, setReview, useBank, updateMany } from '../lib/store';
import { moveManyToTrash, moveToTrash, trashBlockReason, undoMoveToTrash } from '../lib/trashflow';
import { BIG_OP, ensureRestorePoint } from '../lib/dbbackup';
import { decisionsLoaded, loadDecisions } from '../lib/dupdecisions';
import { BankSidebar } from '../components/BankSidebar';
import { BankEmpty } from '../components/BankEmpty';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AutoIdDialog } from '../components/AutoIdDialog';
import { BatchTagDialog, BatchTrashDialog } from '../components/BatchDialogs';
import { applyIdSync, AUTO_ID_MAX, clearAutoIdUndo, getAutoIdUndo, syncCounts, undoAutoId, undoConflicts, type AutoIdUndo } from '../lib/idapply';
import { withReview } from '../lib/batchops';
import { exportSizeMB } from '../lib/texexport';
import { verbatimTex } from '../lib/texproject';
import { ExportChoiceDialog } from '../components/ExportChoiceDialog';
import { addMany, exportVerdict, pageState, prune, removeMany, selCounts, SELECT_ALL_CONFIRM_OVER, toggleOne, EXPORT_MAX } from '../lib/selection';
import { SORT_LABEL, SORT_MODES, sortedCopy, type SortMode } from '../lib/qsort';
import { attrCount, chapterBranchMap, levelsActive, clearAttrs, computeFacets, emptyFilters, facetCtx, sanitize, taxMaps, type BankFilters } from '../lib/bankfilter';
import { DupCheck } from '../components/DupCheck';
import { QuestionModal } from '../components/QuestionModal';
import { BankMoreFilters, type IdFilter } from '../components/BankMoreFilters';
import { ReviewBadge } from '../components/ReviewControl';
import { IdStateBadge, useEffectiveOf } from '../components/IdReviewControl';
import { VerifyQueue } from '../components/VerifyQueue';
import { ClaudeIdDialog } from '../components/ClaudeIdDialog';
import { scopeCounts } from '../lib/verifyqueue';
import { LEVELS, LEVEL_LABEL, REVIEW_LABEL, TYPES, TYPE_LABEL, type Question, type ReviewStatus } from '../lib/types';

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

// Chữ tìm kiếm của từng câu được nhớ theo ĐỐI TƯỢNG câu: sửa/gắn nhãn hàng loạt chỉ tạo đối tượng mới cho câu bị đổi,
// nên không phải dựng lại chỉ mục của cả 60.000 câu (~1 giây) sau mỗi thao tác.
let searchCache = new WeakMap<Question, string>();
let searchCacheTax: unknown = null; // mã ID hiển thị phụ thuộc cây chương trình ⇒ đổi cây thì bỏ nhớ
function searchable(q: Question): string {
  const hit = searchCache.get(q);
  if (hit !== undefined) return hit;
  const v = searchableRaw(q);
  searchCache.set(q, v);
  return v;
}
function searchableRaw(q: Question): string {
  const p = parseExTest(q.latex);
  return fold([p.stem, ...p.options.map((o) => o.text), p.solution ?? '', questionCode(q, q.level), q.tags.join(' ')].join(' ').replace(/\\[a-zA-Z]+/g, ' '));
}

const nf = new Intl.NumberFormat('vi-VN');

export function BankScreen() {
  const { go, toast, openPalette, showFile, nav } = useApp();
  const { questions } = useBank();
  const { tax } = useTaxonomy();

  const sess = useRef(loadSession()).current; // quay lại từ màn khác thì giữ bộ lọc/tìm/sắp xếp/trang (chỉ trong bộ nhớ)
  const [f0, setF0] = useState<BankFilters>(() => sess?.f0 ?? emptyFilters()); // vị trí + thuộc tính; luôn đi qua sanitize trước khi dùng
  const [text, setText] = useState(() => sess?.text ?? '');
  const [wide, setWide] = useState(() => sess?.wide ?? false); // tìm trong toàn bộ ngân hàng thay vì mục đang chọn (chỉ có hiệu lực khi đang có chữ tìm)
  const [showSol, setShowSol] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState<null | { title: string; body: string; label: string; run: () => void }>(null);
  const [batch, setBatch] = useState<null | 'trash' | 'autoid' | 'tag'>(null); // hộp thoại thao tác hàng loạt
  const [autoUndo, setAutoUndo] = useState<AutoIdUndo | null>(() => getAutoIdUndo()); // Hoàn tác Gán ID (trong phiên)
  const [batchBusy, setBatchBusy] = useState(false);
  const [undo, setUndo] = useState<null | { qs: Question[]; n: number }>(null); // dải "Hoàn tác" sau khi chuyển vào Thùng rác
  const busyRef = useRef(false); // chống bấm liên tiếp trước khi giao diện kịp khoá nút
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [moreSel, setMoreSel] = useState(false); // menu "Thao tác khác" của thanh chọn
  const [dupSel, setDupSel] = useState(false); // mở Kiểm tra trùng với phạm vi "các câu đang chọn"
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  /** câu đang mở trong cửa sổ xem (bấm vào thẻ) */
  const [viewUid, setViewUid] = useState<string | null>(null);
  const [viewEdit, setViewEdit] = useState(false); // đang sửa câu ngay trong cửa sổ xem
  const [openUid, setOpenUid] = useState<string | null>(nav.openUid ?? null); // câu đang sửa ở ngăn bên phải
  const opened = openUid ? questions.find((q) => q.uid === openUid) : undefined;
  const [page, setPage] = useState(() => sess?.page ?? 0);
  const [perPage, setPerPageState] = useState<PerPage>(loadPerPage);
  const PER_PAGE: number = perPage;
  const [sort, setSortState] = useState<SortMode>(() => sess?.sort ?? loadSort());
  const setSort = (m: SortMode) => { setSortState(m); saveSort(m); setPage(0); };
  const setPerPage = (n: PerPage) => { setPerPageState(n); savePerPage(n); setPage(0); };
  const qlistRef = useRef<HTMLElement>(null);
  /** Chuyển trang; từ pager cuối danh sách thì cuộn về đầu danh sách để thấy câu đầu trang mới. */
  const goPage = (n: number, scroll = false) => { setPage(n); if (scroll) requestAnimationFrame(() => { const el = qlistRef.current; if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 8) }); }); };
  /** câu vừa được nhảy tới (từ Kiểm tra trùng): cuộn tới thẻ và nháy sáng một lần */
  const [flashUid, setFlashUid] = useState<string | null>(null);
  const [dupOpen, setDupOpen] = useState(false); // màn Kiểm tra trùng
  const [menuUid, setMenuUid] = useState<string | null>(null); // menu ba chấm của thẻ

  const index = useMemo(() => {
    if (searchCacheTax !== tax) { searchCache = new WeakMap(); searchCacheTax = tax; }
    return new Map(questions.map((q) => [q.uid, searchable(q)]));
  }, [questions, tax]);

  const f = useMemo(() => sanitize(tax, f0), [tax, f0]);
  const setF = (n: BankFilters) => { setPage(0); setF0(n); };
  const hasText = text.trim().length > 0;
  const wideOn = wide && hasText;
  const gradeObj = tax.grades.find((g) => g.id === f.gradeId) ?? null;
  const chapter = gradeObj?.branches.flatMap((b) => b.chapters).find((c) => c.id === f.chapterId) ?? null;
  const lesson = chapter?.lessons.find((l) => l.id === f.lessonId) ?? null;

  // Trạng thái xác minh Dạng: lọc cùng lượt với chữ tìm, để MỌI số đếm (cây, thống kê, Tổng) khớp đúng danh sách đang hiện
  const effOf = useEffectiveOf();
  const [idF, setIdF] = useState<IdFilter>('all');
  const qByUid = useMemo(() => new Map(questions.map((q) => [q.uid, q])), [questions]);
  /** Một lượt duyệt: danh sách hiện ra + số đếm theo chiều cho mọi ô lọc. */
  const facets = useMemo(() => {
    const words = fold(text.trim()).split(/\s+/).filter(Boolean);
    const idOk = (uid: string) => {
      if (idF === 'all') return true;
      const q = qByUid.get(uid);
      if (!q) return false;
      const e = effOf(q);
      return idF === 'chua-phan-loai' ? e.unclassified : !e.unclassified && e.form === idF;
    };
    return computeFacets(questions, f, facetCtx(tax, (uid) => words.every((w) => index.get(uid)!.includes(w)) && idOk(uid), wideOn, sort));
  }, [questions, f, text, wideOn, tax, index, sort, idF, qByUid, effOf]);
  const uidSet = useMemo(() => new Set(questions.map((q) => q.uid)), [questions]);
  // câu đã xoá thì khỏi tập chọn; tập chọn rỗng thì thoát chế độ "chỉ xem đã chọn"
  useEffect(() => { setSel((s) => prune(s, uidSet) as Set<string>); }, [uidSet]);
  const selectedQs = useMemo(() => sortedCopy(questions.filter((q) => sel.has(q.uid)), sort), [questions, sel, sort]);
  const list = facets.list;
  const resultUids = useMemo(() => new Set(list.map((q) => q.uid)), [list]);
  const [vqOpen, setVqOpen] = useState(false); // hàng đợi xác minh từng câu (PR 1E)
  const [cidOpen, setCidOpen] = useState(false); // Gán ID nhờ Claude (AI ngoài)
  const vqCount = useMemo(() => scopeCounts(list, effOf)['tat-ca'], [list, effOf]);

  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const cur = Math.min(page, pages - 1);
  useEffect(() => { saveSession({ f0, text, wide, sort, page: cur }); }, [f0, text, wide, sort, cur]);
  const shown = list.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);
  const shownUids = useMemo(() => shown.map((q) => q.uid), [shown]);
  const counts = selCounts(sel, shownUids, resultUids);
  const pState = pageState(sel, shownUids);
  const masterRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (masterRef.current) masterRef.current.indeterminate = pState === 'some'; }, [pState]);
  useEffect(() => {
    if (!flashUid) return;
    const el = document.querySelector<HTMLElement>(`.card[data-uid="${flashUid}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setFlashUid(null), 2200);
    return () => clearTimeout(t);
  }, [flashUid, shown]);
  // Menu ba chấm: bấm ra ngoài thì đóng
  useEffect(() => {
    if (!menuUid) return;
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('.more')) { setMenuUid(null); setConfirmDel(null); } };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMenuUid(null); setConfirmDel(null); } };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [menuUid]);

  /** Từ màn Kiểm tra trùng: chuyển tới đúng câu trong Ngân hàng (cuộn tới thẻ, nháy sáng) để giáo viên tự xoá có xác nhận. */
  const gotoQuestion = (uid: string) => {
    const q = questions.find((x) => x.uid === uid);
    if (!q) return;
    setDupOpen(false); setWide(false); setText('');
    const tm = taxMaps(tax);
    setF0({ ...emptyFilters(), gradeId: tm.chapterGrade.get(q.chapterId) ?? tm.gradeByNum.get(q.grade) ?? null, branchId: chapterBranchMap(tax).get(q.chapterId) ?? null, chapterId: q.chapterId || null, lessonId: q.lessonId || null });
    const sc = questions.filter((x) => x.grade === q.grade && (!q.chapterId || x.chapterId === q.chapterId) && (!q.lessonId || x.lessonId === q.lessonId)).sort((a, b) => b.updatedAt - a.updatedAt);
    setPage(Math.floor(Math.max(0, sc.findIndex((x) => x.uid === uid)) / PER_PAGE));
    setFlashUid(uid);
    toast(`Đã chuyển tới ${seqLabel(q.seq)}. Muốn xoá: nút ⋯ → Xoá câu (có hỏi lại).`);
  };

  /** Câu mới ở vị trí đang duyệt: chỉ khi đã chọn Lớp và không đang tìm toàn kho; mức độ chỉ gợi ý khi chọn đúng một mức. */
  const newHere = () => {
    if (wideOn || !gradeObj) { go({ screen: 'editor', fromBank: true }); return; }
    const branch = gradeObj.branches.find((b) => b.id === f.branchId);
    const ch = chapter ?? (branch ?? gradeObj.branches[0])?.chapters[0] ?? null;
    const ls = lesson ?? ch?.lessons[0] ?? null;
    const fm = (ls && f.formId ? ls.forms.find((x) => x.id === f.formId) : null) ?? ls?.forms[0] ?? null;
    const level = levelsActive(f) && f.levels.size === 1 ? LEVELS.find((l) => f.levels.has(l)) : undefined;
    const label = [gradeLabel(gradeObj), ch && chapter ? shortName(ch.name) : null, ls && lesson ? shortName(ls.name) : null].filter(Boolean).join(' › ');
    go({ screen: 'editor', fromBank: true, newAt: { grade: gradeObj.grade, chapterId: ch?.id ?? '', lessonId: ls?.id ?? '', formId: fm?.id ?? '', level, label } });
  };

  // Từ màn Soạn quay về: dừng ở câu vừa lưu nếu nó nằm trong bộ lọc hiện tại
  const focusDone = useRef(false);
  useEffect(() => {
    if (focusDone.current || !nav.focusUid) return;
    focusDone.current = true;
    const i = list.findIndex((q) => q.uid === nav.focusUid);
    if (i >= 0) { setPage(Math.floor(i / PER_PAGE)); setFlashUid(nav.focusUid); }
    else toast('Câu vừa lưu nằm ngoài bộ lọc hiện tại. Bấm “Đặt lại toàn bộ” để thấy tất cả.');
  }, [nav.focusUid, list, toast, PER_PAGE]);

  const clearFilters = () => setF(clearAttrs(f));
  const resetEverything = () => { setF(emptyFilters()); setText(''); setWide(false); };
  const nAttr = attrCount(f);
  const canReset = f.gradeId != null || nAttr > 0 || hasText || wide;

  // Thanh trái: gắn cố định khi đủ rộng và đang mở; ngược lại là ngăn trượt (cùng một thành phần, cùng trạng thái).
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1000);
  useEffect(() => { const h = () => setNarrow(window.innerWidth < 1000); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  const docked = !narrow;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (docked && drawerOpen) setDrawerOpen(false); }, [docked, drawerOpen]);
  useEffect(() => {
    if (!drawerOpen) return;
    document.querySelector<HTMLElement>('.fside.is-drawer .fs-top button')?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.fm-pop')) { e.preventDefault(); setDrawerOpen(false); openerRef.current?.focus(); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [drawerOpen]);

  const noFilter = f.gradeId == null && nAttr === 0 && !hasText;
  const resultsName = noFilter ? 'toàn bộ ngân hàng' : 'kết quả đang lọc';
  const selectPage = () => setSel(addMany(sel, shownUids));
  const deselectPage = () => setSel(removeMany(sel, shownUids));
  const doSelectAll = () => { setSel(addMany(sel, list.map((q) => q.uid))); toast(`Đã chọn thêm ${nf.format(list.length)} câu (${resultsName}). Tổng đang chọn sẽ hiện ở thanh phía trên.`); };
  const selectAllResults = () => {
    if (list.length > SELECT_ALL_CONFIRM_OVER) setAsk({ title: `Chọn ${nf.format(list.length)} câu?`, body: `Sẽ chọn tất cả ${nf.format(list.length)} câu trong ${resultsName}, ở mọi trang. Các câu đã chọn trước đó vẫn giữ.`, label: `Chọn ${nf.format(list.length)} câu`, run: doSelectAll });
    else doSelectAll();
  };
  /** Chạy một thao tác hàng loạt: ghi MỘT lần, báo trung thực "Đã lưu X/Y" hoặc "Chưa lưu được". Giữ nguyên lựa chọn. */
  const runBatch = async (fn: (q: Question) => Question | null, what: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBatchBusy(true);
    const r = await updateMany(sel, fn);
    busyRef.current = false;
    setBatchBusy(false);
    setBatch(null);
    if (!r.ok) toast(`Chưa lưu được ${what} — KHÔNG câu nào bị thay đổi. Hãy kiểm tra ổ đĩa rồi thử lại.`);
    else if (r.changed === 0) toast(`Không có gì thay đổi: các câu đã chọn đã đúng như vậy.`);
    else toast(`Đã lưu ${what}: ${nf.format(r.changed)}/${nf.format(r.total)} câu${r.changed < r.total ? ` (${nf.format(r.total - r.changed)} câu đã đúng sẵn)` : ''}.`);
  };
  /** Hoàn tác lần Gán ID gần nhất: câu đã bị sửa tiếp / xoá thì giữ nguyên (hỏi trước khi làm). */
  const runAutoUndo = async (u: AutoIdUndo) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const r = await undoAutoId(u);
    busyRef.current = false;
    if (!r.ok) { toast('Chưa hoàn tác được — KHÔNG câu nào bị thay đổi. Hãy kiểm tra ổ đĩa rồi thử lại.'); return; }
    setAutoUndo(getAutoIdUndo());
    toast(`Đã hoàn tác (vị trí, mức độ, ID trong LaTeX) cho ${nf.format(r.restored)} câu${r.conflicts ? `; ${nf.format(r.conflicts)} câu đã bị sửa tiếp hoặc xoá nên giữ nguyên` : ''}.`);
  };
  const askAutoUndo = () => {
    const u = autoUndo;
    if (!u) return;
    const n = undoConflicts(u, new Map(questions.map((q) => [q.uid, q]))).length;
    if (n === 0) { void runAutoUndo(u); return; }
    setAsk({ title: `Hoàn tác cập nhật ID cho ${nf.format(u.items.length - n)} câu?`, body: `${nf.format(n)} câu đã bị sửa tiếp (vị trí, mức độ hoặc nội dung) hoặc đã xoá sau lần gán — các câu đó GIỮ NGUYÊN, không bị ghi đè.`, label: 'Hoàn tác', run: () => { void runAutoUndo(u); } });
  };
  /** Dữ liệu cũ: thêm `%[ID]` theo vị trí vào LaTeX của câu chưa có ID. Câu có ID (khớp, lệch hay lỗi) không bị đụng. */
  const askIdSync = () => {
    const n = syncCounts(selectedQs);
    const other = n.lech + n['id-loi'] + n['vi-tri-loi'];
    if (n['chua-co-id'] === 0) { toast(`Không có câu nào cần thêm ID: ${nf.format(n.khop)} câu đã khớp${other ? `, ${nf.format(other)} câu có ID lệch/lỗi — mở từng câu để chọn bên đúng` : ''}.`); return; }
    setAsk({
      title: `Thêm ID vào LaTeX cho ${nf.format(n['chua-co-id'])} câu?`,
      body: `HEdu ghi %[ID] theo vị trí + mức độ đang lưu ngay sau \\begin{ex} của ${nf.format(n['chua-co-id'])} câu chưa có ID; nội dung câu, kiểm duyệt, nhãn không đổi. ${nf.format(n.khop)} câu đã khớp: giữ nguyên.${other ? ` ${nf.format(n.lech)} câu có ID khác vị trí, ${nf.format(n['id-loi'])} câu có ID lỗi, ${nf.format(n['vi-tri-loi'])} câu có vị trí chưa ra được ID: KHÔNG đụng — mở từng câu để xử lý.` : ''} Có thể Hoàn tác ngay sau đó.`,
      label: `Thêm ID cho ${nf.format(n['chua-co-id'])} câu`,
      run: () => { void runIdSync(); },
    });
  };
  const runIdSync = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBatchBusy(true);
    const r = await applyIdSync(sel);
    busyRef.current = false;
    setBatchBusy(false);
    if (!r.ok) { toast('Chưa lưu được — KHÔNG câu nào bị thay đổi. Hãy kiểm tra ổ đĩa rồi thử lại.'); return; }
    setAutoUndo(getAutoIdUndo());
    toast(r.changed ? `Đã thêm ID vào LaTeX cho ${nf.format(r.changed)} câu.` : 'Không có gì thay đổi.');
  };
  const openTrashBatch = async () => { if (!decisionsLoaded()) await loadDecisions(); setBatch('trash'); };
  /** Xoá hàng loạt vào Thùng rác: tất cả hoặc không câu nào; chỉ nói "Đã chuyển N câu" khi cả thùng rác và ngân hàng đã ghi xong. */
  const runTrashBatch = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBatchBusy(true);
    const moved = selectedQs;
    const rp = await ensureRestorePoint('xoa-hang-loat', moved.length >= BIG_OP); // SQLite: điểm khôi phục trước khi xoá hàng loạt
    if (!rp.ok) { busyRef.current = false; setBatchBusy(false); setBatch(null); toast(rp.message); return; }
    const r = await moveManyToTrash(moved);
    busyRef.current = false;
    setBatchBusy(false);
    setBatch(null);
    if (r.ok) { setUndo({ qs: moved, n: r.moved }); return; }
    toast(r.strayInTrash ? `${r.message} Lưu ý: ${nf.format(r.strayInTrash)} câu đang có bản trong Thùng rác (không mất gì); mở màn Thùng rác nếu cần dọn.` : r.message);
  };
  const runUndo = async () => {
    if (!undo || busyRef.current) return;
    busyRef.current = true;
    const u = undo;
    const r = await undoMoveToTrash(u.qs);
    busyRef.current = false;
    setUndo(null);
    if (!r.ok) { toast(r.message); return; }
    toast(r.strayInTrash ? `Đã khôi phục ${nf.format(r.restored)} câu về Ngân hàng. Lưu ý: còn bản trong Thùng rác (không mất gì), có thể dọn ở màn Thùng rác.` : `Đã khôi phục ${nf.format(r.restored)} câu về Ngân hàng.`);
  };
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 30000); return () => clearTimeout(t); }, [undo]);
  // Đổi bộ lọc hoặc chữ tìm ⇒ bỏ chọn các câu ngoài kết quả mới (mọi câu đang chọn luôn nhìn thấy được). Đổi trang/sắp xếp/kiểu xem thì giữ.
  const filterSeen = useRef(false);
  useEffect(() => {
    if (!filterSeen.current) { filterSeen.current = true; return; }
    setSel((s) => {
      if (s.size === 0) return s;
      const kept = new Set<string>();
      for (const u of s) if (resultUids.has(u)) kept.add(u);
      if (kept.size === s.size) return s;
      toast(`Đã bỏ chọn ${nf.format(s.size - kept.size)} câu nằm ngoài bộ lọc mới.`);
      return kept;
    });
  }, [f0, text, wideOn]); // eslint-disable-line react-hooks/exhaustive-deps
  // Menu "Thao tác khác": bấm ra ngoài hoặc Esc thì đóng (Esc trả focus về nút)
  useEffect(() => {
    if (!moreSel) return;
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('.selbar-more')) setMoreSel(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMoreSel(false); moreBtnRef.current?.focus(); } };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [moreSel]);
  const [exportPick, setExportPick] = useState(false);
  const runFileOnly = () => {
    setExportPick(false);
    showFile({ title: `${selectedQs.length} câu đã chọn`, name: 'cau-hoi-da-chon.tex', text: verbatimTex(selectedQs), mime: 'application/x-tex' });
  };
  const runExport = () => setExportPick(true);
  const exportSelected = () => {
    const n = selectedQs.length, v = exportVerdict(n);
    if (v === 'refuse') { toast(`Mỗi lần xuất .tex tối đa ${nf.format(EXPORT_MAX)} câu (đang chọn ${nf.format(n)}). Hãy bỏ bớt hoặc xuất theo từng chương.`); return; }
    if (v === 'warn') { setAsk({ title: `Xuất ${nf.format(n)} câu ra .tex?`, body: `File khoảng ${exportSizeMB(selectedQs).toFixed(1)} MB và hộp xem có thể chậm. Nên xuất theo từng chương nếu không cần tất cả một lần.`, label: 'Vẫn xuất', run: runExport }); return; }
    runExport();
  };

  const viewIdx = viewUid ? list.findIndex((q) => q.uid === viewUid) : -1;
  const viewQ = viewIdx >= 0 ? list[viewIdx] : null;
  /** Câu trước/sau trong cửa sổ xem, theo cả danh sách đang lọc; trang nền đi theo để đóng cửa sổ là thấy đúng chỗ. */
  const stepView = (d: number) => {
    const i = viewIdx + d;
    if (i < 0 || i >= list.length) return;
    setViewUid(list[i].uid);
    setPage(Math.floor(i / PER_PAGE));
  };

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]') || document.querySelector('[aria-modal="true"]')) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === 'PageDown' && cur < pages - 1) { e.preventDefault(); goPage(cur + 1, true); }
      else if (e.key === 'PageUp' && cur > 0) { e.preventDefault(); goPage(cur - 1, true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const renderCard = (q: Question) => {
    const p = parseExTest(q.latex);
    const on = sel.has(q.uid);
    const at = place(q.lessonId) ?? place(q.chapterId);
    return (
      <article key={q.uid} data-uid={q.uid} className={`card${on ? ' is-selected' : ''}${flashUid === q.uid ? ' is-flash' : ''}`}>
        <input type="checkbox" checked={on} aria-label={`Chọn câu ${seqLabel(q.seq)}`} onChange={() => setSel(toggleOne(sel, q.uid))} />
        <div className="card-body">
          <div className="card-meta">
            <span className="mono card-no">{seqLabel(q.seq)}</span>
            <span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span>
            <span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
            <span className="code-tag" title={questionCode(q, q.level)}>{questionCode(q, q.level)}</span>
            <div className="card-acts">
              <button type="button" className="ico" aria-label="Sửa câu" title="Sửa" onClick={() => { setViewUid(q.uid); setViewEdit(true); }}><IcEdit size={17} /></button>
              <div className="more">
                <button type="button" className="ico" aria-label="Thêm thao tác" aria-haspopup="menu" aria-expanded={menuUid === q.uid} title="Nhân bản, xoá…" onClick={() => { setConfirmDel(null); setMenuUid(menuUid === q.uid ? null : q.uid); }}><IcMore size={17} /></button>
                {menuUid === q.uid && (
                  <div className="more-menu" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenuUid(null); } }}>
                    <button type="button" role="menuitem" onClick={() => { setMenuUid(null); const c = duplicateQuestion(q.uid); if (c) { toast(`Đã nhân bản thành ${seqLabel(c.seq)} — nhớ sửa số liệu.`); } }}><IcCopy size={16} />Nhân bản</button>
                    {confirmDel === q.uid
                      ? <button type="button" role="menuitem" className="danger" onClick={() => { setMenuUid(null); removeQuestion(q); }} autoFocus><IcTrash size={16} />Bấm lần nữa để xoá</button>
                      : <button type="button" role="menuitem" className="danger" onClick={() => setConfirmDel(q.uid)}><IcTrash size={16} />Xoá câu</button>}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="card-where" title={at ? `${at.chapter?.name ?? ''} › ${at.lesson?.name ?? ''}` : undefined}><span className="cw-path">{at ? `${shortName(at.chapter?.name ?? '')} › ${shortName(at.lesson?.name ?? '')}` : 'Chưa gán vị trí'}</span><ReviewBadge q={q} /><IdStateBadge eff={effOf(q)} />{q.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
          <div className="card-content" role="button" tabIndex={0} aria-label={`Xem đầy đủ câu ${seqLabel(q.seq)}`} title="Bấm để xem đầy đủ"
            onClick={() => setViewUid(q.uid)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewUid(q.uid); } }}>
            <QuestionView p={p} variant="compact" showSolution={showSol} raw={q.latex} />
          </div>
        </div>
      </article>
    );
  };

  /** Đổi kiểm duyệt; nếu câu rời khỏi bộ lọc đang bật thì báo nhẹ (câu đang xem tự chuyển sang câu hợp lệ kế tiếp). */
  const changeReview = async (q: Question, s: ReviewStatus | undefined): Promise<boolean> => {
    const ok = await setReview(q.uid, s);
    if (ok && f.review !== 'all' && (s ?? 'unreviewed') !== f.review) toast(`${seqLabel(q.seq)} chuyển sang “${REVIEW_LABEL[s ?? 'unreviewed']}” nên không còn trong bộ lọc này.`);
    return ok;
  };

  /** Xoá một câu (vào Thùng rác) và bỏ khỏi ô chọn. */
  const removeQuestion = async (q: Question) => {
    setConfirmDel(null);
    const block = await trashBlockReason([q]);
    if (block) { toast(block); return; }
    const mv = await moveManyToTrash([q]);
    if (!mv.ok) { toast(mv.why === 'trash-write' ? 'Không lưu được thùng rác nên CHƯA xoá câu. Hãy thử lại hoặc tạo file sao lưu trước.' : mv.message); return; }
    setSel((s) => { const n = new Set(s); n.delete(q.uid); return n; });
    toast(`Đã chuyển ${seqLabel(q.seq)} vào Thùng rác.`, { label: 'Mở Thùng rác', run: () => go({ screen: 'trash' }) });
  };


  const heading = wideOn ? 'Kết quả tìm trong toàn kho' : chapter && gradeObj ? `${gradeLabel(gradeObj)} · ${chapter.name}` : gradeObj ? gradeLabel(gradeObj) : 'Toàn bộ ngân hàng';

  return (
    <>
      <header className="page-head bank-head">
        <h1>Ngân hàng câu hỏi</h1>
        <div className="head-actions">
          <button type="button" className="btn btn-outline" onClick={() => go({ screen: 'import' })}>Nhập từ file</button>
          <button type="button" className="btn btn-accent" onClick={newHere} title="Soạn câu mới; nếu đang xem một chương/bài thì điền sẵn vị trí đó">+ Câu hỏi mới</button>
        </div>
      </header>

      <div className={`body-row${!docked ? ' tree-hidden' : ''}`}>
        {docked && (
          <BankSidebar variant="dock" tax={tax} f={f} facets={facets} wide={wideOn} onF={setF} onHide={() => undefined} />
        )}

        <section ref={qlistRef} className="qlist" aria-label="Danh sách câu hỏi">
          <div className="qbar">
            <label className="search sm">
              <IcSearch size={16} />
              <span className="sr-only">Tìm câu hỏi</span>
              <input ref={searchRef} type="search" value={text} onChange={(e) => { setText(e.target.value); setPage(0); }} placeholder="Tìm câu hoặc mã (vd 2D1H1) — phím /" />
              <select className="scope-sel" value={wide ? 'all' : 'here'} onChange={(e) => setWide(e.target.value === 'all')} aria-label="Phạm vi tìm">
                <option value="here">mục này</option>
                <option value="all">toàn kho</option>
              </select>
              <button type="button" className="kbd" style={{ border: 'none' }} onClick={openPalette}>Ctrl K</button>
            </label>
            <BankMoreFilters f={f} facets={facets} onF={setF} idF={idF} onIdF={(v) => { setPage(0); setIdF(v); }} onClearAll={() => { clearFilters(); setIdF('all'); }} onResetAll={() => { resetEverything(); setIdF('all'); }} canReset={canReset || idF !== 'all'} nAll={nAttr + (idF !== 'all' ? 1 : 0)} />
            <button type="button" className="btn btn-sm" onClick={() => setDupOpen(true)}>Kiểm tra trùng</button>
            {narrow && (
              <button ref={openerRef} type="button" className={`btn btn-sm fs-open${nAttr > 0 ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} title="Mở mục lục và bộ lọc">
                Mục lục
              </button>
            )}
          </div>


          {sel.size > 0 && (
            <div className="selbar" role="region" aria-label="Thao tác với các câu đã chọn">
              <span className="selbar-n">
                <b>Đã chọn {nf.format(counts.total)} câu</b>
                <small>{nf.format(counts.inPage)} ở trang này · {nf.format(counts.outPage)} ngoài trang{counts.outScope > 0 ? ` · ${nf.format(counts.outScope)} ngoài bộ lọc` : ''}</small>
              </span>
              <div className="selbar-grp">
                <button type="button" className="btn btn-sm" onClick={exportSelected} title="Xuất các câu đã chọn ra file .tex, theo kiểu sắp xếp đang chọn">Xuất .tex</button>
                <button type="button" className="btn btn-sm" onClick={() => { setDupSel(true); setDupOpen(true); }} title="Quét trùng trong các câu đã chọn">Kiểm tra trùng</button>
                <button type="button" className="btn btn-sm" onClick={() => { if (sel.size > AUTO_ID_MAX) toast(`Gán ID tự động: mỗi lượt tối đa ${nf.format(AUTO_ID_MAX)} câu (đang chọn ${nf.format(sel.size)}). Hãy bỏ bớt rồi làm từng lượt.`); else setBatch('autoid'); }} title={`Gợi ý vị trí (ID) theo các câu đã có trong ngân hàng, xem trước rồi mới áp dụng — tối đa ${AUTO_ID_MAX} câu/lượt`}>Gán ID tự động</button>
                {featureOn('exam') && <button type="button" className="btn btn-sm btn-accent" onClick={() => go({ screen: 'exam', examPick: selectedQs.map((q) => q.uid) })}>Thêm vào đề</button>}
                <span className="selbar-more">
                  <button ref={moreBtnRef} type="button" className="btn btn-sm" aria-haspopup="menu" aria-expanded={moreSel} onClick={() => setMoreSel(!moreSel)}>Thao tác khác ▾</button>
                  {moreSel && (
                    <div className="more-menu" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setMoreSel(false); moreBtnRef.current?.focus(); } }}>
                      <button type="button" role="menuitem" autoFocus onClick={() => { setMoreSel(false); setBatch('tag'); }}>Gắn nhãn…</button>
                      <button type="button" role="menuitem" onClick={() => { setMoreSel(false); setAsk({ title: `Đánh dấu “Cần sửa” cho ${nf.format(sel.size)} câu?`, body: 'Chỉ đổi trạng thái kiểm duyệt. Nội dung câu không đổi. (HEdu không có “Đã duyệt hàng loạt”: việc duyệt do thầy/cô xác nhận từng câu.)', label: 'Đánh dấu Cần sửa', run: () => { void runBatch(withReview('needs_fix'), 'đánh dấu Cần sửa'); } }); }}>Đánh dấu “Cần sửa”</button>
                      <button type="button" role="menuitem" onClick={() => { setMoreSel(false); setAsk({ title: `Đưa ${nf.format(sel.size)} câu về “Chưa kiểm tra”?`, body: 'Các câu đang “Đã duyệt” hoặc “Cần sửa” sẽ trở về “Chưa kiểm tra”. Nội dung không đổi.', label: 'Về Chưa kiểm tra', run: () => { void runBatch(withReview(undefined), 'đưa về Chưa kiểm tra'); } }); }}>Về “Chưa kiểm tra”</button>
                      <button type="button" role="menuitem" onClick={() => { setMoreSel(false); askIdSync(); }}>Đồng bộ ID vào LaTeX…</button>
                      <button type="button" role="menuitem" className="danger" onClick={() => { setMoreSel(false); void openTrashBatch(); }}>Chuyển vào Thùng rác…</button>
                    </div>
                  )}
                </span>
                <span className="selbar-sep" aria-hidden="true" />
                {counts.inPage > 0 && <button type="button" className="btn btn-sm" onClick={deselectPage} title="Chỉ bỏ các câu của trang này, giữ các trang khác">Bỏ chọn trang</button>}
                <button type="button" className="btn btn-sm" onClick={() => setSel(new Set())}>Bỏ chọn tất cả</button>
              </div>
            </div>
          )}
          {(list.length > 0 || levelsActive(f) || f.types.size > 0) && (
            <div className="qstats" role="group" aria-label="Thống kê kết quả (bấm để lọc; bấm nhiều ô để chọn nhiều)">
              <span className="qs-title">Thống kê</span>
              <div className="qs-grp">
                <span className="qs-col qs-head"><span>Mức</span><span>Số câu</span></span>
                {LEVELS.map((l) => (
                  <button key={l} type="button" className={`qs-col qs-btn l-${l}`} aria-pressed={f.levels.has(l)} title={`${LEVEL_LABEL[l]}: bấm để lọc (bấm lần nữa để bỏ)`} aria-label={`${LEVEL_LABEL[l]}: ${nf.format(facets.level.get(l) ?? 0)} câu`}
                    onClick={() => { const n = new Set(f.levels); if (n.has(l)) n.delete(l); else n.add(l); setF({ ...f, levels: n }); }}>
                    <span>{LEVEL_LETTER[l]}</span><span>{nf.format(facets.level.get(l) ?? 0)}</span>
                  </button>
                ))}
              </div>
              <div className="qs-grp">
                <span className="qs-col qs-head"><span>Kiểu</span><span>Số câu</span></span>
                {TYPES.map((t) => (
                  <button key={t} type="button" className={`qs-col qs-btn t-${t}`} aria-pressed={f.types.has(t)} title={`${TYPE_LABEL[t]}: bấm để lọc (bấm lần nữa để bỏ)`}
                    onClick={() => { const n = new Set(f.types); if (n.has(t)) n.delete(t); else n.add(t); setF({ ...f, types: n }); }}>
                    <span>{TYPE_LABEL[t]}</span><span>{nf.format(facets.type.get(t) ?? 0)}</span>
                  </button>
                ))}
              </div>
              <div className="qs-grp qs-end">
                {levelsActive(f) || f.types.size > 0
                  ? <button type="button" className="qs-col qs-btn qs-sum" title="Bỏ lọc mức độ và kiểu câu" onClick={() => setF({ ...f, levels: new Set(), types: new Set() })}><span>Bỏ lọc ✕</span><span>{nf.format(list.length)}</span></button>
                  : <span className="qs-col qs-sum"><span>Tổng</span><span>{nf.format(list.length)}</span></span>}
              </div>
            </div>
          )}
          {shown.length > 0 && (
            <div className="qtools">
              <span className="lh-left">
                <label className="lh-sel" title="Chọn hoặc bỏ chọn các câu đang hiện ở trang này">
                  <input ref={masterRef} type="checkbox" checked={pState === 'all'} onChange={() => (pState === 'all' ? deselectPage() : selectPage())} />
                  Chọn trang
                </label>
                <label className="sw lh-sol"><input type="checkbox" checked={showSol} onChange={(e) => setShowSol(e.target.checked)} />Hiện lời giải</label>
                {list.length > shown.length && counts.total - counts.outScope < list.length && (
                  <button type="button" className="linkbtn" onClick={selectAllResults} title={`Chọn cả ${nf.format(list.length)} câu của ${resultsName}, ở mọi trang`}>Chọn cả {nf.format(list.length)} câu</button>
                )}
              </span>
              <span className="qtools-r">
                <button type="button" className="btn btn-sm" disabled={vqCount === 0} onClick={() => setVqOpen(true)} title="Xem từng câu, xác nhận Dạng/mức độ bằng phím tắt">Xác minh ({nf.format(vqCount)})</button>
                <button type="button" className="btn btn-sm" onClick={() => setCidOpen(true)} title="Xuất lô câu cần gán ID cho Claude, nhập đề xuất về hàng đợi Xác minh">Gán ID nhờ Claude…</button>
                <label className="qsel" title="Sắp xếp">
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} aria-label="Sắp xếp danh sách">
                    {SORT_MODES.map((m) => <option key={m} value={m}>{SORT_LABEL[m]}</option>)}
                  </select>
                </label>
                <label className="qsel">
                  <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value) as PerPage)} aria-label="Số câu mỗi trang">
                    {PER_PAGE_CHOICES.map((n) => <option key={n} value={n}>{n}/trang</option>)}
                  </select>
                </label>
                {pages > 1 && (
                  <span className="pager-top" role="group" aria-label="Chuyển trang">
                    <button type="button" className="btn btn-sm" disabled={cur === 0} onClick={() => goPage(cur - 1)} aria-label="Trang trước">‹</button>
                    <label className="pg-jump"><input key={cur} type="number" min={1} max={pages} defaultValue={cur + 1} aria-label={`Trang (1–${pages})`}
                      onKeyDown={(e) => { if (e.key === 'Enter') { const n = Math.round(Number((e.target as HTMLInputElement).value)); if (n >= 1 && n <= pages) goPage(n - 1); else (e.target as HTMLInputElement).value = String(cur + 1); } }}
                      onBlur={(e) => { const n = Math.round(Number(e.target.value)); if (n >= 1 && n <= pages && n !== cur + 1) goPage(n - 1); else e.target.value = String(cur + 1); }} /> / {nf.format(pages)}</label>
                    <button type="button" className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => goPage(cur + 1)} aria-label="Trang sau">›</button>
                  </span>
                )}
              </span>
            </div>
          )}

          {shown.length > 0 && <div className="cards-grid">{shown.map((q) => renderCard(q))}</div>}


          {pages > 1 && (
            <nav className="pager" aria-label="Phân trang">
              <button type="button" className="btn btn-sm" disabled={cur === 0} onClick={() => goPage(cur - 1, true)}>‹ Trước</button>
              <span>Trang <b>{cur + 1}</b> / {nf.format(pages)}</span>
              <button type="button" className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => goPage(cur + 1, true)}>Sau ›</button>
            </nav>
          )}

          {!list.length && (
            <BankEmpty tax={tax} f={f} facets={facets} totalQuestions={questions.length} text={text} wide={wideOn} onF={setF}
              onClearText={() => { setText(''); setWide(false); setPage(0); }} onWide={() => setWide(true)} onClearAttrs={clearFilters}
              onNew={newHere} onImport={() => go({ screen: 'import' })} />
          )}
        </section>
      </div>
      {drawerOpen && !docked && (
        <>
          <div className="fs-scrim" onClick={() => { setDrawerOpen(false); openerRef.current?.focus(); }} />
          <BankSidebar variant="drawer" tax={tax} f={f} facets={facets} wide={wideOn} onF={setF} onHide={() => { setDrawerOpen(false); openerRef.current?.focus(); }} />
        </>
      )}
      {vqOpen && <VerifyQueue pool={list} onClose={() => setVqOpen(false)} />}
      {cidOpen && <ClaudeIdDialog pool={list} all={questions} tax={tax} effOf={effOf} toast={toast} onClose={() => setCidOpen(false)} onOpenQueue={() => setVqOpen(true)} />}
      {dupOpen && <DupCheck questions={questions} selected={sel} initialSelection={dupSel} onClose={() => { setDupOpen(false); setDupSel(false); }} onOpen={setOpenUid} onGoto={gotoQuestion} onTrash={moveToTrash} />}
      {undo && (
        <div className="undo-bar" role="status">
          <span>Đã chuyển <b>{nf.format(undo.n)}</b> câu vào Thùng rác.</span>
          <button type="button" className="btn btn-sm btn-accent" onClick={() => { void runUndo(); }}>Hoàn tác</button>
          <button type="button" className="btn btn-sm" onClick={() => go({ screen: 'trash' })}>Mở Thùng rác</button>
          <button type="button" className="ico" aria-label="Đóng" onClick={() => setUndo(null)}>×</button>
        </div>
      )}
      {batch === 'autoid' && <AutoIdDialog qs={selectedQs} onClose={() => setBatch(null)} onDone={(m) => { setBatch(null); setAutoUndo(getAutoIdUndo()); toast(m); }} />}
      {autoUndo && !undo && (
        <div className="undo-bar" role="status">
          <span>Đã cập nhật ID (vị trí/LaTeX) cho <b>{nf.format(autoUndo.items.length)}</b> câu. <small>Hoàn tác được trong phiên này.</small></span>
          <button type="button" className="btn btn-sm btn-accent" onClick={askAutoUndo}>Hoàn tác</button>
          <button type="button" className="ico" aria-label="Đóng (không hoàn tác nữa)" onClick={() => { clearAutoIdUndo(); setAutoUndo(null); }}>×</button>
        </div>
      )}
      {batch === 'tag' && <BatchTagDialog qs={selectedQs} busy={batchBusy} onRun={(fn) => { void runBatch(fn, 'nhãn'); }} onCancel={() => setBatch(null)} />}
      {batch === 'trash' && <BatchTrashDialog qs={selectedQs} busy={batchBusy} onRun={() => { void runTrashBatch(); }} onCancel={() => setBatch(null)} />}
      {exportPick && <ExportChoiceDialog qs={selectedQs} onFileOnly={runFileOnly} onClose={() => setExportPick(false)} onToast={toast} />}
      {ask && <ConfirmDialog title={ask.title} confirmLabel={ask.label} onConfirm={() => { const r = ask.run; setAsk(null); r(); }} onCancel={() => setAsk(null)}><p>{ask.body}</p></ConfirmDialog>}
      {viewQ && (
        <QuestionModal q={viewQ} index={viewIdx} total={list.length} eff={effOf(viewQ)} selected={sel.has(viewQ.uid)} onToggleSel={() => setSel(toggleOne(sel, viewQ.uid))}
          onPrev={() => stepView(-1)} onNext={() => stepView(1)} editing={viewEdit} onEditing={setViewEdit} onReview={(s) => changeReview(viewQ, s)} onClose={() => { setViewUid(null); setViewEdit(false); }} />
      )}
      {opened && <QuestionDrawer q={opened} onClose={() => setOpenUid(null)} onDirty={() => undefined} />}
    </>
  );
}
