// Màn "Đọc đề" (Đợt A): dự án lưu trên đĩa · bước 1 Nguồn · bước 2 Bố cục (khoanh + duyệt khung) · bước 3 Chép chữ theo lô.
// Bước 4–7 (gắn khoá riêng, dựng hình, soát, xuất) làm ở các đợt sau; tạm thời xuất qua Nhập liệu hoặc Soạn TeX.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { AiConsentDialog, type AiSendPlan } from '../components/AiConsentDialog';
import { LatexEditor } from '../components/LatexEditor';
import { loadLib } from '../components/PdfViewer';
import { QuestionView } from '../components/QuestionView';
import { aiKeyStatus, getCurrentProfile } from '../lib/ai/client';
import { loadAiPrefs, thinkingFor } from '../lib/ai/prefs';
import { BO_CUC_SCHEMA, BO_CUC_SYSTEM, BO_CUC_USER, parseBoCuc } from '../lib/ai/tasks/bocuc';
import { checkCau, OCR_LO_SYSTEM, OCR_TRANG_SCHEMA, parsePageRange, parseTrang } from '../lib/ai/tasks/ocrtrang';
import { chiaLoNoi, demTheoPhan, gop, loiNhanLo, newProject, nudge, parseProject, STEPS, tach, type Cau, type Khung, type Loai, type Phan, type Project, type Trang } from '../lib/docde/project';
import { parseExTest } from '../lib/extest';
import { setImportHandoff, setScratchHandoff } from '../lib/importhandoff';
import { normalizeOcr } from '../lib/ocrnorm';
import { canvasShrink } from '../lib/pdfview';
import { channel, invoke, isDesktop } from '../lib/platform';

const DPI = 200;
const LOAI_TEN: Record<Loai, string> = { cau: 'Câu', hinh: 'Hình', bbt: 'BBT', dapan: 'Bảng đáp án' };
type Ev = { type: 'started' | 'waiting' | 'done' | 'failed' | 'finished'; pageId?: string; secs?: number; reply?: { text: string }; error?: { message: string }; done?: number; failed?: number; stoppedReason?: string | null };

const uid = () => Math.random().toString(36).slice(2, 9);
const toB64 = (buf: ArrayBuffer): string => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

/** Dựng ảnh JPEG các trang chọn của một PDF (≈200 dpi). */
async function renderPdf(buf: ArrayBuffer, nos: number[]): Promise<string[]> {
  const lib = await loadLib();
  const d = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, useWorkerFetch: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const out: string[] = [];
    for (const no of nos) {
      const pg = await d.getPage(no);
      const base = pg.getViewport({ scale: DPI / 72 });
      const vp = pg.getViewport({ scale: (DPI / 72) * canvasShrink(base.width, base.height, 4000, 12_000_000) });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push(c.toDataURL('image/jpeg', 0.88).split(',')[1]);
    }
    return out;
  } finally { void d.destroy(); }
}
async function imgToJpegB64(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = canvasShrink(bmp.width, bmp.height, 4000, 12_000_000);
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.88).split(',')[1];
}

/** Gọi hàng đợi ocr_run; trả về khi xong cả lượt. */
function runOcr(job: object, onEvent: (e: Ev) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const ch = channel<Ev>((e) => { onEvent(e); if (e.type === 'finished') resolve(); });
    invoke('ocr_run', { job, onEvent: ch }).catch((e) => reject(e instanceof Error ? e : new Error(String(e))));
  });
}

export function DocDeScreen() {
  const { toast } = useApp();
  const [list, setList] = useState<Project[] | null>(null);
  const [p, setP] = useState<Project | null>(null);
  const reload = useCallback(() => {
    if (!isDesktop()) { setList([]); return; }
    invoke<{ id: string; state: string }[]>('ocr_proj_list').then((l) => setList(l.map((x) => parseProject(x.state)).filter((x): x is Project => !!x)), (e) => { setList([]); toast(String(e)); });
  }, [toast]);
  useEffect(reload, [reload]);
  if (p) return <ProjectView key={p.id} init={p} onClose={() => { setP(null); reload(); }} />;
  return <ProjectList list={list} onOpen={setP} onCreated={setP} onDeleted={reload} />;
}

// ---------------- danh sách dự án + tạo mới (bước 1 Nguồn) ----------------
function ProjectList({ list, onOpen, onCreated, onDeleted }: { list: Project[] | null; onOpen(p: Project): void; onCreated(p: Project): void; onDeleted(): void }) {
  const { toast } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [range, setRange] = useState('');

  async function create(files: File[]) {
    if (!files.length || busy) return;
    if (!isDesktop()) { toast('Chỉ có trong bản cài trên Windows.'); return; }
    const p = newProject(files[0].name.replace(/\.[^.]+$/, ''), loadAiPrefs().model);
    let n = 0;
    try {
      for (const f of files) {
        if (/\.pdf$/i.test(f.name)) {
          const buf = await f.arrayBuffer();
          const lib = await loadLib();
          const doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false, useWorkerFetch: false, disableFontFace: true, verbosity: 0 }).promise;
          const total = doc.numPages; void doc.destroy();
          const nos = (files.length === 1 ? parsePageRange(range, total) : null) ?? Array.from({ length: total }, (_, i) => i + 1);
          for (let i = 0; i < nos.length; i += 4) {
            setBusy(`Dựng ảnh ${f.name}: trang ${nos[i]}/${total}…`);
            const imgs = await renderPdf(buf, nos.slice(i, i + 4));
            for (let j = 0; j < imgs.length; j++) { n++; await invoke('ocr_proj_save_page', { id: p.id, page: String(n), b64: imgs[j] }); p.pages.push({ n, file: f.name, no: nos[i + j], kieu: 'de', trangThai: 'cho' }); }
          }
          p.files.push({ name: f.name, pages: nos.length });
        } else if (/^image\/(png|jpeg|webp)$/.test(f.type)) {
          setBusy(`Lưu ảnh ${f.name}…`);
          n++; await invoke('ocr_proj_save_page', { id: p.id, page: String(n), b64: await imgToJpegB64(f) });
          p.pages.push({ n, file: f.name, no: 1, kieu: 'de', trangThai: 'cho' });
          p.files.push({ name: f.name, pages: 1 });
        } else toast(`Bỏ qua ${f.name}: chỉ nhận PDF, PNG, JPG, WebP.`);
      }
      if (!p.pages.length) { setBusy(''); return; }
      p.step = 1;
      await invoke('ocr_proj_save', { id: p.id, json: JSON.stringify(p) });
      setBusy(''); onCreated(p);
    } catch (e) { setBusy(''); toast(`Không tạo được dự án: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // Ctrl+V dán ảnh chụp màn hình
  useEffect(() => {
    const h = (e: ClipboardEvent) => { const fs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/')); if (fs.length) { e.preventDefault(); void create(fs); } };
    window.addEventListener('paste', h); return () => window.removeEventListener('paste', h);
  });

  return (
    <>
      <header className="page-head g3-head"><h1>Đọc đề</h1><div className="head-actions"><button type="button" className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => input.current?.click()}>+ Dự án đọc đề mới</button></div></header>
      <div className="simple dd-list">
        <div className="ocr-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void create(Array.from(e.dataTransfer.files)); }}>
          <div><b>{busy || 'Kéo thả PDF hoặc ảnh vào đây · hoặc Ctrl+V để dán ảnh chụp'}</b><span>Mỗi lần thả là một dự án, lưu trên máy (tắt app vẫn làm tiếp được). Nhiều tệp một lượt được.</span></div>
          <label className="dd-range"><span>Trang (một tệp PDF)</span><input value={range} onChange={(e) => setRange(e.target.value)} placeholder="vd 1-3, 5" /></label>
          <button type="button" className="btn" disabled={!!busy} onClick={() => input.current?.click()}>Chọn tệp…</button>
          <input ref={input} type="file" hidden multiple accept=".pdf,image/png,image/jpeg,image/webp" onChange={(e) => { void create(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </div>
        {list === null ? <p className="ocr-empty">Đang tải…</p> : list.length === 0 ? <p className="ocr-empty">Chưa có dự án nào.</p> : (
          <table className="dd-table"><thead><tr><th>Dự án</th><th>Tệp · trang</th><th>Tiến độ</th><th>Câu</th><th>Sửa lần cuối</th><th /></tr></thead><tbody>
            {list.map((x) => (
              <tr key={x.id}>
                <td><b>{x.name}</b></td><td>{x.files.length} tệp · {x.pages.length} trang</td>
                <td><span className="dd-mini" aria-label={`Bước ${x.step + 1}/7: ${STEPS[x.step]}`}>{STEPS.map((s, i) => <i key={s} className={i < x.step ? 'ok' : i === x.step ? 'run' : ''} />)}</span> {STEPS[x.step]}</td>
                <td>{x.chep.cau.length}</td><td>{new Date(x.updatedAt).toLocaleString('vi-VN')}</td>
                <td className="dd-act"><button type="button" className="btn btn-sm" onClick={() => onOpen(x)}>Mở tiếp</button><button type="button" className="btn btn-sm" aria-label={`Xoá dự án ${x.name}`} onClick={() => { if (confirm(`Xoá dự án "${x.name}" và ảnh trang của nó?`)) void invoke('ocr_proj_delete', { id: x.id }).then(onDeleted); }}>Xoá</button></td>
              </tr>
            ))}
          </tbody></table>
        )}
        <p className="dd-tip">Đọc bảng đáp án ở trang nào cũng gắn đúng câu · không bao giờ tự bịa đáp án (câu không có khoá in ⇒ Cần xác minh).</p>
      </div>
    </>
  );
}

// ---------------- một dự án ----------------
function ProjectView({ init, onClose }: { init: Project; onClose(): void }) {
  const { go, toast } = useApp();
  const [p, setP] = useState(init);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [plan, setPlan] = useState<{ ai: AiSendPlan; run(): void } | null>(null);
  const [run, setRun] = useState<{ id: string; text: string } | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const profile = getCurrentProfile();
  const prefs = useMemo(() => loadAiPrefs(), []);

  // lưu tự động
  const saveT = useRef<number | undefined>(undefined);
  const update = useCallback((f: (p: Project) => Project) => setP((cur) => { const nx = { ...f(cur), updatedAt: Date.now() }; window.clearTimeout(saveT.current); saveT.current = window.setTimeout(() => void invoke('ocr_proj_save', { id: nx.id, json: JSON.stringify(nx) }).catch((e) => toast(`Chưa lưu được dự án: ${String(e)}`)), 500); return nx; }), [toast]);

  useEffect(() => { if (profile) aiKeyStatus(profile).then((s) => setHasKey(s.hasKey), () => setHasKey(false)); }, [profile]);
  useEffect(() => {
    let live = true; const made: string[] = [];
    (async () => { for (const pg of init.pages) { const buf = await invoke<ArrayBuffer>('ocr_proj_read_page', { id: init.id, page: String(pg.n) }); if (!live) return; const u = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' })); made.push(u); setUrls((m) => ({ ...m, [pg.n]: u })); } })().catch((e) => toast(String(e)));
    return () => { live = false; made.forEach(URL.revokeObjectURL); };
  }, [init.id, init.pages, toast]);

  const b64 = (n: number) => invoke<ArrayBuffer>('ocr_proj_read_page', { id: p.id, page: String(n) }).then(toB64);
  const ready = hasKey && prefs.consent && !run;
  const why = !hasKey ? 'Chưa có khoá Gemini (Cài đặt › AI).' : !prefs.consent ? 'Bật "Cho phép gửi tới AI" trong Cài đặt › AI.' : '';

  function ask(task: string, calls: number, pages: number, go2: () => void) {
    setPlan({ ai: { task, model: p.model, questions: 0, calls, sends: [`${pages} ảnh trang đề của dự án "${p.name}"`, 'Hướng dẫn theo quy tắc ex_test của HEdu'] }, run: go2 });
  }

  // bước 2: khoanh bố cục
  async function runBoCuc(only?: number) {
    const pages = p.pages.filter((x) => only == null || x.n === only);
    const id = `bc-${Date.now()}`;
    setRun({ id, text: 'Đang khoanh bố cục…' });
    try {
      const imgs = await Promise.all(pages.map(async (x) => ({ id: String(x.n), mime: 'image/jpeg', dataB64: await b64(x.n) })));
      let done = 0;
      await runOcr({ jobId: id, model: p.model, system: BO_CUC_SYSTEM, user: BO_CUC_USER, schema: BO_CUC_SCHEMA, pages: imgs, thinkingLevel: thinkingFor(p.model), profileId: profile ?? undefined, parallel: 2, minGapMs: 3000 }, (e) => {
        if (e.type === 'waiting') setRun((r) => r && { ...r, text: `Google báo chậm lại — thử lại sau ${e.secs} giây` });
        if (e.type === 'failed') update((q) => ({ ...q, pages: q.pages.map((x) => String(x.n) === e.pageId ? { ...x, trangThai: 'loi' } : x) }));
        if (e.type === 'done' && e.reply) {
          done++; setRun((r) => r && { ...r, text: `Khoanh ${done}/${pages.length} trang` });
          const n = Number(e.pageId);
          try {
            const r = parseBoCuc(e.reply.text, n, uid);
            update((q) => ({ ...q, pages: q.pages.map((x) => x.n === n ? { ...x, kieu: r.kieu, trangThai: 'xong' } : x), boCuc: { chot: false, khung: [...q.boCuc.khung.filter((k) => k.page !== n), ...r.khung] } }));
          } catch { update((q) => ({ ...q, pages: q.pages.map((x) => x.n === n ? { ...x, trangThai: 'loi' } : x) })); }
        }
        if (e.type === 'finished') toast(e.stoppedReason ? `Đã dừng: ${e.stoppedReason}` : `Khoanh xong ${e.done} trang${e.failed ? `, ${e.failed} trang lỗi (bấm "Khoanh lại trang này")` : ''}.`);
      });
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
    setRun(null);
  }

  // bước 3: chép theo lô
  async function runChep(onlyLo?: number) {
    const los = chiaLoNoi(p.pages, p.boCuc.khung, 3);
    const todo = los.map((pages, i) => ({ pages, i })).filter((x) => onlyLo == null || x.i === onlyLo);
    const id = `ch-${Date.now()}`;
    setRun({ id, text: 'Đang chuẩn bị lô…' });
    update((q) => ({ ...q, step: Math.max(q.step, 2), chep: { ...q.chep, lo: los.map((pages, i) => q.chep.lo[i] && String(q.chep.lo[i].pages) === String(pages) && onlyLo !== i ? q.chep.lo[i] : { pages, trangThai: 'cho' }) } }));
    try {
      const jobPages = await Promise.all(todo.map(async ({ pages, i }) => {
        const [first, ...rest] = await Promise.all(pages.map(b64));
        const prevTail = p.chep.cau.filter((c) => c.lo === i - 1).map((c) => c.tex).join('\n');
        return { id: String(i), mime: 'image/jpeg', dataB64: first, more: rest.map((d) => ({ mime: 'image/jpeg', dataB64: d })), user: loiNhanLo(p, pages, prevTail) };
      }));
      let done = 0;
      await runOcr({ jobId: id, model: p.model, system: OCR_LO_SYSTEM, user: '', schema: OCR_TRANG_SCHEMA, pages: jobPages, thinkingLevel: thinkingFor(p.model), profileId: profile ?? undefined, parallel: 2, minGapMs: 4000 }, (e) => {
        const i = Number(e.pageId);
        const setLo = (st: Project['chep']['lo'][number]['trangThai'], loi?: string) => update((q) => ({ ...q, chep: { ...q.chep, lo: q.chep.lo.map((l, j) => j === i ? { ...l, trangThai: st, loi } : l) } }));
        if (e.type === 'started') setLo('doc');
        if (e.type === 'waiting') setRun((r) => r && { ...r, text: `Google báo chậm lại — thử lại sau ${e.secs} giây` });
        if (e.type === 'failed') setLo('loi', e.error?.message);
        if (e.type === 'done' && e.reply) {
          done++; setRun((r) => r && { ...r, text: `Chép ${done}/${todo.length} lô` });
          try {
            const t = parseTrang(e.reply.text);
            const cau: Cau[] = t.cau.map((c) => { const nm = normalizeOcr(c.tex); return { id: uid(), lo: i, soNguon: c.soNguon, phan: c.phan, dang: c.dang, tex: nm.tex, orig: c.tex, canXacMinh: c.canXacMinh, ok: [], loi: checkCau(nm.tex, c.dang) }; });
            update((q) => ({ ...q, chep: { lo: q.chep.lo.map((l, j) => j === i ? { ...l, trangThai: 'xong', loi: undefined } : l), cau: [...q.chep.cau.filter((c) => c.lo !== i), ...cau].sort((a, b) => a.lo - b.lo) } }));
          } catch { setLo('loi', 'AI trả kết quả sai khuôn — bấm Chép lại lô này.'); }
        }
        if (e.type === 'finished') toast(e.stoppedReason ? `Đã dừng: ${e.stoppedReason}` : `Chép xong ${e.done} lô${e.failed ? `, ${e.failed} lô lỗi` : ''}.`);
      });
    } catch (e) { toast(e instanceof Error ? e.message : String(e)); }
    setRun(null);
  }

  const toImport = () => { setImportHandoff(p.chep.cau.map((c) => c.tex.trim()).join('\n'), 'ocr'); go({ screen: 'import' }); };
  const toTex = () => { setScratchHandoff(p.name, p.chep.cau.map((c) => c.tex.trim()).join('\n\n')); go({ screen: 'tex' }); };

  return (
    <div className="dd-wrap">
      <header className="page-head g3-head dd-head">
        <h1><button type="button" className="dd-back" onClick={onClose} aria-label="Về danh sách dự án">Đọc đề</button> <span className="dd-sep">/</span> {p.name}</h1>
        <div className="head-actions">
          {run && <span className="ocr-run" role="status">{run.text}</span>}
          {run && <button type="button" className="btn btn-sm" onClick={() => void invoke('ocr_cancel', { jobId: run.id })}>Dừng</button>}
          {!run && why && <span className="dd-why">{why}</span>}
        </div>
      </header>
      <div className="dd-split">
        <aside className="dd-rail" aria-label="Dự án đọc đề">
          <div className="dd-proj"><small>DỰ ÁN</small><b>{p.name}</b><span>{p.files.length} tệp · {p.pages.length} trang · lưu tự động</span></div>
          <div className="dd-files">{p.files.map((f) => <div key={f.name} className="dd-file"><b className={/\.pdf$/i.test(f.name) ? 'pdf' : 'img'}>{/\.pdf$/i.test(f.name) ? 'PDF' : 'ẢNH'}</b><span>{f.name}<small>{f.pages} trang</small></span></div>)}</div>
          <ol className="dd-steps">{STEPS.map((s, i) => (
            <li key={s} className={i < p.step ? 'ok' : i === p.step ? 'cur' : i > 2 ? 'later' : ''}>
              <button type="button" disabled={i === 0 || i > 2 || i > p.step} onClick={() => update((q) => ({ ...q, step: i }))}><b>{i < p.step ? '✓' : i + 1}</b>{s}{i > 2 && <small>đợt sau</small>}</button>
            </li>))}
          </ol>
          <div className="dd-cost"><span>Model</span><input className="mono" value={p.model} onChange={(e) => update((q) => ({ ...q, model: e.target.value.trim() }))} aria-label="Model dùng cho dự án" /></div>
        </aside>
        {p.step === 1 && <BoCuc p={p} urls={urls} update={update} busy={!!run} canRun={ready} onRun={(only) => ask(only ? 'Khoanh lại bố cục một trang' : 'Khoanh bố cục trang đề', only ? 1 : p.pages.length, only ? 1 : p.pages.length, () => void runBoCuc(only))} />}
        {p.step >= 2 && <Chep p={p} urls={urls} update={update} busy={!!run} canRun={ready} onRun={(lo) => { const los = chiaLoNoi(p.pages, p.boCuc.khung, 3); ask('Chép đề theo lô (chỉ chép, không giải)', lo == null ? los.length : 1, lo == null ? los.flat().length : los[lo].length, () => void runChep(lo)); }} onImport={toImport} onTex={toTex} />}
      </div>
      {plan && <AiConsentDialog plan={plan.ai} onSend={() => { const r = plan.run; setPlan(null); r(); }} onCancel={() => setPlan(null)} />}
    </div>
  );
}

// ---------------- bước 2: Bố cục ----------------
function BoCuc({ p, urls, update, busy, canRun, onRun }: { p: Project; urls: Record<number, string>; update(f: (p: Project) => Project): void; busy: boolean; canRun: boolean; onRun(only?: number): void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [draw, setDraw] = useState<{ page: number; y0: number; x0: number; y1: number; x1: number } | null>(null);
  const k1 = p.boCuc.khung.find((k) => k.id === sel[sel.length - 1]);
  const setK = (id: string, f: (k: Khung) => Khung) => update((q) => ({ ...q, boCuc: { chot: false, khung: q.boCuc.khung.map((k) => k.id === id ? f(k) : k) } }));
  const dem = demTheoPhan(p.boCuc.khung);
  const hinhNo = new Map(p.boCuc.khung.filter((k) => k.loai === 'hinh' || k.loai === 'bbt').map((k, i) => [k.id, i + 1]));
  const daKhoanh = p.pages.some((x) => x.trangThai === 'xong');

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,select,textarea') || !sel.length) return;
      const step = e.altKey ? 2 : 10;
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (d[e.key]) { e.preventDefault(); sel.forEach((id) => setK(id, (k) => ({ ...k, box: nudge(k.box, d[e.key][0], d[e.key][1], e.shiftKey) }))); }
      if (e.key === 'Delete') { update((q) => ({ ...q, boCuc: { chot: false, khung: q.boCuc.khung.filter((k) => !sel.includes(k.id)) } })); setSel([]); }
      if (e.key === 'g' || e.key === 'G') { const ks = p.boCuc.khung.filter((k) => sel.includes(k.id)); const g = gop(ks); if (g) { update((q) => ({ ...q, boCuc: { chot: false, khung: [...q.boCuc.khung.filter((k) => !sel.includes(k.id)), g] } })); setSel([g.id]); } }
      if ((e.key === 't' || e.key === 'T') && k1) { const [a, b] = tach(k1, uid()); update((q) => ({ ...q, boCuc: { chot: false, khung: [...q.boCuc.khung.filter((k) => k.id !== k1.id), a, b] } })); setSel([b.id]); }
      if (e.key === 'Escape') setSel([]);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });

  const pt = (e: React.MouseEvent, el: HTMLElement) => { const r = el.getBoundingClientRect(); return [Math.round(((e.clientY - r.top) / r.height) * 1000), Math.round(((e.clientX - r.left) / r.width) * 1000)]; };

  return (
    <>
      <section className="dd-body">
        <div className="ocr-bar">
          {(['cau', 'hinh', 'bbt', 'dapan'] as Loai[]).map((l) => <span key={l} className={`chip dd-c-${l}`}>{LOAI_TEN[l]} <b>{p.boCuc.khung.filter((k) => k.loai === l).length}</b></span>)}
          <span className="sp" />
          <span className="muted" title="Kéo trên trang để thêm khung câu · bấm khung để chọn (Shift để chọn thêm) · mũi tên dịch, Shift+mũi tên đổi cỡ, Alt để dịch nhỏ · G gộp · T tách · Delete xoá · Esc bỏ chọn">Kéo để thêm · mũi tên chỉnh · G gộp · T tách · Delete xoá</span>
          <button type="button" className="btn btn-sm" disabled={busy || !canRun} onClick={() => onRun()}>{daKhoanh ? 'Khoanh lại tất cả' : `Khoanh ${p.pages.length} trang`}</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !p.boCuc.khung.some((k) => k.loai === 'cau')} onClick={() => update((q) => ({ ...q, step: 2, boCuc: { ...q.boCuc, chot: true } }))}>Chốt bố cục → Chép chữ</button>
        </div>
        <div className="dd-pages">
          {p.pages.map((pg) => (
            <figure key={pg.n} className={`dd-pg k-${pg.kieu}`}>
              <figcaption>Trang {pg.n} <small>({pg.file}{pg.file.endsWith('.pdf') ? ` tr.${pg.no}` : ''})</small>
                <select value={pg.kieu} aria-label={`Loại trang ${pg.n}`} onChange={(e) => update((q) => ({ ...q, pages: q.pages.map((x) => x.n === pg.n ? { ...x, kieu: e.target.value as Trang['kieu'] } : x) }))}>
                  <option value="de">đề</option><option value="dapan">bảng đáp án</option><option value="loigiai">lời giải (bỏ)</option><option value="bo">bìa/quảng cáo (bỏ)</option>
                </select>
                {pg.trangThai === 'loi' && <span className="err">lỗi</span>}
                <button type="button" className="btn btn-sm" disabled={busy || !canRun} onClick={() => onRun(pg.n)} title="Khoanh lại riêng trang này">↻</button>
              </figcaption>
              <div className="dd-pgb" onMouseDown={(e) => { if ((e.target as HTMLElement).closest('.bx')) return; const [y, x] = pt(e, e.currentTarget); setDraw({ page: pg.n, y0: y, x0: x, y1: y, x1: x }); }}
                onMouseMove={(e) => { if (draw?.page === pg.n) { const [y, x] = pt(e, e.currentTarget); setDraw({ ...draw, y1: y, x1: x }); } }}
                onMouseUp={() => { if (draw && Math.abs(draw.y1 - draw.y0) > 15 && Math.abs(draw.x1 - draw.x0) > 15) { const k: Khung = { id: uid(), page: draw.page, loai: 'cau', phan: k1?.phan ?? '', cau: '', box: [Math.min(draw.y0, draw.y1), Math.min(draw.x0, draw.x1), Math.max(draw.y0, draw.y1), Math.max(draw.x0, draw.x1)] }; update((q) => ({ ...q, boCuc: { chot: false, khung: [...q.boCuc.khung, k] } })); setSel([k.id]); } setDraw(null); }}>
                {urls[pg.n] ? <img src={urls[pg.n]} alt={`Trang ${pg.n}`} draggable={false} /> : <div className="dd-ph">Đang tải ảnh…</div>}
                {p.boCuc.khung.filter((k) => k.page === pg.n).map((k) => (
                  <button type="button" key={k.id} className={`bx ${k.loai}${sel.includes(k.id) ? ' sel' : ''}`} style={{ top: `${k.box[0] / 10}%`, left: `${k.box[1] / 10}%`, height: `${(k.box[2] - k.box[0]) / 10}%`, width: `${(k.box[3] - k.box[1]) / 10}%` }}
                    aria-label={`${LOAI_TEN[k.loai]} ${k.phan} ${k.cau}`} aria-pressed={sel.includes(k.id)} onClick={(e) => setSel((s) => e.shiftKey ? (s.includes(k.id) ? s.filter((x) => x !== k.id) : [...s, k.id]) : [k.id])}>
                    <span>{LOAI_TEN[k.loai]}{hinhNo.has(k.id) ? ` ${hinhNo.get(k.id)}` : ''}{k.phan || k.cau ? ` · ${k.phan}${k.phan && k.cau ? '.' : ''}${k.cau}` : ''}{k.vatTrang ? ' · vắt trang' : ''}</span>
                  </button>
                ))}
                {draw?.page === pg.n && <i className="bx draft" style={{ top: `${Math.min(draw.y0, draw.y1) / 10}%`, left: `${Math.min(draw.x0, draw.x1) / 10}%`, height: `${Math.abs(draw.y1 - draw.y0) / 10}%`, width: `${Math.abs(draw.x1 - draw.x0) / 10}%` }} />}
              </div>
            </figure>
          ))}
        </div>
      </section>
      <aside className="dd-side" aria-label="Đếm câu và khung đang chọn">
        <h5>ĐẾM THEO PHẦN</h5>
        {dem.length ? dem.map((d) => <div key={d.phan || '-'} className={`dd-count${d.thieu.length ? ' warn' : ''}`}><span>{d.phan ? `Phần ${d.phan}` : 'Không chia phần'}</span><b>{d.so} câu</b>{d.thieu.length > 0 && <small>Thiếu Câu {d.thieu.join(', ')} — kéo thêm khung hoặc sửa số câu</small>}</div>) : <p className="muted">Chưa có khung câu. Bấm "Khoanh" hoặc kéo trên trang.</p>}
        <h5>KHUNG ĐANG CHỌN {sel.length > 1 && `(${sel.length})`}</h5>
        {k1 ? (
          <div className="dd-prop">
            <label>Loại<select value={k1.loai} onChange={(e) => setK(k1.id, (k) => ({ ...k, loai: e.target.value as Loai }))}>{(Object.keys(LOAI_TEN) as Loai[]).map((l) => <option key={l} value={l}>{LOAI_TEN[l]}</option>)}</select></label>
            <div className="two2"><label>Phần<select value={k1.phan} onChange={(e) => setK(k1.id, (k) => ({ ...k, phan: e.target.value as Phan }))}>{['', 'I', 'II', 'III', 'IV'].map((x) => <option key={x} value={x}>{x || '—'}</option>)}</select></label>
              <label>Câu số<input value={k1.cau} inputMode="numeric" onChange={(e) => setK(k1.id, (k) => ({ ...k, cau: e.target.value.replace(/\D/g, '').slice(0, 3) }))} /></label></div>
            {k1.loai === 'cau' && <div className="dd-ck"><input id="dd-vat" type="checkbox" checked={!!k1.vatTrang} onChange={(e) => setK(k1.id, (k) => ({ ...k, vatTrang: e.target.checked || undefined }))} /><label htmlFor="dd-vat">Câu vắt sang trang sau (nối khi chép)</label></div>}
            <button type="button" className="btn btn-sm" onClick={() => { update((q) => ({ ...q, boCuc: { chot: false, khung: q.boCuc.khung.filter((k) => !sel.includes(k.id)) } })); setSel([]); }}>Xoá khung</button>
          </div>
        ) : <p className="muted">Bấm một khung trên trang để sửa.</p>}
        <h5>TRANG ĐẶC BIỆT</h5>
        {p.pages.filter((x) => x.kieu !== 'de').map((x) => <div key={x.n} className={`dd-count${x.kieu === 'dapan' ? '' : ' mute'}`}><span>Trang {x.n}</span><b>{x.kieu === 'dapan' ? 'bảng đáp án' : 'bỏ qua'}</b></div>)}
      </aside>
    </>
  );
}

// ---------------- bước 3: Chép chữ (3 cột) ----------------
function Chep({ p, urls, update, busy, canRun, onRun, onImport, onTex }: { p: Project; urls: Record<number, string>; update(f: (p: Project) => Project): void; busy: boolean; canRun: boolean; onRun(lo?: number): void; onImport(): void; onTex(): void }) {
  const [sel, setSel] = useState(0);
  const [filter, setFilter] = useState<'all' | 'cxm' | 'loi'>('all');
  const items = p.chep.cau;
  const shown = items.map((c, i) => ({ c, i })).filter(({ c }) => filter === 'all' || (filter === 'cxm' ? c.canXacMinh.length > c.ok.length : c.loi.length > 0));
  const order = shown.map((x) => x.i);
  const cur = items[sel];
  const lo = cur ? p.chep.lo[cur.lo] : undefined;
  const parsed = useMemo(() => { try { return cur ? parseExTest(cur.tex) : null; } catch { return null; } }, [cur]);
  const setTex = (tex: string) => update((q) => ({ ...q, chep: { ...q.chep, cau: q.chep.cau.map((c, i) => i === sel ? { ...c, tex, loi: checkCau(tex, c.dang) } : c) } }));
  const step = useCallback((d: 1 | -1) => setSel((s) => { const pos = order.indexOf(s); const n = pos < 0 ? order[0] : order[pos + d]; return n ?? s; }), [order.join()]);
  useEffect(() => { if (order.length && !order.includes(sel)) setSel(order[0]); }, [filter]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest('input,textarea,select,.cm-editor')) return; if (e.key === 'j') step(1); if (e.key === 'k') step(-1); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [step]);
  const los = p.chep.lo;
  const cxm = items.reduce((n, c) => n + c.canXacMinh.length - c.ok.length, 0);

  return (
    <section className="dd-body">
      <div className="ocr-bar">
        <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tất cả <b>{items.length}</b></button>
        <button type="button" className="chip y" aria-pressed={filter === 'cxm'} onClick={() => setFilter('cxm')}>Cần xác minh <b>{cxm}</b></button>
        <button type="button" className="chip r" aria-pressed={filter === 'loi'} onClick={() => setFilter('loi')}>Lỗi khuôn <b>{items.filter((c) => c.loi.length).length}</b></button>
        <span className="dd-los">{los.map((l, i) => <button type="button" key={i} className={`st-${l.trangThai}`} title={l.loi ?? `Lô ${i + 1}: trang ${l.pages.join(', ')}`} disabled={busy || !canRun} onClick={() => onRun(i)}>Lô {i + 1}{l.trangThai === 'loi' ? ' ↻' : ''}</button>)}</span>
        <span className="sp" />
        <button type="button" className="btn btn-sm" disabled={busy || !canRun} onClick={() => onRun()}>{los.length ? 'Chép lại tất cả' : 'Bắt đầu chép'}</button>
        <button type="button" className="btn btn-sm" disabled={busy || !items.length} onClick={onTex}>Mở trong Soạn TeX</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || !items.length} onClick={onImport}>Nhập vào Ngân hàng →</button>
      </div>
      {!items.length ? <p className="ocr-empty">{busy ? 'Đang chép lô đầu tiên…' : 'Chưa chép. Bấm "Bắt đầu chép": đề được chia lô 3 trang, câu vắt trang đi cùng lô, hình để mốc %%%HINH-n%%% (dựng ở bước Dựng hình).'}</p> : (
        <div className="ocr3 dd3">
          <section aria-label="Trang gốc">
            <div className="och"><b>Trang gốc</b><span className="muted">{lo ? `lô ${cur.lo + 1} · trang ${lo.pages.join(', ')}` : ''}</span></div>
            <div className="ocr-page">{lo?.pages.map((n) => urls[n] && <img key={n} className="dd-lopg" src={urls[n]} alt={`Trang ${n}`} />)}</div>
          </section>
          <section aria-label="Mã ex_test">
            <div className="och"><b>Mã ex_test</b><span className="muted">câu {cur?.phan ? `${cur.phan}.` : ''}{cur?.soNguon}</span><span className="sp" />{cur && (cur.loi.length ? <span className="ocr-tag err">{cur.loi.length} lỗi khuôn</span> : <span className="ocr-tag ok">✓ Đúng khuôn</span>)}</div>
            {cur && <LatexEditor key={cur.id} value={cur.tex} onChange={setTex} label={`Mã ex_test câu ${sel + 1}`} />}
            {cur && (cur.loi.length > 0 || cur.tex !== cur.orig) && <div className="ocr-fixes">
              {cur.tex !== cur.orig && <button type="button" className="btn btn-sm" onClick={() => setTex(cur.orig)}>Về bản AI chép (bỏ chuẩn hoá và sửa tay)</button>}
              {cur.loi.map((l) => <span key={l} className="err">{l}</span>)}
            </div>}
          </section>
          <section aria-label="Xem trước">
            <div className="och"><b>Xem trước</b><span className="sp" /><span className="pager"><button type="button" className="btn btn-sm" aria-label="Câu trước (K)" onClick={() => step(-1)}>‹</button> {sel + 1}/{items.length} <button type="button" className="btn btn-sm" aria-label="Câu sau (J)" onClick={() => step(1)}>›</button></span><kbd>J / K</kbd></div>
            <div className="ocr-pv">{cur && parsed ? <QuestionView p={parsed} number={sel + 1} raw={cur.tex} showSolution={false} /> : cur && <p className="ocr-empty">Chưa xem trước được — sửa mã ở cột giữa.</p>}</div>
            {cur && cur.canXacMinh.length > 0 && <div className="ocr-cxm"><b>Cần xác minh ({cur.canXacMinh.length - cur.ok.length})</b>
              {cur.canXacMinh.map((m, k) => <div key={k} className={cur.ok.includes(k) ? 'done' : ''}><span><i>{k + 1}</i>{m}</span>
                <button type="button" className="btn btn-sm" disabled={cur.ok.includes(k)} onClick={() => update((q) => ({ ...q, chep: { ...q.chep, cau: q.chep.cau.map((c, i) => i === sel ? { ...c, ok: [...c.ok, k] } : c) } }))}>{cur.ok.includes(k) ? 'Đã xem' : 'Đã đúng'}</button></div>)}</div>}
          </section>
        </div>
      )}
    </section>
  );
}
