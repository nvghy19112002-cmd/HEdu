// Bộ nhãn chuẩn: giáo viên gắn nhãn khoảng 150 cặp (không thấy nhận định của máy), rồi xem báo cáo độ chính xác.
import { useEffect, useMemo, useState } from 'react';
import { PairCompare } from './PairCompare';
import { compareLatex } from '../lib/dup2';
import type { DupPairHit } from '../lib/dupindex';
import { GOLD_LABEL, goldClear, goldList, goldOf, goldSet, useDecisions, type GoldLabel } from '../lib/dupdecisions';
import { evaluateGold, GOLD_TARGET, sampleGold, type GoldItem } from '../lib/goldset';
import { DUP_KIND_LABEL, type DupKind } from '../lib/dup2';
import { questionCode, seqLabel } from '../lib/id';
import { LEVEL_LABEL, TYPE_LABEL, type Question } from '../lib/types';

const LABELS: GoldLabel[] = ['true_dup', 'keep_both', 'different', 'unsure'];
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');

export function GoldPanel({ questions, pairs, onClose }: { questions: Question[]; pairs: DupPairHit[]; onClose: () => void }) {
  useDecisions();
  const byUid = useMemo(() => new Map(questions.map((q) => [q.uid, q])), [questions]);
  const [items, setItems] = useState<GoldItem[]>([]);
  const [i, setI] = useState(0);
  const [report, setReport] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [askClear, setAskClear] = useState(false);
  const recs = goldList().filter((g) => { const a = byUid.get(g.a), b = byUid.get(g.b); return !!a && !!b && !!goldOf(a, b); });
  const rep = useMemo(() => evaluateGold(recs), [recs.length, recs.map((r) => r.at).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const newSample = () => {
    const skip = new Set(recs.map((g) => (g.a <= g.b ? `${g.a}|${g.b}` : `${g.b}|${g.a}`)));
    const s = sampleGold(questions, pairs, skip, Math.max(0, GOLD_TARGET - recs.length) || 0);
    setItems(s); setI(0); setReport(false);
    setMsg(s.length ? null : recs.length >= GOLD_TARGET ? `Đã đủ ${recs.length} nhãn. Bấm “Xem báo cáo”.` : 'Không còn cặp nào để lấy mẫu (hãy quét lại ở phạm vi rộng hơn).');
  };
  useEffect(() => { if (!items.length && recs.length < GOLD_TARGET && pairs.length) newSample(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = items[i];
  const A = cur && byUid.get(cur.a), B = cur && byUid.get(cur.b);
  const have = A && B ? goldOf(A, B) : undefined;
  const label = async (l: GoldLabel) => {
    if (!cur || !A || !B) return;
    const ok = await goldSet(A, B, l, cur.kind);
    setMsg(ok ? null : 'Chưa lưu được nhãn vào tệp (đang giữ tạm trong phiên). Dùng “Xuất nhãn” để lưu ra file.');
    if (i < items.length - 1) setI(i + 1); else setReport(true);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      const k = Number(e.key);
      if (k >= 1 && k <= 4) { e.preventDefault(); void label(LABELS[k - 1]); }
      if (e.key === 'ArrowRight' && i < items.length - 1) setI(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) setI(i - 1);
    };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  });

  const side = (q: Question, title: string) => ({
    title, latex: q.latex,
    badges: <><span className={`pill t-${q.type}`}>{TYPE_LABEL[q.type]}</span><span className={`pill l-${q.level}`}>{LEVEL_LABEL[q.level]}</span><span className="code-tag">{questionCode(q, q.level)}</span><span className="mono card-no">{seqLabel(q.seq)}</span></>,
  });
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'HEdu', kind: 'nhan-chuan', exportedAt: new Date().toISOString(), report: rep, labels: recs.map((r) => ({ a: r.a, b: r.b, label: r.label, detector: r.kind })) }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hedu-nhan-chuan.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="dc gold" role="dialog" aria-modal="true" aria-label="Bộ nhãn chuẩn">
      <header className="dc-head">
        <h2>Bộ nhãn chuẩn</h2>
        <p className="dc-note">Gắn nhãn khoảng {GOLD_TARGET} cặp để đo độ chính xác của bộ dò trên ngân hàng thật. Máy <b>không</b> hiện nhận định của nó ở đây để thầy/cô không bị gợi ý. Nhãn chỉ dùng để đo, không tự xoá hay sửa câu nào.</p>
        <div className="dc-acts">
          <span className="chip-n on" aria-live="polite">{recs.length}/{GOLD_TARGET} đã gắn</span>
          <button type="button" className="btn btn-sm" onClick={() => setReport(!report)} disabled={!recs.length}>{report ? 'Tiếp tục gắn nhãn' : 'Xem báo cáo'}</button>
          <button type="button" className="btn btn-sm" onClick={newSample} disabled={!pairs.length}>Lấy mẫu tiếp</button>
          <button type="button" className="btn btn-sm" onClick={exportJson} disabled={!recs.length}>Xuất nhãn + báo cáo</button>
          {askClear
            ? <><button type="button" className="btn btn-sm btn-accent" onClick={async () => { setAskClear(false); await goldClear(); setItems([]); }}>Xoá hết {recs.length} nhãn</button><button type="button" className="btn btn-sm" autoFocus onClick={() => setAskClear(false)}>Giữ lại</button></>
            : <button type="button" className="btn btn-sm" onClick={() => setAskClear(true)} disabled={!recs.length}>Xoá nhãn…</button>}
          <button type="button" className="btn btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </header>
      {msg && <p className="dc-stale" role="status">{msg}</p>}
      {!pairs.length && <p className="dc-empty">Chưa có kết quả quét. Đóng cửa sổ này, bấm “Quét” ở màn Kiểm tra trùng rồi mở lại.</p>}

      {report && <GoldReportView rep={rep} />}

      {!report && cur && A && B && (
        <>
          <div className="gold-bar">
            <b>Cặp {i + 1}/{items.length}</b>
            {have && <span className="chip-n on">đã gắn: {GOLD_LABEL[have.label]}</span>}
            <span className="grow" />
            <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => setI(i - 1)}>‹ Trước</button>
            <button type="button" className="btn btn-sm" disabled={i >= items.length - 1} onClick={() => setI(i + 1)}>Bỏ qua ›</button>
          </div>
          <PairCompare blind A={side(A, 'Câu A')} B={side(B, 'Câu B')} result={compareLatex(A.latex, B.latex)} />
          <div className="dc-foot gold-btns" role="group" aria-label="Nhãn cho cặp này">
            {LABELS.map((l, k) => <button key={l} type="button" className={`btn btn-sm${have?.label === l ? ' btn-dark' : ''}`} onClick={() => void label(l)}>{k + 1}. {GOLD_LABEL[l]}</button>)}
            <span className="muted sm">Phím 1–4 để gắn nhãn, ← → để chuyển cặp.</span>
          </div>
        </>
      )}
      {!report && !cur && pairs.length > 0 && !msg && <p className="dc-empty">Bấm “Lấy mẫu tiếp” để bắt đầu.</p>}
    </div>
  );
}

function GoldReportView({ rep }: { rep: ReturnType<typeof evaluateGold> }) {
  const kinds = ['raw', 'same', 'conflict', 'near', 'template', 'insufficient', 'none'];
  return (
    <div className="gold-rep" aria-label="Báo cáo độ chính xác">
      <p className="dc-ok" role="status">Đã gắn {rep.total} nhãn ({rep.unsure} “chưa chắc” không tính vào tỉ lệ). {rep.caveat}</p>
      <table className="gold-tbl">
        <thead><tr><th>Bộ dò xếp loại</th>{LABELS.map((l) => <th key={l}>{GOLD_LABEL[l]}</th>)}<th>Trùng thật (tỉ lệ)</th></tr></thead>
        <tbody>
          {kinds.filter((k) => rep.matrix[k]).map((k) => {
            const m = rep.matrix[k]; const n = m.true_dup + m.keep_both + m.different;
            return <tr key={k}><th scope="row">{k === 'none' ? 'Bộ dò không báo (đối chứng)' : DUP_KIND_LABEL[k as DupKind]}</th>{LABELS.map((l) => <td key={l}>{m[l]}</td>)}<td>{pct(m.true_dup, n)}</td></tr>;
          })}
        </tbody>
      </table>
      <ul className="gold-sum">
        <li><b>“Chắc trùng” (giống nguyên mã + cùng câu):</b> {rep.sureTrue}/{rep.sureN} là trùng thật ({pct(rep.sureTrue, rep.sureN)}). {rep.sureN - rep.sureTrue > 0 ? 'Có cặp bộ dò xếp “chắc trùng” nhưng thầy/cô cho là không phải trùng thật — đây là loại lỗi nghiêm trọng nhất, cần xem lại.' : ''}</li>
        <li><b>Nhóm hiển thị mặc định (nguyên mã, mâu thuẫn, cùng câu, gần trùng):</b> {rep.viewTrue}/{rep.viewN} trùng thật ({pct(rep.viewTrue, rep.viewN)}); tính cả “giống nhưng giữ cả hai”: {rep.viewRelated}/{rep.viewN} ({pct(rep.viewRelated, rep.viewN)}).</li>
        <li><b>Trùng thật nhưng nằm ngoài nhóm mặc định:</b> {rep.trueTotal - rep.trueInView}/{rep.trueTotal}{rep.missed.length ? ` — ${rep.missed.map((m) => `${m.kind === 'none' ? 'bộ dò không báo' : DUP_KIND_LABEL[m.kind as DupKind]}: ${m.n}`).join('; ')}` : ''}. Nếu số này lớn, cần chỉnh bộ dò hoặc đưa loại đó vào nhóm mặc định.</li>
      </ul>
    </div>
  );
}
