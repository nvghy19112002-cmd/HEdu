// Hộp "Gán ID nhờ Claude" (màn Ngân hàng): xuất lô câu cần gán ID vào THƯ MỤC TRAO ĐỔI cố định; Claude (Claude Code, trong cuộc
// trò chuyện) đọc lô và ghi tệp đề xuất vào cùng thư mục; HEdu nhập đề xuất mới nhất: báo độ đúng trên câu đối chứng, đưa đề xuất
// vào hàng đợi Xác minh. Không câu nào bị đổi Dạng/ID ở đây.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildLot, CONF_LABEL, RECHECK_PREFIX, latestPending, LOT_STATE_LABEL, lotFileName, lotRows, parseProposal, pct, planImport, SKIP_LABEL,
  type ImportPlan, type LotRow, type ProposalFile, type SkipWhy, type XFile,
} from '../lib/claudeid';
import { commitRecs, type Effective } from '../lib/idreview';
import { invoke, isDesktop } from '../lib/platform';
import { taxRevision } from '../lib/taxpath';
import { indexOf } from '../lib/taxonomy';
import type { Question, Taxonomy } from '../lib/types';

const nf = new Intl.NumberFormat('vi-VN');
const SIZES = [100, 200, 300, 500];
const DIR_KEY = 'hedu.claudeid.dir';
const DONE_KEY = 'hedu.claudeid.imported';
const load = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* chỉ là tiện lợi */ } };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (ms: number) => (ms ? new Date(ms).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

interface Props {
  /** câu đang lọc ở Ngân hàng (lô lấy từ đây) */
  pool: readonly Question[];
  /** toàn bộ ngân hàng (đề xuất được đối chiếu với câu hiện có) */
  all: readonly Question[];
  tax: Taxonomy;
  effOf(q: Question): Effective;
  toast(m: string): void;
  onClose(): void;
  onOpenQueue(): void;
}

export function ClaudeIdDialog({ pool, all, tax, effOf, toast, onClose, onOpenQueue }: Props) {
  const desktop = isDesktop();
  const ix = useMemo(() => indexOf(tax), [tax]);
  const taxRev = useMemo(() => taxRevision(tax), [tax]);
  const [size, setSize] = useState(300);
  const [gold, setGold] = useState(true);
  // Kiểm tra lại: xuất MỌI câu đang lọc (kể cả câu đã xác minh) để Claude soát lại Dạng và mức độ; câu vẫn nằm nguyên trong ngân hàng
  const [recheck, setRecheck] = useState(false);
  const [dir, setDir] = useState<string>(() => load(DIR_KEY) ?? '');
  const [files, setFiles] = useState<XFile[]>([]);
  const [done, setDone] = useState<Set<string>>(() => { try { return new Set(JSON.parse(load(DONE_KEY) ?? '[]') as string[]); } catch { return new Set(); } });
  const [plan, setPlan] = useState<{ p: ProposalFile; plan: ImportPlan; dropped: number; name: string; lo: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);
  const need = useMemo(() => pool.filter((q) => { const e = effOf(q); return !(e.form === 'gv' && !e.unclassified); }).length, [pool, effOf]);
  const verified = pool.length - need;
  const rows = useMemo(() => lotRows(files, done), [files, done]);
  const pending = latestPending(rows);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [busy, onClose]);
  // thư mục mặc định (D:\HEdu-gan-id nếu có ổ D)
  useEffect(() => { if (desktop && !dir) invoke<string>('id_exchange_default').then((d) => { setDir(d); save(DIR_KEY, d); }).catch(() => undefined); }, [desktop, dir]);
  const refresh = useCallback(async () => { if (!desktop || !dir) return; try { setFiles(await invoke<XFile[]>('id_exchange_list', { dir })); } catch (e) { setErr(msg(e)); } }, [desktop, dir]);
  // Claude ghi tệp đề xuất trong lúc hộp đang mở: tự xem lại thư mục mỗi 5 giây
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 5000); return () => clearInterval(t); }, [refresh]);
  const where = (formId: string) => { const p = ix.get(formId); return p && p.kind === 'form' ? `${p.lesson?.name ?? ''} › ${p.form?.name ?? ''}` : formId; };

  const pickDir = async () => {
    const open = window.__TAURI__?.dialog?.open;
    if (!open) return;
    const d = await open({ directory: true, multiple: false, title: 'Chọn thư mục trao đổi với Claude' });
    if (typeof d === 'string' && d) { setDir(d); save(DIR_KEY, d); setPlan(null); }
  };

  const exportLot = async () => {
    setErr(null);
    const d = new Date();
    const p2 = (x: number) => String(x).padStart(2, '0');
    const lo = `${recheck ? RECHECK_PREFIX : 'L'}${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    const { lot, need: n, gold: g } = buildLot(pool, { tax, ix, taxRev, effOf, size, goldShare: gold ? 0.1 : 0, lo, seed: d.getTime() % 100000, recheck });
    const text = JSON.stringify(lot, null, 1);
    try {
      if (desktop && dir) {
        await invoke<string>('id_exchange_write', { dir, name: lotFileName(lo), text });
        await refresh();
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = lotFileName(lo); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      toast(`Đã xuất lô ${lo}: ${nf.format(n)} câu ${recheck ? 'cần kiểm tra lại' : 'cần gán'}${g ? ` + ${nf.format(g)} câu đối chứng` : ''}. Nhắn Claude: “làm lô mới nhất”.`);
    } catch (e) { setErr(msg(e)); }
  };

  const readText = (text: string, name: string, lo: string) => {
    setErr(null); setPlan(null);
    const r = parseProposal(text);
    if (!r.ok) { setErr(`${name}: ${r.why}`); return; }
    setPlan({ p: r.p, plan: planImport(r.p, all, { ix, taxRev, effOf }), dropped: r.dropped, name, lo: lo || r.p.lo });
  };
  const readRow = async (r: LotRow) => {
    if (!r.propFile) return;
    try { readText(await invoke<string>('id_exchange_read', { dir, name: r.propFile }), r.propFile, r.lo); } catch (e) { setErr(msg(e)); }
  };

  const apply = async () => {
    if (!plan || busy) return;
    setBusy(true);
    const ok = await commitRecs(plan.plan.recs);
    setBusy(false);
    if (!ok) { setErr('Chưa lưu được trạng thái xác minh (ổ đĩa đầy hoặc tệp bị chặn ghi). Không câu nào bị đổi.'); return; }
    if (plan.lo) { const n = new Set(done); n.add(plan.lo); setDone(n); save(DONE_KEY, JSON.stringify([...n].slice(-500))); }
    toast(`Đã đưa ${nf.format(plan.plan.recs.length)} đề xuất vào hàng đợi Xác minh (${nf.format(plan.plan.khac)} câu cần xem lại). Không câu nào bị đổi Dạng hay ID.`);
    setPlan(null);
  };

  const P = plan?.plan;
  const g = P?.gold;
  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm xl-panel cid" role="dialog" aria-modal="true" aria-label="Gán ID nhờ Claude">
        <h3>Gán ID nhờ Claude</h3>
        <div className="xl-panel-body">
          <p className="xl-meta">Claude chỉ <b>đề xuất</b>; HEdu đưa đề xuất vào hàng đợi Xác minh để thầy/cô duyệt. Không câu nào bị đổi Dạng hay ID cho tới khi thầy/cô xác nhận.</p>

          {desktop && (
            <div className="cid-row cid-dir">
              <span>Thư mục trao đổi: <code>{dir || '…'}</code></span>
              <button type="button" className="btn btn-sm" onClick={() => void pickDir()}>Đổi…</button>
            </div>
          )}

          <section className="cid-step">
            <b>1 · Xuất lô {recheck ? 'kiểm tra lại' : 'cần gán ID'}</b>
            <span className="xl-meta">Lấy từ {nf.format(pool.length)} câu đang lọc: {nf.format(need)} câu chưa được giáo viên xác minh Dạng (ưu tiên câu “Cần xem lại”), {nf.format(verified)} câu đã xác minh.</span>
            <label className="sw"><input type="checkbox" checked={recheck} onChange={(e) => setRecheck(e.target.checked)} /> Kiểm tra lại cả câu đã xác minh (Claude soát Dạng và mức độ của mọi câu đang lọc; câu không bị xoá hay đổi)</label>
            <div className="cid-row">
              <label className="sm-n">Số câu mỗi lô
                <select className="sel" value={size} onChange={(e) => setSize(Number(e.target.value))}>{SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </label>
              <label className="sw"><input type="checkbox" checked={gold && !recheck} disabled={verified === 0 || recheck} onChange={(e) => setGold(e.target.checked)} /> Trộn ngầm ~10% câu đã xác minh để đo độ đúng</label>
              <button type="button" className="btn btn-accent btn-sm" disabled={recheck ? pool.length === 0 : need === 0} onClick={() => void exportLot()}>Xuất lô</button>
            </div>
            {recheck && pool.length > size && <span className="xl-meta">Đang lọc {nf.format(pool.length)} câu, lô chỉ lấy {nf.format(size)} câu đầu. Hãy chọn mục nhỏ hơn trong Cây mục lục (từng Bài hoặc Dạng) để kiểm hết.</span>}
            <span className="xl-meta">Rồi nhắn Claude trong cuộc trò chuyện: <b>“làm lô mới nhất”</b>. Claude đọc lô trong thư mục trên và ghi tệp đề xuất vào cùng chỗ; danh sách bên dưới tự cập nhật.</span>
          </section>

          <section className="cid-step">
            <b>2 · Nhập đề xuất của Claude</b>
            {rows.length > 0 && (
              <ul className="cid-lots">
                {rows.slice(0, 8).map((r) => (
                  <li key={r.lo}>
                    <span className="mono">{r.lo}</span>
                    <span className={`cid-st st-${r.state}`}>{LOT_STATE_LABEL[r.state]}</span>
                    <span className="xl-meta">{when(r.at)}</span>
                    {r.propFile ? <button type="button" className="btn btn-sm" onClick={() => void readRow(r)}>{r.state === 'da-nhap' ? 'Xem lại' : 'Nhập'}</button> : <span />}
                  </li>
                ))}
              </ul>
            )}
            <div className="cid-row">
              <button type="button" className="btn btn-accent btn-sm" disabled={!pending} onClick={() => { if (pending) void readRow(pending); }}>{pending ? `Nhập đề xuất mới nhất (${pending.lo})` : 'Chưa có đề xuất mới'}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => fileIn.current?.click()}>Chọn tệp khác…</button>
              <input ref={fileIn} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readText(await f.text(), f.name, ''); }} />
              {plan && <span className="xl-meta">{plan.name} · {nf.format(plan.p.cau.length)} dòng{plan.dropped ? ` · ${plan.dropped} dòng hỏng bị bỏ` : ''}</span>}
            </div>
            {err && <div className="note bad" role="alert"><div className="note-body"><span>{err}</span></div></div>}
            {P && g && (
              <div className="cid-sum">
                <div className={`note ${g.n >= 10 ? (g.dang / g.n >= 0.9 ? 'ok' : 'warn') : 'warn'}`}><div className="note-body">
                  <b>{g.n ? `Độ đúng trên ${nf.format(g.n)} câu ${P.recheck ? 'thầy/cô đã xác minh' : 'đối chứng'}: Dạng ${pct(g.dang, g.n)} · Bài ${pct(g.bai, g.n)} · Chương ${pct(g.chuong, g.n)} · Mức độ ${pct(g.muc, g.n)}` : 'Lô này không có câu đối chứng nên chưa đo được độ đúng.'}</b>
                  {g.n > 0 && g.n < 10 && <span>Ít câu đối chứng nên tỉ lệ chưa đáng tin; nên xác minh tay thêm câu rồi xuất lô có đối chứng.</span>}
                  {g.sai.slice(0, 5).map((s) => <span key={s.uid} className="xl-meta">Sai: đúng là {where(s.dung)} — Claude chọn {where(s.deXuat)}</span>)}
                </div></div>
                <ul className="xl-lines">
                  <li><b>{nf.format(P.dongY)}</b> câu Claude đồng ý Dạng đang lưu → {P.recheck ? 'câu đã xác minh giữ nguyên, câu chưa xác minh thành' : ''} “Máy phân loại” (nguồn AI ngoài)</li>
                  <li><b>{nf.format(P.khac)}</b> câu Claude đề xuất Dạng khác → “Cần xem lại” (Dạng đang lưu giữ nguyên), thầy/cô bấm <kbd>P</kbd> “Dùng Dạng đề xuất” hoặc <kbd>Y</kbd> giữ Dạng cũ trong hàng đợi</li>
                  {P.mucKhac > 0 && <li><b>{nf.format(P.mucKhac)}</b> câu Claude đề xuất mức độ khác → thầy/cô bấm <kbd>K</kbd> “Dùng mức đề xuất” hoặc <kbd>M</kbd> giữ mức cũ</li>}
                  {(['cao', 'vua', 'thap'] as const).map((c) => P.theoChac[c].dongY + P.theoChac[c].khac > 0 && <li key={c} className="xl-meta">{CONF_LABEL[c]}: {nf.format(P.theoChac[c].dongY)} đồng ý · {nf.format(P.theoChac[c].khac)} khác</li>)}
                  {(Object.keys(P.skip) as SkipWhy[]).map((k) => <li key={k} className="xl-meta">Bỏ qua {nf.format(P.skip[k] ?? 0)}: {SKIP_LABEL[k]}</li>)}
                </ul>
                <div className="cid-row">
                  <button type="button" className="btn btn-accent btn-sm" disabled={busy || !P.recs.length} onClick={() => void apply()}>{busy ? 'Đang lưu…' : `Đưa ${nf.format(P.recs.length)} đề xuất vào hàng đợi Xác minh`}</button>
                </div>
              </div>
            )}
          </section>
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Đóng</button>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { onClose(); onOpenQueue(); }}>Mở hàng đợi Xác minh</button>
        </div>
      </div>
    </>
  );
}
