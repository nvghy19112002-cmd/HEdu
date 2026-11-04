// Không gian Biên tập đề (E3): cây tệp · soạn nhiều tab · xem PDF · nhật ký lỗi. Mở từ Thư viện đề thi.
// An toàn dữ liệu: lưu bằng so dấu vân (không ghi đè tệp đã đổi ngoài app), giữ nguyên BOM/CRLF, bản nháp tự lưu NGOÀI dự án,
// biên dịch chỉ chạy sau khi lưu xong mọi tệp (không lưu được thì không biên dịch). Không báo "đã lưu" khi chưa ghi xong.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { exportPdf } from '../lib/exampdf';
import { CodeEditor, type CodeEditorHandle } from '../components/CodeEditor';
import { BankPicker } from '../components/BankPicker';
import { PdfViewer } from '../components/PdfViewer';
import { mapSyncFile, synctexEdit, synctexView, type SyncPos } from '../lib/synctex';
import { LintDialog } from '../components/LintDialog';
import { HistoryDialog, type HistVersion } from '../components/HistoryDialog';
import { SourcesPanel } from '../components/SourcesPanel';
import { canJump, ENGINES, examCompile, examCompileAll, examCompileCancel, examProfiles, groupDiagnostics, MODE_NOTE, MODES, modeLabel, summarize, type CompileOut, type Engine, type ExamMode, type GoodInfo, type ProfileInfo } from '../lib/examcompile';
import { insertionText, norm, sourcesAdd, sourcesForget, sourcesStatus, toSource, type SourceIn, type SourceItem, type SourceStatus } from '../lib/examsources';
import type { Question } from '../lib/types';
import {
  anyDirty, buildTree, draftClear, draftRead, draftWrite, externalState, fileCreate, fileImage, fileList, fileRead, fileStat, fileVersionRead, fileVersions, fileWrite, kindIcon, newFileProblem, saveBadge, savePlan,
  type Draft, type FileEntry, type ListOut, type TabInfo, type TreeNode,
} from '../lib/examfiles';
import { getSettings } from '../lib/tikz';
import { addToGoiThem, missingPackages } from '../lib/missingpkg';
import { compileSlots, type TabStatus } from '../lib/examtabs';
import { clampLog, clampPdf, lacksPreamble, loadLayout, saveLayout, treeShown, type EwLayout } from '../lib/ewlayout';
import { TEX_KEYS_HINT } from '../lib/texextras';
import { inputName, wrapFiles } from '../lib/examwrap';
import { HEDU_THEME_ID, loadDefaultInfo, loadThemeId, themeOf } from '../lib/examtheme';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
type Pane = 'files' | 'edit' | 'pdf' | 'log';
const NARROW = 1000;

/** Mỗi đề đang mở là một tab ở Thư viện đề: tab ẩn vẫn giữ nguyên trạng thái (tệp đang sửa, PDF, nhật ký).
 * `onLibrary` = về tab Thư viện (đề vẫn mở) · `onInfo` = mở hộp Thông tin & thao tác của đề · `onClose` = đóng tab (đã hỏi lưu nếu cần). */
interface Props { id: string; name: string; mainFile: string | null; /** năm học của đề (Thông tin đề), in trên mẫu HyMath */ schoolYear?: string | null; hidden?: boolean; onLibrary(): void; onInfo(): void; onClose(): void; onStatus?(id: string, s: TabStatus): void }
export interface ExamWorkspaceHandle { requestClose(): void }

export const ExamWorkspace = forwardRef<ExamWorkspaceHandle, Props>(function ExamWorkspace({ id, name, mainFile, schoolYear, hidden, onLibrary, onInfo, onClose, onStatus }, ref) {
  const { toast } = useApp();
  const ed = useRef<CodeEditorHandle>(null);
  const loaded = useRef(new Map<string, string>()); // văn bản lúc mở, dùng khi gắn vào trình soạn lần đầu
  const [list, setList] = useState<ListOut>({ files: [], blocked: [] });
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [engine, setEngine] = useState<Engine>('pdflatex');
  const [runs, setRuns] = useState(2);
  const [compiling, setCompiling] = useState(false);
  /** đang chờ lượt biên dịch (đã có 2 đề khác đang biên dịch) */
  const [queued, setQueued] = useState(false);
  const gen = useRef(0); // mỗi lần bấm Biên dịch một số mới; "Huỷ chờ" tăng số để lượt đang chờ tự bỏ
  const alive = useRef(true);
  const [result, setResult] = useState<CompileOut | null>(null);
  const [goods, setGoods] = useState<GoodInfo[]>([]);
  const [mode, setMode] = useState<ExamMode>('nguyen-van');
  const [viewMode, setViewMode] = useState<ExamMode>('nguyen-van');
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [picker, setPicker] = useState(false);
  const [srcOpen, setSrcOpen] = useState(false);
  const [statuses, setStatuses] = useState<SourceStatus[] | null>(null);
  const [srcErr, setSrcErr] = useState<string | null>(null);
  const pend = useRef(new Map<string, { add: SourceIn[]; forget: SourceItem[] }>());
  const [leave, setLeave] = useState(false);
  const [pane, setPane] = useState<Pane>('edit');
  /** bố cục (cây tệp, bề rộng PDF, chiều cao nhật ký) nhớ theo máy; nhật ký gập lại khi không có lỗi */
  const [lay, setLay] = useState<EwLayout>(loadLayout);
  const [logOpen, setLogOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < NARROW);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const busy = useRef(false);

  const patch = useCallback((rel: string, p: Partial<TabInfo>) => setTabs((ts) => ts.map((t) => (t.rel === rel ? { ...t, ...p } : t))), []);
  const tab = tabs.find((t) => t.rel === active) ?? null;

  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < NARROW);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const reloadList = useCallback(async () => {
    try { const l = await fileList(id); setList(l); setOpen((o) => (o.size ? o : new Set(l.files.flatMap((f) => f.rel.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/')))))); }
    catch (e) { setNote(msg(e)); }
  }, [id]);

  useEffect(() => {
    void reloadList();
    examCompileAll(id).then((g) => { setGoods(g); const m = g.find((x) => x.mode === 'de') ?? g[0]; if (m) setViewMode(m.mode as ExamMode); }).catch(() => undefined);
  }, [id, reloadList]);

  /** tệp chính chỉ có dữ liệu và ghép phần đầu được ⇒ bản Đề / Lời giải dùng được dù dự án không có ex_test */
  const dataOnlyRef = useRef(false);
  const refreshProfile = useCallback(() => {
    examProfiles(id).then((p) => { setProfile(p); setMode((m) => (m !== 'nguyen-van' && !p.available && !dataOnlyRef.current ? 'nguyen-van' : m)); }).catch(() => setProfile(null));
  }, [id]);
  useEffect(() => {
    examProfiles(id).then((p) => { setProfile(p); setMode(p.available ? 'de' : 'nguyen-van'); }).catch(() => setProfile(null));
  }, [id]);

  // ---- mở tệp ----
  const openFile = useCallback(async (f: FileEntry) => {
    setNote(null); setDraft(null);
    if (tabsRef.current.some((t) => t.rel === f.rel)) { setActive(f.rel); setPane('edit'); return; }
    const base: TabInfo = { rel: f.rel, sha: '', eol: 'lf', bom: false, dirty: false, external: 'none', readOnly: null, kind: f.kind };
    if (f.kind === 'text') {
      try {
        const r = await fileRead(id, f.rel);
        loaded.current.set(f.rel, r.text);
        setTabs((ts) => [...ts, { ...base, sha: r.sha256, eol: r.eol, bom: r.bom }]);
        const d = await draftRead(id, f.rel).catch(() => null);
        if (d && d.baseSha256 === r.sha256 && d.text !== r.text) setDraft(d);
      } catch (e) { setTabs((ts) => [...ts, { ...base, readOnly: msg(e) }]); }
    } else {
      setTabs((ts) => [...ts, { ...base, readOnly: f.kind === 'image' ? 'Ảnh: chỉ xem trước.' : 'Tệp này không phải văn bản nên HEdu không sửa.' }]);
    }
    setActive(f.rel); setPane('edit');
  }, [id]);

  // gắn tệp đang chọn vào trình soạn / nạp ảnh
  useEffect(() => {
    setImg((u) => { if (u) URL.revokeObjectURL(u); return null; });
    if (!tab) return;
    if (tab.kind === 'text' && !tab.readOnly) { ed.current?.open(tab.rel, loaded.current.get(tab.rel) ?? '', false); return; }
    if (tab.kind === 'image') {
      let live = true;
      fileImage(id, tab.rel).then((b) => { if (live) setImg(URL.createObjectURL(new Blob([b], { type: tab.rel.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/*' }))); }).catch((e) => setNote(msg(e)));
      return () => { live = false; };
    }
  }, [active, tab?.kind, tab?.readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // mở sẵn tệp chính
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !mainFile || !list.files.length) return;
    const f = list.files.find((x) => x.rel === mainFile);
    if (f) { opened.current = true; void openFile(f); }
  }, [list, mainFile, openFile]);

  // ---- bản nháp tự lưu (ngoài dự án) ----
  const timers = useRef(new Map<string, number>());
  const latest = useRef(new Map<string, string>()); // văn bản mới nhất từng tệp, để ghi nháp ngay khi rời màn
  const scheduleDraft = (rel: string, text: string) => {
    latest.current.set(rel, text);
    const t = tabsRef.current.find((x) => x.rel === rel);
    if (!t || t.readOnly) return;
    window.clearTimeout(timers.current.get(rel));
    timers.current.set(rel, window.setTimeout(() => {
      const cur = tabsRef.current.find((x) => x.rel === rel);
      if (cur?.dirty) void draftWrite(id, rel, cur.sha, text).catch(() => undefined);
    }, 1500));
  };
  useEffect(() => () => {
    alive.current = false;
    for (const t of timers.current.values()) window.clearTimeout(t);
    // rời màn Thư viện đề khi còn tệp chưa lưu: ghi bản nháp ngay (không đợi 1,5 giây), lần sau mở lại sẽ hỏi khôi phục
    for (const t of tabsRef.current) { const text = latest.current.get(t.rel); if (t.dirty && !t.readOnly && text !== undefined) void draftWrite(id, t.rel, t.sha, text).catch(() => undefined); }
  }, [id]);

  // ---- lưu ----
  const inflight = useRef(new Map<string, Promise<boolean>>());
  /** Mỗi tệp chỉ có MỘT lần lưu đang chạy; bấm lưu lần nữa trong lúc đó dùng lại kết quả (không gửi hai yêu cầu cùng dấu vân). */
  const saveOne = useCallback((rel: string): Promise<boolean> => {
    const cur = inflight.current.get(rel);
    if (cur) return cur;
    const p = doSave(rel).finally(() => inflight.current.delete(rel));
    inflight.current.set(rel, p);
    return p;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doSave = async (rel: string): Promise<boolean> => {
    const t = tabsRef.current.find((x) => x.rel === rel);
    const text = ed.current?.text(rel);
    if (!t || t.readOnly || text === null || text === undefined) return false;
    if (t.external !== 'none') { setNote(`“${rel}” đã đổi ngoài HEdu: hãy chọn “Nạp bản ngoài” hoặc “Giữ bản của tôi” trước.`); return false; }
    try {
      const r = await fileWrite(id, rel, text, t.eol, t.bom, t.sha);
      if (r.status === 'conflict') { patch(rel, { external: r.missing ? 'missing' : 'changed' }); setNote(`Chưa lưu “${rel}”: tệp trên đĩa đã khác lúc bạn mở. Không có gì bị ghi đè.`); return false; }
      window.clearTimeout(timers.current.get(rel));
      patch(rel, { sha: r.sha256 });
      ed.current?.markSaved(rel, text);
      const pn = pend.current.get(rel);
      if (pn) {
        // chỉ ghi nguồn cho những đoạn thực sự còn nguyên văn trong tệp vừa lưu (người dùng có thể đã hoàn tác)
        const nt = norm(text);
        const add = pn.add.filter((x) => nt.includes(norm(x.latex)));
        try {
          for (const f of pn.forget) await sourcesForget(id, f.uid, f.rel, f.sha256);
          if (add.length) await sourcesAdd(id, rel, add);
          pend.current.delete(rel);
          if (srcOpen) void loadSources();
        } catch (e) { setNote(`Đã lưu “${rel}” nhưng chưa ghi được nguồn câu hỏi: ${msg(e)}`); }
      }
      refreshProfile();
      void draftClear(id, rel).catch(() => undefined);
      return true;
    } catch (e) { setNote(`Chưa lưu “${rel}”: ${msg(e)}`); return false; }
  };

  const saveAll = useCallback(async (): Promise<boolean> => {
    if (busy.current) return false;
    const plan = savePlan(tabsRef.current);
    if (plan.blocked.length) { setNote(`Chưa lưu vì có tệp đã đổi ngoài HEdu: ${plan.blocked.join(', ')}. Hãy xử lý các tệp đó trước.`); return false; }
    busy.current = true; setSaving(true);
    try { for (const rel of plan.toSave) if (!(await saveOne(rel))) return false; return true; }
    finally { busy.current = false; setSaving(false); }
  }, [saveOne]);

  // ---- đổi ngoài app ----
  const check = useCallback(async () => {
    const ts = tabsRef.current.filter((t) => t.kind === 'text' && !t.readOnly);
    if (!ts.length) return;
    try {
      const st = await fileStat(id, ts.map((t) => t.rel));
      for (const t of ts) {
        const e = externalState(t, st.find((s) => s.rel === t.rel));
        if (e === t.external) continue;
        if (e === 'changed' && !t.dirty) { await reload(t.rel, true); continue; }
        patch(t.rel, { external: e });
      }
    } catch (e) { setNote(msg(e)); }
  }, [id, patch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') void check(); };
    window.addEventListener('focus', on); document.addEventListener('visibilitychange', on);
    return () => { window.removeEventListener('focus', on); document.removeEventListener('visibilitychange', on); };
  }, [check]);

  async function reload(rel: string, silent = false) {
    try {
      const r = await fileRead(id, rel);
      loaded.current.set(rel, r.text);
      ed.current?.reset(rel, r.text);
      patch(rel, { sha: r.sha256, eol: r.eol, bom: r.bom, dirty: false, external: 'none' });
      void draftClear(id, rel).catch(() => undefined);
      if (!silent) toast(`Đã nạp lại “${rel}” từ đĩa.`); else toast(`“${rel}” đã đổi ngoài HEdu nên được nạp lại.`);
    } catch (e) { setNote(msg(e)); }
  }

  /** "Giữ bản của tôi": coi dấu vân hiện có trên đĩa là mốc mới để lần lưu sau ghi đè CÓ CHỦ ĐÍCH (bản cũ vẫn được chụp trong .hedu/versions). */
  const keepMine = async (rel: string) => {
    try {
      const st = (await fileStat(id, [rel]))[0];
      if (!st?.exists || !st.sha256) { patch(rel, { external: 'none' }); return; }
      patch(rel, { sha: st.sha256, external: 'none' });
      toast('Lần lưu sau sẽ ghi bản của bạn lên tệp trên đĩa (bản đang có trên đĩa được chụp lại trước).');
    } catch (e) { setNote(msg(e)); }
  };

  // ---- đóng tab ----
  const closeTab = (rel: string) => {
    const t = tabsRef.current.find((x) => x.rel === rel);
    if (t?.dirty && !window.confirm(`“${rel}” có thay đổi chưa lưu. Đóng tab này? (Bản nháp vẫn được giữ lần sau mở lại.)`)) return;
    ed.current?.drop(rel); loaded.current.delete(rel);
    setTabs((ts) => ts.filter((x) => x.rel !== rel));
    setActive((a) => (a === rel ? tabsRef.current.filter((x) => x.rel !== rel).at(-1)?.rel ?? null : a));
  };

  // ---- tệp mới ----
  const createFile = async () => {
    const rel = (newName ?? '').trim();
    const p = newFileProblem(rel);
    if (p) { setNote(p); return; }
    try {
      const f = await fileCreate(id, rel, '');
      setNewName(null); await reloadList(); await openFile(f);
    } catch (e) { setNote(msg(e)); }
  };

  // ---- biên dịch ----
  const compile = async () => {
    if (compiling) return;
    setNote(null);
    if (!(await saveAll())) return; // không lưu được thì không biên dịch
    setCompiling(true); setResult(null);
    const my = ++gen.current;
    setQueued(compileSlots.busy >= 2);
    const release = await compileSlots.acquire(); // tối đa 2 đề biên dịch cùng lúc, đề sau chờ lượt
    if (!alive.current || my !== gen.current) { release(); return; } // đã huỷ chờ hoặc đã đóng đề
    setQueued(false);
    try {
      const st = getSettings();
      // tệp chính chỉ có nội dung đề ⇒ HEdu ghép phần đầu theo mẫu in (chỉ trong thư mục build)
      const mt = mainFile ? (ed.current?.text(mainFile) ?? loaded.current.get(mainFile) ?? (await fileRead(id, mainFile).then((x) => x.text).catch(() => null))) : null;
      const di = loadDefaultInfo();
      const wrap = mainFile && mt !== null ? wrapFiles(mainFile, mt, loadThemeId(), mode, { schoolYear: schoolYear || di.year, teacher: di.teacher }) : null;
      if (!wrap && mode === 'de-in') { setNote('Bản “Đề in trắng đen” chỉ có với tệp đề chỉ có dữ liệu và mẫu in HyMath.'); return; }
      const r = await examCompile(id, { engine: wrap?.engine ?? engine, runs: wrap?.modes ? Math.max(runs, 2) : runs, mode, texBin: st.texBin || undefined, timeoutSecs: Math.max(st.timeoutSecs, 120), ...(wrap ? { wrap: wrap.files, wrapModes: wrap.modes } : {}) });
      setResult(r);
      examCompileAll(id).then(setGoods).catch(() => undefined);
      if (r.status === 'ok') setViewMode(mode);
      setLogOpen(r.status !== 'ok');
      if (r.status === 'ok' && narrow) setPane('pdf'); else if (r.status !== 'ok') setPane('log');
    } catch (e) { setNote(msg(e)); } finally { release(); if (alive.current) setCompiling(false); }
  };

  /** Biên dịch lỗi vì thiếu gói: thêm gói vào hedu-goithem.tex (hedu.sty tự nạp) rồi biên dịch lại. */
  const addPackages = async (pkgs: string[]) => {
    setNote(null);
    try {
      const rel = 'hedu-goithem.tex';
      const has = list.files.some((x) => x.rel === rel);
      const cur = has ? await fileRead(id, rel) : null;
      const r = addToGoiThem(cur?.text ?? null, pkgs);
      if (!r.added.length) { setNote('Các gói này đã có trong hedu-goithem.tex. Nếu vẫn lỗi, có thể gói chưa được cài trong TeX Live.'); return; }
      if (cur) {
        const w = await fileWrite(id, rel, r.text, cur.eol === 'crlf' ? 'crlf' : 'lf', cur.bom, cur.sha256);
        if (w.status === 'conflict') { setNote('hedu-goithem.tex vừa bị sửa ở nơi khác; mở tệp để thêm tay.'); return; }
      } else await fileCreate(id, rel, r.text);
      await reloadList();
      await compile();
    } catch (e) { setNote(msg(e)); }
  };

  /** SyncTeX: vị trí đang tô trên PDF (từ dòng mã) */
  const [syncMark, setSyncMark] = useState<(SyncPos & { n: number }) | null>(null);
  const syncN = useRef(0);
  const [lintOpen, setLintOpen] = useState(false);
  const [hist, setHist] = useState<{ rel: string; versions: HistVersion[] } | null>(null);
  /** bấm trên PDF ⇒ nhảy tới dòng mã nguồn */
  const fromPdf = async (page: number, x: number, y: number) => {
    try {
      const r = await synctexEdit(id, viewMode, page, x, y, getSettings().texBin || undefined);
      if (!r) { setNote('Không tìm thấy dòng mã tương ứng với chỗ vừa bấm (có thể là khoảng trắng hoặc hình).'); return; }
      const rel = mapSyncFile(r.file, list.files.map((f) => f.rel));
      if (!rel) { setNote('Chỗ này thuộc phần đầu do HEdu ghép khi in (hoặc gói hệ thống), không nằm trong tệp của đề.'); return; }
      await jump(rel, r.line);
    } catch (e) { setNote(msg(e)); }
  };
  /** từ dòng mã (con trỏ) ⇒ tô vị trí trên PDF */
  const toPdf = async () => {
    const tab = active;
    const cur = tab ? ed.current?.cursor(tab) : null;
    if (!tab || !cur) { setNote('Đặt con trỏ vào một dòng trong tệp đang mở rồi bấm lại.'); return; }
    try {
      const r = await synctexView(id, viewMode, tab, cur.line, cur.col, getSettings().texBin || undefined);
      if (!r) { setNote('Dòng này chưa có chỗ tương ứng trên PDF (dòng trống, chú thích hoặc lệnh không in gì).'); return; }
      setPane('pdf');
      setSyncMark({ ...r, n: ++syncN.current });
    } catch (e) { setNote(msg(e)); }
  };
  const openHistory = async () => {
    if (!active) return;
    try {
      const vs = await fileVersions(id, active);
      setHist({ rel: active, versions: vs.map((v) => ({ key: String(v.at), label: new Date(v.at).toLocaleString('vi-VN'), load: () => fileVersionRead(id, active, v.at) })) });
    } catch (e) { setNote(msg(e)); }
  };
  const lintText = () => (active ? ed.current?.text(active) ?? loaded.current.get(active) ?? '' : '');
  const jump = async (file: string, line: number) => {
    const f = list.files.find((x) => x.rel === file);
    if (!f) return;
    await openFile(f);
    setPane('edit');
    window.setTimeout(() => ed.current?.jump(file, line), 80);
  };

  async function loadSources() {
    setSrcErr(null);
    try { setStatuses(await sourcesStatus(id)); } catch (e) { setSrcErr(msg(e)); setStatuses([]); }
  }
  const openSources = () => { setSrcOpen(true); setStatuses(null); void loadSources(); };

  const insertFromBank = (qs: Question[]) => {
    const rel = active;
    if (!rel || !tab || tab.kind !== 'text' || tab.readOnly) { setNote('Hãy mở một tệp .tex sửa được rồi đặt con trỏ nơi cần chèn.'); return; }
    if (!ed.current?.insertAtCursor(rel, insertionText(qs))) { setNote('Không chèn được vào tệp đang mở.'); return; }
    const cur = pend.current.get(rel) ?? { add: [], forget: [] };
    cur.add.push(...qs.map(toSource));
    pend.current.set(rel, cur);
    setPicker(false);
    toast(`Đã chèn ${qs.length} câu nguyên văn. Bấm Lưu để ghi vào đề (HEdu ghi nguồn khi lưu).`);
  };

  const replaceFromBank = (item: SourceItem, newLatex: string): boolean => {
    const ok = ed.current?.replaceText(item.rel, item.latex, newLatex) ?? false;
    if (!ok) return false;
    const cur = pend.current.get(item.rel) ?? { add: [], forget: [] };
    cur.add.push({ uid: item.uid, label: item.label, latex: newLatex });
    cur.forget.push(item);
    pend.current.set(item.rel, cur);
    return true;
  };

  const forgetSource = async (item: SourceItem) => {
    try { await sourcesForget(id, item.uid, item.rel, item.sha256); await loadSources(); } catch (e) { setSrcErr(msg(e)); }
  };

  const tree = useMemo(() => buildTree(list.files), [list.files]);
  const badge = saveBadge(tabs, saving);
  const groups = useMemo(() => (result ? groupDiagnostics(result.diagnostics) : []), [result]);
  const pkgHints = useMemo(() => (result && result.status === 'failed' ? missingPackages(result.diagnostics, result.rawLog ?? '') : []), [result]);
  const heduSty = list.files.some((x) => x.rel === 'hedu.sty');
  const stale = !!result && result.status !== 'ok';

  const requestClose = () => { if (anyDirty(tabsRef.current)) setLeave(true); else onClose(); };
  useImperativeHandle(ref, () => ({ requestClose }));
  const dirtyAny = anyDirty(tabs);
  const compileState: TabStatus['compile'] = queued ? 'waiting' : compiling ? 'running' : !result ? 'idle' : result.status === 'ok' ? 'ok' : 'failed';
  useEffect(() => { onStatus?.(id, { dirty: dirtyAny, compile: compileState }); }, [id, dirtyAny, compileState, onStatus]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return; // trình soạn đã xử lý (vd. Ctrl+S) rồi
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (e.shiftKey) void saveAll(); else if (active) void saveOne(active); }
    else if (e.key === 'Escape' && !leave && !newName) { e.stopPropagation(); onLibrary(); }
  };

  /** kéo vạch chia: dọc = bề rộng khung PDF, ngang = chiều cao nhật ký; thả tay thì lưu */
  const startDrag = (kind: 'pdf' | 'log') => (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragging(true);
    const move = (ev: PointerEvent) => setLay((l) => (kind === 'pdf' ? { ...l, pdf: clampPdf(((rect.right - ev.clientX) / rect.width) * 100) } : { ...l, log: clampLog(window.innerHeight - ev.clientY - 30, window.innerHeight) }));
    const up = () => { window.removeEventListener('pointermove', move); setDragging(false); setLay((l) => { saveLayout(l); return l; }); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };
  const nudge = (kind: 'pdf' | 'log') => (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    setLay((l) => { const n = kind === 'pdf' ? { ...l, pdf: clampPdf(l.pdf - d * 3) } : { ...l, log: clampLog(l.log + d * 30, window.innerHeight) }; saveLayout(n); return n; });
  };
  const toggleTree = () => setLay((l) => { const n = { ...l, tree: !treeShown(l, list.files.length) }; saveLayout(n); return n; });

  const renderNode = (n: TreeNode, depth: number): React.ReactNode => {
    if (n.dir) {
      const isOpen = open.has(n.rel);
      return (
        <li key={n.rel} role="treeitem" aria-expanded={isOpen}>
          <button type="button" className="ew-node" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => setOpen((o) => { const x = new Set(o); if (x.has(n.rel)) x.delete(n.rel); else x.add(n.rel); return x; })}>
            <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span> {n.name}
          </button>
          {isOpen && <ul role="group" className="ew-tree">{n.children.map((c) => renderNode(c, depth + 1))}</ul>}
        </li>
      );
    }
    const t = tabs.find((x) => x.rel === n.rel);
    return (
      <li key={n.rel} role="treeitem" aria-selected={n.rel === active}>
        <button type="button" className={`ew-node${n.rel === active ? ' on' : ''}`} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => openFile({ rel: n.rel, bytes: n.bytes ?? 0, kind: n.kind ?? 'other' })}>
          <span aria-hidden="true">{kindIcon(n.kind, false)}</span> {n.name}
          {n.rel === mainFile && <span className="xl-meta"> (chính)</span>}
          {t?.dirty && <span className="ew-dot" aria-label="chưa lưu" title="Chưa lưu"> ●</span>}
          {t && t.external !== 'none' && <span className="ew-warn" aria-label="đổi ngoài HEdu" title="Đổi ngoài HEdu"> !</span>}
        </button>
      </li>
    );
  };

  const tree0 = treeShown(lay, list.files.length);
  const showFiles = narrow ? pane === 'files' : tree0;
  const showEdit = !narrow || pane === 'edit';
  const showPdf = !narrow || pane === 'pdf';
  const showLog = narrow ? pane === 'log' : logOpen;
  const sm = result ? summarize(result) : null;
  const errs = result?.errorCount ?? 0;
  // tệp chính chỉ có nội dung đề (không có \documentclass) ⇒ giải thích vì sao TeX báo "Missing \begin{document}"
  const mainText = mainFile ? (ed.current?.text(mainFile) ?? loaded.current.get(mainFile) ?? null) : null;
  const dataOnly = !!mainFile && mainText !== null && lacksPreamble(mainText) && inputName(mainFile) !== null;
  dataOnlyRef.current = dataOnly;
  const modesOk = !!profile?.available || dataOnly;
  /** tệp dữ liệu + mẫu HyMath: ba bản Đề / Đề in / Lời giải, không có "nguyên văn"; trình dịch XeLaTeX */
  const hyData = dataOnly && loadThemeId() !== HEDU_THEME_ID;
  const modeList = MODES.filter((m) => (hyData ? m.id !== 'nguyen-van' : m.id !== 'de-in'));
  // bản đang chọn không có trong danh sách (vd mở tệp dữ liệu khi đang chọn "nguyên văn") ⇒ về bản Đề
  useEffect(() => { if (!modeList.some((m) => m.id === mode)) setMode(hyData || profile?.available ? 'de' : 'nguyen-van'); }, [hyData, mode, profile?.available]); // eslint-disable-line react-hooks/exhaustive-deps
  // chỉ có dữ liệu nhưng tên tệp không ghép được (khoảng trắng, ký tự lạ) ⇒ giải thích
  const noPreamble = !!result && result.status !== 'ok' && mainText !== null && lacksPreamble(mainText) && !dataOnly;
  const themeName = themeOf(loadThemeId()).name;

  return (
    <div className={`ew tabbed${hidden ? ' off' : ''}`} role="dialog" aria-modal={!hidden} aria-hidden={hidden || undefined} aria-label={`Biên tập đề: ${name}`} onKeyDown={onKey}>
      {hist && <HistoryDialog title={`Lịch sử phiên bản của ${hist.rel}`} current={ed.current?.text(hist.rel) ?? loaded.current.get(hist.rel) ?? ''} versions={hist.versions} onRestore={(t) => { ed.current?.replaceDoc(hist.rel, t); setNote('Đã đưa bản cũ vào khung soạn (chưa lưu). Xem lại rồi bấm Lưu.'); }} onClose={() => setHist(null)} />}
      {lintOpen && <LintDialog text={lintText()} texBin={getSettings().texBin || undefined} onJump={(l) => { if (active) { setPane('edit'); window.setTimeout(() => ed.current?.jump(active, l), 60); } }} onClose={() => setLintOpen(false)} />}
      <header className="ew-head">
        <button type="button" className="btn btn-sm btn-ghost ew-back" onClick={onLibrary} title="Về Thư viện đề (đề vẫn mở ở tab trên cùng) · Esc" aria-label="Về Thư viện đề">←</button>
        <div className="ew-title"><b title={name}>{name}</b>{active && <span className="ew-path" title={active}>{active}</span>}</div>
        <span className={`ew-badge ${badge.tone}`} role="status" aria-live="polite">{badge.text}</span>
        {dataOnly
          ? <span className="ew-chip ok" title={`Tệp chính chỉ có nội dung đề: khi biên dịch, HEdu tự ghép phần đầu (khai báo + mẫu in “${themeName}”) trong thư mục tạm. Tệp của thầy/cô không bị sửa. Đổi mẫu ở Cài đặt › Đề thi.`}>Tự ghép mẫu: {themeName}</span>
          : profile && !profile.available && <span className="ew-chip" title={`${profile.reason ?? ''} Bạn vẫn biên dịch được bản “nguyên văn” (chưa xác định đề hay lời giải, có thể chứa lời giải).`}>Chỉ bản nguyên văn</span>}
        <span className="ew-sp" />
        {!narrow && <span className="ew-grp"><button type="button" className={`btn btn-sm btn-ghost${tree0 ? ' on' : ''}`} aria-pressed={tree0} onClick={toggleTree} title="Hiện/ẩn cây tệp của đề">Tệp</button></span>}
        <span className="ew-grp">
          <button type="button" className="btn btn-sm btn-ghost" disabled={!tab || !tab.dirty || !!tab.readOnly || saving} onClick={() => active && void saveOne(active)} title="Lưu tệp đang mở (Ctrl+S)">Lưu</button>
          {tabs.filter((t) => t.dirty).length > 1 && <button type="button" className="btn btn-sm btn-ghost" disabled={saving} onClick={() => void saveAll()} title="Lưu mọi tệp (Ctrl+Shift+S)">Lưu tất cả</button>}
        </span>
        <span className="ew-grp">
          <button type="button" className="btn btn-sm btn-ghost" disabled={!tab || tab.kind !== 'text' || !!tab.readOnly} onClick={() => setPicker(true)} title="Chèn câu nguyên văn từ Ngân hàng vào chỗ con trỏ">+ Câu</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={openSources} title="Các câu trong đề lấy từ Ngân hàng">Nguồn câu</button>
        </span>
        <span className="ew-grp ew-compile">
          <select className="xl-in ew-sel" value={mode} disabled={compiling} onChange={(e) => setMode(e.target.value as ExamMode)} aria-label="Bản biên dịch" title="Bản biên dịch">{modeList.map((m) => <option key={m.id} value={m.id} disabled={m.id !== 'nguyen-van' && !modesOk} title={m.id !== 'nguyen-van' && !modesOk ? (profile?.reason ?? 'Chưa nhận diện được') : ''}>{m.label}</option>)}</select>
          <details className="ew-opts">
            <summary className="btn btn-sm btn-ghost" title={`Tuỳ chọn biên dịch: ${ENGINES.find((x) => x.id === engine)?.label ?? engine}, ${runs} lượt`} aria-label="Tuỳ chọn biên dịch">⚙</summary>
            <div className="ew-pop">
              <label>Trình dịch <select className="xl-in" value={engine} disabled={compiling} onChange={(e) => setEngine(e.target.value as Engine)}>{ENGINES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
              <label>Số lượt <select className="xl-in" value={runs} disabled={compiling} onChange={(e) => setRuns(+e.target.value)}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            </div>
          </details>
          {!compiling ? <button type="button" className="btn btn-sm btn-primary" disabled={!mainFile} onClick={compile}>Biên dịch</button> : <button type="button" className="btn btn-sm" title={queued ? 'Đang chờ lượt: 2 đề khác đang biên dịch' : undefined} onClick={() => { if (queued) { gen.current++; setQueued(false); setCompiling(false); } else void examCompileCancel(id); }}>{queued ? 'Huỷ chờ' : 'Dừng'}</button>}
          <button type="button" className="btn btn-sm" disabled={!goods.length || !active} onClick={() => { void toPdf(); }} title="Tô trên PDF chỗ ứng với dòng đang đặt con trỏ (Ctrl+bấm hoặc bấm đúp trên PDF thì đi ngược lại)">Tới chỗ này trên PDF</button>
          <button type="button" className="btn btn-sm" disabled={!active} onClick={() => setLintOpen(true)} title="Kiểm ngoặc, dấu $ và lỗi mã LaTeX hay gặp trong tệp đang mở (ChkTeX)">Kiểm lỗi mã</button>
          <button type="button" className="btn btn-sm" disabled={!active} onClick={() => { void openHistory(); }} title="Xem các bản cũ của tệp đang mở (HEdu giữ 10 bản gần nhất mỗi lần lưu), so sánh và khôi phục">Lịch sử</button>
          <button type="button" className="btn btn-sm" disabled={compiling || result?.status !== 'ok'} title={result?.status === 'ok' ? `Xuất PDF “${modeLabel(result.mode as ExamMode)}” vừa biên dịch thành công ra một tệp` : 'Biên dịch thành công rồi mới xuất được PDF'} onClick={() => { if (result) void exportPdf(id, name, result.mode as ExamMode).then((d) => { if (d) toast(`Đã xuất PDF: ${d}`); }).catch((e) => toast(e instanceof Error ? e.message : String(e))); }}>Xuất PDF…</button>
        </span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onInfo} title="Thông tin đề: đổi tên, lớp, loại đề, chốt đề, xuất gói, sao chép, Thùng rác…">Thông tin…</button>
      </header>
      {narrow && (
        <div className="ew-tabs" role="tablist" aria-label="Khu vực">
          {([['files', 'Tệp'], ['edit', 'TeX'], ['pdf', 'PDF'], ['log', 'Log']] as [Pane, string][]).map(([p, l]) => (
            <button key={p} type="button" role="tab" aria-selected={pane === p} className={`ew-tab${pane === p ? ' on' : ''}`} onClick={() => setPane(p)}>{l}{p === 'log' && result && result.errorCount > 0 ? ` (${result.errorCount})` : ''}</button>
          ))}
        </div>
      )}
      {note && <div className="note bad ew-note" role="alert"><div className="note-body"><span>{note}</span></div><button type="button" className="btn btn-sm" onClick={() => setNote(null)}>Ẩn</button></div>}
      <div ref={bodyRef} className={`ew-body${narrow ? ' narrow' : ''}${dragging ? ' dragging' : ''}`} style={narrow ? undefined : { gridTemplateColumns: `${showFiles ? '210px ' : ''}minmax(0, 1fr) 6px ${lay.pdf}%` }}>
        {showFiles && (
          <aside className="ew-files" aria-label="Cây tệp">
            <div className="xl-actions">
              <button type="button" className="btn btn-sm" onClick={() => setNewName('')}>+ Tệp mới</button>
              <button type="button" className="btn btn-sm" onClick={() => void reloadList()}>Làm mới</button>
            </div>
            {newName !== null && (
              <div className="xl-box" role="group" aria-label="Tệp mới">
                <input className="xl-in" autoFocus value={newName} placeholder="chapters/c2.tex" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void createFile(); if (e.key === 'Escape') { e.stopPropagation(); setNewName(null); } }} />
                <button type="button" className="btn btn-sm btn-primary" onClick={createFile}>Tạo</button>
                <button type="button" className="btn btn-sm" onClick={() => setNewName(null)}>Huỷ</button>
              </div>
            )}
            <ul role="tree" className="ew-tree" aria-label="Tệp của dự án">{tree.map((n) => renderNode(n, 0))}</ul>
            {list.blocked.length > 0 && <div className="note warn"><div className="note-body"><b>Bị chặn</b><span>Liên kết/junction hoặc tên không an toàn, HEdu không mở: {list.blocked.join(', ')}</span></div></div>}
          </aside>
        )}
        {showEdit && (
          <section className="ew-edit" aria-label="Soạn thảo">
            <div className="ew-tabbar" role="tablist" aria-label="Tệp đang mở">
              {tabs.map((t) => (
                <span key={t.rel} className={`ew-tabitem${t.rel === active ? ' on' : ''}`}>
                  <button type="button" role="tab" aria-selected={t.rel === active} className="ew-tabname" onClick={() => setActive(t.rel)}>{t.rel.split('/').pop()}{t.dirty ? ' ●' : ''}{t.external !== 'none' ? ' !' : ''}</button>
                  <button type="button" className="ew-x" aria-label={`Đóng ${t.rel}`} onClick={() => closeTab(t.rel)}>×</button>
                </span>
              ))}
            </div>
            {tab && tab.external !== 'none' && (
              <div className="note warn ew-note" role="alert"><div className="note-body">
                <b>{tab.external === 'missing' ? 'Tệp đã bị xoá hoặc đổi tên ngoài HEdu.' : 'Tệp đã bị sửa ngoài HEdu.'}</b>
                <span>Chưa có gì bị ghi đè. {tab.external === 'changed' ? 'Chọn nạp bản ngoài (bỏ sửa của bạn) hoặc giữ bản của bạn (lần lưu sau sẽ thay tệp trên đĩa; bản đó được chụp lại trước).' : 'Có thể đóng tab, hoặc lưu lại thành tệp mới bằng cách sao chép nội dung.'}</span>
              </div>
                {tab.external === 'changed' && <><button type="button" className="btn btn-sm" onClick={() => void reload(tab.rel)}>Nạp bản ngoài</button><button type="button" className="btn btn-sm" onClick={() => void keepMine(tab.rel)}>Giữ bản của tôi</button></>}
              </div>
            )}
            {draft && tab && draft.rel === tab.rel && (
              <div className="note warn ew-note" role="status"><div className="note-body"><b>Có bản nháp chưa lưu từ lần trước ({draft.at.slice(0, 16).replace('T', ' ')})</b></div>
                <button type="button" className="btn btn-sm" onClick={() => { const d = draft; ed.current?.replaceDoc(d.rel, d.text); setDraft(null); }}>Khôi phục bản nháp</button>
                <button type="button" className="btn btn-sm" onClick={() => { void draftClear(id, draft.rel); setDraft(null); }}>Bỏ bản nháp</button>
              </div>
            )}
            {tab?.readOnly && <div className="note warn ew-note" role="status"><div className="note-body"><b>Chỉ xem</b><span>{tab.readOnly}</span></div></div>}
            {tab?.kind === 'image' && img && <div className="ew-img"><img src={img} alt={tab.rel} /></div>}
            <div className="ew-cm" hidden={!tab || tab.kind !== 'text' || !!tab.readOnly}>
              <CodeEditor ref={ed} label={tab ? `Soạn ${tab.rel}` : 'Soạn thảo'} onSave={() => { if (active) void saveOne(active); }}
                onDirty={(k, d) => patch(k, { dirty: d })} onChangeText={scheduleDraft} />
            </div>
            {!tab && <p className="xl-meta ew-empty">{tree0 || narrow ? 'Chọn một tệp ở cây bên trái để mở.' : 'Bấm “Tệp” trên thanh công cụ để chọn tệp cần mở.'}</p>}
            {tab && !tab.readOnly && <div className="xl-meta ew-status" title={`${TEX_KEYS_HINT} · Ctrl+S lưu · Ctrl+F tìm · Ctrl+H thay`}><span>{tab.eol === 'crlf' ? 'CRLF' : tab.eol === 'lf' ? 'LF' : '—'} · UTF-8{tab.bom ? ' có BOM' : ''}</span><span className="ew-keys">{TEX_KEYS_HINT}</span></div>}
          </section>
        )}
        {!narrow && <div className="ew-split" role="separator" aria-orientation="vertical" aria-label="Kéo để đổi bề rộng khung PDF" tabIndex={0} onPointerDown={startDrag('pdf')} onKeyDown={nudge('pdf')} onDoubleClick={() => setLay((l) => { const n = { ...l, pdf: 42 }; saveLayout(n); return n; })} title="Kéo để đổi bề rộng · bấm đúp: về mặc định" />}
        {showPdf && (
          <section className="ew-pdf" aria-label="PDF">
            {/* chỉ một bản PDF và đang xem đúng bản đó: không cần dải tab (đỡ một hàng trống; ghi chú bên dưới đã nêu loại bản) */}
            {(goods.length > 1 || (goods.length === 1 && viewMode !== goods[0].mode)) && (
              <div className="ew-tabbar" role="tablist" aria-label="Bản PDF">
                {MODES.filter((m) => goods.some((g) => g.mode === m.id)).map((m) => (
                  <span key={m.id} className={`ew-tabitem${viewMode === m.id ? ' on' : ''}`}>
                    <button type="button" role="tab" aria-selected={viewMode === m.id} className="ew-tabname" onClick={() => setViewMode(m.id)}>{m.label}</button>
                  </span>
                ))}
              </div>
            )}
            {goods.find((g) => g.mode === viewMode)
              ? <PdfViewer key={viewMode + goods.find((g) => g.mode === viewMode)!.fingerprint + goods.find((g) => g.mode === viewMode)!.at} embedded id={id} mode={viewMode} title={name} stale={stale && mode === viewMode} note={MODE_NOTE[viewMode]} onSourceAt={(p, x, y) => { void fromPdf(p, x, y); }} mark={syncMark} />
              : <p className="xl-meta ew-empty">Chưa có PDF {viewMode === 'nguyen-van' ? '' : `bản “${modeLabel(viewMode)}” `}cho đề này. Chọn bản và bấm “Biên dịch PDF”.</p>}
          </section>
        )}
      </div>
      {!narrow && (
        <div className={`ew-logbar ${compiling ? 'run' : sm ? sm.tone : ''}`}>
          {logOpen && <div className="ew-hsplit" role="separator" aria-orientation="horizontal" aria-label="Kéo để đổi chiều cao nhật ký" tabIndex={0} onPointerDown={startDrag('log')} onKeyDown={nudge('log')} />}
          <button type="button" className="ew-logtoggle" aria-expanded={logOpen} onClick={() => setLogOpen((o) => !o)}>
            <span className="ew-logdot" aria-hidden="true" />
            <span className="ew-logtext">{compiling ? (queued ? 'Đang chờ lượt biên dịch…' : 'Đang lưu và biên dịch…') : sm ? sm.text : 'Chưa biên dịch lần nào trong phiên này'}</span>
            {result && !compiling && <span className="xl-meta">{result.texVersion ? `${Math.round(result.ms / 100) / 10} giây · ${result.runs} lượt` : ''}</span>}
            {errs > 0 && <span className="ew-count">{errs} lỗi</span>}
            <span className="ew-caret" aria-hidden="true">{logOpen ? '▾' : '▴'}</span>
            <span className="sr-only">{logOpen ? 'Thu nhật ký' : 'Mở nhật ký'}</span>
          </button>
        </div>
      )}
      {showLog && (
        <section className="ew-log" aria-label="Nhật ký biên dịch" style={narrow ? undefined : { height: clampLog(lay.log, window.innerHeight) }}>
          {compiling && <p className="aid-wait" role="status">{queued ? 'Đang chờ lượt biên dịch (đã có 2 đề khác đang biên dịch)…' : 'Đang lưu và biên dịch…'}</p>}
          {!result && !compiling && <p className="xl-meta">Kết quả biên dịch sẽ hiện ở đây.</p>}
          {result && sm && (narrow || result.warnings.length > 0) && <div className={`note ${sm.tone === 'bad' ? 'bad' : sm.tone}`} role="status"><div className="note-body"><b>{sm.text}</b>{result.warnings.map((w, i) => <span key={i}>{w}</span>)}{result.texVersion && <span className="xl-meta">{result.texVersion} · {result.runs} lượt · {Math.round(result.ms / 100) / 10} giây</span>}</div></div>}
          {noPreamble && (
            <div className="note warn" role="status"><div className="note-body">
              <b>Tệp chính “{mainFile}” chỉ có nội dung đề nhưng tên tệp có khoảng trắng hoặc ký tự đặc biệt</b>
              <span>HEdu chỉ tự ghép phần đầu (khai báo + mẫu in) cho tệp tên gồm chữ, số, dấu chấm, gạch nối, gạch dưới. Hãy đổi tên tệp (vd <code>de-thi.tex</code>) rồi biên dịch lại.</span>
            </div></div>
          )}
          {pkgHints.length > 0 && (
            <div className="note warn" role="status"><div className="note-body">
              <b>Có vẻ đề thiếu gói LaTeX</b>
              {pkgHints.map((h) => <span key={h.pkg}><code>{h.pkg}</code> — {h.why}{h.installed ? '' : ` (chưa cài trong TeX: mở “TeX Live Shell” hoặc chạy “tlmgr install ${h.pkg}”)`}</span>)}
              {heduSty
                ? <span><button type="button" className="btn btn-sm btn-accent" disabled={compiling} onClick={() => void addPackages(pkgHints.filter((h) => h.installed).map((h) => h.pkg))}>Thêm {pkgHints.filter((h) => h.installed).map((h) => h.pkg).join(', ')} vào hedu-goithem.tex và biên dịch lại</button></span>
                : <span>Đề này dùng khai báo cũ (chưa có hedu.sty): thêm <code>{pkgHints.map((h) => `\\usepackage{${h.pkg}}`).join(' ')}</code> vào khaibaochung.tex.</span>}
            </div></div>
          )}
          {groups.map((g) => (
            <details key={g.file ?? '?'} open={g.items.some((d) => d.severity === 'error')}>
              <summary>{g.file ?? 'Không rõ tệp'} ({g.items.length})</summary>
              <ul className="xl-lines">{g.items.map((d, i) => (
                <li key={i}>
                  {canJump(d) ? <button type="button" className="btn btn-sm" onClick={() => void jump(d.file as string, d.line as number)}>{d.severity === 'error' ? 'Lỗi' : 'Cảnh báo'} dòng {d.line}</button> : <b>{d.severity === 'error' ? 'Lỗi' : 'Cảnh báo'}</b>} {d.message}
                  {d.context.length > 0 && <pre className="xl-ctx">{d.context.join('\n')}</pre>}
                </li>
              ))}</ul>
            </details>
          ))}
          {result && result.profileChanges.length > 0 && (
            <details open><summary>Bản dẫn xuất ({modeLabel(result.mode)}): HEdu đổi {result.profileChanges.length} dòng CHỈ trong thư mục build, tệp của bạn không đổi</summary>
              <ul className="xl-lines">{result.profileChanges.map((c, i) => <li key={i}><code>{c.file}:{c.line}</code><pre className="xl-ctx">{'- ' + c.before + '\n+ ' + c.after}</pre></li>)}</ul>
            </details>
          )}
          {result?.rawLog && <details><summary>Nhật ký TeX (thô)</summary><pre className="xl-ctx">{result.rawLog}</pre></details>}
        </section>
      )}
      {picker && <BankPicker onClose={() => setPicker(false)} onInsert={insertFromBank} />}
      {srcOpen && <SourcesPanel statuses={statuses} error={srcErr} onClose={() => setSrcOpen(false)} onReplace={replaceFromBank} onForget={(i) => void forgetSource(i)} onGoto={(rel) => { const f = list.files.find((x) => x.rel === rel); if (f) { setSrcOpen(false); void openFile(f); } }} />}
      {leave && (
        <>
          <div className="cfm-scrim" onClick={() => setLeave(false)} />
          <div className="cfm" role="alertdialog" aria-modal="true" aria-label="Thay đổi chưa lưu">
            <h3>Có tệp chưa lưu</h3>
            <p>{tabs.filter((t) => t.dirty).map((t) => t.rel).join(', ')}</p>
            <p className="xl-meta">Nếu đóng không lưu, bản nháp tự lưu vẫn được giữ và hỏi khôi phục lần sau.</p>
            <div className="xl-actions">
              <button type="button" className="btn btn-sm btn-primary" onClick={async () => { if (await saveAll()) onClose(); else setLeave(false); }}>Lưu tất cả rồi đóng</button>
              <button type="button" className="btn btn-sm" onClick={() => onClose()}>Đóng không lưu</button>
              <button type="button" className="btn btn-sm" onClick={() => setLeave(false)}>Quay lại</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
