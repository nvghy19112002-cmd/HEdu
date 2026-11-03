// Hộp "Xuất trọn gói": nhiều đề đã chọn → một thư mục (mỗi đề một thư mục con) + Danh-muc.xlsx.
import { useEffect, useRef, useState } from 'react';
import { chooseFolder } from '../lib/exampdf';
import { DEFAULT_PACK_OPTS, runPack, type PackOpts, type PackResult } from '../lib/exampack';
import type { ExamSummary } from '../lib/examlib';
import type { Question, Taxonomy } from '../lib/types';

const OPTS: { key: keyof PackOpts; label: string; note: string }[] = [
  { key: 'pdf', label: 'PDF các bản đã biên dịch', note: 'Đề, lời giải… mỗi bản một tệp (chỉ bản đã dịch được và khớp tệp nguồn).' },
  { key: 'matrix', label: 'Ma trận đề (Excel)', note: 'Chỉ có với đề tạo từ ngân hàng; đề soạn tay được ghi chú trong danh mục.' },
  { key: 'answers', label: 'Đáp án theo mã đề (Excel)', note: 'Cho đề có nhiều mã đề.' },
  { key: 'bundle', label: 'Gói đề HEdu (nguồn .tex, hình, tệp phụ)', note: 'Để nhập lại vào HEdu ở máy khác. Chiếm nhiều dung lượng hơn.' },
];

export function ExamPackDialog({ exams, qn, tax, question, onClose, onToast }: {
  exams: ExamSummary[]; qn: ReadonlyMap<string, number>; tax: Taxonomy; question(uid: string): Question | undefined; onClose(): void; onToast(m: string): void;
}) {
  const [opts, setOpts] = useState<PackOpts>(DEFAULT_PACK_OPTS);
  const [dest, setDest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number; name: string } | null>(null);
  const [out, setOut] = useState<PackResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [busy, onClose]);

  const any = Object.values(opts).some(Boolean);
  const pick = async () => { try { const d = await chooseFolder('Chọn thư mục để xuất trọn gói'); if (d) setDest(d); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } };
  const go = async () => {
    if (!dest) return;
    setBusy(true); setErr(null); setOut(null);
    try {
      const r = await runPack(exams, opts, dest, qn, { tax, question, progress: (done, total, name) => setProg({ done, total, name }) }, new Date());
      setOut(r);
      onToast(r.failed.length ? `Xuất trọn gói xong, ${r.failed.length} lỗi. Thư mục: ${r.dir}` : `Đã xuất ${exams.length} đề vào ${r.dir}`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); setProg(null); }
  };

  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label="Xuất trọn gói" style={{ maxWidth: 640 }}>
        <h3>Xuất trọn gói · {exams.length} đề</h3>
        <div className="cfm-body">
          {err && <p className="te-bad" role="alert">{err}</p>}
          <div role="group" aria-label="Nội dung xuất" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {OPTS.map((o) => (
              <label key={o.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={opts[o.key]} disabled={busy} onChange={(e) => setOpts({ ...opts, [o.key]: e.target.checked })} />
                <span><b>{o.label}</b><br /><span style={{ color: 'var(--ink-3)' }}>{o.note}</span></span>
              </label>
            ))}
          </div>
          <ul className="fx-multi-list" style={{ maxHeight: 130, overflow: 'auto' }}>{exams.slice(0, 12).map((e) => <li key={e.id} title={e.name}>{e.name}</li>)}{exams.length > 12 && <li className="xl-meta">… và {exams.length - 12} đề nữa</li>}</ul>
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void pick(); }}>Chọn thư mục lưu…</button>
            <span style={{ fontSize: 13, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>{dest ?? 'Chưa chọn'}</span>
          </div>
          {busy && prog && <p role="status" aria-live="polite" style={{ marginTop: 8 }}>Đang xuất {Math.min(prog.done + 1, prog.total)}/{prog.total}{prog.name ? `: ${prog.name}` : ''}…</p>}
          {out && (
            <div role="status" style={{ marginTop: 8 }}>
              <p className={out.failed.length ? 'te-warn' : 'okmark'}>Đã xuất vào <b style={{ overflowWrap: 'anywhere' }}>{out.dir}</b>{out.catalog ? ' (có Danh-muc.xlsx).' : '.'}</p>
              {out.failed.length > 0 && <ul className="fx-multi-list">{out.failed.map((f, i) => <li key={i} className="te-bad" style={{ whiteSpace: 'normal' }}>{f.name}: {f.error}</li>)}</ul>}
            </div>
          )}
          <p className="te-note" style={{ marginTop: 8 }}>HEdu tạo một thư mục mới (HEdu-xuat-ngày-giờ) và không bao giờ ghi đè tệp có sẵn. Đề không có nội dung nào để xuất vẫn được ghi trong danh mục kèm lý do.</p>
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" ref={first} disabled={busy} onClick={onClose}>{out ? 'Đóng' : 'Huỷ'}</button>
          <button type="button" className="btn btn-accent" disabled={busy || !dest || !any || !!out} onClick={() => { void go(); }}>{busy ? 'Đang xuất…' : 'Xuất trọn gói'}</button>
        </div>
      </div>
    </>
  );
}
