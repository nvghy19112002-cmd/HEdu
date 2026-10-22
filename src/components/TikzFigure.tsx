// Vẽ một hình TikZ. Bản cài Windows gọi TeX Live để dịch ra SVG; nếu chưa có TeX Live
// hoặc hình lỗi thì hiện khung báo rõ lý do kèm đoạn log.
import { useEffect, useRef, useState } from 'react';
import { classifyTexLog } from '../lib/texcheck';
import { asTikzErr, getSettings, isTikzReady, onSettingsChange, renderTikz, type TikzErr } from '../lib/tikz';

type State =
  | { s: 'cho' }
  | { s: 'dang' }
  | { s: 'xong'; svg: string; cached: boolean; ms: number }
  | { s: 'loi'; err: TikzErr };

export function TikzFigure({ code, defs = '', label }: { code: string; defs?: string; label: string }) {
  const [st, setSt] = useState<State>({ s: 'cho' });
  const [showLog, setShowLog] = useState(false);
  const alive = useRef(true);

  const run = () => {
    if (!isTikzReady()) return;
    setSt({ s: 'dang' });
    renderTikz(code, defs)
      .then((r) => { if (alive.current) setSt({ s: 'xong', svg: r.svg, cached: r.cached, ms: r.ms }); })
      .catch((e) => { if (alive.current) setSt({ s: 'loi', err: asTikzErr(e) }); });
  };

  useEffect(() => {
    alive.current = true;
    if (isTikzReady() && getSettings().auto) run();
    else setSt({ s: 'cho' });
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, defs]);

  useEffect(() => onSettingsChange(() => setSt({ s: 'cho' })), []);

  if (st.s === 'xong') {
    return (
      <span className="fig" role="img" aria-label={label}>
        <span className="fig-svg" dangerouslySetInnerHTML={{ __html: st.svg }} />
      </span>
    );
  }

  if (st.s === 'loi') {
    const e = st.err;
    const info = e.stage === 'latex' ? classifyTexLog(e.message, e.log) : null;
    return (
      <span className="fig-ph err">
        <span className="fig-ph-t">{e.stage === 'thieu-texlive' ? 'Chưa dịch được hình' : info && info.kind !== 'khac' ? info.label : 'Hình lỗi khi dịch'}</span>
        <span className="fig-ph-s">{e.message}</span>
        {info && info.kind !== 'khac' && <span className="fig-ph-s">{info.detail}</span>}
        {e.log && (
          <>
            <button type="button" className="linkbtn" onClick={() => setShowLog(!showLog)}>{showLog ? 'Ẩn log' : 'Xem log TeX'}</button>
            {showLog && <code className="fig-log">{e.log}</code>}
          </>
        )}
        <button type="button" className="btn btn-sm" onClick={run}>Dịch lại</button>
      </span>
    );
  }

  return (
    <span className="fig-ph" role="img" aria-label={label}>
      <span className="fig-ph-t">{label}</span>
      {st.s === 'dang' ? (
        <span className="fig-ph-s">Đang dịch bằng TeX Live…</span>
      ) : isTikzReady() ? (
        <button type="button" className="btn btn-sm" onClick={run}>Vẽ hình</button>
      ) : (
        <span className="fig-ph-s">Bản cài trên Windows sẽ vẽ hình này bằng TeX Live</span>
      )}
    </span>
  );
}
