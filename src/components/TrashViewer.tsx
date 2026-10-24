// Khung xem MỘT câu trong Thùng rác (chỉ đọc, đúng bản snapshot lúc xoá):
//   Xem nhanh  — HEdu tự dựng (QuestionView), chạy offline, có công tắc Đáp án / Lời giải (mặc định ẨN);
//   Xem chuẩn  — TeX Live biên dịch, CHỈ khi bấm; đổi câu thì bỏ kết quả cũ; lỗi TeX không chặn khôi phục / xuất;
//   LaTeX gốc  — nguyên văn, chỉ đọc, sao chép được.
import { useEffect, useMemo, useState } from 'react';
import { infoLines, neighbours, type TrashRow } from '../lib/trashview';
import { parseExTest } from '../lib/extest';
import { seqLabel } from '../lib/id';
import { isTikzReady } from '../lib/tikz';
import { CompiledView } from './CompiledView';
import { QuestionView } from './QuestionView';

export type ViewMode = 'quick' | 'exact' | 'raw';
const MODES: { m: ViewMode; label: string }[] = [{ m: 'quick', label: 'Xem nhanh' }, { m: 'exact', label: 'Xem chuẩn' }, { m: 'raw', label: 'LaTeX gốc' }];

// nhớ lựa chọn trong phiên: đổi câu không làm lộ lại lời giải
let rememberMode: ViewMode = 'quick';
let rememberAnswer = false;
let rememberSolution = false;

export function TrashViewer({ row, list, busy, readOnly, onNav, onRestore, onExport, onPurge, onClose, onToast }: {
  row: TrashRow;
  /** danh sách đang lọc (để duyệt câu trước / sau) */
  list: readonly TrashRow[];
  busy: boolean;
  readOnly: boolean;
  onNav(uid: string): void;
  onRestore(): void;
  onExport(): void;
  onPurge(): void;
  onClose(): void;
  onToast(m: string): void;
}) {
  const [mode, setMode] = useState<ViewMode>(rememberMode);
  const [ans, setAns] = useState(rememberAnswer);
  const [sol, setSol] = useState(rememberSolution);
  const [compileFor, setCompileFor] = useState<string | null>(null);
  const [exactState, setExactState] = useState<'dang' | 'xong' | 'loi'>('dang');
  const p = useMemo(() => parseExTest(row.q.latex), [row.q.latex]);
  const nav = neighbours(list, row.q.uid);
  const ready = isTikzReady();
  const uid = row.q.uid;

  // đổi sang câu khác: bỏ kết quả biên dịch của câu cũ, không tự biên dịch câu mới
  useEffect(() => { setCompileFor(null); }, [uid, sol]);
  const pick = (m: ViewMode) => { rememberMode = m; setMode(m); };
  const setAnswer = (v: boolean) => { rememberAnswer = v; setAns(v); };
  const setSolution = (v: boolean) => { rememberSolution = v; setSol(v); };

  const copy = async () => {
    try { await navigator.clipboard.writeText(row.q.latex); onToast('Đã sao chép LaTeX gốc.'); }
    catch { onToast('Không sao chép được tự động — hãy bôi đen mã rồi nhấn Ctrl+C.'); }
  };

  return (
    <section className="tr-view" aria-label={`Xem câu ${seqLabel(row.q.seq)}`}>
      <div className="tr-view-head">
        <button type="button" className="btn btn-sm tr-back" onClick={onClose}>← Về Thùng rác</button>
        <b>{seqLabel(row.q.seq)} · <span className="code-tag">{row.id6}</span></b>
        <span className="tr-nav" role="group" aria-label="Chuyển câu">
          <button type="button" className="btn btn-sm" disabled={!nav.prev} onClick={() => nav.prev && onNav(nav.prev)} aria-label="Câu trước">‹</button>
          <span className="muted sm">{nav.index >= 0 ? `${nav.index + 1} / ${nav.total}` : ''}</span>
          <button type="button" className="btn btn-sm" disabled={!nav.next} onClick={() => nav.next && onNav(nav.next)} aria-label="Câu sau">›</button>
        </span>
      </div>

      <div className="tr-tabs" role="tablist" aria-label="Cách xem">
        {MODES.map(({ m, label }) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={`tr-tab${mode === m ? ' is-on' : ''}`} onClick={() => pick(m)}>{label}</button>
        ))}
      </div>

      {mode !== 'raw' && (
        <div className="tr-toggles">
          <label className="sw"><input type="checkbox" checked={ans} disabled={mode === 'exact'} onChange={(e) => setAnswer(e.target.checked)} />Hiện đáp án</label>
          <label className="sw"><input type="checkbox" checked={sol} onChange={(e) => setSolution(e.target.checked)} />{mode === 'exact' ? 'Có lời giải (in cùng đáp án)' : 'Hiện lời giải'}</label>
        </div>
      )}

      <div className="tr-view-body">
        {mode === 'quick' && <QuestionView p={p} showAnswer={ans} showSolution={sol} raw={row.q.latex} />}

        {mode === 'exact' && (
          !ready ? <p className="sys-hint">Xem chuẩn bằng TeX Live chỉ có trong bản cài trên Windows. Bạn vẫn có thể xem nhanh, xem LaTeX gốc, xuất .tex hoặc khôi phục.</p>
            : compileFor !== uid
              ? (
                <div className="tr-exact-ask">
                  <p className="sys-hint">HEdu sẽ nhờ TeX Live biên dịch đúng câu này (mất vài giây). Chỉ chạy khi bạn bấm — chuyển câu hay cuộn danh sách không tự biên dịch.</p>
                  <button type="button" className="btn btn-sm btn-accent" onClick={() => { setExactState('dang'); setCompileFor(uid); }}>Biên dịch bằng TeX Live</button>
                </div>
              )
              : <CompiledView key={`${uid}|${sol ? 1 : 0}`} latex={row.q.latex} solution={sol} onBack={() => pick('quick')} onState={setExactState} />
        )}

        {mode === 'raw' && (
          <div className="tr-raw">
            <div className="tr-raw-bar">
              <button type="button" className="btn btn-sm" onClick={() => { void copy(); }}>Sao chép LaTeX</button>
              <span className="muted sm">Nguyên văn, chỉ đọc — không sửa trong Thùng rác.</span>
            </div>
            <pre className="tr-pre" tabIndex={0} aria-label="Mã LaTeX gốc (chỉ đọc)">{row.q.latex}</pre>
          </div>
        )}
        {mode === 'exact' && exactState === 'loi' && compileFor === uid && <p className="sys-hint">Lỗi TeX Live không ảnh hưởng dữ liệu: bạn vẫn xem được LaTeX gốc, xuất .tex hoặc khôi phục câu.</p>}
      </div>

      <details className="tr-info">
        <summary>Thông tin câu</summary>
        <dl>{infoLines(row).map((l, i) => <div key={i}><dt>{l.label}</dt><dd className={l.label === 'Mã nội bộ (uid)' ? 'mono' : undefined}>{l.value}</dd></div>)}</dl>
      </details>

      <div className="tr-view-acts">
        <button type="button" className="btn btn-sm btn-accent" disabled={busy || readOnly} onClick={onRestore}>Khôi phục</button>
        <button type="button" className="btn btn-sm" onClick={onExport}>Xuất .tex</button>
        <span className="tr-acts-gap" />
        <button type="button" className="btn btn-sm btn-outline tr-danger" disabled={busy || readOnly} onClick={onPurge}>Xoá hẳn…</button>
      </div>
    </section>
  );
}
