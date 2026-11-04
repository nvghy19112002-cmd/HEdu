// Công cụ vẽ hình bằng giao diện: bảng biến thiên (tkz-tab), bảng xét dấu nhiều hàng, đồ thị hàm số (TikZ). Xem trước ngay bằng TeX Live,
// rồi chèn vào câu / bàn nháp hoặc lưu vào Kho hình. Mã sinh ra cùng kiểu với các hình trong kho MathHub (xem bbtgen.ts, graphgen.ts).
import { Fragment, useEffect, useMemo, useState } from 'react';
import { autoMarks, bbtCode, bbtIssues, DEFAULT_BBT, signTableCode, signTableIssues, type BbtInput, type BbtNode, type Mark, type Sign } from '../lib/bbtgen';
import { DEFAULT_GRAPH, graphCode, graphIssues, suggestWindow, type GraphInput } from '../lib/graphgen';
import { KhoSaveDialog } from './KhoDialogs';
import { KhoThumb } from './KhoThumb';

type Tab = 'bbt' | 'dau' | 'dothi';
const TAB_LABEL: Record<Tab, string> = { bbt: 'Bảng biến thiên', dau: 'Bảng xét dấu', dothi: 'Đồ thị hàm số' };
const MARK_LABEL: Record<Mark, string> = { z: '0 (y′=0)', d: '‖ (không xác định)', t: '┆ (vạch chấm)' };
const parseNums = (s: string): number[] => s.split(/[,;\s]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
const nf = (n: number) => (Number.isFinite(n) ? String(n) : '');
const toSigns = (s: string): Sign[] => s.split(/[\s,]+/).filter(Boolean).map((x) => (x === '+' ? '+' : '-'));
const toMarks = (s: string): Mark[] => s.split(/[\s,]+/).filter(Boolean).map((x) => (x === 'd' ? 'd' : x === 't' ? 't' : 'z'));
/** viết tắt cho người gõ nhanh: -oo / +oo → -\infty / +\infty */
const xfix = (s: string) => s.replace(/(^|[^\\a-z])oo\b/gi, '$1\\infty').replace(/inf(ty)?\b/gi, (m, _g, off, all) => (all[off - 1] === '\\' ? m : '\\infty'));

export function FigureBuilder({ onInsert, onClose, onSaved }: { onInsert?(code: string): void; onClose(): void; onSaved?(msg: string): void }) {
  const [tab, setTab] = useState<Tab>('bbt');
  const [bbt, setBbt] = useState<BbtInput>(DEFAULT_BBT);
  const [dau, setDau] = useState({ xs: '-\\infty, -\\tfrac{1}{2}, 3, +\\infty', rows: [{ label: '2x+1', signs: '- + +', marks: 'z t' }, { label: 'x-3', signs: '- - +', marks: 't z' }, { label: '\\dfrac{2x+1}{x-3}', signs: '+ - +', marks: 'z d' }], nocadre: true, lgt: 1.5, espcl: 2.5 });
  const [g, setG] = useState<GraphInput>(DEFAULT_GRAPH);
  const [marksTxt, setMarksTxt] = useState('');
  const [vTxt, setVTxt] = useState('');
  const [hTxt, setHTxt] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // ---- mã sinh ra + lỗi ----
  const { code, issues } = useMemo((): { code: string; issues: string[] } => {
    try {
      if (tab === 'bbt') { const is = bbtIssues(bbt); return { code: is.length ? '' : bbtCode(bbt), issues: is }; }
      if (tab === 'dau') {
        const xs = dau.xs.split(',').map((x) => xfix(x.trim())).filter(Boolean);
        const inp = { xName: 'x', xs, rows: dau.rows.map((r) => ({ label: r.label, signs: toSigns(r.signs), marks: toMarks(r.marks) })), nocadre: dau.nocadre, lgt: dau.lgt, espcl: dau.espcl };
        const is = signTableIssues(inp);
        return { code: is.length ? '' : signTableCode(inp), issues: is };
      }
      const gi: GraphInput = { ...g, marks: parseNums(marksTxt).map((x) => ({ x })), vAsym: parseNums(vTxt), hAsym: parseNums(hTxt) };
      const is = graphIssues(gi);
      return { code: is.length ? '' : graphCode(gi), issues: is };
    } catch (e) { return { code: '', issues: [e instanceof Error ? e.message : String(e)] }; }
  }, [tab, bbt, dau, g, marksTxt, vTxt, hTxt]);

  // xem trước: chờ ngừng gõ 700 ms rồi mới dịch
  const [shown, setShown] = useState('');
  useEffect(() => { const t = window.setTimeout(() => setShown(code), 700); return () => window.clearTimeout(t); }, [code]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saveOpen) { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [onClose, saveOpen]);

  // ---- bảng biến thiên: sửa nút / dấu ----
  const setNode = (i: number, p: Partial<BbtNode>) => setBbt((b) => ({ ...b, nodes: b.nodes.map((n, k) => (k === i ? { ...n, ...p } : n)) }));
  const setSign = (i: number, s: Sign) => setBbt((b) => {
    const signs = b.signs.map((x, k) => (k === i ? s : x));
    const am = autoMarks(signs);
    // đổi dấu một khoảng thì đặt lại dấu hiệu của hai nút kề nó theo quy tắc mặc định (đổi dấu ⇒ 0, giữ dấu ⇒ ‖)
    return { ...b, signs, nodes: b.nodes.map((n, k) => (k === i || k === i + 1 ? { ...n, mark: am[k] } : n)) };
  });
  const addNode = () => setBbt((b) => {
    const last = b.nodes.length - 1;
    const nodes = [...b.nodes.slice(0, last), { x: '', mark: 'z' as Mark, y: '' }, b.nodes[last]];
    const signs: Sign[] = [...b.signs.slice(0, last), b.signs[last - 1] === '+' ? '-' : '+', ...b.signs.slice(last)];
    const am = autoMarks(signs);
    return { ...b, nodes: nodes.map((n, k) => ({ ...n, mark: am[k] })), signs };
  });
  const delNode = (i: number) => setBbt((b) => {
    if (b.nodes.length <= 2 || i === 0 || i === b.nodes.length - 1) return b;
    const nodes = b.nodes.filter((_, k) => k !== i);
    const signs = b.signs.filter((_, k) => k !== i);
    const am = autoMarks(signs);
    return { ...b, nodes: nodes.map((n, k) => ({ ...n, mark: am[k] })), signs };
  });

  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* không có quyền thì thôi */ } };
  const title = tab === 'bbt' ? 'Bảng biến thiên' : tab === 'dau' ? 'Bảng xét dấu' : `Đồ thị hàm số y = ${g.expr}`;
  const row: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' };

  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm fb" role="dialog" aria-modal="true" aria-label="Vẽ hình bằng công cụ" style={{ maxWidth: 1040, width: 'min(1040px, 96vw)' }}>
        <h3>Vẽ hình bằng công cụ</h3>
        <div className="cfm-body fb-body">
          <div className="fb-left">
            <div className="xl-seg" role="tablist" aria-label="Loại hình">
              {(Object.keys(TAB_LABEL) as Tab[]).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{TAB_LABEL[k]}</button>)}
            </div>

            {tab === 'bbt' && (
              <div className="fb-form">
                <div style={row}>
                  <label>Biến <input className="xl-in" style={{ width: 54 }} value={bbt.xName} onChange={(e) => setBbt({ ...bbt, xName: e.target.value })} /></label>
                  <label>Hàm <input className="xl-in" style={{ width: 84 }} value={bbt.yName} onChange={(e) => setBbt({ ...bbt, yName: e.target.value })} /></label>
                  <label className="sw"><input type="checkbox" checked={bbt.derivName !== null} onChange={(e) => setBbt({ ...bbt, derivName: e.target.checked ? `${bbt.yName}'` : null })} />Hàng đạo hàm</label>
                  {bbt.derivName !== null && <label>Tên <input className="xl-in" style={{ width: 84 }} value={bbt.derivName} onChange={(e) => setBbt({ ...bbt, derivName: e.target.value })} /></label>}
                </div>
                <table className="fb-tab" aria-label="Các giá trị x">
                  <thead><tr><th>x</th><th>y′ tại x</th><th>y tại x</th><th>y bên phải (nếu ‖)</th><th /></tr></thead>
                  <tbody>
                    {bbt.nodes.map((n, i) => (
                      <Fragment key={i}>
                        <tr>
                          <td><input className="xl-in" value={n.x} aria-label={`x thứ ${i + 1}`} placeholder="vd -\infty, 1" onChange={(e) => setNode(i, { x: xfix(e.target.value) })} /></td>
                          <td>{i === 0 || i === bbt.nodes.length - 1 ? <span className="xl-meta">—</span> : <select className="xl-in" value={n.mark} aria-label={`Vạch tại x thứ ${i + 1}`} onChange={(e) => setNode(i, { mark: e.target.value as Mark })}>{(Object.keys(MARK_LABEL) as Mark[]).map((m) => <option key={m} value={m}>{MARK_LABEL[m]}</option>)}</select>}</td>
                          <td><input className="xl-in" value={n.y} aria-label={`y thứ ${i + 1}`} placeholder="vd 3, -\frac{4}{9}" onChange={(e) => setNode(i, { y: xfix(e.target.value) })} disabled={bbt.derivName === null} /></td>
                          <td>{n.mark === 'd' && i > 0 && i < bbt.nodes.length - 1 ? <input className="xl-in" value={n.yRight ?? ''} aria-label={`y phải thứ ${i + 1}`} onChange={(e) => setNode(i, { yRight: xfix(e.target.value) })} /> : null}</td>
                          <td>{i > 0 && i < bbt.nodes.length - 1 && <button type="button" className="btn btn-sm" aria-label={`Xoá x thứ ${i + 1}`} onClick={() => delNode(i)}>✕</button>}</td>
                        </tr>
                        {i < bbt.nodes.length - 1 && (
                          <tr className="fb-sign">
                            <td colSpan={5}>
                              <span className="xl-meta">Khoảng {i + 1}: y′ mang dấu</span>{' '}
                              <select className="xl-in" style={{ width: 150 }} value={bbt.signs[i]} aria-label={`Dấu y′ khoảng ${i + 1}`} onChange={(e) => setSign(i, e.target.value as Sign)}><option value="+">+ (đồng biến)</option><option value="-">− (nghịch biến)</option></select>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                <div style={row}>
                  <button type="button" className="btn btn-sm" onClick={addNode}>+ Thêm giá trị x</button>
                  <label className="sw"><input type="checkbox" checked={bbt.nocadre} onChange={(e) => setBbt({ ...bbt, nocadre: e.target.checked })} />Không khung ngoài</label>
                  <label>Rộng nhãn <input className="xl-in" type="number" step="0.1" style={{ width: 64 }} value={bbt.lgt} onChange={(e) => setBbt({ ...bbt, lgt: +e.target.value || 1.2 })} /></label>
                  <label>Giãn cột <input className="xl-in" type="number" step="0.5" style={{ width: 64 }} value={bbt.espcl} onChange={(e) => setBbt({ ...bbt, espcl: +e.target.value || 2.5 })} /></label>
                </div>
                <p className="xl-meta">Gõ <code>-oo</code>, <code>+oo</code> cho ∓∞. Mũi tên lên/xuống tự suy từ dấu của y′; nút đổi dấu tự là 0, nút giữ dấu tự là ‖ (tiệm cận), đổi lại được.</p>
              </div>
            )}

            {tab === 'dau' && (
              <div className="fb-form">
                <label>Các giá trị x (cách nhau dấu phẩy, gõ <code>-oo</code>/<code>+oo</code> cho ∓∞)
                  <input className="xl-in" style={{ width: '100%' }} value={dau.xs} onChange={(e) => setDau({ ...dau, xs: e.target.value })} />
                </label>
                {dau.rows.map((r, i) => (
                  <div key={i} className="fb-rowbox">
                    <div style={row}>
                      <label>Hàng {i + 1} <input className="xl-in" style={{ width: 160 }} value={r.label} aria-label={`Tên hàng ${i + 1}`} onChange={(e) => setDau({ ...dau, rows: dau.rows.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /></label>
                      <button type="button" className="btn btn-sm" disabled={dau.rows.length <= 1} onClick={() => setDau({ ...dau, rows: dau.rows.filter((_, k) => k !== i) })}>Xoá hàng</button>
                    </div>
                    <div style={row}>
                      <label>Dấu từng khoảng <input className="xl-in" style={{ width: 150 }} value={r.signs} aria-label={`Dấu hàng ${i + 1}`} onChange={(e) => setDau({ ...dau, rows: dau.rows.map((x, k) => (k === i ? { ...x, signs: e.target.value } : x)) })} placeholder="vd + - +" /></label>
                      <label>Vạch ở các giá trị giữa <input className="xl-in" style={{ width: 110 }} value={r.marks} aria-label={`Vạch hàng ${i + 1}`} onChange={(e) => setDau({ ...dau, rows: dau.rows.map((x, k) => (k === i ? { ...x, marks: e.target.value } : x)) })} placeholder="vd z d" /></label>
                    </div>
                  </div>
                ))}
                <div style={row}>
                  <button type="button" className="btn btn-sm" onClick={() => setDau({ ...dau, rows: [...dau.rows, { label: 'f(x)', signs: '+ - +', marks: 'z z' }] })}>+ Thêm hàng</button>
                  <label className="sw"><input type="checkbox" checked={dau.nocadre} onChange={(e) => setDau({ ...dau, nocadre: e.target.checked })} />Không khung ngoài</label>
                </div>
                <p className="xl-meta">Vạch: <code>z</code> = 0, <code>d</code> = ‖ (không xác định), <code>t</code> = vạch chấm. Số dấu bằng số khoảng; số vạch bằng số giá trị giữa.</p>
              </div>
            )}

            {tab === 'dothi' && (
              <div className="fb-form">
                <label>Hàm số y = <input className="xl-in" style={{ width: '70%' }} value={g.expr} onChange={(e) => setG({ ...g, expr: e.target.value })} placeholder="vd x^3-3x+1, (x+1)/(x-2), sqrt(x), sin(x)" aria-label="Hàm số" /></label>
                <div style={row}>
                  <label>x từ <input className="xl-in" type="number" step="0.5" style={{ width: 74 }} value={nf(g.xmin)} onChange={(e) => setG({ ...g, xmin: +e.target.value })} /></label>
                  <label>đến <input className="xl-in" type="number" step="0.5" style={{ width: 74 }} value={nf(g.xmax)} onChange={(e) => setG({ ...g, xmax: +e.target.value })} /></label>
                  <label>y từ <input className="xl-in" type="number" step="0.5" style={{ width: 74 }} value={nf(g.ymin)} onChange={(e) => setG({ ...g, ymin: +e.target.value })} /></label>
                  <label>đến <input className="xl-in" type="number" step="0.5" style={{ width: 74 }} value={nf(g.ymax)} onChange={(e) => setG({ ...g, ymax: +e.target.value })} /></label>
                  <button type="button" className="btn btn-sm" onClick={() => { try { setG({ ...g, ...suggestWindow(g.expr, g.xmin, g.xmax) }); } catch { /* biểu thức lỗi: đã báo ở dưới */ } }} title="Tự chọn khoảng y vừa với đường cong">Gợi ý khung y</button>
                </div>
                <div style={row}>
                  <label>Tỉ lệ <input className="xl-in" type="number" step="0.1" style={{ width: 64 }} value={nf(g.scale)} onChange={(e) => setG({ ...g, scale: +e.target.value })} /></label>
                  <label>Số điểm <input className="xl-in" type="number" step="50" style={{ width: 74 }} value={nf(g.samples)} onChange={(e) => setG({ ...g, samples: +e.target.value })} /></label>
                  <label className="sw"><input type="checkbox" checked={g.showO} onChange={(e) => setG({ ...g, showO: e.target.checked })} />Ghi gốc O</label>
                </div>
                <label>Điểm đánh dấu trên trục x (cách nhau dấu phẩy) <input className="xl-in" style={{ width: '100%' }} value={marksTxt} onChange={(e) => setMarksTxt(e.target.value)} placeholder="vd -1, 2" /></label>
                <div style={row}>
                  <label>Tiệm cận đứng x = <input className="xl-in" style={{ width: 110 }} value={vTxt} onChange={(e) => setVTxt(e.target.value)} placeholder="vd 2" /></label>
                  <label>Tiệm cận ngang y = <input className="xl-in" style={{ width: 110 }} value={hTxt} onChange={(e) => setHTxt(e.target.value)} placeholder="vd 1" /></label>
                </div>
                <p className="xl-meta">Gõ như bình thường: <code>2x^2-3x+1</code>, <code>x(x-1)</code>, <code>1/x</code>, <code>sqrt(x)</code>, <code>ln(x)</code>, <code>sin(x)</code>, <code>pi</code>. Dùng dấu chấm cho số thập phân.</p>
              </div>
            )}
          </div>

          <div className="fb-right">
            <div className="fb-prev" aria-label="Xem trước">
              {code && shown === code
                ? <KhoThumb id="fb-preview" code={shown} defs="" big />
                : issues.length ? <p className="te-warn" role="alert">{issues.map((x, i) => <span key={i}>{x}<br /></span>)}</p> : <span className="xl-meta">Đang chờ…</span>}
            </div>
            <label className="xm-field">Mã TikZ sinh ra
              <textarea className="xl-in fb-code" readOnly value={code || ''} aria-label="Mã TikZ" onFocus={(e) => e.currentTarget.select()} />
            </label>
          </div>
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>
          <button type="button" className="btn" disabled={!code} onClick={() => { void copy(); }}>{copied ? 'Đã chép' : 'Chép mã'}</button>
          <button type="button" className="btn" disabled={!code} onClick={() => setSaveOpen(true)}>Lưu vào Kho hình…</button>
          {onInsert && <button type="button" className="btn btn-accent" disabled={!code} onClick={() => onInsert(code)}>Chèn vào câu</button>}
        </div>
      </div>
      {saveOpen && <KhoSaveDialog latex={code} stem={title} onClose={() => setSaveOpen(false)} onDone={(m) => { setSaveOpen(false); onSaved?.(m); }} />}
    </>
  );
}
