// So sánh hai câu cân xứng. Dùng chung cho màn Kiểm tra trùng và màn Rà soát trước khi nhập.
// Chỉ thay đổi CÁCH XEM TRƯỚC (hình xuống dưới đề, tab A/B khi hẹp); không sửa mã LaTeX.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DUP_KIND_LABEL, fingerprint, type PairResult } from '../lib/dup2';
import { explainPair, type Tok } from '../lib/dupdiff';
import { parseExTest } from '../lib/extest';
import { QuestionView } from './QuestionView';

export interface CmpSide { title: string; latex: string; badges?: ReactNode; actions?: ReactNode }
type Tab = 'view' | 'diff' | 'src';
/** Dưới bề rộng này (px) hai khung cạnh nhau sẽ quá chật để đọc Toán ⇒ chuyển sang xem từng câu theo tab A/B. */
export const SIDE_BY_SIDE_MIN = 900;

function Toks({ toks }: { toks: Tok[] }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < toks.length; ) {
    const t = toks[i];
    if (t.math) {
      let j = i; while (j < toks.length && toks[j].math && toks[j].run === t.run) j++;
      const seg = toks.slice(i, j);
      out.push(<code key={i} className="dd-m">{seg.map((x, k) => <span key={k} className={x.changed ? 'dd-x' : undefined}>{x.t}{' '}</span>)}</code>);
      i = j;
    } else { out.push(<span key={i} className={t.changed ? 'dd-x' : undefined}>{t.t}{' '}</span>); i++; }
  }
  return <>{out}</>;
}

/** blind = ẩn nhận định của máy (loại nghi vấn, điểm, lý do) để giáo viên gắn nhãn không bị gợi ý. */
export function PairCompare({ A, B, result, note, footer, blind }: { A: CmpSide; B: CmpSide; result: PairResult; note?: ReactNode; footer?: ReactNode; blind?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [tab, setTab] = useState<Tab>('view');
  const [stack, setStack] = useState(true);
  const [sol, setSol] = useState(false);
  const [which, setWhich] = useState<'A' | 'B'>('A');
  useEffect(() => {
    const el = root.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const narrow = width < SIDE_BY_SIDE_MIN;
  const fa = useMemo(() => fingerprint(A.latex), [A.latex]);
  const fb = useMemo(() => fingerprint(B.latex), [B.latex]);
  const rows = useMemo(() => explainPair(fa, fb), [fa, fb]);
  const pa = useMemo(() => parseExTest(A.latex), [A.latex]);
  const pb = useMemo(() => parseExTest(B.latex), [B.latex]);
  const r = result;

  const card = (s: CmpSide, p: typeof pa, key: 'A' | 'B') => (
    <article className="dc-card" key={key} aria-label={s.title}>
      <div className="dc-card-h">
        <b>{s.title}</b>{s.badges}
        <span className="dc-card-a">{s.actions}</span>
      </div>
      <div className={`dc-card-b${stack ? ' dc-stack' : ''}`}>
        {tab === 'src'
          ? <pre className="dc-src" tabIndex={0}>{(key === 'A' ? A : B).latex}</pre>
          : <QuestionView p={p} variant="compact" showSolution={sol} raw={(key === 'A' ? A : B).latex} />}
      </div>
    </article>
  );

  return (
    <div className="dc-cmp" ref={root}>
      {!blind && <div className="dc-why">
        <div className="dc-why-h">
          <b className={`dc-kind k-${r.kind}`}>{DUP_KIND_LABEL[r.kind]}</b>
          <span className="dc-sc">Mức tương đồng {Math.round(r.score * 100)}% (chữ {Math.round(r.text * 100)}%, công thức {Math.round(r.math * 100)}%) — chỉ để tham khảo, không phải xác suất trùng.</span>
        </div>
        {note}
        {r.reasons.map((t, i) => <p key={i}>{t}</p>)}
        {r.flags.length > 0 && <p className="dc-flags">Khác nhau: {r.flags.join(' · ')}</p>}
        <div className="dc-parts" aria-label="Đối chiếu từng phần">
          {rows.filter((x) => !/^(Phương án \d|Ý )/.test(x.label)).map((x) => <span key={x.label} className={`dc-part ${x.same ? 'eq' : 'ne'}`}>{x.label}: {x.same ? 'giống' : 'khác'}</span>)}
          {(() => { const o = rows.filter((x) => /^(Phương án \d|Ý )/.test(x.label)); const bad = o.filter((x) => !x.same).length; return o.length ? <span className={`dc-part ${bad ? 'ne' : 'eq'}`}>Phương án/ý: {bad ? `${bad}/${o.length} khác` : 'giống'}</span> : null; })()}
        </div>
      </div>}

      <div className="dc-tools">
        <div className="vseg" role="tablist" aria-label="Cách xem">
          <button type="button" role="tab" aria-selected={tab === 'view'} aria-pressed={tab === 'view'} onClick={() => setTab('view')}>Xem câu</button>
          <button type="button" role="tab" aria-selected={tab === 'diff'} aria-pressed={tab === 'diff'} onClick={() => setTab('diff')}>Khác biệt</button>
          <button type="button" role="tab" aria-selected={tab === 'src'} aria-pressed={tab === 'src'} onClick={() => setTab('src')}>Mã LaTeX</button>
        </div>
        {tab === 'view' && (
          <>
            <label className="dc-chk"><input type="checkbox" checked={stack} onChange={(e) => setStack(e.target.checked)} /> Hình xuống dưới đề (dễ so sánh)</label>
            <label className="dc-chk"><input type="checkbox" checked={sol} onChange={(e) => setSol(e.target.checked)} /> Hiện lời giải</label>
          </>
        )}
        {narrow && tab !== 'diff' && (
          <div className="vseg" role="group" aria-label="Chọn câu để xem">
            <button type="button" aria-pressed={which === 'A'} onClick={() => setWhich('A')}>{A.title}</button>
            <button type="button" aria-pressed={which === 'B'} onClick={() => setWhich('B')}>{B.title}</button>
          </div>
        )}
      </div>

      {tab === 'diff' ? (
        <div className="dd" role="table" aria-label="Khác biệt từng phần">
          <div className="dd-head" role="row"><span role="columnheader">Phần</span><span role="columnheader">{A.title}</span><span role="columnheader">{B.title}</span></div>
          {rows.map((x, i) => (
            <div key={i} role="row" className={`dd-row${x.same ? '' : ' ne'}`}>
              <span role="rowheader" className="dd-l">{x.label}<em>{x.same ? 'giống' : 'khác'}</em></span>
              <span role="cell">{x.emptyA ? <i>(không có)</i> : <Toks toks={x.a} />}</span>
              <span role="cell">{x.emptyB ? <i>(không có)</i> : <Toks toks={x.b} />}</span>
            </div>
          ))}
          <p className="dc-sc">Ký hiệu tô đậm là chỗ hai câu khác nhau. Đây là bản đã chuẩn hoá để so sánh (bỏ \left, \dfrac→\frac…), không phải mã gốc — xem mã gốc ở tab “Mã LaTeX”.</p>
        </div>
      ) : (
        <div className={`dc-pair${narrow ? ' narrow' : ''}`}>
          {(!narrow || which === 'A') && card(A, pa, 'A')}
          {(!narrow || which === 'B') && card(B, pb, 'B')}
        </div>
      )}
      {footer && <div className="dc-foot">{footer}</div>}
    </div>
  );
}
