// Hộp "Kiểm lỗi mã" (ChkTeX): liệt kê các chỗ nên xem lại trong đoạn mã đang soạn; bấm "Dòng N" để nhảy tới.
import { useEffect, useState } from 'react';
import { chktexCheck, LEVEL_VI, lintSummary, lintText, type Lint } from '../lib/chktex';

export function LintDialog({ text, texBin, onJump, onClose }: { text: string; texBin?: string; onJump(line: number): void; onClose(): void }) {
  const [res, setRes] = useState<Lint[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    chktexCheck(text, texBin).then((r) => { if (!dead) setRes(r); }).catch((e) => { if (!dead) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { dead = true; };
  }, [text, texBin]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label="Kiểm lỗi mã LaTeX" style={{ maxWidth: 720, width: 'min(720px, 94vw)' }}>
        <h3>Kiểm lỗi mã (ChkTeX)</h3>
        <div className="cfm-body">
          {err && <p className="te-bad" role="alert">{err}</p>}
          {!res && !err && <p>Đang kiểm…</p>}
          {res && <p className={res.length ? 'te-warn' : 'okmark'} role="status">{lintSummary(res)} <span className="xl-meta">Đã tắt các cảnh báo thuần phong cách (khoảng trắng, dấu gạch, ngoặc kép…).</span></p>}
          {res && res.length > 0 && (
            <ol className="hl-qs" style={{ maxHeight: '50vh' }}>
              {res.map((l, i) => (
                <li key={i} className={`chk-lines-li ${l.level === 'error' ? 'loi' : 'canh'}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-sm" onClick={() => { onJump(l.line); onClose(); }}>Dòng {l.line}</button>
                  <b>{LEVEL_VI[l.level]}</b>
                  <span>{lintText(l)}</span>
                  {lintText(l) !== l.msg && <span className="xl-meta">{l.msg}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="cfm-acts"><button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button></div>
      </div>
    </>
  );
}
