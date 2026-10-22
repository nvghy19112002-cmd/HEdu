// Màn hình Tạo đề: ma trận 3 phần (đề 2025) hoặc chọn tay; sinh nhiều mã đề, bảng đáp án, xuất .tex.
import { useMemo, useState } from 'react';
import { useApp } from '../app-context';
import { QuestionView } from '../components/QuestionView';
import { IcCheck, IcX } from '../components/Icons';
import { chapters as chaptersOf, grades } from '../lib/curriculum';
import { shortName } from '../lib/taxonomy';
import { available, CELLS, examToTex, makeVariants, partTitle, pickByMatrix, pickManual, POINTS, shortages, type Cell, type MatrixRow, type Picked, type Variant } from '../lib/exam';
import { useBank } from '../lib/store';

/** Ma trận mở sẵn: ba chương đầu của lớp cao nhất, mỗi ô một câu để thấy cách dùng. */
function defaultRows(list: { id: string }[]): MatrixRow[] {
  return list.slice(0, 3).map((c) => ({ chapterId: c.id, nb: 1, th: 1, vd: 0, ds: 1, tln: 1 }));
}

const CELL_ARIA: Record<Cell, string> = { nb: 'Phần I, Nhận biết', th: 'Phần I, Thông hiểu', vd: 'Phần I, Vận dụng', ds: 'Phần II', tln: 'Phần III' };
const LEVEL_SHORT: Record<Cell, string> = { nb: 'NB', th: 'TH', vd: 'VD', ds: 'Đ/S', tln: 'TLN' };

function PartHead({ text }: { text: string }) {
  const k = text.indexOf('. ');
  return <p className="sheet-part"><b>{text.slice(0, k + 1)}</b>{text.slice(k + 1)}</p>;
}

function fmt(n: number) { return n.toLocaleString('vi-VN', { maximumFractionDigits: 2 }); }

export function ExamScreen({ pick }: { pick?: string[] }) {
  const { go, toast, showFile } = useApp();
  const { questions } = useBank();
  const [mode, setMode] = useState<'matrix' | 'manual'>(pick?.length ? 'manual' : 'matrix');
  const [grade, setGrade] = useState(12);
  const [rows, setRows] = useState<MatrixRow[]>(() => defaultRows(chaptersOf(grades()[grades().length - 1] ?? 12)));
  const [school, setSchool] = useState('');
  const [title, setTitle] = useState('Kiểm tra cuối học kì I');
  const [minutes, setMinutes] = useState(90);
  const [n, setN] = useState(4);
  const [shuffleQ, setShuffleQ] = useState(true);
  const [shuffleO, setShuffleO] = useState(true);
  const [withSol, setWithSol] = useState(false);
  const [withKey, setWithKey] = useState(true);
  const [result, setResult] = useState<{ variants: Variant[]; sig: string } | null>(null);
  const [shown, setShown] = useState(0);

  const manualQs = useMemo(() => questions.filter((q) => pick?.includes(q.uid)), [questions, pick]);
  const miss = useMemo(() => shortages(questions, rows), [questions, rows]);
  const chapters = chaptersOf(grade);

  const tot = { nb: 0, th: 0, vd: 0, ds: 0, tln: 0 } as Record<Cell, number>;
  rows.forEach((r) => CELLS.forEach((c) => (tot[c] += r[c])));
  const manualPicked: Picked = pickManual(manualQs);
  const p1 = mode === 'matrix' ? tot.nb + tot.th + tot.vd : manualPicked.p1.length;
  const p2 = mode === 'matrix' ? tot.ds : manualPicked.p2.length;
  const p3 = mode === 'matrix' ? tot.tln : manualPicked.p3.length;
  const p4 = mode === 'matrix' ? 0 : manualPicked.p4.length;
  const totalQ = p1 + p2 + p3 + p4;

  const sig = JSON.stringify([mode, rows, pick, n, shuffleQ, shuffleO]);
  const stale = result != null && result.sig !== sig;
  const canGenerate = totalQ > 0 && (mode === 'manual' || miss.length === 0);

  const generate = () => {
    const seed = Math.floor(Math.random() * 1e9);
    const picked = mode === 'matrix' ? pickByMatrix(questions, rows, seed) : manualPicked;
    const variants = makeVariants(picked, { count: n, firstCode: 101, shuffleQuestions: shuffleQ, shuffleOptions: shuffleO, seed });
    setResult({ variants, sig });
    setShown(0);
    toast(`Đã sinh ${n} mã đề, mỗi đề ${totalQ} câu.`);
  };

  const exportTex = () => {
    if (!result) return;
    const slug = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-');
    showFile({ title: `Mã LaTeX · ${n} mã đề`, name: `de-${slug}.tex`, text: examToTex({ school, title, minutes, grade }, result.variants, { withSolution: withSol, withKey }), mime: 'application/x-tex' });
  };

  const setCell = (i: number, c: Cell, v: number) => setRows(rows.map((r, k) => (k === i ? { ...r, [c]: Math.max(0, Math.min(40, v || 0)) } : r)));
  const unused = chapters.filter((c) => !rows.some((r) => r.chapterId === c.id));

  const variant = result?.variants[Math.min(shown, (result?.variants.length ?? 1) - 1)];

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="crumbs">Tạo đề / Đề mới · Toán {grade}</span>
          <h1>{mode === 'matrix' ? 'Tạo đề theo ma trận' : 'Tạo đề từ câu đã chọn'}</h1>
        </div>
        <div className="seg" role="group" aria-label="Cách chọn câu">
          <button type="button" aria-pressed={mode === 'matrix'} onClick={() => setMode('matrix')}>Theo ma trận</button>
          <button type="button" aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>Chọn tay từ ngân hàng</button>
        </div>
      </header>

      <div className="body-row">
        <div style={{ flex: '999 1 620px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {mode === 'matrix' ? (
            <section className="mx-sec" aria-label="Ma trận đề">
              <div className="mx-head">
                <h2>Ma trận · cấu trúc 3 phần</h2>
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Tổng <b style={{ color: 'var(--ink)' }}>{totalQ} câu</b> · <b style={{ color: 'var(--ink)' }}>{fmt(p1 * POINTS.p1 + p2 * POINTS.p2 + p3 * POINTS.p3)} điểm</b></span>
              </div>
              <div className="mx-wrap">
                <table className="mx">
                  <thead>
                    <tr>
                      <th rowSpan={2} scope="col" style={{ verticalAlign: 'bottom' }}>Chương</th>
                      <th colSpan={3} scope="colgroup" style={{ borderBottom: 'none', color: 'var(--ink)' }}>Phần I · Trắc nghiệm</th>
                      <th scope="col" style={{ borderBottom: 'none', color: 'var(--ink)' }}>Phần II</th>
                      <th scope="col" style={{ borderBottom: 'none', color: 'var(--ink)' }}>Phần III</th>
                      <th rowSpan={2} scope="col" style={{ verticalAlign: 'bottom' }}>Kho câu hỏi</th>
                      <th rowSpan={2} scope="col"><span className="sr-only">Bỏ dòng</span></th>
                    </tr>
                    <tr><th scope="col">NB</th><th scope="col">TH</th><th scope="col">VD</th><th scope="col">Đúng / Sai</th><th scope="col">Trả lời ngắn</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const ch = chapters.find((c) => c.id === r.chapterId);
                      const rowMiss = miss.filter((m) => m.chapterId === r.chapterId);
                      return (
                        <tr key={r.chapterId} className={rowMiss.length ? 'short-row' : undefined}>
                          <td style={{ fontWeight: 500 }}>{ch ? shortName(ch.name) : r.chapterId}</td>
                          {CELLS.map((c) => {
                            const have = available(questions, r.chapterId, c);
                            return (
                              <td key={c}>
                                <input className={`num${r[c] > have ? ' over' : ''}`} type="number" min={0} max={40} value={r[c]} aria-label={`${ch ? shortName(ch.name) : ''}, ${CELL_ARIA[c]}`} onChange={(e) => setCell(i, c, Number(e.target.value))} />
                                <span className="avail">có {have}</span>
                              </td>
                            );
                          })}
                          <td>
                            {rowMiss.length ? (
                              <button type="button" className="linkbtn" style={{ textAlign: 'left' }} onClick={() => go({ screen: 'editor' })}>
                                Thiếu {rowMiss.map((m) => `${m.need - m.have} câu ${LEVEL_SHORT[m.cell]}`).join(', ')} · Soạn thêm
                              </button>
                            ) : (
                              <span className="okmark"><IcCheck />Đủ câu</span>
                            )}
                          </td>
                          <td><button type="button" className="ico" style={{ width: 32, height: 32 }} aria-label={`Bỏ chương ${ch ? shortName(ch.name) : ''}`} onClick={() => setRows(rows.filter((_, k) => k !== i))}><IcX /></button></td>
                        </tr>
                      );
                    })}
                    <tr style={{ fontWeight: 700 }}>
                      <td>Số câu</td>
                      {CELLS.map((c) => <td key={c}>{tot[c]}</td>)}
                      <td /><td />
                    </tr>
                    <tr style={{ color: 'var(--ink-2)' }}>
                      <td style={{ fontWeight: 600 }}>Điểm</td>
                      <td colSpan={3}>{p1} × 0,25 = {fmt(p1 * POINTS.p1)}</td>
                      <td>{p2} × 1,0 = {fmt(p2 * POINTS.p2)}</td>
                      <td>{p3} × 0,5 = {fmt(p3 * POINTS.p3)}</td>
                      <td /><td />
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mx-foot">
                {unused.length > 0 && (
                  <label className="lbl" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <span>Thêm chương</span>
                    <select className="sel" style={{ width: 'auto', maxWidth: 360 }} value="" onChange={(e) => e.target.value && setRows([...rows, { chapterId: e.target.value, nb: 0, th: 0, vd: 0, ds: 0, tln: 0 }])}>
                      <option value="">Chọn chương…</option>
                      {unused.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                )}
                <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 'auto' }}>Đề chuẩn 2025: 12 câu phần I, 4 câu phần II, 6 câu phần III.</span>
              </div>
            </section>
          ) : (
            <section className="panel" aria-label="Câu đã chọn">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h2>Câu đã chọn từ ngân hàng</h2>
                <button type="button" className="btn btn-sm" onClick={() => go({ screen: 'bank' })}>Chọn lại trong ngân hàng</button>
              </div>
              {manualQs.length ? (
                <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                  Phần I: <b>{p1}</b> câu · Phần II: <b>{p2}</b> câu · Phần III: <b>{p3}</b> câu{p4 ? <> · Tự luận: <b>{p4}</b> câu</> : null}
                </span>
              ) : (
                <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>Chưa chọn câu nào. Vào Ngân hàng, tích chọn câu rồi bấm “Thêm vào đề”.</span>
              )}
            </section>
          )}

          <section className="sheet-wrap" aria-label="Xem trước trang đề">
            {result && (
              <div className="codes" role="group" aria-label="Xem mã đề">
                {result.variants.map((v, i) => <button key={v.code} type="button" className="code" aria-pressed={i === shown} onClick={() => setShown(i)}>Mã {v.code}</button>)}
              </div>
            )}
            <div className="sheet">
              <div className="sheet-top">
                <div><b>[TÊN SỞ GD&amp;ĐT]</b><b>{school || '[TÊN TRƯỜNG]'}</b></div>
                <div><b>{title.toUpperCase()}</b><span>Môn: Toán {grade} · Thời gian: {minutes} phút</span></div>
              </div>
              <div className="sheet-code">Mã đề {variant?.code ?? '101'}</div>
              {stale && <p className="sheet-part" style={{ color: 'var(--accent)' }}>Thiết lập đã đổi — bấm “Sinh {n} mã đề” để cập nhật.</p>}
              {variant ? (
                variant.parts.map((items, pi) => items.length > 0 && (
                  <div key={pi} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <PartHead text={partTitle(pi, 1, items.length)} />
                    {items.map((it, k) => <QuestionView key={it.q.uid} p={it.parsed} order={it.order} number={k + 1} variant="exam" showAnswer={false} showSolution={withSol} />)}
                  </div>
                ))
              ) : (
                <p className="sheet-blank">Bấm “Sinh {n} mã đề” để xem trước đề thật.</p>
              )}
            </div>
          </section>

          {result && withKey && (
            <section className="panel" aria-label="Bảng đáp án">
              <h2>Bảng đáp án</h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="keytbl">
                  <thead>
                    <tr>
                      <th>Mã đề</th>
                      {result.variants[0].key[0].map((_, i) => <th key={'a' + i}>I.{i + 1}</th>)}
                      {result.variants[0].key[1].map((_, i) => <th key={'b' + i}>II.{i + 1}</th>)}
                      {result.variants[0].key[2].map((_, i) => <th key={'c' + i}>III.{i + 1}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.variants.map((v) => (
                      <tr key={v.code}>
                        <td>{v.code}</td>
                        {[...v.key[0], ...v.key[1], ...v.key[2]].map((k, i) => <td key={i}>{k}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="aside" style={{ maxWidth: 380 }} aria-label="Thiết lập đề">
          <div className="panel">
            <h2>Thông tin đề</h2>
            <label className="lbl">Trường<input className="inp" type="text" placeholder="[TÊN TRƯỜNG]" value={school} onChange={(e) => setSchool(e.target.value)} /></label>
            <label className="lbl">Kỳ thi<input className="inp" type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <div className="grid2">
              <label className="lbl">Thời gian (phút)<input className="inp" type="number" min={15} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 0)} /></label>
              <label className="lbl">Lớp
                <select className="sel" value={grade} onChange={(e) => {
                  const g = Number(e.target.value);
                  setGrade(g);
                  setRows(defaultRows(chaptersOf(g)));
                }}>
                  {[...grades()].reverse().map((g) => <option key={g} value={g}>Lớp {g}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="panel" style={{ gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h2>Số mã đề</h2>
              <div className="stepper">
                <button type="button" aria-label="Bớt một mã đề" onClick={() => setN(Math.max(1, n - 1))}>−</button>
                <span aria-live="polite">{n}</span>
                <button type="button" aria-label="Thêm một mã đề" onClick={() => setN(Math.min(24, n + 1))}>+</button>
              </div>
            </div>
            <div className="codes">{Array.from({ length: n }, (_, i) => <span key={i} className="code">{101 + i}</span>)}</div>
            <div className="divider" />
            <label className="sw">Trộn thứ tự câu trong từng phần<input type="checkbox" checked={shuffleQ} onChange={(e) => setShuffleQ(e.target.checked)} /></label>
            <label className="sw">Trộn phương án A, B, C, D<input type="checkbox" checked={shuffleO} onChange={(e) => setShuffleO(e.target.checked)} /></label>
            <label className="sw">Kèm lời giải cuối đề<input type="checkbox" checked={withSol} onChange={(e) => setWithSol(e.target.checked)} /></label>
            <label className="sw">Kèm bảng đáp án mọi mã đề<input type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} /></label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" className="btn btn-dark" style={{ height: 48 }} disabled={!canGenerate} onClick={generate}>Sinh {n} mã đề</button>
            {!canGenerate && mode === 'matrix' && miss.length > 0 && <span style={{ fontSize: 12.5, color: 'var(--accent)' }}>Ngân hàng chưa đủ câu cho ma trận — soạn thêm hoặc giảm số câu ở ô viền đỏ.</span>}
            <div className="grid2" style={{ gap: 10 }}>
              <button type="button" className="btn btn-accent" style={{ height: 48 }} disabled={!result} onClick={() => toast('Xuất Word sẽ chạy trong bản cài trên Windows.')}>Xuất Word</button>
              <button type="button" className="btn btn-outline" style={{ height: 48 }} disabled={!result} onClick={exportTex}>Xuất .tex</button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
