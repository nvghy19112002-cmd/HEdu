// Màn "Đọc đề từ PDF/ảnh" (Studio, Đợt 1c): chọn tệp → dựng ảnh trang (pdf.js, ~200 dpi) → Gemini chép từng trang
// (lệnh ocr_run, OCR THUẦN) → tự chuẩn hoá (ocrnorm) → xem/sửa 3 cột: trang gốc | mã ex_test | xem trước.
// Nhập vào ngân hàng KHÔNG ghi thẳng: chuyển sang màn Nhập liệu để chạy đủ chuẩn hoá, rà trùng, kiểm ID, xem lại.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { AiConsentDialog, type AiSendPlan } from '../components/AiConsentDialog';
import { LatexEditor } from '../components/LatexEditor';
import { loadLib } from '../components/PdfViewer';
import { QuestionView } from '../components/QuestionView';
import { aiKeyStatus, getCurrentProfile } from '../lib/ai/client';
import { loadAiPrefs } from '../lib/ai/prefs';
import { ocrJob, parsePageRange, parseTrang, checkCau, type OcrCau } from '../lib/ai/tasks/ocrtrang';
import { parseExTest } from '../lib/extest';
import { setImportHandoff } from '../lib/importhandoff';
import { normalizeOcr, type NormChange } from '../lib/ocrnorm';
import { canvasShrink } from '../lib/pdfview';
import { channel, invoke, isDesktop } from '../lib/platform';

const DPI = 200;
interface SrcFile { name: string; kind: 'pdf' | 'img'; buf: ArrayBuffer; pages: number; mime: string }
interface Page { id: string; file: string; no: number; dataUrl: string; state: 'cho' | 'doc' | 'xong' | 'loi' | 'bo'; note?: string }
interface Item extends OcrCau { pageId: string; orig: string; changes: NormChange[]; ok: Set<number> }
type OcrEvent =
  | { type: 'started'; pageId: string } | { type: 'waiting'; pageId: string; secs: number; reason: string }
  | { type: 'done'; pageId: string; reply: { text: string } } | { type: 'failed'; pageId: string; error: { kind: string; message: string } }
  | { type: 'finished'; done: number; failed: number; cancelled: boolean; stoppedReason: string | null };

async function pdfPages(buf: ArrayBuffer): Promise<number> {
  const lib = await loadLib();
  const d = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, useWorkerFetch: false, disableFontFace: true, verbosity: 0 }).promise;
  const n = d.numPages; void d.destroy(); return n;
}
/** Dựng ảnh JPEG các trang chọn của một PDF. */
async function renderPdf(buf: ArrayBuffer, nos: number[]): Promise<string[]> {
  const lib = await loadLib();
  const d = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, useWorkerFetch: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const out: string[] = [];
    for (const no of nos) {
      const pg = await d.getPage(no);
      const base = pg.getViewport({ scale: DPI / 72 });
      const k = canvasShrink(base.width, base.height, 4000, 12_000_000);
      const vp = pg.getViewport({ scale: (DPI / 72) * k });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push(c.toDataURL('image/jpeg', 0.9));
    }
    return out;
  } finally { void d.destroy(); }
}
const toDataUrl = (f: SrcFile) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(new Blob([f.buf], { type: f.mime })); });

export function OcrScreen() {
  const { go, toast } = useApp();
  const prefs = useMemo(() => loadAiPrefs(), []);
  const [files, setFiles] = useState<SrcFile[]>([]);
  const [range, setRange] = useState('');
  const [model, setModel] = useState(prefs.model);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [plan, setPlan] = useState<AiSendPlan | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState(0);
  const [run, setRun] = useState<{ id: string; status: string; wait?: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'cxm' | 'loi'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const profile = getCurrentProfile();

  useEffect(() => { if (isDesktop() && profile) aiKeyStatus(profile).then((s) => setHasKey(s.hasKey), () => setHasKey(false)); else setHasKey(false); }, [profile]);

  const pdfCount = files.filter((f) => f.kind === 'pdf').length;
  const total = files.reduce((n, f) => n + f.pages, 0);
  const pick = useMemo(() => files.length === 1 && files[0].kind === 'pdf' ? parsePageRange(range, files[0].pages) : files.length ? Array.from({ length: total }, (_, i) => i + 1) : [], [files, range, total]);

  async function onFiles(list: FileList | null) {
    if (!list) return;
    const out: SrcFile[] = [];
    for (const f of Array.from(list)) {
      const buf = await f.arrayBuffer();
      if (/\.pdf$/i.test(f.name)) {
        try { out.push({ name: f.name, kind: 'pdf', buf, pages: await pdfPages(buf), mime: 'application/pdf' }); } catch { toast(`Không mở được ${f.name} (PDF hỏng hoặc có mật khẩu).`); }
      } else if (/^image\/(png|jpeg|webp)$/.test(f.type)) out.push({ name: f.name, kind: 'img', buf, pages: 1, mime: f.type });
      else toast(`Bỏ qua ${f.name}: chỉ nhận PDF, PNG, JPG, WebP.`);
    }
    setFiles((p) => [...p, ...out]);
  }

  async function start() {
    setPlan(null);
    const id = `ocr-${Date.now()}`;
    setRun({ id, status: 'Đang dựng ảnh trang…' });
    const pg: Page[] = [];
    try {
      for (const f of files) {
        if (f.kind === 'pdf') {
          const nos = files.length === 1 ? (pick ?? []) : Array.from({ length: f.pages }, (_, i) => i + 1);
          const imgs = await renderPdf(f.buf, nos);
          nos.forEach((no, i) => pg.push({ id: `${f.name}#${no}`, file: f.name, no, dataUrl: imgs[i], state: 'cho' }));
        } else pg.push({ id: `${f.name}#1`, file: f.name, no: 1, dataUrl: await toDataUrl(f), state: 'cho' });
      }
    } catch (e) { setRun(null); toast(`Không dựng được ảnh trang: ${e instanceof Error ? e.message : String(e)}`); return; }
    setPages(pg); setItems([]); setSel(0);
    const job = ocrJob(id, model, pg.map((p) => ({ id: p.id, mime: p.dataUrl.slice(5, p.dataUrl.indexOf(';')), dataB64: p.dataUrl.slice(p.dataUrl.indexOf(',') + 1) })), profile ?? undefined);
    let done = 0;
    const onEvent = (e: OcrEvent) => {
      if (e.type === 'started') setPages((ps) => ps.map((p) => p.id === e.pageId ? { ...p, state: 'doc' } : p));
      else if (e.type === 'waiting') setRun((r) => r && { ...r, wait: `Google báo chậm lại — thử lại sau ${e.secs} giây` });
      else if (e.type === 'failed') setPages((ps) => ps.map((p) => p.id === e.pageId ? { ...p, state: 'loi', note: e.error.message } : p));
      else if (e.type === 'done') {
        done++;
        setRun((r) => r && { ...r, status: `Đang đọc ${done}/${pg.length} trang`, wait: undefined });
        try {
          const t = parseTrang(e.reply.text);
          setPages((ps) => ps.map((p) => p.id === e.pageId ? { ...p, state: t.coDe ? 'xong' : 'bo', note: t.coDe ? undefined : 'Trang không có đề, đã bỏ qua' } : p));
          const add = t.cau.map((c): Item => { const n = normalizeOcr(c.tex); return { ...c, tex: n.tex, loi: checkCau(n.tex, c.dang), pageId: e.pageId, orig: c.tex, changes: n.changes, ok: new Set() }; });
          const order = new Map(pg.map((p, i) => [p.id, i]));
          setItems((it) => [...it, ...add].sort((a, b) => (order.get(a.pageId) ?? 0) - (order.get(b.pageId) ?? 0)));
        } catch { setPages((ps) => ps.map((p) => p.id === e.pageId ? { ...p, state: 'loi', note: 'AI trả kết quả sai khuôn' } : p)); }
      } else if (e.type === 'finished') {
        setRun(null);
        toast(e.stoppedReason ? `Đã dừng: ${e.stoppedReason} Các trang đã đọc vẫn giữ.` : e.cancelled ? 'Đã dừng. Các trang đã đọc vẫn giữ.' : `Đọc xong ${e.done} trang${e.failed ? `, ${e.failed} trang lỗi` : ''}.`);
      }
    };
    try { await invoke('ocr_run', { job, onEvent: channel<OcrEvent>(onEvent) }); }
    catch (e) { setRun(null); toast(e instanceof Error ? e.message : String(e)); }
  }

  const ask = () => setPlan({
    task: 'Đọc đề từ PDF/ảnh (chỉ chép, không giải)', model, questions: pick?.length ?? 0, calls: pick?.length ?? 0,
    sends: [`${pick?.length ?? 0} ảnh trang đề (${files.map((f) => f.name).join(', ')})`, 'Hướng dẫn chép theo quy tắc ex_test của HEdu'],
  });

  const shown = items.map((it, i) => ({ it, i })).filter(({ it }) => filter === 'all' || (filter === 'cxm' ? it.canXacMinh.length > it.ok.size : it.loi.length > 0));
  const cur = items[sel];
  const curPage = pages.find((p) => p.id === cur?.pageId) ?? pages[0];
  const setTex = useCallback((tex: string) => setItems((it) => it.map((x, i) => i === sel ? { ...x, tex, loi: checkCau(tex, x.dang) } : x)), [sel]);
  const parsed = useMemo(() => { try { return cur ? parseExTest(cur.tex) : null; } catch { return null; } }, [cur]);
  const cxm = items.reduce((n, x) => n + x.canXacMinh.length - x.ok.size, 0);

  // J/K và ‹ › đi trong các câu khớp bộ lọc
  const order = shown.map((x) => x.i);
  const step = useCallback((d: 1 | -1) => setSel((s) => { const pos = order.indexOf(s); const n = pos < 0 ? (d > 0 ? order.find((i) => i > s) : [...order].reverse().find((i) => i < s)) : order[pos + d]; return n ?? s; }), [order.join()]);
  useEffect(() => { if (order.length && !order.includes(sel)) setSel(order[0]); }, [filter]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,.cm-editor')) return;
      if (e.key === 'j') step(1);
      if (e.key === 'k') step(-1);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [step]);

  function toImport() {
    const text = items.map((x) => x.tex.trim() + (x.canXacMinh.length > x.ok.size ? '' : '')).join('\n');
    setImportHandoff(text, 'ocr');
    go({ screen: 'import' });
  }

  // ---------- bước 1: chọn tệp ----------
  if (!pages.length) {
    const err = files.length === 1 && files[0].kind === 'pdf' && pick === null;
    return (
      <>
        <header className="page-head g3-head nh-head"><h1>Đọc đề từ PDF/ảnh</h1>
                  </header>
        <div className="simple ocr-src nh-body">
          <div className="ocr-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFiles(e.dataTransfer.files); }}>
            <div><b>Kéo thả PDF hoặc ảnh vào đây</b><span>Nhiều tệp cùng lúc · mỗi ảnh là một trang</span></div>
            <button type="button" className="btn" onClick={() => inputRef.current?.click()}>Chọn tệp…</button>
            <input ref={inputRef} type="file" hidden multiple accept=".pdf,image/png,image/jpeg,image/webp" onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {files.length > 0 && <ul className="ocr-files">{files.map((f, i) => <li key={i}><b className={f.kind}>{f.kind === 'pdf' ? 'PDF' : 'ẢNH'}</b>{f.name} · {f.pages} trang<button type="button" className="btn btn-sm" aria-label={`Bỏ ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>×</button></li>)}</ul>}
          <div className="ocr-form">
            <label><span>Trang cần đọc</span><input value={range} onChange={(e) => setRange(e.target.value)} placeholder="vd 1-3, 5 · để trống = cả tệp" disabled={!(files.length === 1 && pdfCount === 1)} aria-invalid={err} />
              <small>{err ? 'Khoảng trang không hợp lệ.' : files.length > 1 ? 'Nhiều tệp: đọc mọi trang. Trang bìa, quảng cáo tự bỏ qua.' : 'Trang bìa, quảng cáo, mục lục tự bỏ qua.'}</small></label>
            <label><span>Model chép</span><input value={model} onChange={(e) => setModel(e.target.value.trim())} className="mono" />
              <small>Chỉ chép đề, không giải, không tự gắn \True khi trang không có khoá in.</small></label>
          </div>
          <div className="ocr-key">
            {hasKey === false
              ? <><span>Chưa có khoá Gemini cho cấu hình đang dùng.</span><button type="button" className="btn btn-sm" onClick={() => go({ screen: 'system' })}>Mở Cài đặt AI</button></>
              : <span>Gói miễn phí: Google có thể dùng ảnh đề để huấn luyện. <b>Đề chưa công bố nên dùng khoá trả phí.</b></span>}
          </div>
          <div className="ocr-go"><span>{pick?.length ? `${pick.length} trang · khoảng ${pick.length * 1100} token đầu vào` : ''}</span>
            <button type="button" className="btn btn-primary" disabled={!pick?.length || !hasKey || !prefs.consent || !!run} onClick={ask}>{run ? run.status : `Bắt đầu đọc ${pick?.length ?? 0} trang`}</button></div>
          {!prefs.consent && <p className="ocr-warn">Bật "Cho phép gửi tới AI" trong Cài đặt AI trước.</p>}
        </div>
        {plan && <AiConsentDialog plan={plan} onSend={() => void start()} onCancel={() => setPlan(null)} />}
      </>
    );
  }

  // ---------- bước 2: xem/sửa 3 cột ----------
  return (
    <div className="ocr-wrap">
      <header className="page-head g3-head nh-head"><h1>Đọc đề từ PDF/ảnh</h1>
        <ol className="steps" aria-label="Các bước"><li aria-current="step"><b>1</b>Chép &amp; soát</li><li><b>2</b>Nhập liệu</li></ol>
        <div className="head-actions">
          {run && <span className="ocr-run" role="status">{run.wait ?? run.status}</span>}
          {run && <button type="button" className="btn btn-sm" onClick={() => void invoke('ocr_cancel', { jobId: run.id })}>Dừng</button>}
          <button type="button" className="btn btn-sm" disabled={!!run} onClick={() => { setPages([]); setItems([]); }}>Đọc tệp khác</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={!items.length || !!run} onClick={toImport}>Tiếp: Nhập liệu ({items.length} câu) →</button>
        </div>
      </header>
      <div className="ocr-bar">
        <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tất cả <b>{items.length}</b></button>
        <button type="button" className="chip y" aria-pressed={filter === 'cxm'} onClick={() => setFilter('cxm')}>Cần xác minh <b>{cxm}</b></button>
        <button type="button" className="chip r" aria-pressed={filter === 'loi'} onClick={() => setFilter('loi')}>Lỗi khuôn <b>{items.filter((x) => x.loi.length).length}</b></button>
        <span className="chip">Trang bỏ qua <b>{pages.filter((p) => p.state === 'bo').length}</b></span>
        <span className="sp" />
        <button type="button" className="btn btn-sm" aria-label="Câu trước (K)" disabled={order.indexOf(sel) <= 0} onClick={() => step(-1)}>‹</button>
        <span>Câu <b>{items.length ? sel + 1 : 0}</b> / {items.length}{shown.length < items.length ? ` · lọc ${shown.length}` : ''}</span>
        <button type="button" className="btn btn-sm" aria-label="Câu sau (J)" disabled={order.indexOf(sel) >= order.length - 1} onClick={() => step(1)}>›</button>
        <kbd>J / K</kbd>
      </div>
      <div className="ocr3">
        <section aria-label="Trang gốc">
          <div className="och"><b>Trang gốc</b><span className="muted">{curPage ? `${curPage.file} · trang ${curPage.no}` : ''}</span></div>
          <div className="ocr-page">{curPage && <div className="ocr-img"><img src={curPage.dataUrl} alt={`Trang ${curPage.no}`} />
            {cur?.hinh.map((b, k) => <i key={k} className="ocr-box" style={{ top: `${b[0] / 10}%`, left: `${b[1] / 10}%`, height: `${(b[2] - b[0]) / 10}%`, width: `${(b[3] - b[1]) / 10}%` }} title="Vùng hình" />)}</div>}</div>
          <div className="ocr-thumbs">{pages.map((p) => <button type="button" key={p.id} className={`st-${p.state}${p.id === curPage?.id ? ' on' : ''}`} title={p.note ?? p.id} aria-current={p.id === curPage?.id ? 'page' : undefined}
            onClick={() => { const i = items.findIndex((x) => x.pageId === p.id); if (i >= 0) setSel(i); }}>{p.no}</button>)}</div>
        </section>
        <section aria-label="Mã ex_test">
          <div className="och"><b>Mã ex_test</b><span className="muted">sửa trực tiếp</span><span className="sp" />{cur && (cur.loi.length ? <span className="ocr-tag err">{cur.loi.length} lỗi khuôn</span> : <span className="ocr-tag ok">✓ Đúng khuôn</span>)}</div>
          {cur ? <LatexEditor key={sel} value={cur.tex} onChange={setTex} label={`Mã ex_test câu ${sel + 1}`} /> : <p className="ocr-empty">{run ? 'Đang chờ trang đầu tiên…' : 'Không có câu nào.'}</p>}
          {cur && (cur.changes.length > 0 || cur.loi.length > 0) && <div className="ocr-fixes">
            {cur.changes.length > 0 && <><b>Tự chuẩn hoá</b>{cur.changes.map((c) => <span key={c.rule}>{c.label} ×{c.count}</span>)}<button type="button" className="btn btn-sm" onClick={() => setTex(cur.orig)}>Hoàn tác</button></>}
            {cur.loi.map((l) => <span key={l} className="err">{l}</span>)}
          </div>}
        </section>
        <section aria-label="Xem trước">
          <div className="och"><b>Xem trước</b><span className="muted">{cur ? `câu ${cur.soNguon} của nguồn` : ''}</span></div>
          <div className="ocr-pv">{cur && parsed ? <QuestionView p={parsed} number={sel + 1} raw={cur.tex} showSolution={false} /> : cur && <p className="ocr-empty">Chưa xem trước được — sửa mã ở cột giữa.</p>}</div>
          {cur && cur.canXacMinh.length > 0 && <div className="ocr-cxm"><b>Cần xác minh ({cur.canXacMinh.length - cur.ok.size})</b>
            {cur.canXacMinh.map((m, k) => <div key={k} className={cur.ok.has(k) ? 'done' : ''}><span><i>{k + 1}</i>{m}</span>
              <button type="button" className="btn btn-sm" disabled={cur.ok.has(k)} onClick={() => setItems((it) => it.map((x, i) => i === sel ? { ...x, ok: new Set([...x.ok, k]) } : x))}>{cur.ok.has(k) ? 'Đã xem' : 'Đã đúng'}</button></div>)}</div>}
        </section>
      </div>
    </div>
  );
}
