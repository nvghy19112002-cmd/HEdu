// Hộp "Duyệt nhờ Claude" (màn Ngân hàng): xuất lô câu Chưa kiểm tra vào thư mục trao đổi (mặc định D:\HEdu-duyet); Claude
// (Claude Code, trong cuộc trò chuyện) tự giải lại từng câu, kiểm đề/đáp án/lời giải, ghi ket-qua-<lô>.json; HEdu nhập kết quả:
// xem trước → Áp dụng ("đạt" ⇒ Đã duyệt, "cần sửa" ⇒ Cần sửa + nhãn lý do) → Hoàn tác được. Không đè quyết định của giáo viên.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyChange, buildReviewLot, LOI, parseReviewResult, planReview, REVIEW_LOT_STATE_LABEL, REVIEW_PREFIX, reviewLotFileName, reviewLotRows, SKIP_WHY_LABEL,
  undoChange, type ReviewPlan, type ReviewResultFile, type SkipWhy, type XFile,
} from '../lib/claudereview';
import { BIG_OP, ensureRestorePoint } from '../lib/dbbackup';
import { invoke, isDesktop } from '../lib/platform';
import { getState, updateMany } from '../lib/store';
import type { Question } from '../lib/types';

const nf = new Intl.NumberFormat('vi-VN');
const SIZES = [50, 100, 200, 300];
const DIR_KEY = 'hedu.claudereview.dir';
const DONE_KEY = 'hedu.claudereview.imported';
const load = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* chỉ là tiện lợi */ } };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (ms: number) => (ms ? new Date(ms).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

interface Props {
  /** câu đang tick, hoặc danh sách đang lọc khi không tick câu nào */
  pool: readonly Question[];
  fromSelection?: boolean;
  /** vị trí đọc được của câu (Chương › Bài › Dạng) để Claude có ngữ cảnh */
  whereOf(q: Question): string;
  toast(m: string, action?: { label: string; run(): void }): void;
  onOpen(uid: string): void;
  onClose(): void;
}
type Loaded = { r: ReviewResultFile; plan: ReviewPlan; dropped: number; name: string; lo: string };
type Undo = { before: Map<string, Question>; after: Map<string, Question> };

export function ClaudeReviewDialog({ pool, fromSelection = false, whereOf, toast, onOpen, onClose }: Props) {
  const desktop = isDesktop();
  const [size, setSize] = useState(100);
  const [inclReviewed, setInclReviewed] = useState(false);
  const [dir, setDir] = useState<string>(() => load(DIR_KEY) ?? '');
  const [files, setFiles] = useState<XFile[]>([]);
  const [done, setDone] = useState<Set<string>>(() => { try { return new Set(JSON.parse(load(DONE_KEY) ?? '[]') as string[]); } catch { return new Set(); } });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const unreviewed = pool.filter((q) => !q.review).length;
  const rows = reviewLotRows(files, done);
  const pending = rows.find((r) => r.state === 'co-ket-qua') ?? null;

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [busy, onClose]);
  // thư mục mặc định: cạnh thư mục Gán ID (D:\HEdu-gan-id → D:\HEdu-duyet)
  useEffect(() => { if (desktop && !dir) invoke<string>('id_exchange_default').then((d) => { const x = d.replace(/HEdu-gan-id$/i, 'HEdu-duyet'); setDir(x); save(DIR_KEY, x); }).catch(() => undefined); }, [desktop, dir]);
  const refresh = useCallback(async () => { if (!desktop || !dir) return; try { setFiles(await invoke<XFile[]>('id_exchange_list', { dir })); } catch (e) { setErr(msg(e)); } }, [desktop, dir]);
  // Claude ghi kết quả trong lúc hộp đang mở: tự xem lại thư mục mỗi 5 giây
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 5000); return () => clearInterval(t); }, [refresh]);

  const pickDir = async () => {
    const open = window.__TAURI__?.dialog?.open;
    if (!open) return;
    const d = await open({ directory: true, multiple: false, title: 'Chọn thư mục trao đổi với Claude (duyệt câu)' });
    if (typeof d === 'string' && d) { setDir(d); save(DIR_KEY, d); setLoaded(null); }
  };

  const exportLot = async () => {
    setErr(null);
    const d = new Date();
    const p2 = (x: number) => String(x).padStart(2, '0');
    const lo = `${REVIEW_PREFIX}${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    const { lot } = buildReviewLot(pool, { lo, size, includeReviewed: inclReviewed, whereOf, now: d });
    const text = JSON.stringify(lot, null, 1);
    try {
      if (desktop && dir) { await invoke<string>('id_exchange_write', { dir, name: reviewLotFileName(lo), text }); await refresh(); }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = reviewLotFileName(lo); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
      toast(`Đã xuất lô ${lo}: ${nf.format(lot.cau.length)} câu cần duyệt. Nhắn Claude: “duyệt lô mới nhất”.`);
    } catch (e) { setErr(msg(e)); }
  };

  const readText = (text: string, name: string, lo: string) => {
    setErr(null); setLoaded(null); setResult(null); setUndo(null);
    const p = parseReviewResult(text);
    if (!p.ok) { setErr(`${name}: ${p.why}`); return; }
    setLoaded({ r: p.r, plan: planReview(p.r, getState().questions), dropped: p.dropped, name, lo: lo || p.r.lo });
  };
  const readRow = async (lo: string, file: string | null) => {
    if (!file) return;
    try { readText(await invoke<string>('id_exchange_read', { dir, name: file }), file, lo); } catch (e) { setErr(msg(e)); }
  };

  const apply = async () => {
    if (!loaded || busy) return;
    // lập lại kế hoạch trên ngân hàng HIỆN TẠI (câu có thể vừa bị sửa trong lúc xem)
    const plan = planReview(loaded.r, getState().questions);
    if (!plan.changes.length) { setErr('Không còn câu nào để áp dụng.'); return; }
    setBusy(true);
    const rp = await ensureRestorePoint('thu-cong', plan.changes.length >= BIG_OP);
    if (!rp.ok) { setBusy(false); setErr(rp.message); return; }
    const byUid = new Map(plan.changes.map((c) => [c.uid, c] as const));
    const before = new Map<string, Question>(), after = new Map<string, Question>();
    const r = await updateMany(byUid.keys(), (q) => { const c = byUid.get(q.uid)!; const n = applyChange(q, c); before.set(q.uid, q); after.set(q.uid, n); return n; });
    setBusy(false);
    if (!r.ok) { setErr('Chưa ghi được xuống đĩa nên chưa áp dụng câu nào. Hãy kiểm tra ổ đĩa rồi thử lại.'); return; }
    if (loaded.lo) { const n = new Set(done); n.add(loaded.lo); setDone(n); save(DONE_KEY, JSON.stringify([...n].slice(-500))); }
    const u = { before, after };
    setUndo(u);
    const m = `Lô ${loaded.lo || loaded.name}: ${nf.format(plan.dat)} câu → Đã duyệt · ${nf.format(plan.canSua)} câu → Cần sửa${plan.skipped.length ? ` · bỏ qua ${nf.format(plan.skipped.length)}` : ''}.`;
    setResult(m);
    setLoaded({ ...loaded, plan });
    toast(m, { label: 'Hoàn tác', run: () => void runUndo(u) });
  };
  const runUndo = async (u: Undo) => {
    setBusy(true);
    let kept = 0;
    const r = await updateMany(u.after.keys(), (q) => { const x = undoChange(q, u.before.get(q.uid)!, u.after.get(q.uid)!); if (!x) kept++; return x; });
    setBusy(false);
    setUndo(null);
    const m = r.ok ? `Đã hoàn tác ${nf.format(r.changed)} câu${kept ? ` (${nf.format(kept)} câu đã sửa tiếp nên giữ)` : ''}.` : 'Chưa hoàn tác được: hãy kiểm tra ổ đĩa rồi thử lại.';
    setResult(m); toast(m);
  };

  const P = loaded?.plan;
  const skipBy = P ? P.skipped.reduce<Partial<Record<SkipWhy, number>>>((m, s) => ({ ...m, [s.why]: (m[s.why] ?? 0) + 1 }), {}) : {};
  const fixList = P ? P.changes.filter((c) => c.to === 'needs_fix') : [];
  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm xl-panel cid" role="dialog" aria-modal="true" aria-label="Duyệt nhờ Claude">
        <h3>Duyệt nhờ Claude</h3>
        <div className="xl-panel-body">
          <p className="xl-meta">Claude tự giải lại từng câu, kiểm đề, đáp án đánh dấu và lời giải. Nhập kết quả: câu đạt → <b>Đã duyệt</b>, câu có lỗi → <b>Cần sửa</b> kèm nhãn lý do. Chỉ đổi câu <b>Chưa kiểm tra</b>; câu thầy/cô đã đánh dấu giữ nguyên. Có Hoàn tác.</p>

          {desktop && (
            <div className="cid-row cid-dir">
              <span>Thư mục trao đổi: <code>{dir || '…'}</code></span>
              <button type="button" className="btn btn-sm" onClick={() => void pickDir()}>Đổi…</button>
            </div>
          )}

          <section className="cid-step">
            <b>1 · Xuất lô cần duyệt</b>
            <span className="xl-meta">Lấy từ {nf.format(pool.length)} câu {fromSelection ? 'đang chọn (tick)' : 'đang lọc'}: {nf.format(unreviewed)} câu Chưa kiểm tra.</span>
            <label className="sw"><input type="checkbox" checked={inclReviewed} onChange={(e) => setInclReviewed(e.target.checked)} /> Gồm cả câu đã kiểm tra (chỉ để soát; kết quả không đè quyết định của thầy/cô)</label>
            <div className="cid-row">
              <label className="sm-n">Số câu mỗi lô
                <select className="sel" value={size} onChange={(e) => setSize(Number(e.target.value))}>{SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </label>
              <button type="button" className="btn btn-accent btn-sm" disabled={inclReviewed ? pool.length === 0 : unreviewed === 0} onClick={() => void exportLot()}>Xuất lô</button>
            </div>
            <span className="xl-meta">Rồi nhắn Claude trong cuộc trò chuyện: <b>“duyệt lô mới nhất”</b>. Claude ghi tệp kết quả vào cùng thư mục; danh sách bên dưới tự cập nhật.</span>
          </section>

          <section className="cid-step">
            <b>2 · Nhập kết quả của Claude</b>
            {rows.length > 0 && (
              <ul className="cid-lots">
                {rows.slice(0, 8).map((r) => (
                  <li key={r.lo}>
                    <span className="mono">{r.lo}</span>
                    <span className={`cid-st st-${r.state === 'co-ket-qua' ? 'co-de-xuat' : r.state}`}>{REVIEW_LOT_STATE_LABEL[r.state]}</span>
                    <span className="xl-meta">{when(r.at)}</span>
                    {r.resFile ? <button type="button" className="btn btn-sm" onClick={() => void readRow(r.lo, r.resFile)}>{r.state === 'da-nhap' ? 'Xem lại' : 'Xem kết quả'}</button> : <span />}
                  </li>
                ))}
              </ul>
            )}
            <div className="cid-row">
              <button type="button" className="btn btn-accent btn-sm" disabled={!pending || busy} onClick={() => pending && void readRow(pending.lo, pending.resFile)}>{pending ? `Xem kết quả mới nhất (${pending.lo})` : 'Chưa có kết quả mới'}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => fileIn.current?.click()}>Chọn tệp khác…</button>
              <input ref={fileIn} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readText(await f.text(), f.name, ''); }} />
              {loaded && <span className="xl-meta">{loaded.name} · {nf.format(loaded.r.cau.length)} dòng{loaded.dropped ? ` · ${loaded.dropped} dòng hỏng bị bỏ` : ''}</span>}
            </div>
            {result && <div className="note ok" role="status"><div className="note-body"><span>{result}</span>{undo && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void runUndo(undo)}>Hoàn tác lần này</button>}</div></div>}
            {err && <div className="note bad" role="alert"><div className="note-body"><span>{err}</span></div></div>}
            {P && !result && (
              <div className="cid-sum">
                <ul className="xl-lines">
                  <li><b>{nf.format(P.dat)}</b> câu đạt → Đã duyệt</li>
                  <li><b>{nf.format(P.canSua)}</b> câu cần sửa → Cần sửa (kèm nhãn lý do)</li>
                  {P.doubt.length > 0 && <li><b>{nf.format(P.doubt.length)}</b> câu thầy/cô đã duyệt nhưng Claude nghi có lỗi — chỉ báo, không đổi (xem danh sách dưới)</li>}
                  {(Object.keys(skipBy) as SkipWhy[]).map((k) => <li key={k} className="xl-meta">Bỏ qua {nf.format(skipBy[k] ?? 0)}: {SKIP_WHY_LABEL[k]}</li>)}
                </ul>
                <div className="cid-row">
                  <button type="button" className="btn btn-accent btn-sm" disabled={busy || !P.changes.length} onClick={() => void apply()}>{busy ? 'Đang áp dụng…' : `Áp dụng ${nf.format(P.changes.length)} câu`}</button>
                </div>
              </div>
            )}
            {(fixList.length > 0 || (P?.doubt.length ?? 0) > 0) && (
              <ul className="crv-list" aria-label="Câu Claude thấy có lỗi">
                {[...fixList.map((c) => c.item), ...(P?.doubt ?? [])].slice(0, 200).map((it) => (
                  <li key={it.k}>
                    <button type="button" className="btn btn-sm" onClick={() => onOpen(it.k)}>Mở</button>
                    <span className="crv-tags">{it.loi.map((l) => <span key={l} className="chip">{LOI[l]}</span>)}</span>
                    <span className="crv-note">{it.ghiChu || '—'}{it.dapAnDung ? <> · <b>Đáp án đúng: {it.dapAnDung}</b></> : null}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Đóng</button>
        </div>
      </div>
    </>
  );
}
