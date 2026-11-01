// Màn "Xử lí TeX" — Đợt 1a (claude/de-xuat-man-xu-li-tex.md mục 10): bàn nháp soạn các khối \begin{ex}…\end{ex}.
// Khung soạn (CodeEditor) + danh sách câu (phân tích CHỈ ĐỌC, texscratch.ts) + xem nhanh từng câu (gần đúng, có thể khác PDF).
// Một bản nháp duy nhất, lưu bền (scratchdraft.ts → texscratch.rs). Không ghi gì vào ngân hàng hay Thư viện đề; không sửa văn bản.
// Đợt 1b: "Biên dịch PDF" (nút hoặc Ctrl+Enter) — main.tex + content.tex nguyên văn (scratchbuild.ts) → Rust texscratch.rs; lỗi theo câu/dòng,
// PDF mang nhãn "bản trước" khi mã đã đổi; PDF nguyên văn (có thể chứa lời giải).
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { CodeEditor, type CodeEditorHandle } from '../components/CodeEditor';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IcAlert, IcCheckCircle, IcCopy } from '../components/Icons';
import { PdfViewer } from '../components/PdfViewer';
import { QuestionView } from '../components/QuestionView';
import { useTaxonomy } from '../lib/curriculum';
import { parseExTest } from '../lib/extest';
import { AUTOSAVE_MS, loadDraft, SAVE_LABEL, saveDraft, type SaveState } from '../lib/scratchdraft';
import { blockInfos, ID_STATE_LABEL, scanScratch, type BlockInfo } from '../lib/texscratch';
import type { Diag } from '../lib/examcompile';
import { missingPackages } from '../lib/missingpkg';
import { invoke, isDesktop } from '../lib/platform';
import { errorReport, scratchFiles, whereLabel, whereOf } from '../lib/scratchbuild';
import { FIX_RULES, planFix, planSort } from '../lib/texfix';

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
  const { toast } = useApp();
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

  /** Lưu NGAY (Ctrl+S, rời màn, hết thời gian chờ). Các lần lưu chạy nối tiếp nhau, không chồng. */
  const flush = useCallback((): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    chain.current = chain.current.then(async () => {
      if (blockedRef.current) return;
      const t = latest.current;
      if (t === saved.current) { setSave('da-luu'); return; }
      setSave('dang-luu');
      try {
        await saveDraft(t);
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
    loadDraft().then((d) => {
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
      if (latest.current !== saved.current && !blockedRef.current) void saveDraft(latest.current).catch(() => undefined);
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
  const nBad = infos.filter((b) => b.problems > 0).length;

  const compile = useCallback(async () => {
    if (busy) return;
    if (!isDesktop()) { toast('Biên dịch PDF chỉ có ở bản cài trên Windows (cần TeX Live).'); return; }
    const t = latest.current;
    if (!t.trim()) { toast('Bàn nháp đang trống.'); return; }
    setBusy(true); setTab('pdf');
    try {
      await flush();
      if (shared.current === null) { try { shared.current = await invoke<string>('tikz_default_preamble'); } catch { shared.current = ''; } }
      const o = await invoke<ScratchOut>('tex_scratch_compile', { files: scratchFiles(t, shared.current, extra) });
      setOut(o);
      if (o.status === 'ok') { setPdfText(t); setPdfGen((g) => g + 1); }
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
  const errs = (out?.diagnostics ?? []).filter((d) => d.severity === 'error');
  const hints = out && out.status !== 'ok' ? missingPackages(out.diagnostics, out.rawLog) : [];
  /** PDF đang hiện không phải của nội dung hiện tại (mã đã đổi, hoặc là PDF của lần trước khi mở lại màn) */
  const stale = pdfGen > 0 && (pdfText === null || pdfText !== text);
  const addPkg = (p: string) => { const n = [...new Set([...extra, p])]; setExtra(n); try { localStorage.setItem(PKG_KEY, JSON.stringify(n)); } catch { /* chỉ là tiện lợi */ } toast(`Đã thêm gói ${p} vào khai báo của bàn nháp. Bấm Biên dịch PDF lại.`); };
  const copyReport = async () => { try { await navigator.clipboard.writeText(errorReport(out?.diagnostics ?? [], scan, latest.current)); toast('Đã sao chép báo lỗi. Dán vào tin nhắn gửi Claude.'); } catch { toast('Không sao chép được (bị chặn).'); } };
  const jumpTo = (d: Diag) => { const w = whereOf(d, scan); if (w.kind === 'noi-dung') { ed.current?.jump(KEY, w.line); if (w.block != null) setSel(w.block); if (vmode === 'view') setVmode('both'); } };

  const pick = (b: BlockInfo) => { setSel(b.block.n); ed.current?.jump(KEY, b.block.line0); if (vmode === 'view') setVmode('both'); };
  /** Áp dụng một thay đổi đã xem trước: thay cả văn bản (Ctrl+Z trong khung soạn lấy lại được), kèm nút Hoàn tác. */
  const applyText = (next: string, what: string) => {
    const prev = latest.current;
    setFixFor(null);
    if (next === prev) { toast(`${what}: không có gì thay đổi.`); return; }
    ed.current?.replaceDoc(KEY, next);
    toast(`Đã ${what.toLowerCase()}.`, { label: 'Hoàn tác', run: () => { if (latest.current === next) ed.current?.replaceDoc(KEY, prev); } });
  };
  const clearAll = () => { setAskClear(false); ed.current?.replaceDoc(KEY, ''); ed.current?.focus(); toast('Đã xoá nội dung bàn nháp. Bấm Ctrl+Z trong khung soạn để lấy lại.'); };

  return (
    <div className="qe-page tsx-page">
      <header className="page-head tsx-head">
        <div>
          <h1>Xử lí TeX</h1>
          <span className="sys-hint">Dán hoặc gõ các khối <code>\begin{'{ex}'}…\end{'{ex}'}</code>. Khai báo gói có sẵn, không cần <code>\documentclass</code>. Bàn nháp không ghi vào ngân hàng.</span>
        </div>
        <div className="head-actions">
          <span className={`qs ${save === 'loi' ? 'bad' : save === 'da-luu' ? 'ok' : 'idle'}`} role="status" title={saveErr ?? undefined}>{blocked ? 'Không lưu được' : SAVE_LABEL[save]}</span>
          <button type="button" className="btn btn-sm" disabled={!!blocked || save === 'da-luu'} onClick={() => void flush()} title="Ctrl+S">Lưu nháp</button>
          <button type="button" className="btn btn-sm" disabled={!text || !!blocked} onClick={() => setFixFor('fix')} title="Xem trước các thay đổi rồi mới áp dụng">Chuẩn hoá…</button>
          <button type="button" className="btn btn-sm" disabled={!scan.blocks.length || !!blocked} onClick={() => setFixFor('sort')}>Sắp xếp theo ID…</button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={!text} onClick={() => setAskClear(true)}>Xoá nội dung…</button>
          {busy
            ? <button type="button" className="btn btn-sm" onClick={stop}>Dừng biên dịch</button>
            : <button type="button" className="btn btn-sm btn-accent" disabled={!text.trim()} onClick={() => void compile()} title="Ctrl+Enter">Biên dịch PDF</button>}
        </div>
      </header>

      {blocked && <div className="note bad" role="alert"><div className="note-body"><IcAlert size={16} /><span>{blocked}</span></div></div>}
      {fromBackup && <div className="note warn" role="status"><div className="note-body"><span>Bản nháp chính bị hỏng nên HEdu đã mở bản dự phòng gần nhất. Kiểm tra lại nội dung.</span></div></div>}
      {saveErr && !blocked && <div className="note bad" role="alert"><div className="note-body"><span>{saveErr}</span><button type="button" className="btn btn-sm" onClick={() => void flush()}>Thử lưu lại</button></div></div>}

      <div className="seg sm qe-vmode" role="group" aria-label="Chế độ xem">
        {([['code', 'Mã'], ['both', 'Mã + Xem trước'], ['view', 'Xem trước']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={vmode === k} onClick={() => setVmode(k)}>{l}</button>
        ))}
      </div>
      <div className="qe-tabs" role="tablist" aria-label="Khung đang xem">
        <button type="button" role="tab" aria-selected={pane === 'code'} onClick={() => setPane('code')}>Mã LaTeX</button>
        <button type="button" role="tab" aria-selected={pane === 'view'} onClick={() => setPane('view')}>Câu hỏi</button>
      </div>

      <div className="qe-panes tsx-panes" data-pane={pane} data-vmode={vmode}>
        <section className="qe-code" aria-label="Mã LaTeX">
          <div className="qe-bar"><h2>Mã LaTeX</h2><span className="qe-pos">{ready ? `${nf.format(scan.blocks.length)} khối ex` : 'Đang mở bản nháp…'}</span></div>
          <div className="tsx-editor">
            <CodeEditor ref={ed} label="Soạn nội dung LaTeX" onDirty={() => undefined} onSave={() => void flush()} onChangeText={onChangeText} />
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
                    {errs.length > 0 && <span className="sys-hint">TeX có thể dừng ở lỗi đầu tiên nên danh sách chưa chắc đủ mọi lỗi.</span>}
                    {hints.map((h) => <span key={h.pkg}>{h.why} <button type="button" className="btn btn-sm" onClick={() => addPkg(h.pkg)}>Thêm gói {h.pkg}</button></span>)}
                    {errs.length > 0 && <span><button type="button" className="btn btn-sm btn-ghost" onClick={() => void copyReport()}><IcCopy size={14} /> Sao chép báo lỗi</button></span>}
                  </div>
                </div>
              )}
              {pdfGen > 0 && (
                <>
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
            <ol className="tsx-list" aria-label="Danh sách câu">
              {infos.length === 0 && <li className="sys-hint">Chưa có khối <code>\begin{'{ex}'}</code> nào.</li>}
              {infos.map((b) => (
                <li key={b.block.n}>
                  <button type="button" className={`tsx-item${cur?.block.n === b.block.n ? ' on' : ''}`} aria-current={cur?.block.n === b.block.n ? 'true' : undefined} onClick={() => pick(b)} title={b.firstProblem ?? undefined}>
                    <b>Câu {b.block.n}</b>
                    <span className="tsx-ln">dòng {b.block.line0}–{b.block.line1}</span>
                    <span className={`tsx-id id-${b.id.state}`}>{b.id.code ? `${b.id.code} · ` : ''}{ID_STATE_LABEL[b.id.state]}</span>
                    {b.problems > 0 && <span className="tsx-bad"><IcAlert size={13} />{b.problems}</span>}
                  </button>
                </li>
              ))}
            </ol>
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
        <span className={`qs ${busy || !out ? 'idle' : out.status === 'ok' && !stale ? 'ok' : out.status === 'ok' ? 'warn' : 'bad'}`}>{busy ? 'Đang biên dịch…' : !out ? 'PDF: chưa biên dịch' : out.status === 'ok' ? (stale ? 'PDF cũ (mã đã đổi)' : 'PDF mới') : out.status === 'no-tex' ? 'Chưa có TeX Live' : 'PDF: biên dịch lỗi'}</span>
      </footer>

      {fixFor && <FixDialog mode={fixFor} text={latest.current} onApply={applyText} onClose={() => setFixFor(null)} />}
      {askClear && (
        <ConfirmDialog title="Xoá toàn bộ nội dung bàn nháp?" confirmLabel="Xoá nội dung" danger onConfirm={clearAll} onCancel={() => setAskClear(false)}>
          <p>Bản nháp được lưu lại sau khi xoá. Muốn lấy lại, bấm Ctrl+Z trong khung soạn trước khi đóng app.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Hộp "Chuẩn hoá" / "Sắp xếp theo ID": chạy trên bản sao, hiện thay đổi, chỉ ghi khi bấm Áp dụng. */
function FixDialog({ mode, text, onApply, onClose }: { mode: 'fix' | 'sort'; text: string; onApply(next: string, what: string): void; onClose(): void }) {
  const { tax } = useTaxonomy();
  const [on, setOn] = useState<Set<string>>(() => new Set(FIX_RULES.filter((r) => r.on).map((r) => r.id)));
  const fix = useMemo(() => (mode === 'fix' ? planFix(text, on) : null), [mode, text, on]);
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
              <p className="xl-meta">HEdu chạy thử trên bản sao và liệt kê các dòng sẽ đổi. Chỉ khi bấm <b>Áp dụng</b> nội dung mới thay đổi (Ctrl+Z hoặc nút Hoàn tác để lấy lại). Không có luật nào xoá chú thích hay đụng vào hình TikZ.</p>
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
                    <li key={c.line}><span className="tsx-ln">dòng {c.line}</span><del>{c.before || ' '}</del><ins>{c.after || ' '}</ins></li>
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
          {fix && <button type="button" className="btn btn-accent" disabled={!fix.linesChanged} onClick={() => onApply(fix.out, 'Chuẩn hoá')}>Áp dụng</button>}
          {sort?.ok && <button type="button" className="btn btn-accent" onClick={() => onApply(sort.out, 'Sắp xếp theo ID')}>Sắp xếp</button>}
        </div>
      </div>
    </>
  );
}
