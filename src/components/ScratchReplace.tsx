// Hộp "Tìm và thay thế" của màn Xử lí TeX: chạy thử trên bản sao, hiện các dòng sẽ đổi, chỉ ghi khi bấm Áp dụng.
import { useEffect, useMemo, useRef, useState } from 'react';
import { planReplace } from '../lib/scratchsel';
import type { ScratchScan } from '../lib/texscratch';

const nf = new Intl.NumberFormat('vi-VN');

export function ScratchReplace({ text, scan, scope, onApply, onClose }: {
  text: string;
  scan: ScratchScan;
  /** các câu đang chọn (null = cả bàn nháp) */
  scope: ReadonlySet<number> | null;
  onApply(next: string, what: string): void;
  onClose(): void;
}) {
  const [find, setFind] = useState('');
  const [repl, setRepl] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [regex, setRegex] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  const plan = useMemo(() => (find ? planReplace(text, scan, scope, find, repl, { matchCase, regex }) : null), [text, scan, scope, find, repl, matchCase, regex]);
  const can = plan?.ok && plan.count > 0 && plan.linesChanged > 0;
  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm xl-panel tsx-fix" role="dialog" aria-modal="true" aria-label="Tìm và thay thế">
        <h3>Tìm và thay thế</h3>
        <div className="xl-panel-body">
          <p className="xl-meta">{scope ? <>Chỉ trong <b>{nf.format(scope.size)} câu đã chọn</b>.</> : <>Trong <b>cả bàn nháp</b>.</>} HEdu chạy thử trên bản sao; chỉ khi bấm <b>Áp dụng</b> nội dung mới đổi (Ctrl+Z hoặc nút Hoàn tác để lấy lại).</p>
          <label className="tsx-rf"><span>Tìm</span><input ref={first} value={find} onChange={(e) => setFind(e.target.value)} spellCheck={false} placeholder="vd. \dfrac" /></label>
          <label className="tsx-rf"><span>Thay bằng</span><input value={repl} onChange={(e) => setRepl(e.target.value)} spellCheck={false} placeholder="vd. \frac (để trống = xoá)" /></label>
          <div className="tsx-opts">
            <label className="sw"><input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />Phân biệt chữ hoa/thường</label>
            <label className="sw"><input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />Dùng biểu thức chính quy <small className="sys-hint">Ô “Thay bằng” hiểu $1, $2… là nhóm trong ô Tìm.</small></label>
          </div>
          {plan && !plan.ok && <p className="q-warn">{plan.why}</p>}
          {plan?.ok && (
            <>
              <b>{plan.count ? `${nf.format(plan.count)} chỗ khớp, ${nf.format(plan.linesChanged)} dòng sẽ đổi` : 'Không có chỗ nào khớp'}</b>
              {plan.changes.length > 0 && (
                <ol className="tsx-diff">
                  {plan.changes.map((c) => <li key={c.line}><span className="tsx-ln">dòng {c.line}</span><del>{c.before || ' '}</del><ins>{c.after || ' '}</ins></li>)}
                  {plan.linesChanged > plan.changes.length && <li className="sys-hint">… và {nf.format(plan.linesChanged - plan.changes.length)} dòng nữa</li>}
                </ol>
              )}
            </>
          )}
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" onClick={onClose}>Huỷ</button>
          <button type="button" className="btn btn-accent" disabled={!can} onClick={() => plan?.ok && onApply(plan.out, 'Thay thế')}>Áp dụng</button>
        </div>
      </div>
    </>
  );
}
