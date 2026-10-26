// Không gian Biên tập đề (E3): cây tệp · soạn nhiều tab · xem PDF · nhật ký lỗi. Mở từ Thư viện đề thi.
// An toàn dữ liệu: lưu bằng so dấu vân (không ghi đè tệp đã đổi ngoài app), giữ nguyên BOM/CRLF, bản nháp tự lưu NGOÀI dự án,
// biên dịch chỉ chạy sau khi lưu xong mọi tệp (không lưu được thì không biên dịch). Không báo "đã lưu" khi chưa ghi xong.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { CodeEditor, type CodeEditorHandle } from '../components/CodeEditor';
import { PdfViewer } from '../components/PdfViewer';
import { canJump, ENGINES, examCompile, examCompileCancel, examCompileLast, groupDiagnostics, RAW_MODE_NOTE, summarize, type CompileOut, type Engine, type GoodInfo } from '../lib/examcompile';
import {
  anyDirty, buildTree, draftClear, draftRead, draftWrite, externalState, fileCreate, fileImage, fileList, fileRead, fileStat, fileWrite, kindIcon, newFileProblem, saveBadge, savePlan,
  type Draft, type FileEntry, type ListOut, type TabInfo, type TreeNode,
} from '../lib/examfiles';
import { getSettings } from '../lib/tikz';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
type Pane = 'files' | 'edit' | 'pdf' | 'log';
const NARROW = 1000;

interface Props { id: string; name: string; mainFile: string | null; onClose(): void }

export function ExamWorkspace({ id, name, mainFile, onClose }: Props) {
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
  const [result, setResult] = useState<CompileOut | null>(null);
  const [good, setGood] = useState<GoodInfo | null>(null);
  const [leave, setLeave] = useState(false);
  const [pane, setPane] = useState<Pane>('edit');
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
    examCompileLast(id).then(setGood).catch(() => undefined);
  }, [id, reloadList]);

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
  const scheduleDraft = (rel: string, text: string) => {
    const t = tabsRef.current.find((x) => x.rel === rel);
    if (!t || t.readOnly) return;
    window.clearTimeout(timers.current.get(rel));
    timers.current.set(rel, window.setTimeout(() => {
      const cur = tabsRef.current.find((x) => x.rel === rel);
      if (cur?.dirty) void draftWrite(id, rel, cur.sha, text).catch(() => undefined);
    }, 1500));
  };
  useEffect(() => () => { for (const t of timers.current.values()) window.clearTimeout(t); }, []);

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
    try {
      const st = getSettings();
      const r = await examCompile(id, { engine, runs, texBin: st.texBin || undefined, timeoutSecs: Math.max(st.timeoutSecs, 120) });
      setResult(r);
      if (r.lastGood) setGood(r.lastGood);
      if (r.status === 'ok' && narrow) setPane('pdf'); else if (r.status !== 'ok') setPane('log');
    } catch (e) { setNote(msg(e)); } finally { setCompiling(false); }
  };

  const jump = async (file: string, line: number) => {
    const f = list.files.find((x) => x.rel === file);
    if (!f) return;
    await openFile(f);
    setPane('edit');
    window.setTimeout(() => ed.current?.jump(file, line), 80);
  };

  const tree = useMemo(() => buildTree(list.files), [list.files]);
  const badge = saveBadge(tabs, saving);
  const groups = useMemo(() => (result ? groupDiagnostics(result.diagnostics) : []), [result]);
  const stale = !!result && result.status !== 'ok';

  const requestClose = () => { if (anyDirty(tabsRef.current)) setLeave(true); else onClose(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return; // trình soạn đã xử lý (vd. Ctrl+S) rồi
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (e.shiftKey) void saveAll(); else if (active) void saveOne(active); }
    else if (e.key === 'Escape' && !leave && !newName) { e.stopPropagation(); requestClose(); }
  };

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

  const showFiles = !narrow || pane === 'files';
  const showEdit = !narrow || pane === 'edit';
  const showPdf = !narrow || pane === 'pdf';
  const showLog = !narrow || pane === 'log';

  return (
    <div className="ew" role="dialog" aria-modal="true" aria-label={`Biên tập đề: ${name}`} onKeyDown={onKey}>
      <header className="ew-head">
        <nav aria-label="Vị trí" className="ew-crumb"><button type="button" className="btn btn-sm" onClick={requestClose}>← Thư viện</button> <b>{name}</b>{active && <span className="xl-meta"> › {active}</span>}</nav>
        <span className={`ew-badge ${badge.tone}`} role="status" aria-live="polite">{badge.text}</span>
        <span className="pv-grp">
          <button type="button" className="btn btn-sm" disabled={!tab || !tab.dirty || !!tab.readOnly || saving} onClick={() => active && void saveOne(active)}>Lưu</button>
          <button type="button" className="btn btn-sm" disabled={!anyDirty(tabs) || saving} onClick={() => void saveAll()}>Lưu tất cả</button>
          <label className="xl-meta">Trình dịch <select className="xl-in" value={engine} disabled={compiling} onChange={(e) => setEngine(e.target.value as Engine)}>{ENGINES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
          <label className="xl-meta">Lượt <select className="xl-in" value={runs} disabled={compiling} onChange={(e) => setRuns(+e.target.value)}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          {!compiling ? <button type="button" className="btn btn-sm btn-primary" disabled={!mainFile} onClick={compile}>Biên dịch PDF</button> : <button type="button" className="btn btn-sm" onClick={() => void examCompileCancel(id)}>Dừng</button>}
        </span>
      </header>
      {narrow && (
        <div className="ew-tabs" role="tablist" aria-label="Khu vực">
          {([['files', 'Tệp'], ['edit', 'TeX'], ['pdf', 'PDF'], ['log', 'Log']] as [Pane, string][]).map(([p, l]) => (
            <button key={p} type="button" role="tab" aria-selected={pane === p} className={`ew-tab${pane === p ? ' on' : ''}`} onClick={() => setPane(p)}>{l}{p === 'log' && result && result.errorCount > 0 ? ` (${result.errorCount})` : ''}</button>
          ))}
        </div>
      )}
      {note && <div className="note bad ew-note" role="alert"><div className="note-body"><span>{note}</span></div><button type="button" className="btn btn-sm" onClick={() => setNote(null)}>Ẩn</button></div>}
      <div className={`ew-body${narrow ? ' narrow' : ''}`}>
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
            {!tab && <p className="xl-meta ew-empty">Chọn một tệp ở cây bên trái để mở.</p>}
            {tab && !tab.readOnly && <div className="xl-meta ew-status">{tab.eol === 'crlf' ? 'CRLF' : tab.eol === 'lf' ? 'LF' : '—'} · UTF-8{tab.bom ? ' có BOM' : ''} · Ctrl+S lưu · Ctrl+F tìm · Ctrl+H thay</div>}
          </section>
        )}
        {showPdf && (
          <section className="ew-pdf" aria-label="PDF">
            {good ? <PdfViewer key={good.fingerprint + good.at} embedded id={id} title={name} stale={stale} note={RAW_MODE_NOTE} /> : <p className="xl-meta ew-empty">Chưa có PDF. Bấm “Biên dịch PDF”.</p>}
          </section>
        )}
      </div>
      {showLog && (
        <section className="ew-log" aria-label="Nhật ký biên dịch">
          {compiling && <p className="aid-wait" role="status">Đang lưu và biên dịch…</p>}
          {!result && !compiling && <p className="xl-meta">Kết quả biên dịch sẽ hiện ở đây.</p>}
          {result && (() => { const sm = summarize(result); return <div className={`note ${sm.tone === 'bad' ? 'bad' : sm.tone}`} role="status"><div className="note-body"><b>{sm.text}</b>{result.warnings.map((w, i) => <span key={i}>{w}</span>)}{result.texVersion && <span className="xl-meta">{result.texVersion} · {result.runs} lượt · {Math.round(result.ms / 100) / 10} giây</span>}</div></div>; })()}
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
          {result?.rawLog && <details><summary>Nhật ký TeX (thô)</summary><pre className="xl-ctx">{result.rawLog}</pre></details>}
        </section>
      )}
      {leave && (
        <>
          <div className="cfm-scrim" onClick={() => setLeave(false)} />
          <div className="cfm" role="alertdialog" aria-modal="true" aria-label="Thay đổi chưa lưu">
            <h3>Có tệp chưa lưu</h3>
            <p>{tabs.filter((t) => t.dirty).map((t) => t.rel).join(', ')}</p>
            <p className="xl-meta">Nếu đóng không lưu, bản nháp tự lưu vẫn được giữ và hỏi khôi phục lần sau.</p>
            <div className="xl-actions">
              <button type="button" className="btn btn-sm btn-primary" onClick={async () => { if (await saveAll()) onClose(); else setLeave(false); }}>Lưu tất cả rồi đóng</button>
              <button type="button" className="btn btn-sm" onClick={onClose}>Đóng không lưu</button>
              <button type="button" className="btn btn-sm" onClick={() => setLeave(false)}>Quay lại</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
