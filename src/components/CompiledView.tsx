// Hiện câu hỏi do TeX Live biên dịch (“Xem chuẩn”): ảnh SVG hoặc báo lỗi rõ nguyên nhân kèm log.
import { useEffect, useRef, useState } from 'react';
import { compileQuestion, type Failure } from '../lib/xemchuan';

type State = { s: 'dang' } | { s: 'xong'; svg: string; cached: boolean; ms: number } | { s: 'loi'; fail: Failure };

export function FailureBox({ fail, onRetry }: { fail: Failure; onRetry?: () => void }) {
  const [log, setLog] = useState(false);
  return (
    <div className="fig-ph err cv-err" role="alert">
      <span className="fig-ph-t">{fail.label}</span>
      <span className="fig-ph-s">{fail.detail}</span>
      {fail.message && fail.message !== fail.detail && <span className="fig-ph-s mono">{fail.message}</span>}
      {fail.log && (
        <>
          <button type="button" className="linkbtn" onClick={() => setLog(!log)}>{log ? 'Ẩn log' : 'Xem log TeX'}</button>
          {log && <code className="fig-log">{fail.log}</code>}
        </>
      )}
      {onRetry && <button type="button" className="btn btn-sm" onClick={onRetry}>Dịch lại</button>}
    </div>
  );
}

export function CompiledView({ latex, solution, onBack, onState }: { latex: string; solution: boolean; onBack?: () => void; onState?: (s: 'dang' | 'xong' | 'loi') => void }) {
  const [st, setSt] = useState<State>({ s: 'dang' });
  const alive = useRef(true);
  const [again, setAgain] = useState(0);

  useEffect(() => { onState?.(st.s === 'dang' ? 'dang' : st.s === 'xong' ? 'xong' : 'loi'); }, [st.s]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    alive.current = true;
    setSt({ s: 'dang' });
    compileQuestion(latex, solution).then((r) => {
      if (!alive.current) return;
      setSt(r.ok ? { s: 'xong', svg: r.svg, cached: r.cached, ms: r.ms } : { s: 'loi', fail: r.fail });
    });
    return () => { alive.current = false; };
  }, [latex, solution, again]);

  return (
    <div className="cv">
      <div className="cv-bar">
        <b>Xem chuẩn</b>
        <span>{st.s === 'dang' ? 'Đang biên dịch bằng TeX Live…' : st.s === 'xong' ? `TeX Live đã biên dịch${st.cached ? ' (lấy từ bộ nhớ đệm)' : ` trong ${(st.ms / 1000).toFixed(1)} giây`}` : 'TeX Live báo lỗi'}</span>
        {onBack && <button type="button" className="linkbtn" onClick={onBack}>Về xem nhanh</button>}
      </div>
      {st.s === 'dang' && <div className="cv-wait" aria-busy="true">Đang dịch…</div>}
      {st.s === 'xong' && <div className="cv-page" dangerouslySetInnerHTML={{ __html: st.svg }} />}
      {st.s === 'loi' && <FailureBox fail={st.fail} onRetry={() => { setAgain(again + 1); }} />}
    </div>
  );
}
