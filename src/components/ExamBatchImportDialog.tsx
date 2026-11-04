// Hộp "Nhập nhiều đề": chọn các đề tìm thấy trong một thư mục rồi nhập lần lượt (mỗi đề qua đúng bước quét/nhập như nhập một đề).
import { useEffect, useMemo, useRef, useState } from 'react';
import { batchCandidates, summarizeBatch, type BatchCandidate, type BatchOutcome } from '../lib/examimportbatch';
import { examImport, examScan, needsMainChoice, type ExamSummary } from '../lib/examlib';

export function ExamBatchImportDialog({ folder, candidates, truncated, place, placeNew, onClose, onDone }: {
  folder: string; candidates: BatchCandidate[]; truncated: boolean; place: string;
  /** đặt đề vừa nhập vào mục đang chọn ở cây (lớp, loại, thư mục…) */
  placeNew(s: ExamSummary): Promise<ExamSummary>;
  onClose(): void; onDone(msg: string): void;
}) {
  const [on, setOn] = useState<ReadonlySet<number>>(() => new Set(candidates.map((_, i) => i)));
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ i: number; n: number; name: string } | null>(null);
  const [out, setOut] = useState<BatchOutcome[] | null>(null);
  const stop = useRef(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [busy, onClose]);

  const chosen = useMemo(() => candidates.filter((_, i) => on.has(i)), [candidates, on]);
  const toggle = (i: number) => setOn((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const go = async () => {
    setBusy(true); stop.current = false;
    const res: BatchOutcome[] = [];
    for (let i = 0; i < chosen.length; i++) {
      if (stop.current) { res.push(...chosen.slice(i).map((c) => ({ name: c.name, ok: false, message: 'đã dừng' }))); break; }
      const c = chosen[i];
      setProg({ i, n: chosen.length, name: c.name });
      try {
        const scan = await examScan(c.path);
        if (needsMainChoice(scan) && scan.candidates.length > 1) { res.push({ name: c.name, ok: false, message: 'có nhiều tệp có thể là tệp chính, hãy nhập riêng để chọn' }); continue; }
        const s = await placeNew(await examImport(c.path, c.name, scan.mainFile));
        res.push({ name: s.name, ok: true, message: '' });
      } catch (e) { res.push({ name: c.name, ok: false, message: e instanceof Error ? e.message : String(e) }); }
    }
    setProg(null); setBusy(false); setOut(res);
    onDone(summarizeBatch(res));
  };

  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label="Nhập nhiều đề" style={{ maxWidth: 680, width: 'min(680px, 94vw)' }}>
        <h3>Nhập nhiều đề · {candidates.length} đề tìm thấy</h3>
        <div className="cfm-body">
          <p className="xl-meta" style={{ overflowWrap: 'anywhere' }}>Thư mục: {folder}. {place ? <>Các đề sẽ vào: <b>{place}</b>.</> : 'Các đề chưa được xếp vào mục nào (chọn mục ở cây trước nếu muốn).'} Tệp gốc giữ nguyên.</p>
          {!candidates.length && <p>Không tìm thấy tệp .tex nào trong thư mục này.</p>}
          {truncated && <p className="te-warn">Chỉ hiện {candidates.length} đề đầu tiên; nhập xong có thể chọn lại thư mục để nhập tiếp.</p>}
          {candidates.length > 0 && (
            <>
              <div className="head-actions" style={{ marginBottom: 6 }}>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setOn(new Set(candidates.map((_, i) => i)))}>Chọn hết</button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setOn(new Set())}>Bỏ chọn hết</button>
              </div>
              <ul className="fx-multi-list" style={{ maxHeight: 300, overflow: 'auto', listStyle: 'none', paddingLeft: 0 }}>
                {candidates.map((c, i) => {
                  const r = out?.find((x) => x.name === c.name || x.name.startsWith(c.name));
                  return (
                    <li key={c.path} style={{ display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'normal' }}>
                      <input type="checkbox" checked={on.has(i)} disabled={busy || !!out} onChange={() => toggle(i)} aria-label={c.name} />
                      <span>{c.name}</span>
                      <span className="xl-meta">{c.kind === 'folder' ? `thư mục, ${c.texCount} tệp .tex` : 'một tệp .tex'}</span>
                      {out && r && <span style={{ marginLeft: 'auto', color: r.ok ? 'var(--ok)' : 'var(--danger)' }}>{r.ok ? '✓ đã nhập' : `✗ ${r.message}`}</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {busy && prog && <p role="status" aria-live="polite" style={{ marginTop: 8 }}>Đang nhập {prog.i + 1}/{prog.n}: {prog.name}…</p>}
          {out && <p role="status" className={out.every((x) => x.ok) ? 'okmark' : 'te-warn'} style={{ marginTop: 8 }}>{summarizeBatch(out)}</p>}
        </div>
        <div className="cfm-acts">
          {busy ? <button type="button" className="btn btn-outline" onClick={() => { stop.current = true; }}>Dừng sau đề này</button> : <button type="button" className="btn btn-outline" onClick={onClose}>{out ? 'Đóng' : 'Huỷ'}</button>}
          <button type="button" className="btn btn-accent" disabled={busy || !!out || !chosen.length} onClick={() => { void go(); }}>{busy ? 'Đang nhập…' : `Nhập ${chosen.length} đề`}</button>
        </div>
      </div>
    </>
  );
}

export { batchCandidates };
