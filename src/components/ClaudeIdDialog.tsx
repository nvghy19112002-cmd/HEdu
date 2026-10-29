// Hộp "Gán ID nhờ Claude" (màn Ngân hàng): xuất lô câu cần gán ID cho AI ngoài (Claude qua gói Pro / Claude Code),
// rồi nhập tệp đề xuất: báo độ đúng trên câu đối chứng, đưa đề xuất vào hàng đợi Xác minh. Không câu nào bị đổi Dạng/ID ở đây.
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildLot, CONF_LABEL, parseProposal, pct, planImport, SKIP_LABEL, type ImportPlan, type ProposalFile, type SkipWhy } from '../lib/claudeid';
import { commitRecs, type Effective } from '../lib/idreview';
import { saveTextFile } from '../lib/savefile';
import { taxRevision } from '../lib/taxpath';
import { indexOf } from '../lib/taxonomy';
import type { Question, Taxonomy } from '../lib/types';

const nf = new Intl.NumberFormat('vi-VN');
const SIZES = [100, 200, 300, 500];

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
  const ix = useMemo(() => indexOf(tax), [tax]);
  const taxRev = useMemo(() => taxRevision(tax), [tax]);
  const [size, setSize] = useState(300);
  const [gold, setGold] = useState(true);
  const [plan, setPlan] = useState<{ p: ProposalFile; plan: ImportPlan; dropped: number; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);
  const need = useMemo(() => pool.filter((q) => { const e = effOf(q); return !(e.form === 'gv' && !e.unclassified); }).length, [pool, effOf]);
  const verified = pool.length - need;
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [busy, onClose]);
  const where = (formId: string) => { const p = ix.get(formId); return p && p.kind === 'form' ? `${p.lesson?.name ?? ''} › ${p.form?.name ?? ''}` : formId; };

  const exportLot = async () => {
    const d = new Date();
    const lo = `L${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const { lot, need: n, gold: g } = buildLot(pool, { tax, ix, taxRev, effOf, size, goldShare: gold ? 0.1 : 0, lo, seed: d.getTime() % 100000 });
    const name = `hedu-gan-id-${lo}.json`;
    const r = await saveTextFile(name, JSON.stringify(lot, null, 1), () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(lot, null, 1)], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
    if (r.kind === 'error') setErr(r.message);
    else if (r.kind !== 'cancelled') toast(`Đã xuất lô ${lo}: ${nf.format(n)} câu cần gán${g ? ` + ${nf.format(g)} câu đối chứng` : ''}. Gửi tệp cho Claude rồi nhập tệp đề xuất trả về.`);
  };

  const readProposal = async (f: File) => {
    setErr(null); setPlan(null);
    const r = parseProposal(await f.text());
    if (!r.ok) { setErr(r.why); return; }
    setPlan({ p: r.p, plan: planImport(r.p, all, { ix, taxRev, effOf }), dropped: r.dropped, name: f.name });
  };

  const apply = async () => {
    if (!plan || busy) return;
    setBusy(true);
    const ok = await commitRecs(plan.plan.recs);
    setBusy(false);
    if (!ok) { setErr('Chưa lưu được trạng thái xác minh (ổ đĩa đầy hoặc tệp bị chặn ghi). Không câu nào bị đổi.'); return; }
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

          <section className="cid-step">
            <b>1 · Xuất lô cần gán ID</b>
            <span className="xl-meta">Lấy từ {nf.format(pool.length)} câu đang lọc: {nf.format(need)} câu chưa được giáo viên xác minh Dạng (ưu tiên câu “Cần xem lại”), {nf.format(verified)} câu đã xác minh.</span>
            <div className="cid-row">
              <label className="sm-n">Số câu mỗi lô
                <select className="sel" value={size} onChange={(e) => setSize(Number(e.target.value))}>{SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </label>
              <label className="sw"><input type="checkbox" checked={gold} disabled={verified === 0} onChange={(e) => setGold(e.target.checked)} /> Trộn ngầm ~10% câu đã xác minh để đo độ đúng</label>
              <button type="button" className="btn btn-accent btn-sm" disabled={need === 0} onClick={() => void exportLot()}>Xuất lô…</button>
            </div>
            <span className="xl-meta">Đề trong lô đã bỏ ID cũ. Mở Claude Code, gửi tệp lô và nhờ: “Đọc tệp lô gán ID của HEdu, làm đúng phần huongDan và ghi kết quả ra tệp de-xuat.json”.</span>
          </section>

          <section className="cid-step">
            <b>2 · Nhập tệp đề xuất của Claude</b>
            <div className="cid-row">
              <button type="button" className="btn btn-sm" onClick={() => fileIn.current?.click()}>Chọn tệp đề xuất…</button>
              <input ref={fileIn} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readProposal(f); }} />
              {plan && <span className="xl-meta">{plan.name} · lô {plan.p.lo || '?'} · {nf.format(plan.p.cau.length)} dòng{plan.dropped ? ` · ${plan.dropped} dòng hỏng bị bỏ` : ''}</span>}
            </div>
            {err && <div className="note bad" role="alert"><div className="note-body"><span>{err}</span></div></div>}
            {P && g && (
              <div className="cid-sum">
                <div className={`note ${g.n >= 10 ? (g.dang / g.n >= 0.9 ? 'ok' : 'warn') : 'warn'}`}><div className="note-body">
                  <b>Độ đúng trên {nf.format(g.n)} câu đối chứng: Dạng {pct(g.dang, g.n)} · Bài {pct(g.bai, g.n)} · Chương {pct(g.chuong, g.n)} · Mức độ {pct(g.muc, g.n)}</b>
                  {g.n < 10 && <span>Ít câu đối chứng nên tỉ lệ chưa đáng tin; nên xác minh tay thêm câu rồi xuất lô có đối chứng.</span>}
                  {g.sai.slice(0, 5).map((s) => <span key={s.uid} className="xl-meta">Sai: đúng là {where(s.dung)} — Claude chọn {where(s.deXuat)}</span>)}
                </div></div>
                <ul className="xl-lines">
                  <li><b>{nf.format(P.dongY)}</b> câu Claude đồng ý Dạng đang lưu → “Máy phân loại” (nguồn AI ngoài)</li>
                  <li><b>{nf.format(P.khac)}</b> câu Claude đề xuất Dạng khác → “Cần xem lại”, thầy/cô bấm <kbd>P</kbd> “Dùng Dạng đề xuất” trong hàng đợi</li>
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
