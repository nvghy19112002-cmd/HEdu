// Màn "Sức khoẻ ngân hàng": quét mọi câu theo từng đợt nhỏ (không treo giao diện) và liệt kê những chỗ cần xem lại.
// CHỈ ĐỌC: không sửa câu nào; bấm "Sửa" để mở câu ở màn Soạn.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { addToReport, emptyReport, HEALTH, healthFlags, type HealthKey, type HealthReport } from '../lib/bankhealth';
import { useTaxonomy } from '../lib/curriculum';
import { parseExTest } from '../lib/extest';
import { seqLabel } from '../lib/id';
import { approveRun } from '../lib/approverun';
import { planApprove } from '../lib/approveids';
import { effectiveOf, getRec, useIdReview } from '../lib/idreview';
import { useBank } from '../lib/store';
import { indexOf } from '../lib/taxonomy';
import { taxRevision } from '../lib/taxpath';

const nf = new Intl.NumberFormat('vi-VN');
const SHOW = 100;
const TONE: Record<string, string> = { loi: 'bad', canh: 'warn', tin: 'ok' };
const stemOf = (latex: string) => parseExTest(latex).stem.replace(/\s+/g, ' ').trim().slice(0, 110) || '(đề bài trống)';

export function HealthScreen() {
  const { go } = useApp();
  const { questions } = useBank();
  const { tax } = useTaxonomy();
  const ix = useMemo(() => indexOf(tax), [tax]);
  const rev = taxRevision(tax);
  const reviewVer = useIdReview();
  const [rep, setRep] = useState<HealthReport>(() => emptyReport(questions.length));
  const [running, setRunning] = useState(false);
  const [again, setAgain] = useState(0);
  const [open, setOpen] = useState<HealthKey | null>(null);
  const [inclFix, setInclFix] = useState(false);
  const [apBusy, setApBusy] = useState(false);
  const [apMsg, setApMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const plan = useMemo(() => planApprove(questions, (q) => effectiveOf(q, getRec(q.uid), { ix, taxRev: rev }), { includeNeedsFix: inclFix }), [questions, ix, rev, reviewVer, inclFix]);
  const doApprove = async () => {
    const n = new Set([...plan.review, ...plan.verify]).size;
    if (!n) return;
    if (!window.confirm(`Sẽ đặt “Đã duyệt” cho ${plan.review.length} câu và xác minh Dạng/mức độ cho ${plan.verify.length} câu (tổng ${n} câu đã có ID). HEdu tạo điểm khôi phục trước khi ghi. Tiếp tục?`)) return;
    setApBusy(true); setApMsg(null);
    try { setApMsg(await approveRun(plan, rev, (q) => effectiveOf(q, getRec(q.uid), { ix, taxRev: rev }))); } finally { setApBusy(false); }
  };
  const byUid = useMemo(() => new Map(questions.map((q) => [q.uid, q] as const)), [questions]);

  // quét theo đợt 60 câu, nhường chỗ cho giao diện giữa các đợt; đổi ngân hàng/cây/xác minh ⇒ quét lại
  useEffect(() => {
    let stop = false;
    const r = emptyReport(questions.length);
    setRep(r); setRunning(questions.length > 0);
    let i = 0;
    const step = () => {
      if (stop) return;
      const until = Math.min(i + 60, questions.length);
      for (; i < until; i++) {
        const q = questions[i];
        addToReport(r, q.uid, healthFlags(q, effectiveOf(q, getRec(q.uid), { ix, taxRev: rev })));
      }
      setRep({ ...r, counts: { ...r.counts } });
      if (i < questions.length) setTimeout(step, 0); else setRunning(false);
    };
    const t = setTimeout(step, 0);
    return () => { stop = true; clearTimeout(t); };
  }, [questions, ix, rev, reviewVer, again]);

  const pct = rep.total ? Math.round((rep.scanned / rep.total) * 100) : 100;
  const heavy = HEALTH.filter((h) => h.tone !== 'tin').reduce((a, h) => a + rep.counts[h.key], 0);

  return (
    <>
      <header className="page-head g3-head">
        <div className="g3-crumb">
          <h1>Sức khoẻ ngân hàng</h1>
          <span className="sys-hint">Quét mọi câu và đếm những chỗ nên xem lại. Bảng quét chỉ đọc; phần “Duyệt hàng loạt” bên dưới là nơi duy nhất ghi (sau khi bạn xác nhận). Nghi trùng kiểm ở màn Kiểm tra trùng trong Ngân hàng.</span>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-sm btn-accent" disabled={running} onClick={() => setAgain((n) => n + 1)}>Kiểm tra lại toàn kho</button>
          <button type="button" className="btn btn-sm" onClick={() => go({ screen: 'bank' })}>Về Ngân hàng</button>
        </div>
      </header>
      <div className="simple">
        {!running && rep.total > 0 && (() => {
          const score = Math.round((rep.clean / rep.total) * 100);
          const word = score >= 90 ? 'Ngân hàng rất khoẻ' : score >= 75 ? 'Ngân hàng khá khoẻ' : score >= 50 ? 'Ngân hàng cần chăm sóc' : 'Ngân hàng còn nhiều việc';
          const jobs = HEALTH.filter((h) => h.tone !== 'tin' && rep.counts[h.key] > 0).length;
          return (
            <div className="hl-hero">
              <div className="hl-ring" style={{ ['--p' as string]: `${score}` } as React.CSSProperties} role="img" aria-label={`Điểm sức khoẻ ${score} trên 100`}><b>{score}</b></div>
              <div className="hl-hero-t"><b>{word}</b><span>{nf.format(rep.clean)}/{nf.format(rep.total)} câu không có vấn đề nặng · {jobs ? `${jobs} việc nên xử lí` : 'không có việc nào cần xử lí'}</span></div>
            </div>
          );
        })()}
        {(running || rep.total === 0) && <div className="panel hl-panel" role="status" aria-live="polite">
          {running
            ? <span>Đang quét {nf.format(rep.scanned)}/{nf.format(rep.total)} câu ({pct}%)…</span>
            : rep.total === 0
              ? <span>Ngân hàng chưa có câu nào.</span>
              : <span><b>{nf.format(rep.clean)}</b> / {nf.format(rep.total)} câu không có vấn đề nặng ({Math.round((rep.clean / rep.total) * 100)}%). {heavy === 0 ? 'Không có lỗi hay cảnh báo nào.' : `Còn ${nf.format(heavy)} chỗ lỗi hoặc cảnh báo cần xem.`}</span>}
        </div>}
        <div className="panel hl-panel" style={{ display: 'grid', gap: 8 }}>
          <b>Duyệt hàng loạt các câu đã có ID</b>
          <span className="xl-meta">Đặt “Đã duyệt” và xác minh Dạng + mức độ cho mọi câu đã có ID. Bỏ qua: câu chưa có ID ({nf.format(plan.skippedNoId)}), câu có Dạng “cần xem lại” ({nf.format(plan.skippedXemLai)}){inclFix ? '' : `, câu bạn đã đánh “Cần sửa” (${nf.format(plan.skippedNeedsFix)})`}.</span>
          <span>Cần đặt “Đã duyệt”: <b>{nf.format(plan.review.length)}</b> câu · cần xác minh Dạng/mức độ: <b>{nf.format(plan.verify.length)}</b> câu · đã đủ: {nf.format(plan.already)} câu.</span>
          <label className="sw hl-sw">Gồm cả câu đang “Cần sửa”<input type="checkbox" checked={inclFix} disabled={apBusy} onChange={(e) => setInclFix(e.target.checked)} /></label>
          <div><button type="button" className="btn btn-sm btn-dark" disabled={apBusy || running || !(plan.review.length + plan.verify.length)} onClick={() => { void doApprove(); }}>{apBusy ? 'Đang ghi…' : 'Duyệt và xác minh các câu đã có ID…'}</button></div>
          {apMsg && <span role="status" className={apMsg.ok ? 'okmark' : 'te-bad'}>{apMsg.text}</span>}
        </div>
        <ul className="hl-list" aria-label="Các nhóm vấn đề">
          {HEALTH.map((h) => {
            const n = rep.counts[h.key];
            const isOpen = open === h.key;
            return (
              <li key={h.key} className={`hl-row ${TONE[h.tone]}`}>
                <div className="hl-head">
                  <span className="hl-n">{nf.format(n)}</span>
                  <div className="hl-t"><b>{h.label}</b><span className="xl-meta">{h.hint}</span></div>
                  <button type="button" className="btn btn-sm" disabled={!n} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : h.key)}>{isOpen ? 'Thu gọn' : n ? 'Xem danh sách' : 'Không có'}</button>
                </div>
                {isOpen && (
                  <ol className="hl-qs">
                    {rep.uids[h.key].slice(0, SHOW).map((uid) => {
                      const q = byUid.get(uid);
                      if (!q) return null;
                      return (
                        <li key={uid}>
                          <b className="mono">{seqLabel(q.seq)}</b>
                          <span className="hl-stem">{stemOf(q.latex)}</span>
                          <button type="button" className="btn btn-sm" onClick={() => go({ screen: 'bank', openUid: uid })}>Xem trong Ngân hàng</button>
                          <button type="button" className="btn btn-sm btn-accent" onClick={() => go({ screen: 'editor', editUid: uid, fromBank: true })}>Sửa</button>
                        </li>
                      );
                    })}
                    {n > SHOW && <li className="xl-meta">… còn {nf.format(n - SHOW)} câu nữa. Sửa bớt rồi bấm "Quét lại".</li>}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
        <p className="hl-foot">Không có việc nào tự sửa dữ liệu khi bạn chưa bấm. Bảng quét chỉ đọc.</p>
      </div>
    </>
  );
}
