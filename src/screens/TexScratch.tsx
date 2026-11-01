// Màn "Xử lí TeX" — Đợt 1a (claude/de-xuat-man-xu-li-tex.md mục 10): bàn nháp soạn các khối \begin{ex}…\end{ex}.
// Khung soạn (CodeEditor) + danh sách câu (phân tích CHỈ ĐỌC, texscratch.ts) + xem nhanh từng câu (gần đúng, có thể khác PDF).
// Một bản nháp duy nhất, lưu bền (scratchdraft.ts → texscratch.rs). Không ghi gì vào ngân hàng hay Thư viện đề; không sửa văn bản.
// Đợt 1b: "Biên dịch PDF" (nút hoặc Ctrl+Enter) — main.tex + content.tex nguyên văn (scratchbuild.ts) → Rust texscratch.rs; lỗi theo câu/dòng,
// PDF mang nhãn "bản trước" khi mã đã đổi; PDF nguyên văn (có thể chứa lời giải).
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { setImportHandoff } from '../lib/importhandoff';
import { CodeEditor, type CodeEditorHandle } from '../components/CodeEditor';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IcAlert, IcCheckCircle, IcCopy } from '../components/Icons';
import { PdfViewer } from '../components/PdfViewer';
import { QuestionView } from '../components/QuestionView';
import { useTaxonomy } from '../lib/curriculum';
import { parseExTest } from '../lib/extest';
import { AUTOSAVE_MS, loadDraft, SAVE_LABEL, saveDraft, type SaveState } from '../lib/scratchdraft';
import { addDraft, deleteDraft, EMPTY_INDEX, loadIndex, MAIN_NAME, nameOf, removeDraft, renameDraft, saveIndex, setActive, type DraftIndex } from '../lib/scratchslots';
import { blockInfos, ID_STATE_LABEL, scanScratch, type BlockInfo } from '../lib/texscratch';
import type { Diag } from '../lib/examcompile';
import { missingPackages } from '../lib/missingpkg';
import { invoke, isDesktop } from '../lib/platform';
import { errorReport, scratchFiles, whereLabel, whereOf } from '../lib/scratchbuild';
import { FIX_RULES, planFix, planSort } from '../lib/texfix';
import { ScratchReplace } from '../components/ScratchReplace';
import { ScratchClaudeId } from '../components/ScratchClaudeId';
import { appendText, exportName, openTexFiles } from '../lib/scratchfile';
import { checkScratchDup, type DupRun } from '../lib/scratchdup';
import { DUP_KIND_LABEL } from '../lib/dup2';
import { seqLabel } from '../lib/id';
import { getState } from '../lib/store';
import { saveTextFile } from '../lib/savefile';
import { downloadText } from '../app-context';
import { filterCounts, FILTER_LABEL, FILTER_ORDER, filterInfos, hasTikz, mapBlocks, pickBlocks, type ListFilter } from '../lib/scratchsel';
import type { ScratchScan } from '../lib/texscratch';

interface ScratchOut { status: 'ok' | 'failed' | 'timeout' | 'cancelled' | 'no-tex'; message: string; pages: number | null; runs: number; ms: number; texVersion: string; diagnostics: Diag[]; errorCount: number; warningCount: number; rawLog: string; invalidPdf: boolean; hasPdf: boolean }
const PKG_KEY = 'hedu.texscratch.goi';
const loadPkgs = (): string[] => { try { const v = JSON.parse(localStorage.getItem(PKG_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : []; } catch { return []; } };

const KEY = 'nhap';
const MODE_KEY = 'hedu.texmode';
type VMode = 'code' | 'both' | 'view';
const nf = new Intl.NumberFormat('vi-VN');
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const lines = (xs: readonly number[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')}…` : xs.join(', '));

export function TexScratchScreen() {
  const { toast, go } = useApp();
  const { tax } = useTaxonomy();
  const ed = useRef<CodeEditorHandle>(null);
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  /** không đọc được bản nháp (kể cả bản dự phòng): khoá ghi để không đè lên tệp người dùng còn cứu được */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [fromBackup, setFromBackup] = useState(false);
  const [save, setSave] = useState<SaveState>('da-luu');
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [vmode, setVmodeState] = useState<VMode>(() => { try { const v = localStorage.getItem(MODE_KEY); return v === 'code' || v === 'view' ? v : 'both'; } catch { return 'both'; } });
  const setVmode = (v: VMode) => { setVmodeState(v); try { localStorage.setItem(MODE_KEY, v); } catch { /* chỉ là tiện lợi */ } };
  const [pane, setPane] = useState<'code' | 'view'>('code'); // khung hẹp
  const [sel, setSel] = useState<number | null>(null);
  const [showSol, setShowSol] = useState(true);
  const [askClear, setAskClear] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [claudeOpen, setClaudeOpen] = useState(false);
  /** các câu đang tick (theo số thứ tự khối); thao tác "đã chọn" chỉ chạy trên các câu này */
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const pickedRef = useRef<ReadonlySet<number>>(picked);
  pickedRef.current = picked;
  const [lfilter, setLfilter] = useState<ListFilter>('all');
  /** kết quả "Kiểm tra trùng": chỉ áp cho câu còn đúng văn bản lúc kiểm */
  const [dupRun, setDupRun] = useState<DupRun | null>(null);
  const [dupBusy, setDupBusy] = useState<{ pct: number; phase: string } | null>(null);
  const dupStop = useRef({ aborted: false });
  /** PDF đang hiện là của các câu này (null = cả bàn nháp) */
  const [pdfScope, setPdfScope] = useState<number[] | null>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toolsOpen) return;
    const off = (e: MouseEvent) => { if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [toolsOpen]);
  const [fixFor, setFixFor] = useState<'fix' | 'sort' | null>(null);
  // biên dịch PDF
  const [tab, setTab] = useState<'cau' | 'pdf'>('cau');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<ScratchOut | null>(null);
  /** nội dung lúc biên dịch THÀNH CÔNG gần nhất (PDF đang có là của nội dung này) */
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [pdfGen, setPdfGen] = useState(0);
  const [extra, setExtra] = useState<string[]>(loadPkgs);
  const shared = useRef<string | null>(null);

  const latest = useRef('');
  const saved = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const blockedRef = useRef<string | null>(null);
  /** bàn nháp đang mở ('' = bàn nháp chính) và danh sách các bàn nháp riêng */
  const slotRef = useRef('');
  const [ix, setIx] = useState<DraftIndex>(EMPTY_INDEX);
  const [nameDlg, setNameDlg] = useState<{ kind: 'new' | 'rename'; initial: string } | null>(null);
  const [askDelete, setAskDelete] = useState(false);

  /** Lưu NGAY (Ctrl+S, rời màn, hết thời gian chờ). Các lần lưu chạy nối tiếp nhau, không chồng. */
  const flush = useCallback((): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    chain.current = chain.current.then(async () => {
      if (blockedRef.current) return;
      const t = latest.current;
      if (t === saved.current) { setSave('da-luu'); return; }
      setSave('dang-luu');
      try {
        await saveDraft(t, slotRef.current);
        saved.current = t;
        ed.current?.markSaved(KEY, t);
        setSaveErr(null);
        setSave(latest.current === t ? 'da-luu' : 'chua-luu');
      } catch (e) {
        setSaveErr(msg(e));
        setSave('loi');
      }
    });
    return chain.current;
  }, []);

  useEffect(() => {
    let alive = true;
    loadIndex().then((index) => {
      slotRef.current = index.active;
      if (alive) setIx(index);
      return loadDraft(index.active);
    }).then((d) => {
      if (!alive) return;
      const t = d.text ?? '';
      latest.current = t; saved.current = t;
      setText(t); setFromBackup(d.fromBackup); setReady(true);
      ed.current?.open(KEY, t, false);
    }).catch((e) => {
      if (!alive) return;
      const m = `Không đọc được bản nháp đã lưu (${msg(e)}). HEdu không ghi đè lên tệp đó; nội dung mới sẽ KHÔNG được lưu cho tới khi mở lại được.`;
      blockedRef.current = m; setBlocked(m); setReady(true);
      ed.current?.open(KEY, '', false);
    });
    return () => {
      alive = false;
      // rời màn: lưu nốt phần chưa lưu
      if (latest.current !== saved.current && !blockedRef.current) void saveDraft(latest.current, slotRef.current).catch(() => undefined);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onChangeText = (_k: string, t: string) => {
    latest.current = t;
    setText(t);
    if (blockedRef.current) return;
    setSave('chua-luu');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  };

  const slow = useDeferredValue(text);
  const scan = useMemo(() => scanScratch(slow), [slow]);
  const infos = useMemo(() => blockInfos(scan, tax), [scan, tax]);
  const cur: BlockInfo | null = infos.find((b) => b.block.n === sel) ?? infos[0] ?? null;
  const parsed = useMemo(() => (cur?.block.closed ? parseExTest(cur.block.text) : null), [cur]);
  const nId = infos.filter((b) => b.id.state === 'co-trong-cay').length;
  const nDone = infos.filter((b) => b.block.closed).length;
  const nBad = infos.filter((b) => b.problems > 0).length;
  /** câu đang tick còn tồn tại (văn bản có thể đã đổi từ lúc tick) */
  const scope = useMemo<ReadonlySet<number> | null>(() => { const s2 = new Set([...picked].filter((n) => n <= scan.blocks.length)); return s2.size ? s2 : null; }, [picked, scan]);
  const nScope = scope?.size ?? 0;

  const compile = useCallback(async () => {
    if (busy) return;
    if (!isDesktop()) { toast('Biên dịch PDF chỉ có ở bản cài trên Windows (cần TeX Live).'); return; }
    // có câu đang tick ⇒ chỉ biên dịch các câu đó (lỗi vẫn báo theo dòng/câu của bàn nháp)
    const sc = scanScratch(latest.current);
    const ns = [...pickedRef.current].filter((n) => n <= sc.blocks.length).sort((a, b) => a - b);
    const sub = ns.length ? pickBlocks(latest.current, sc, ns) : null;
    const t = sub ? sub.text : latest.current;
    if (!t.trim()) { toast('Bàn nháp đang trống.'); return; }
    setBusy(true); setTab('pdf');
    try {
      await flush();
      if (shared.current === null) { try { shared.current = await invoke<string>('tikz_default_preamble'); } catch { shared.current = ''; } }
      const o0 = await invoke<ScratchOut>('tex_scratch_compile', { files: scratchFiles(t, shared.current, extra) });
      const o = sub ? { ...o0, diagnostics: o0.diagnostics.map((d) => ((d.file ?? '').replace(/^\.\//, '') === 'content.tex' && d.line != null && d.line > 0 ? { ...d, line: sub.orig[d.line - 1] ?? null } : d)) } : o0;
      setOut(o);
      if (o.status === 'ok') { setPdfText(t); setPdfScope(sub ? ns : null); setPdfGen((g) => g + 1); }
      else if (o.hasPdf) setPdfGen((g) => g || 1); // vẫn hiện PDF tốt gần nhất (nhãn "bản trước")
    } catch (e) {
      setOut({ status: 'failed', message: msg(e), pages: null, runs: 0, ms: 0, texVersion: '', diagnostics: [], errorCount: 0, warningCount: 0, rawLog: '', invalidPdf: false, hasPdf: false });
    } finally { setBusy(false); }
  }, [busy, extra, flush, toast]);
  const stop = () => { void invoke<boolean>('tex_scratch_compile_cancel'); };
  // Ctrl+Enter: biên dịch (Ctrl+S chỉ lưu nháp)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void compile(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [compile]);
  const errIdx = useRef(-1);
  const errs = useMemo(() => (out?.diagnostics ?? []).filter((d) => d.severity === 'error'), [out]);
  const hints = out && out.status !== 'ok' ? missingPackages(out.diagnostics, out.rawLog) : [];
  /** PDF đang hiện không phải của nội dung hiện tại (mã đã đổi, hoặc là PDF của lần trước khi mở lại màn) */
  const pdfNow = useMemo(() => (pdfScope ? pickBlocks(text, scan, pdfScope).text : text), [text, scan, pdfScope]);
  const stale = pdfGen > 0 && (pdfText === null || pdfText !== pdfNow);
  /** số lỗi biên dịch theo câu (để gắn nhãn ở danh sách và lọc) */
  const buildErr = useMemo(() => { const m = new Map<number, number>(); for (const d of errs) { const w = whereOf(d, scan); if (w.kind === 'noi-dung' && w.block != null) m.set(w.block, (m.get(w.block) ?? 0) + 1); } return m; }, [errs, scan]);
  /** câu nghi trùng còn hiệu lực (văn bản chưa đổi từ lúc kiểm) */
  const dupOf = useMemo(() => { const m = new Map<number, NonNullable<DupRun['marks'] extends Map<number, infer V> ? V : never>>(); if (!dupRun) return m; for (const b of scan.blocks) { const mk = dupRun.marks.get(b.n); if (mk && dupRun.snap.get(b.n) === b.text) m.set(b.n, mk); } return m; }, [dupRun, scan]);
  const fctx = useMemo(() => ({ buildErr: new Set(buildErr.keys()), picked: scope ?? new Set<number>(), dup: new Set(dupOf.keys()) }), [buildErr, scope, dupOf]);
  const counts = useMemo(() => filterCounts(infos, fctx), [infos, fctx]);
  const shown = useMemo(() => filterInfos(infos, lfilter, fctx), [infos, lfilter, fctx]);
  const togglePick = (n: number) => setPicked((p) => { const q = new Set(p); if (q.has(n)) q.delete(n); else q.add(n); return q; });
  const allShownPicked = shown.length > 0 && shown.every((b) => picked.has(b.block.n));
  const pickShown = () => setPicked((p) => { const q = new Set(p); if (allShownPicked) shown.forEach((b) => q.delete(b.block.n)); else shown.forEach((b) => q.add(b.block.n)); return q; });
  /** nhảy tới lỗi biên dịch kế tiếp trong danh sách (vòng lại từ đầu) */
  const nextErr = () => { const here = errs.filter((d) => whereOf(d, scan).kind === 'noi-dung'); if (!here.length) return; errIdx.current = (errIdx.current + 1) % here.length; jumpTo(here[errIdx.current]); };
  const addPkg = (p: string) => { const n = [...new Set([...extra, p])]; setExtra(n); try { localStorage.setItem(PKG_KEY, JSON.stringify(n)); } catch { /* chỉ là tiện lợi */ } toast(`Đã thêm gói ${p} vào khai báo của bàn nháp. Bấm Biên dịch PDF lại.`); };
  const copyReport = async () => { try { await navigator.clipboard.writeText(errorReport(out?.diagnostics ?? [], scan, latest.current)); toast('Đã sao chép báo lỗi. Dán vào tin nhắn gửi Claude.'); } catch { toast('Không sao chép được (bị chặn).'); } };
  const jumpTo = (d: Diag) => { const w = whereOf(d, scan); if (w.kind === 'noi-dung') { ed.current?.jump(KEY, w.line); if (w.block != null) setSel(w.block); setPane('code'); if (vmode === 'view') setVmode('both'); } };

  const pick = (b: BlockInfo) => { setSel(b.block.n); ed.current?.jump(KEY, b.block.line0); if (vmode === 'view') setVmode('both'); };
  /** Mở bàn nháp khác: lưu nốt bàn nháp đang mở, ghi nhớ bàn nháp đang mở, rồi nạp bàn nháp mới (kết quả lọc/chọn/trùng của bàn nháp cũ không mang sang). */
  const openSlot = async (id: string, index: DraftIndex, fresh = false) => {
    await flush();
    if (blockedRef.current && !fresh) { toast('Bàn nháp hiện tại không lưu được, nên chưa chuyển. Xem thông báo đỏ phía trên.'); return; }
    let t = '', fromB = false;
    if (!fresh) {
      try { const d = await loadDraft(id); t = d.text ?? ''; fromB = d.fromBackup; } catch (e) { toast(`Không mở được bàn nháp: ${msg(e)}`); return; }
    }
    const next = setActive(index, id);
    try { await saveIndex(next); } catch (e) { toast(`Không ghi nhớ được bàn nháp đang mở: ${msg(e)}`); }
    slotRef.current = id; setIx(next);
    blockedRef.current = null; setBlocked(null); setFromBackup(fromB); setSaveErr(null); setSave('da-luu');
    latest.current = t; saved.current = t; setText(t);
    ed.current?.reset(KEY, t);
    setPicked(new Set()); setLfilter('all'); setDupRun(null); setSel(null);
  };
  const createDraft = async (name: string) => {
    setNameDlg(null);
    const r = addDraft(ix, name);
    if ('error' in r) { toast(r.error); return; }
    await openSlot(r.id, r.ix, true);
    toast(`Đã tạo “${nameOf(r.ix, r.id)}”. Bàn nháp trước vẫn được giữ.`);
    ed.current?.focus();
  };
  const renameCurrent = async (name: string) => {
    setNameDlg(null);
    const n = renameDraft(ix, slotRef.current, name);
    if (n === ix) return;
    setIx(n);
    try { await saveIndex(n); } catch (e) { toast(`Không lưu được tên mới: ${msg(e)}`); }
  };
  const deleteCurrent = async () => {
    setAskDelete(false);
    const id = slotRef.current;
    if (!id) return;
    await flush();
    const next = removeDraft(ix, id);
    try { await deleteDraft(id); } catch (e) { toast(`Không xoá được: ${msg(e)}`); return; }
    await openSlot('', next);
    toast('Đã xoá bàn nháp. Đang mở bàn nháp chính.');
  };
  /** Áp dụng một thay đổi đã xem trước: thay cả văn bản (Ctrl+Z trong khung soạn lấy lại được), kèm nút Hoàn tác. */
  const applyText = (next: string, what: string) => {
    const prev = latest.current;
    setFixFor(null); setReplaceOpen(false); setClaudeOpen(false);
    if (next === prev) { toast(`${what}: không có gì thay đổi.`); return; }
    ed.current?.replaceDoc(KEY, next);
    toast(`Đã ${what.toLowerCase()}.`, { label: 'Hoàn tác', run: () => { if (latest.current === next) ed.current?.replaceDoc(KEY, prev); } });
  };
  /** Đưa các khối ex của bàn nháp sang màn Nhập liệu (qua đúng luồng nhập: rà trùng, kiểm ID, xem lại, rồi mới ghi). Bàn nháp giữ nguyên. */
  const toBank = async () => {
    const sc = scanScratch(latest.current);
    const sub = scope ? pickBlocks(latest.current, sc, scope) : null;
    if ((sub ? sc.blocks.filter((b) => scope!.has(b.n) && b.closed).length : nDone) === 0) { toast('Chưa có khối ex hoàn chỉnh (đủ \\begin{ex} và \\end{ex}) để đưa vào.'); return; }
    await flush();
    setImportHandoff(sub ? sub.text : latest.current);
    go({ screen: 'import' });
  };
  /** Mở tệp .tex/.txt: nội dung được NỐI vào cuối bàn nháp (không thay thế); Hoàn tác được. */
  const fileIn = useRef<HTMLInputElement>(null);
  const addOpened = (files: { name: string; text: string; guessed: boolean }[]) => {
    if (!files.length) return;
    const prev = latest.current;
    const next = files.reduce((acc, f) => appendText(acc, f.text), prev);
    if (next === prev) { toast('Tệp không có nội dung để thêm.'); return; }
    ed.current?.replaceDoc(KEY, next);
    const guessed = files.filter((f) => f.guessed).map((f) => f.name);
    toast(`Đã thêm ${files.length === 1 ? `tệp ${files[0].name}` : `${files.length} tệp`} vào cuối bàn nháp.${guessed.length ? ` Tệp ${guessed.join(', ')} đọc theo bảng mã đoán (Windows-1258): xem lại chữ tiếng Việt.` : ''}`, { label: 'Hoàn tác', run: () => { if (latest.current === next) ed.current?.replaceDoc(KEY, prev); } });
  };
  const openFiles = async () => {
    try {
      const r = await openTexFiles();
      if (r === null) { fileIn.current?.click(); return; }
      addOpened(r);
    } catch (e) { toast(`Không mở được tệp: ${msg(e)}`); }
  };
  const onPickWeb = async (list: FileList | null) => {
    if (!list?.length) return;
    const got = await Promise.all([...list].map(async (f) => ({ name: f.name, text: await f.text(), guessed: false })));
    addOpened(got);
    if (fileIn.current) fileIn.current.value = '';
  };
  /** Lưu bàn nháp (hoặc chỉ các câu đã chọn) ra tệp .tex nguyên văn */
  const saveFile = async () => {
    const t = scope ? pickBlocks(latest.current, scanScratch(latest.current), scope).text : latest.current;
    if (!t.trim()) { toast('Chưa có nội dung để lưu.'); return; }
    const name = exportName();
    const r = await saveTextFile(name, t, () => downloadText(name, t, 'text/plain'));
    if (r.kind === 'saved') toast(`Đã lưu ${r.path}.`);
    else if (r.kind === 'downloaded') toast(`Đã tải ${name} về máy.`);
    else if (r.kind === 'error') toast(`Không lưu được: ${r.message}`);
  };
  /** So các câu hoàn chỉnh (hoặc chỉ câu đã chọn) với ngân hàng và với nhau. Chỉ đọc; chạy khi bạn bấm. */
  const runDup = async () => {
    if (dupBusy) return;
    const sc = scanScratch(latest.current);
    const blocks = sc.blocks.filter((b) => b.closed && (!scope || scope.has(b.n))).map((b) => ({ n: b.n, text: b.text }));
    if (!blocks.length) { toast('Chưa có câu hoàn chỉnh để kiểm tra.'); return; }
    dupStop.current = { aborted: false };
    const sig = dupStop.current;
    setDupBusy({ pct: 0, phase: 'Đang chuẩn bị' });
    try {
      const r = await checkScratchDup(blocks, getState().questions, { signal: sig, onProgress: (f, phase) => { if (!sig.aborted) setDupBusy({ pct: Math.round(f * 100), phase }); } });
      if (!r.complete) { toast('Đã dừng kiểm tra trùng; chưa có kết quả đầy đủ nên không coi là "không trùng".'); return; }
      // giữ kết quả cũ của câu không nằm trong lượt này
      setDupRun((old) => {
        if (!old || !scope) return r;
        const marks = new Map(old.marks), snap = new Map(old.snap);
        for (const [n] of r.snap) { marks.delete(n); snap.set(n, r.snap.get(n)!); }
        for (const [n, v] of r.marks) marks.set(n, v);
        return { complete: true, marks, snap };
      });
      toast(r.marks.size ? `${r.marks.size}/${blocks.length} câu có thể trùng. Xem mục “Có thể trùng” ở danh sách câu.` : `Không thấy câu nào trùng (${blocks.length} câu đã kiểm).`);
      if (r.marks.size) setLfilter('dup');
    } catch (e) { toast(`Không kiểm tra được: ${msg(e)}`); } finally { setDupBusy(null); }
  };
  /** Dán nội dung đang copy (nếu trình duyệt cho đọc) vào bàn nháp, nối vào cuối. */
  const pasteClip = async () => {
    try { const t = await navigator.clipboard.readText(); if (!t.trim()) { toast('Bộ nhớ tạm đang trống.'); return; } addOpened([{ name: 'bộ nhớ tạm', text: t, guessed: false }]); }
    catch { toast('Không đọc được bộ nhớ tạm (bị chặn). Bấm vào khung rồi dán bằng Ctrl+V.'); ed.current?.focus(); }
  };
  const clearAll = () => { setAskClear(false); ed.current?.replaceDoc(KEY, ''); ed.current?.focus(); toast('Đã xoá nội dung bàn nháp. Bấm Ctrl+Z trong khung soạn để lấy lại.'); };

  return (
    <div className="qe-page tsx-page">
      <header className="page-head tsx-head">
        <div>
          <h1>Xử lí TeX</h1>
          <span className="sys-hint">Dán hoặc gõ các khối <code>\begin{'{ex}'}…\end{'{ex}'}</code>; khai báo gói có sẵn. Bàn nháp không ghi vào ngân hàng cho tới khi bạn bấm “Đưa vào Ngân hàng”.</span>
        </div>
        <div className="head-actions">
          <label className="tsx-slot" title="Chọn bàn nháp. Mỗi bàn nháp lưu riêng (vd. một đề, một chương)."><span>Bàn nháp</span>
            <select value={ix.active} onChange={(e) => void openSlot(e.target.value, ix)} aria-label="Bàn nháp đang mở">
              <option value="">{MAIN_NAME}</option>
              {ix.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <span className={`qs ${save === 'loi' ? 'bad' : save === 'da-luu' ? 'ok' : 'idle'}`} role="status" title={saveErr ?? undefined}>{blocked ? 'Không lưu được' : SAVE_LABEL[save]}</span>
          <button type="button" className="btn btn-sm" disabled={!!blocked || save === 'da-luu'} onClick={() => void flush()} title="Ctrl+S">Lưu nháp</button>
        </div>
      </header>

      <input ref={fileIn} type="file" accept=".tex,.txt,text/plain" multiple hidden onChange={(e) => void onPickWeb(e.target.files)} />
      <div className="tsx-toolbar" role="toolbar" aria-label="Công cụ bàn nháp">
        <div className="seg sm qe-vmode" role="group" aria-label="Chế độ xem">
          {([['code', 'Mã'], ['both', 'Mã + Xem trước'], ['view', 'Xem trước']] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={vmode === k} onClick={() => setVmode(k)}>{l}</button>
          ))}
        </div>
        <div className="tsx-tools">
          <div className="tsx-more" ref={toolsRef}>
            <button type="button" className="btn btn-sm" aria-haspopup="menu" aria-expanded={toolsOpen} onClick={() => setToolsOpen((o) => !o)}>Công cụ ▾</button>
            {toolsOpen && (
              <div className="more-menu" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setToolsOpen(false); } }}>
                <button type="button" role="menuitem" onClick={() => { setToolsOpen(false); setNameDlg({ kind: 'new', initial: '' }); }} autoFocus>Bàn nháp mới…</button>
                <button type="button" role="menuitem" disabled={!ix.active} onClick={() => { setToolsOpen(false); setNameDlg({ kind: 'rename', initial: nameOf(ix, ix.active) }); }}>Đổi tên bàn nháp này…</button>
                <button type="button" role="menuitem" className="danger" disabled={!ix.active} onClick={() => { setToolsOpen(false); setAskDelete(true); }}>Xoá bàn nháp này…</button>
                <hr className="tsx-hr" />
                <button type="button" role="menuitem" onClick={() => { setToolsOpen(false); void openFiles(); }} disabled={!!blocked}>Mở tệp .tex vào bàn nháp…</button>
                <button type="button" role="menuitem" disabled={!text.trim()} onClick={() => { setToolsOpen(false); void saveFile(); }}>Lưu ra tệp .tex…{nScope ? ' (câu đã chọn)' : ''}</button>
                <button type="button" role="menuitem" disabled={!nDone || !!dupBusy} onClick={() => { setToolsOpen(false); void runDup(); }} title="So với ngân hàng và giữa các câu trong bàn nháp; chỉ đọc, không sửa gì">Kiểm tra trùng với ngân hàng…{nScope ? ' (câu đã chọn)' : ''}</button>
                <button type="button" role="menuitem" disabled={!nDone || !!blocked} onClick={() => { setToolsOpen(false); setClaudeOpen(true); }}>Gán ID nhờ Claude…{nScope ? ' (câu đã chọn)' : ''}</button>
                <button type="button" role="menuitem" disabled={!text} onClick={() => { setToolsOpen(false); setReplaceOpen(true); }}>Tìm và thay thế…{nScope ? ' (câu đã chọn)' : ''}</button>
                <button type="button" role="menuitem" disabled={!text} onClick={() => { setToolsOpen(false); setFixFor('fix'); }}>Chuẩn hoá…{nScope ? ' (câu đã chọn)' : ''}</button>
                <button type="button" role="menuitem" disabled={!scan.blocks.length} onClick={() => { setToolsOpen(false); setFixFor('sort'); }}>Sắp xếp theo ID…</button>
                <button type="button" role="menuitem" className="danger" disabled={!text} onClick={() => { setToolsOpen(false); setAskClear(true); }}>Xoá nội dung…</button>
              </div>
            )}
          </div>
          <button type="button" className="btn btn-sm" disabled={!nDone || !!blocked} onClick={() => void toBank()} title="Mở màn Nhập liệu với các câu của bàn nháp (hoặc chỉ các câu đã chọn): rà trùng, kiểm ID rồi mới ghi vào ngân hàng">Đưa vào Ngân hàng{nScope ? ` (${nf.format(nScope)} đã chọn)` : nDone ? ` (${nf.format(nDone)} câu)` : ''}…</button>
          {busy
            ? <button type="button" className="btn btn-sm" onClick={stop}>Dừng biên dịch</button>
            : <button type="button" className="btn btn-sm btn-accent" disabled={!text.trim()} onClick={() => void compile()} title={nScope ? 'Chỉ biên dịch các câu đã chọn (Ctrl+Enter)' : 'Ctrl+Enter'}>{nScope ? `Biên dịch ${nf.format(nScope)} câu đã chọn` : 'Biên dịch PDF'}</button>}
        </div>
      </div>

      {blocked && <div className="note bad" role="alert"><div className="note-body"><IcAlert size={16} /><span>{blocked}</span></div></div>}
      {fromBackup && <div className="note warn" role="status"><div className="note-body"><span>Bản nháp chính bị hỏng nên HEdu đã mở bản dự phòng gần nhất. Kiểm tra lại nội dung.</span></div></div>}
      {saveErr && !blocked && <div className="note bad" role="alert"><div className="note-body"><span>{saveErr}</span><button type="button" className="btn btn-sm" onClick={() => void flush()}>Thử lưu lại</button></div></div>}

      <div className="qe-tabs" role="tablist" aria-label="Khung đang xem">
        <button type="button" role="tab" aria-selected={pane === 'code'} onClick={() => setPane('code')}>Mã LaTeX</button>
        <button type="button" role="tab" aria-selected={pane === 'view'} onClick={() => setPane('view')}>Câu hỏi</button>
      </div>

      <div className="qe-panes tsx-panes" data-pane={pane} data-vmode={vmode}>
        <section className="qe-code" aria-label="Mã LaTeX">
          <div className="qe-bar"><h2>Mã LaTeX</h2><span className="qe-pos">{ready ? `${nf.format(scan.blocks.length)} khối ex` : 'Đang mở bản nháp…'}</span></div>
          <div className="tsx-editor">
            <CodeEditor ref={ed} label="Soạn nội dung LaTeX" onDirty={() => undefined} onSave={() => void flush()} onChangeText={onChangeText} />
            {ready && !text && !blocked && (
              <div className="tsx-empty" role="note">
                <b>Bàn nháp đang trống</b>
                <ol>
                  <li>Dán các khối <code>\begin{'{ex}'}…\end{'{ex}'}</code> vào khung này (Ctrl+V), hoặc mở tệp .tex.</li>
                  <li>Xem từng câu ở bên phải; bấm <b>Biên dịch PDF</b> (Ctrl+Enter) để TeX Live dịch thử.</li>
                  <li>Gán ID, kiểm tra trùng rồi bấm <b>Đưa vào Ngân hàng</b>.</li>
                </ol>
                <div className="head-actions">
                  <button type="button" className="btn btn-sm" onClick={() => void openFiles()}>Mở tệp .tex…</button>
                  <button type="button" className="btn btn-sm" onClick={() => void pasteClip()}>Dán từ bộ nhớ tạm</button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="qe-view tsx-view" aria-label="Câu hỏi">
          <div className="qe-bar">
            <div className="seg sm" role="group" aria-label="Khung bên phải">
              <button type="button" aria-pressed={tab === 'cau'} onClick={() => setTab('cau')}>Câu hỏi</button>
              <button type="button" aria-pressed={tab === 'pdf'} onClick={() => setTab('pdf')}>PDF TeX Live{busy ? ' …' : ''}</button>
            </div>
            {tab === 'cau' && <span className="tsx-tag" title="Dựng nhanh trong app, không qua TeX Live">Xem nhanh (có thể khác PDF)</span>}
            {tab === 'cau' && <label className="sw"><input type="checkbox" checked={showSol} onChange={(e) => setShowSol(e.target.checked)} />Lời giải</label>}
          </div>
          {tab === 'pdf' && (
            <div className="tsx-pdf">
              {busy && <p className="sys-hint" role="status">Đang biên dịch bằng TeX Live… (Dừng ở nút trên cùng)</p>}
              {!busy && !out && <p className="sys-hint">Bấm <b>Biên dịch PDF</b> (Ctrl+Enter) để TeX Live dịch cả bàn nháp. Khai báo gói có sẵn; chỉ dịch khi bạn bấm.</p>}
              {out && !busy && (
                <div className={`note ${out.status === 'ok' ? (out.warningCount ? 'warn' : 'ok') : 'bad'}`} role="status">
                  <div className="note-body">
                    <b>{out.message}</b>
                    {errs.length > 0 && (
                      <ul className="tsx-diags">
                        {errs.slice(0, 8).map((d, k) => { const w = whereOf(d, scan); return (
                          <li key={k}>{w.kind === 'noi-dung' ? <button type="button" className="linkbtn" onClick={() => jumpTo(d)}>{whereLabel(w)}</button> : <span>{whereLabel(w)}</span>}: {d.message}</li>
                        ); })}
                        {errs.length > 8 && <li>… và {errs.length - 8} lỗi nữa</li>}
                      </ul>
                    )}
                    {errs.length > 1 && <span><button type="button" className="btn btn-sm btn-ghost" onClick={nextErr}>Lỗi kế tiếp ▸</button></span>}
                    {errs.length > 0 && <span className="sys-hint">TeX có thể dừng ở lỗi đầu tiên nên danh sách chưa chắc đủ mọi lỗi.</span>}
                    {hints.map((h) => <span key={h.pkg}>{h.why} <button type="button" className="btn btn-sm" onClick={() => addPkg(h.pkg)}>Thêm gói {h.pkg}</button></span>)}
                    {errs.length > 0 && <span><button type="button" className="btn btn-sm btn-ghost" onClick={() => void copyReport()}><IcCopy size={14} /> Sao chép báo lỗi</button></span>}
                  </div>
                </div>
              )}
              {pdfGen > 0 && (
                <>
                  {pdfScope && <p className="sys-hint" role="status">PDF này chỉ gồm {nf.format(pdfScope.length)} câu đã chọn (câu {lines(pdfScope)}).</p>}
                  {stale && <p className="q-warn" role="status">PDF dưới đây là của <b>bản trước</b> (mã đã đổi, hoặc lần biên dịch vừa rồi chưa thành công). Bấm Biên dịch PDF để cập nhật.</p>}
                  <div className="tsx-pdfbox">
                    <PdfViewer key={pdfGen} embedded id="xu-li-tex" title="Bàn nháp Xử lí TeX" stale={stale || (!!out && out.status !== 'ok')} note="PDF nguyên văn: có thể chứa lời giải. Đừng phát cho học sinh khi chưa xem lại." load={() => invoke<ArrayBuffer>('tex_scratch_pdf')} />
                  </div>
                </>
              )}
            </div>
          )}
          {tab === 'cau' && <div className="tsx-notes">
            {scan.fullDoc.length > 0 && <p className="q-warn">Có vẻ đây là cả một tài liệu (<code>\documentclass</code>/<code>\begin{'{document}'}</code> ở dòng {lines(scan.fullDoc)}). Màn này đã có sẵn khai báo; nên chỉ giữ các khối câu hỏi. HEdu không tự xoá phần nào.</p>}
            {scan.io.length > 0 && <p className="q-warn">Có lệnh đọc/ghi tệp ({[...new Set(scan.io.map((x) => x.text))].join(', ')} ở dòng {lines(scan.io.map((x) => x.line))}). Khi biên dịch, chỉ đọc được tệp trong thư mục của bàn nháp.</p>}
            {scan.strayEnds.length > 0 && <p className="q-warn"><code>\end{'{ex}'}</code> thừa ở dòng {lines(scan.strayEnds)}.</p>}
            {scan.outside.length > 0 && <p className="sys-hint">{scan.outside.length} đoạn nằm ngoài các khối câu (dòng {lines(scan.outside.map((o) => o.line0))}): giữ nguyên, không tính là câu.</p>}
          </div>}
          {tab === 'cau' && <div className="tsx-split">
            <div className="tsx-listwrap">
              <div className="tsx-filters" role="group" aria-label="Lọc danh sách câu">
                {FILTER_ORDER.filter((f) => f === 'all' || counts[f] > 0 || f === lfilter).map((f) => (
                  <button key={f} type="button" className="tsx-chip" aria-pressed={lfilter === f} onClick={() => setLfilter(f)}>{FILTER_LABEL[f]} <b>{nf.format(counts[f])}</b></button>
                ))}
              </div>
              {dupBusy && <p className="sys-hint tsx-dupbusy" role="status">{dupBusy.phase}… {dupBusy.pct}% <button type="button" className="linkbtn" onClick={() => { dupStop.current.aborted = true; }}>Dừng</button></p>}
              <div className="tsx-pickbar">
                <label className="sw" title="Tick hoặc bỏ tick mọi câu đang hiện"><input type="checkbox" checked={allShownPicked} disabled={!shown.length} onChange={pickShown} />Chọn các câu đang hiện</label>
                {nScope > 0 && <button type="button" className="linkbtn" onClick={() => setPicked(new Set())}>Bỏ chọn ({nf.format(nScope)})</button>}
              </div>
              <ol className="tsx-list" aria-label="Danh sách câu">
                {infos.length === 0 && <li className="sys-hint">Chưa có khối <code>\begin{'{ex}'}</code> nào.</li>}
                {infos.length > 0 && shown.length === 0 && <li className="sys-hint">Không có câu nào thuộc mục “{FILTER_LABEL[lfilter]}”.</li>}
                {shown.map((b) => (
                  <li key={b.block.n} className="tsx-row">
                    <input type="checkbox" className="tsx-pick" checked={picked.has(b.block.n)} onChange={() => togglePick(b.block.n)} aria-label={`Chọn câu ${b.block.n}`} />
                    <button type="button" className={`tsx-item${cur?.block.n === b.block.n ? ' on' : ''}`} aria-current={cur?.block.n === b.block.n ? 'true' : undefined} onClick={() => pick(b)} title={b.firstProblem ?? undefined}>
                      <b>Câu {b.block.n}</b>
                      <span className="tsx-ln">dòng {b.block.line0}–{b.block.line1}</span>
                      {hasTikz(b.block.text) && <span className="tsx-tag" title="Có hình TikZ">hình</span>}
                      <span className={`tsx-id id-${b.id.state}`}>{b.id.code ? `${b.id.code} · ` : ''}{ID_STATE_LABEL[b.id.state]}</span>
                      {b.problems > 0 && <span className="tsx-bad"><IcAlert size={13} />{b.problems}</span>}
                      {dupOf.get(b.block.n)?.[0] && (() => { const m = dupOf.get(b.block.n)![0]; const q = m.with === 'bank' ? getState().questions.find((x) => x.uid === m.other) : null; return <span className="tsx-bad" title={DUP_KIND_LABEL[m.kind]}>{m.with === 'bank' ? `trùng ${q ? seqLabel(q.seq) : 'câu trong ngân hàng'}` : `trùng câu ${m.other}`}</span>; })()}
                      {buildErr.has(b.block.n) && <span className="tsx-bad" title="TeX báo lỗi ở câu này">lỗi biên dịch</span>}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <div className="qe-sheet tsx-sheet">
              {!cur ? <p className="sys-hint">Dán nội dung vào khung Mã LaTeX để xem từng câu.</p>
                : !parsed ? <p className="q-warn">Câu {cur.block.n} chưa có <code>\end{'{ex}'}</code> nên chưa xem nhanh được.</p>
                : <>
                    {cur.firstProblem && <p className="q-warn">{cur.firstProblem}</p>}
                    <QuestionView p={parsed} number={cur.block.n} raw={cur.block.text} showSolution={showSol} />
                  </>}
            </div>
          </div>}
        </section>
      </div>

      <footer className="qe-status" aria-label="Trạng thái">
        <span className="qs">{nf.format(infos.length)} câu</span>
        <span className="qs" title="ID đúng cú pháp và có trong cây chương trình (chưa phải giáo viên xác minh Dạng)">{nf.format(nId)} có ID trong cây</span>
        <span className={`qs ${nBad ? 'bad' : 'ok'}`}>{nBad ? <IcAlert size={15} /> : <IcCheckCircle size={15} />}{nBad ? `${nf.format(nBad)} câu cần xem lại` : 'Không thấy lỗi cú pháp'}</span>
        <button type="button" className={`qs ${busy || !out ? 'idle' : out.status === 'ok' && !stale ? 'ok' : out.status === 'ok' ? 'warn' : 'bad'}`} onClick={() => setTab('pdf')} title="Xem khung PDF">{busy ? 'Đang biên dịch…' : !out ? 'PDF: chưa biên dịch' : out.status === 'ok' ? (stale ? 'PDF cũ (mã đã đổi)' : 'PDF mới') : out.status === 'no-tex' ? 'Chưa có TeX Live' : 'PDF: biên dịch lỗi'}</button>
      </footer>

      {nameDlg && <NameDialog title={nameDlg.kind === 'new' ? 'Bàn nháp mới' : 'Đổi tên bàn nháp'} initial={nameDlg.initial} confirmLabel={nameDlg.kind === 'new' ? 'Tạo' : 'Đổi tên'} onOk={(n) => void (nameDlg.kind === 'new' ? createDraft(n) : renameCurrent(n))} onCancel={() => setNameDlg(null)} />}
      {askDelete && (
        <ConfirmDialog title={`Xoá “${nameOf(ix, ix.active)}”?`} confirmLabel="Xoá bàn nháp" danger onConfirm={() => void deleteCurrent()} onCancel={() => setAskDelete(false)}>
          <p>Toàn bộ nội dung bàn nháp này bị xoá khỏi máy và không lấy lại được. Các bàn nháp khác và ngân hàng không bị ảnh hưởng. Nếu cần giữ, hãy chọn Công cụ → Lưu ra tệp .tex trước.</p>
        </ConfirmDialog>
      )}
      {fixFor && <FixDialog mode={fixFor} text={latest.current} scope={scope} onApply={applyText} onClose={() => setFixFor(null)} />}
      {claudeOpen && <ScratchClaudeId text={latest.current} scan={scanScratch(latest.current)} scope={scope} tax={tax} toast={toast} onApply={applyText} onClose={() => setClaudeOpen(false)} />}
      {replaceOpen && <ScratchReplace text={latest.current} scan={scanScratch(latest.current)} scope={scope} onApply={applyText} onClose={() => setReplaceOpen(false)} />}
      {askClear && (
        <ConfirmDialog title="Xoá toàn bộ nội dung bàn nháp?" confirmLabel="Xoá nội dung" danger onConfirm={clearAll} onCancel={() => setAskClear(false)}>
          <p>Bản nháp được lưu lại sau khi xoá. Muốn lấy lại, bấm Ctrl+Z trong khung soạn trước khi đóng app.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Hộp "Chuẩn hoá" / "Sắp xếp theo ID": chạy trên bản sao, hiện thay đổi, chỉ ghi khi bấm Áp dụng. */
function FixDialog({ mode, text, scope, onApply, onClose }: { mode: 'fix' | 'sort'; text: string; /** các câu đã chọn (null = cả bàn nháp); chỉ áp cho Chuẩn hoá */ scope: ReadonlySet<number> | null; onApply(next: string, what: string): void; onClose(): void }) {
  const { tax } = useTaxonomy();
  const [on, setOn] = useState<Set<string>>(() => new Set(FIX_RULES.filter((r) => r.on).map((r) => r.id)));
  const pk = useMemo(() => (mode === 'fix' && scope ? pickBlocks(text, scanScratch(text), scope) : null), [mode, text, scope]);
  const fix = useMemo(() => (mode === 'fix' ? planFix(pk ? pk.text : text, on) : null), [mode, text, pk, on]);
  /** kết quả ghi lại: với câu đã chọn thì chuẩn hoá TỪNG khối, phần còn lại giữ nguyên */
  const fixOut = (): string => (pk && scope ? mapBlocks(text, scanScratch(text), scope, (b) => planFix(b, on).out) : fix?.out ?? text);
  const sort = useMemo(() => (mode === 'sort' ? planSort(text, tax) : null), [mode, text, tax]);
  const toggle = (id: string) => setOn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  const groups = [['ky-thuat', 'Kỹ thuật — không đổi bản in'], ['cong-thuc', 'Công thức — ĐỔI cách in, chỉ chạy bên trong công thức']] as const;
  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm xl-panel tsx-fix" role="dialog" aria-modal="true" aria-label={mode === 'fix' ? 'Chuẩn hoá' : 'Sắp xếp theo ID'}>
        <h3>{mode === 'fix' ? 'Chuẩn hoá nội dung' : 'Sắp xếp theo ID'}</h3>
        <div className="xl-panel-body">
          {fix && (
            <>
              <p className="xl-meta">{scope ? <>Chỉ <b>{scope.size} câu đã chọn</b>. </> : null}HEdu chạy thử trên bản sao và liệt kê các dòng sẽ đổi. Chỉ khi bấm <b>Áp dụng</b> nội dung mới thay đổi (Ctrl+Z hoặc nút Hoàn tác để lấy lại). Không có luật nào xoá chú thích hay đụng vào hình TikZ.</p>
              {groups.map(([g, title]) => (
                <fieldset key={g} className="tsx-rules">
                  <legend>{title}</legend>
                  {FIX_RULES.filter((r) => r.group === g).map((r) => (
                    <label key={r.id} className="sw" title={r.hint}>
                      <input type="checkbox" checked={on.has(r.id)} onChange={() => toggle(r.id)} />
                      {r.label}{on.has(r.id) && fix.perRule[r.id] ? <b className="tsx-n"> · {fix.perRule[r.id]}</b> : null}
                      <small className="sys-hint">{r.hint}</small>
                    </label>
                  ))}
                </fieldset>
              ))}
              <b>{fix.linesChanged ? `${nf.format(fix.linesChanged)} dòng sẽ đổi` : 'Không có dòng nào đổi'}</b>
              {fix.changes.length > 0 && (
                <ol className="tsx-diff">
                  {fix.changes.map((c) => (
                    <li key={c.line}><span className="tsx-ln">dòng {pk ? pk.orig[c.line - 1] ?? c.line : c.line}</span><del>{c.before || ' '}</del><ins>{c.after || ' '}</ins></li>
                  ))}
                  {fix.linesChanged > fix.changes.length && <li className="sys-hint">… và {nf.format(fix.linesChanged - fix.changes.length)} dòng nữa</li>}
                </ol>
              )}
            </>
          )}
          {sort && (sort.ok
            ? <p>Xếp {nf.format(sort.sorted)} câu theo lớp → chương → bài → dạng → mức độ{sort.noId ? `; ${nf.format(sort.noId)} câu chưa có ID hợp lệ để ở cuối` : ''}. Thêm dòng chú thích tiêu đề từng chương. Nội dung từng câu giữ nguyên.{!sort.moved && ' Các câu đã đúng thứ tự.'}</p>
            : <p className="q-warn">{sort.why}</p>)}
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" onClick={onClose}>Huỷ</button>
          {fix && <button type="button" className="btn btn-accent" disabled={!fix.linesChanged} onClick={() => onApply(fixOut(), 'Chuẩn hoá')}>Áp dụng</button>}
          {sort?.ok && <button type="button" className="btn btn-accent" onClick={() => onApply(sort.out, 'Sắp xếp theo ID')}>Sắp xếp</button>}
        </div>
      </div>
    </>
  );
}

/** Hộp đặt tên bàn nháp. */
function NameDialog({ title, initial, confirmLabel, onOk, onCancel }: { title: string; initial: string; confirmLabel: string; onOk(name: string): void; onCancel(): void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <ConfirmDialog title={title} confirmLabel={confirmLabel} onConfirm={() => onOk(v)} onCancel={onCancel}>
      <label className="tsx-rf"><span>Tên</span><input ref={ref} value={v} maxLength={60} placeholder="vd. Đề giữa kì 1 — Lớp 12" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOk(v); } }} /></label>
      <p className="sys-hint">Mỗi bàn nháp lưu riêng trên máy; đổi qua lại ở ô “Bàn nháp” phía trên.</p>
    </ConfirmDialog>
  );
}
