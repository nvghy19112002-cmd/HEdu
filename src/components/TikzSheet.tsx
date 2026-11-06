// Bảng "Hình TikZ" của màn Xử lí TeX: tự liệt kê mọi khối tikzpicture trong bàn nháp, mỗi khối một thẻ: mã bên trái, hình TeX Live dịch bên phải.
// Sửa mã ngay trong thẻ ⇒ hình mới tự dịch (sau khi ngừng gõ), hiện cạnh hình hiện tại; "Áp dụng vào mã" mới ghi vào bàn nháp (một bước,
// Ctrl+Z ở trình soạn hoàn tác được; thẻ cũng có nút Hoàn tác). Hình chỉ dịch khi thẻ cuộn tới, tối đa 2 hình cùng lúc.
import { memo, useEffect, useRef, useState } from 'react';
import { classifyTexLog } from '../lib/texcheck';
import { Limiter, CancelledError } from '../lib/limiter';
import { nextSvgPrefix, scopeSvgIds } from '../lib/svgids';
import { asTikzErr, isTikzReady, renderTikz, type TikzErr } from '../lib/tikz';
import { figLabel, type ScratchFig } from '../lib/scratchtikz';

const queue = new Limiter(2);
const LIVE_MS = 700;

type St = { s: 'cho' } | { s: 'dang' } | { s: 'xong'; svg: string; ms: number } | { s: 'loi'; err: TikzErr };

/** Một hình: dịch khi đã cuộn tới; đổi mã thì dịch lại (hình cũ vẫn hiện mờ trong lúc chờ). */
const Fig = memo(function Fig({ code, defs, label, gen, caption }: { code: string; defs: string; label: string; gen: number; caption?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [st, setSt] = useState<St>({ s: 'cho' });
  const [last, setLast] = useState<string | null>(null);
  const [log, setLog] = useState(false);
  const prefix = useRef(nextSvgPrefix());

  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen || !isTikzReady()) return;
    let alive = true;
    setSt({ s: 'dang' });
    const job = queue.add(() => renderTikz(code, defs));
    job.promise
      .then((r) => { if (alive) { setSt({ s: 'xong', svg: r.svg, ms: r.ms }); setLast(r.svg); } })
      .catch((e) => { if (alive && !(e instanceof CancelledError)) setSt({ s: 'loi', err: asTikzErr(e) }); });
    return () => { alive = false; job.cancel(); };
  }, [seen, code, defs, gen]);

  const cap = caption ? <span className="tzs-cap">{caption}{st.s === 'dang' ? ' · đang dịch…' : st.s === 'loi' ? ' · lỗi' : ''}</span> : null;
  let body;
  if (!isTikzReady()) body = <div className="tzs-ph">Bản cài trên Windows sẽ dịch hình này bằng TeX Live</div>;
  else if (st.s === 'xong') body = <div className="tzs-svg" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: scopeSvgIds(st.svg, prefix.current) }} />;
  else if (st.s === 'loi') {
    const info = st.err.stage === 'latex' ? classifyTexLog(st.err.message, st.err.log) : null;
    body = (
      <div className="tzs-err">
        <b>{info && info.kind !== 'khac' ? info.label : 'Hình lỗi khi dịch'}</b>
        <span>{st.err.message}</span>
        {info && info.kind !== 'khac' && <span>{info.detail}</span>}
        {st.err.log && <button type="button" className="linkbtn" onClick={() => setLog(!log)}>{log ? 'Ẩn log' : 'Xem log TeX'}</button>}
        {log && <code className="fig-log">{st.err.log}</code>}
      </div>
    );
  } else if (st.s === 'dang' && last) body = <div className="tzs-svg tzs-stale" aria-busy="true" dangerouslySetInnerHTML={{ __html: scopeSvgIds(last, prefix.current) }} />;
  else body = <div className="tzs-ph">{st.s === 'dang' ? 'Đang dịch bằng TeX Live…' : 'Chờ dịch'}</div>;
  return <div className="tzs-fig" ref={box}>{cap}{body}</div>;
});

function Card({ f, gen, onJump, onCopy, onSave, onApply, toast }: {
  f: ScratchFig; gen: number;
  onJump(f: ScratchFig): void; onCopy(code: string): void; onSave(f: ScratchFig, code: string): void;
  /** ghi `to` thay cho `from` ở vị trí `pos` trong bàn nháp; false nếu chỗ đó đã đổi */
  onApply(pos: number, from: string, to: string): boolean;
  toast(m: string): void;
}) {
  const [edit, setEdit] = useState(f.code);
  const [live, setLive] = useState(f.code);
  const [undo, setUndo] = useState<{ pos: number; now: string; was: string } | null>(null);
  const base = useRef(f.code);
  // mã trong bàn nháp đổi (gõ ở trình soạn, hoàn tác…): thẻ chưa sửa thì theo luôn
  useEffect(() => {
    if (edit === base.current) { setEdit(f.code); setLive(f.code); }
    base.current = f.code;
    if (undo && f.code !== undo.now) setUndo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.code]);
  useEffect(() => { const t = setTimeout(() => setLive(edit), LIVE_MS); return () => clearTimeout(t); }, [edit]);

  const dirty = edit !== f.code;
  const apply = () => {
    if (!dirty) return;
    if (onApply(f.start, f.code, edit)) { setUndo({ pos: f.start, now: edit, was: f.code }); toast('Đã áp dụng hình mới vào bàn nháp. Ctrl+Z ở trình soạn (hoặc nút Hoàn tác) để quay lại.'); }
    else toast('Không áp dụng được: mã hình trong bàn nháp vừa đổi. Bấm Bỏ sửa rồi sửa lại.');
  };
  const revert = () => {
    if (!undo) return;
    if (onApply(undo.pos, undo.now, undo.was)) { setUndo(null); setEdit(undo.was); setLive(undo.was); toast('Đã hoàn tác hình về bản trước.'); }
    else toast('Không hoàn tác được: mã hình đã đổi tiếp. Dùng Ctrl+Z ở trình soạn.');
  };
  const rows = Math.min(24, Math.max(4, edit.split('\n').length + 1));
  return (
    <article className={`tzs-card${dirty ? ' dirty' : ''}`}>
      <header className="tzs-head">
        <button type="button" className="linkbtn" onClick={() => onJump(f)} title="Đưa con trỏ trình soạn tới dòng này">{figLabel(f)}</button>
        <span className="tzs-sub">{f.lines} dòng{f.defs ? ' · có khai báo riêng' : ''}{dirty ? ' · đang sửa' : ''}</span>
        <span className="tzs-acts">
          {dirty && <button type="button" className="btn btn-sm btn-dark" onClick={apply} title="Ctrl+Enter">Áp dụng vào mã</button>}
          {dirty && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setEdit(f.code); setLive(f.code); }}>Bỏ sửa</button>}
          {!dirty && undo && <button type="button" className="btn btn-sm btn-ghost" onClick={revert}>Hoàn tác</button>}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onCopy(edit)}>Sao chép</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onSave(f, edit)}>Lưu vào Kho hình</button>
        </span>
      </header>
      <div className="tzs-body">
        <textarea
          className="tzs-code" value={edit} rows={rows} spellCheck={false} aria-label={`Mã hình ${figLabel(f)}`}
          onChange={(e) => setEdit(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); apply(); }
            else if (e.key === 'Escape' && dirty) { e.stopPropagation(); setEdit(f.code); setLive(f.code); }
            else if (e.ctrlKey || e.metaKey) e.stopPropagation(); // Ctrl+Z/Y… là của ô này, không gửi lên màn
          }}
        />
        <div className="tzs-figs">
          {dirty && <Fig code={f.code} defs={f.defs} label={figLabel(f)} gen={gen} caption="Hình hiện tại" />}
          <Fig code={dirty ? live : f.code} defs={f.defs} label={figLabel(f)} gen={gen} caption={dirty ? 'Hình mới' : undefined} />
        </div>
      </div>
    </article>
  );
}

export function TikzSheet({ figs, total, onlyPicked, onJump, onCopy, onSave, onApply, toast }: {
  figs: ScratchFig[];
  /** số hình của cả bàn nháp (để báo khi đang lọc theo câu đã chọn) */
  total: number;
  onlyPicked: boolean;
  onJump(f: ScratchFig): void;
  onCopy(code: string): void;
  onSave(f: ScratchFig, code: string): void;
  onApply(pos: number, from: string, to: string): boolean;
  toast(m: string): void;
}) {
  const [gen, setGen] = useState(0);
  if (!figs.length) {
    return <p className="sys-hint tzs-empty">{onlyPicked && total ? `Các câu đã chọn không có hình TikZ (cả bàn nháp có ${total} hình).` : 'Bàn nháp chưa có khối \\begin{tikzpicture}…\\end{tikzpicture} nào.'}</p>;
  }
  return (
    <div className="tzs">
      <div className="tzs-bar" role="status">
        <span><b>{figs.length}</b> hình TikZ{onlyPicked ? ` trong các câu đã chọn (cả bàn nháp ${total})` : ''} · sửa mã trong thẻ để xem hình mới</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setGen((g) => g + 1)} title="Dịch lại các hình đang hiện">Dịch lại</button>
      </div>
      {figs.map((f) => <Card key={f.i} f={f} gen={gen} onJump={onJump} onCopy={onCopy} onSave={onSave} onApply={onApply} toast={toast} />)}
    </div>
  );
}
