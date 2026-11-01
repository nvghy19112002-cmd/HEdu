// Hộp "Gán ID nhờ Claude" của màn Xử lí TeX: xuất lô các câu CHƯA có ID của bàn nháp vào thư mục trao đổi (cùng nơi với Gán ID ở Ngân hàng);
// Claude đề xuất Dạng + mức; HEdu cho xem trước từng câu rồi mới chèn `%[ID]` vào bàn nháp (Hoàn tác được). Không ghi gì vào ngân hàng.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { latestPending, LOT_STATE_LABEL, lotFileName, lotRows, parseProposal, type ProposalFile, type XFile } from '../lib/claudeid';
import { effectiveOf, getRec, useIdReview } from '../lib/idreview';
import { invoke, isDesktop } from '../lib/platform';
import { applyScratchIds, blocksNeedingId, buildScratchLot, confLabel, planScratchIds, SCRATCH_LOT_PREFIX, SKIP_LABEL, type ExampleQ, type IdPlan, type SkipWhy } from '../lib/scratchid';
import type { ScratchScan } from '../lib/texscratch';
import { gradeLabel, indexOf, shortName } from '../lib/taxonomy';
import { taxRevision } from '../lib/taxpath';
import { getState } from '../lib/store';
import type { Taxonomy } from '../lib/types';

const nf = new Intl.NumberFormat('vi-VN');
const DIR_KEY = 'hedu.claudeid.dir';
const GR_KEY = 'hedu.scratchid.grades';
const load = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* chỉ là tiện lợi */ } };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const grades = (): Record<string, number | null> => { try { return JSON.parse(load(GR_KEY) ?? '{}') as Record<string, number | null>; } catch { return {}; } };

export function ScratchClaudeId({ text, scan, scope, tax, toast, onApply, onClose }: {
  text: string;
  scan: ScratchScan;
  scope: ReadonlySet<number> | null;
  tax: Taxonomy;
  toast(m: string): void;
  onApply(next: string, what: string): void;
  onClose(): void;
}) {
  const desktop = isDesktop();
  useIdReview();
  const ix = useMemo(() => indexOf(tax), [tax]);
  const taxRev = useMemo(() => taxRevision(tax), [tax]);
  const need = useMemo(() => blocksNeedingId(scan, scope), [scan, scope]);
  const [grade, setGrade] = useState<number | null>(() => (tax.grades.some((g) => g.grade === 12) ? 12 : tax.grades[0]?.grade ?? null));
  const [dir, setDir] = useState(() => load(DIR_KEY) ?? '');
  const [files, setFiles] = useState<XFile[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ plan: IdPlan; name: string; lo: string; p: ProposalFile; grade: number | null } | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => { if (desktop && !dir) invoke<string>('id_exchange_default').then((d) => { setDir(d); save(DIR_KEY, d); }).catch(() => undefined); }, [desktop, dir]);
  const refresh = useCallback(async () => { if (!desktop || !dir) return; try { setFiles(await invoke<XFile[]>('id_exchange_list', { dir })); } catch (e) { setErr(msg(e)); } }, [desktop, dir]);
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 5000); return () => clearInterval(t); }, [refresh]);
  const rows = useMemo(() => lotRows(files, new Set()).filter((r) => r.lo.startsWith(SCRATCH_LOT_PREFIX)).slice(0, 5), [files]);
  const pending = latestPending(rows);

  /** đề mẫu mỗi Dạng: câu trong ngân hàng mà giáo viên đã xác minh Dạng */
  const examples = (): ExampleQ[] => getState().questions.filter((q) => { const e = effectiveOf(q, getRec(q.uid), { ix, taxRev }); return e.form === 'gv' && !e.unclassified; }).map((q) => ({ formId: q.formId, latex: q.latex }));

  const exportLot = async () => {
    setErr(null);
    if (!need.length) return;
    const d = new Date(), p2 = (x: number) => String(x).padStart(2, '0');
    const lo = `${SCRATCH_LOT_PREFIX}${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    const { lot, count } = buildScratchLot(need, { tax, taxRev, grade, lo, now: d, examples: examples() });
    const body = JSON.stringify(lot, null, 1);
    try {
      if (desktop && dir) { await invoke<string>('id_exchange_write', { dir, name: lotFileName(lo), text: body }); await refresh(); }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' })); a.download = lotFileName(lo); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
      const g = grades(); g[lo] = grade; save(GR_KEY, JSON.stringify(Object.fromEntries(Object.entries(g).slice(-100))));
      setSent(lo);
      toast(`Đã xuất lô ${lo}: ${nf.format(count)} câu chưa có ID. Nhắn Claude: “làm lô mới nhất”.`);
    } catch (e) { setErr(msg(e)); }
  };

  const readText = (body: string, name: string, lo: string) => {
    setErr(null); setPlan(null);
    const r = parseProposal(body);
    if (!r.ok) { setErr(`${name}: ${r.why}`); return; }
    const use = lo || r.p.lo;
    const g = use in grades() ? grades()[use] : grade;
    // đối chiếu với văn bản HIỆN TẠI của các khối (câu đã sửa sau khi xuất lô sẽ bị bỏ qua)
    const cur = new Map(scan.blocks.map((b) => [b.n, b.text] as const));
    setPlan({ plan: planScratchIds(r.p, cur, { tax, ix, grade: g }), name, lo: use, p: r.p, grade: g });
  };
  const readRow = async (lo: string, file: string | null) => {
    if (!file) return;
    try { readText(await invoke<string>('id_exchange_read', { dir, name: file }), file, lo); } catch (e) { setErr(msg(e)); }
  };
  const onFile = async (f: File | undefined) => { if (f) readText(await f.text(), f.name, ''); };

  const apply = () => {
    if (!plan || !plan.plan.edits.length) return;
    onApply(applyScratchIds(text, scan, plan.plan.edits), 'Gán ID nhờ Claude');
  };
  const where = (formId: string) => { const p = ix.get(formId); return p && p.kind === 'form' ? `${shortName(p.chapter?.name ?? '')} › ${p.lesson?.name ?? ''} › ${p.form?.name ?? ''}` : formId; };
  const skipN = plan ? Object.values(plan.plan.skip).reduce((a, b) => a + (b ?? 0), 0) : 0;

  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm xl-panel tsx-fix" role="dialog" aria-modal="true" aria-label="Gán ID nhờ Claude">
        <h3>Gán ID nhờ Claude</h3>
        <div className="xl-panel-body">
          <p className="xl-meta">Gửi các câu <b>chưa có ID</b> của bàn nháp cho Claude phân loại (Dạng + mức độ). HEdu cho xem trước từng câu rồi mới chèn <code>%[ID]</code> vào bàn nháp; không đụng câu đã có ID, không ghi gì vào ngân hàng.</p>
          <b>1. Xuất lô</b>
          <p className="sys-hint">{need.length ? <>Có <b>{nf.format(need.length)} câu</b> chưa có ID{scope ? ' (trong các câu đã chọn)' : ''}.</> : 'Không có câu hoàn chỉnh nào thiếu ID.'}</p>
          <label className="tsx-rf"><span>Lớp</span>
            <select value={grade ?? ''} onChange={(e) => setGrade(e.target.value === '' ? null : Number(e.target.value))}>
              {tax.grades.map((g) => <option key={g.grade} value={g.grade}>{gradeLabel(g)}</option>)}
              <option value="">Chưa rõ (gửi Dạng của mọi lớp)</option>
            </select>
          </label>
          <div className="head-actions">
            <button type="button" className="btn btn-sm btn-accent" disabled={!need.length} onClick={() => void exportLot()}>Xuất lô cho Claude</button>
            {desktop && <span className="sys-hint">Thư mục trao đổi: {dir || '…'}</span>}
          </div>
          {sent && <p className="sys-hint">Đã xuất lô <b>{sent}</b>. Nhắn Claude: “làm lô mới nhất”, rồi quay lại bấm “Nhập đề xuất”.</p>}
          <b>2. Nhập đề xuất</b>
          {desktop
            ? (rows.length === 0 ? <p className="sys-hint">Chưa có lô nào của bàn nháp trong thư mục trao đổi.</p>
              : <ul className="tsx-lots">{rows.map((r) => (
                <li key={r.lo}><span><b>{r.lo}</b> · {LOT_STATE_LABEL[r.state]}</span>
                  {r.propFile && <button type="button" className="btn btn-sm" onClick={() => void readRow(r.lo, r.propFile)}>Xem đề xuất</button>}</li>
              ))}</ul>)
            : <label className="btn btn-sm">Chọn tệp đề xuất (de-xuat-….json)<input type="file" accept=".json,application/json" hidden onChange={(e) => void onFile(e.target.files?.[0])} /></label>}
          {desktop && pending && !plan && <p className="sys-hint">Lô <b>{pending.lo}</b> đã có đề xuất của Claude.</p>}
          {err && <p className="q-warn" role="alert">{err}</p>}
          {plan && (
            <>
              <b>3. Xem trước ({plan.name})</b>
              <p className="sys-hint">{nf.format(plan.plan.edits.length)}/{nf.format(plan.plan.total)} câu sẽ được chèn ID{skipN ? `; ${nf.format(skipN)} câu bỏ qua` : ''}.</p>
              {skipN > 0 && <ul className="tsx-skips">{(Object.keys(plan.plan.skip) as SkipWhy[]).map((k) => <li key={k}>{nf.format(plan.plan.skip[k] ?? 0)} — {SKIP_LABEL[k]}</li>)}</ul>}
              {plan.plan.edits.length > 0 && (
                <ol className="tsx-diff">
                  {plan.plan.edits.slice(0, 200).map((e) => (
                    <li key={e.n}><span className="tsx-ln">Câu {e.n}</span><ins>{e.code} · {where(e.dang)} · {confLabel(e.chac)}{e.lyDo ? ` — ${e.lyDo}` : ''}</ins></li>
                  ))}
                  {plan.plan.edits.length > 200 && <li className="sys-hint">… và {nf.format(plan.plan.edits.length - 200)} câu nữa</li>}
                </ol>
              )}
            </>
          )}
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>
          <button type="button" className="btn btn-accent" disabled={!plan || !plan.plan.edits.length} onClick={apply}>Chèn ID vào bàn nháp{plan?.plan.edits.length ? ` (${nf.format(plan.plan.edits.length)} câu)` : ''}</button>
        </div>
      </div>
    </>
  );
}
