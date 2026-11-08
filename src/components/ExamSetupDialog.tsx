// Hộp thoại "Thiết lập đề": khung tiêu đề + chia câu theo phần + đoạn mở đầu mỗi phần (claude/thiet-ke-thiet-lap-de.md).
// Đọc tệp đề → xem trước → ghi (bản cũ được HEdu chụp vào lịch sử phiên bản) → Hoàn tác được ngay trong hộp thoại.
import { useEffect, useMemo, useState } from 'react';
import { fileList, fileRead, fileWrite, type TextFile } from '../lib/examfiles';
import type { PartKey } from '../lib/examgen';
import {
  countParts, EMPTY_FRAME, introCode, loadIntro, misplaced, PART_KIND, pickSetupFile, planSetup, saveIntro, scanSetup, setSetupAsk, setupAskOn, SETUP_PARTS,
  type FrameInfo, type IntroSet, type SetupScan,
} from '../lib/examsetup';
import { loadDefaultInfo } from '../lib/examtheme';

interface Props {
  id: string;
  name: string;
  mainFile: string | null;
  /** mở ngay sau khi nhập đề: hiện ô "Không hỏi lại" */
  fromImport?: boolean;
  onClose(): void;
  /** đã ghi (hoặc đã hoàn tác) tệp này */
  onWritten?(rel: string): void;
  /** văn bản OCR thô: chuyển sang Xử lí TeX */
  onOpenScratch?(text: string): void;
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ROMAN = ['I', 'II', 'III', 'IV'];
type Loaded = { rel: string; file: TextFile; scan: SetupScan };

export function ExamSetupDialog({ id, name, mainFile, fromImport, onClose, onWritten, onOpenScratch }: Props) {
  const [files, setFiles] = useState<{ rel: string; count: number }[]>([]);
  const [cur, setCur] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [parts, setParts] = useState<PartKey[]>([]);
  const [heads, setHeads] = useState<'update' | 'keep'>('update');
  const [intro, setIntro] = useState<IntroSet>(loadIntro);
  const [useFrame, setUseFrame] = useState(true);
  const [frame, setFrame] = useState<FrameInfo>(EMPTY_FRAME);
  const [step, setStep] = useState<'edit' | 'preview' | 'done'>('edit');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ rel: string; before: string; sha: string; eol: string; bom: boolean; undone: boolean } | null>(null);
  const [ask, setAsk] = useState(setupAskOn);

  const open = async (rel: string, cache?: Map<string, TextFile>) => {
    const file = cache?.get(rel) ?? (await fileRead(id, rel));
    const scan = scanSetup(file.text);
    setCur({ rel, file, scan });
    setParts(scan.blocks.map((b) => b.part));
    const fi = scan.frame.kind === 'name' ? scan.frame.info : scan.frame.kind === 'marker' ? scan.frame.info : null;
    if (fi) setFrame(fi);
    else { const d = loadDefaultInfo(); setFrame({ ...EMPTY_FRAME, dept: d.dept, school: d.school, group: d.group, title: name }); }
    setHeads('update'); setStep('edit');
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const l = await fileList(id);
      const tex = l.files.filter((f) => f.kind === 'text' && /\.tex$/i.test(f.rel)).slice(0, 30);
      const cache = new Map<string, TextFile>();
      const counts: { rel: string; count: number }[] = [];
      for (const f of tex) {
        try { const r = await fileRead(id, f.rel); cache.set(f.rel, r); counts.push({ rel: f.rel, count: scanSetup(r.text).blocks.length }); } catch { counts.push({ rel: f.rel, count: 0 }); }
      }
      if (!alive) return;
      setFiles(counts);
      const rel = pickSetupFile(counts, mainFile);
      if (!rel) { setErr('Đề chưa có tệp .tex nào.'); return; }
      await open(rel, cache);
    })().catch((e) => { if (alive) setErr(msg(e)); });
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc đóng hộp thoại (không để lọt xuống màn Biên tập đề)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);

  const scan = cur?.scan;
  const counts = useMemo(() => countParts(parts), [parts]);
  const present = SETUP_PARTS.filter((p) => counts[p] > 0);
  const off = useMemo(() => misplaced(parts), [parts]);
  const handHeads = scan ? scan.headings.filter((h) => !h.marker).length : 0;
  const plan = useMemo(() => (cur && cur.scan.blocks.length ? planSetup(cur.file.text, cur.scan, { parts, headings: heads, intro, frame: useFrame ? frame : null }) : null), [cur, parts, heads, intro, useFrame, frame]);
  const planErr = plan && 'error' in plan ? plan.error : null;
  const unchanged = !!plan && !('error' in plan) && !!cur && plan.text === cur.file.text.replace(/\r\n?/g, '\n');

  const setF = (k: keyof FrameInfo) => (e: React.ChangeEvent<HTMLInputElement>) => setFrame({ ...frame, [k]: k === 'minutes' ? Math.max(0, Math.min(600, Number(e.target.value) || 0)) : e.target.value });
  const setI = (p: PartKey, k: 'title' | 'sentence', v: string) => setIntro({ ...intro, [p]: { ...intro[p], [k]: v } });

  const write = async () => {
    if (!cur || !plan || 'error' in plan) return;
    setBusy(true); setErr(null);
    try {
      const eol = cur.file.eol === 'crlf' ? 'crlf' : 'lf';
      const w = await fileWrite(id, cur.rel, plan.text, eol, cur.file.bom, cur.file.sha256);
      if (w.status === 'conflict') { setErr('Tệp vừa bị sửa ở nơi khác (hoặc có thay đổi chưa lưu). Lưu/đóng tệp rồi mở lại hộp thoại.'); return; }
      saveIntro(intro);
      if (fromImport) setSetupAsk(ask);
      setDone({ rel: cur.rel, before: cur.file.text, sha: w.sha256, eol, bom: cur.file.bom, undone: false });
      setStep('done');
      onWritten?.(cur.rel);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  const undo = async () => {
    if (!done) return;
    setBusy(true); setErr(null);
    try {
      const w = await fileWrite(id, done.rel, done.before, done.eol, done.bom, done.sha);
      if (w.status === 'conflict') { setErr('Tệp đã được sửa sau khi thiết lập nên không hoàn tác tự động được. Dùng nút Lịch sử ở màn Biên tập đề để lấy lại bản cũ.'); return; }
      setDone({ ...done, undone: true });
      onWritten?.(done.rel);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };

  const foot = step === 'done'
    ? <span className="qm-nav">
        {done && !done.undone && <button type="button" className="btn btn-outline" disabled={busy} onClick={undo}>Hoàn tác</button>}
        <button type="button" className="btn btn-accent" onClick={onClose}>Đóng</button>
      </span>
    : <>
        {fromImport ? <label className="sw su-ask"><input type="checkbox" checked={!ask} onChange={(e) => { setAsk(!e.target.checked); setSetupAsk(!e.target.checked); }} />Không hỏi lại khi nhập đề</label> : <span />}
        <span className="qm-nav">
          {step === 'preview' && <button type="button" className="btn btn-outline" onClick={() => setStep('edit')}>← Sửa tiếp</button>}
          <button type="button" className="btn btn-outline" onClick={onClose}>{fromImport ? 'Để sau' : 'Huỷ'}</button>
          {step === 'edit'
            ? <button type="button" className="btn btn-accent" disabled={!plan || !!planErr || unchanged} title={unchanged ? 'Đề đã đúng như thiết lập, không có gì để ghi' : undefined} onClick={() => setStep('preview')}>Xem trước</button>
            : <button type="button" className="btn btn-accent" disabled={busy || !plan || !!planErr} onClick={write}>{busy ? 'Đang ghi…' : 'OK, ghi vào đề'}</button>}
        </span>
      </>;

  return (
    <>
      <div className="qm-scrim" onClick={onClose} />
      <div className="qm xm su" role="dialog" aria-modal="true" aria-label="Thiết lập đề">
        <div className="qm-head"><div className="xm-title"><b>Thiết lập đề</b> <span className="su-name">{name}</span></div><button type="button" className="btn btn-sm qm-x" aria-label="Đóng (Esc)" onClick={onClose}>✕</button></div>
        <div className="qm-body">
          {err && <p className="su-err" role="alert">{err}</p>}
          {!cur && !err && <p className="aid-wait">Đang đọc đề…</p>}
          {cur && scan && step === 'done' && done && (
            <div className="su-done">
              <p>{done.undone ? <>Đã hoàn tác: <code>{done.rel}</code> trở lại như trước.</> : <>Đã ghi vào <code>{done.rel}</code>. Bản cũ vẫn nằm trong <b>Lịch sử</b> của tệp.</>}</p>
            </div>
          )}
          {cur && scan && step === 'preview' && plan && !('error' in plan) && (
            <>
              <p className="xl-meta">Tệp <code>{cur.rel}</code> sau khi thiết lập{plan.reordered ? ' (câu đã được sắp lại theo phần, nội dung từng câu giữ nguyên)' : ''}. Kiểm tra rồi bấm <b>OK, ghi vào đề</b>.</p>
              <pre className="su-pre">{plan.text}</pre>
            </>
          )}
          {cur && scan && step === 'edit' && (
            <>
              {files.length > 1 && (
                <label className="xm-field">Tệp chứa câu
                  <select className="xl-in" value={cur.rel} onChange={(e) => { void open(e.target.value).catch((x) => setErr(msg(x))); }}>
                    {files.map((f) => <option key={f.rel} value={f.rel}>{f.rel} · {f.count} câu</option>)}
                  </select>
                </label>
              )}

              {scan.blocks.length === 0 ? (
                <div className="su-empty">
                  {scan.raw
                    ? <><p><b>Tệp chưa có khung câu</b> (<code>\begin{'{'}ex{'}'}…\end{'{'}ex{'}'}</code>), có vẻ là văn bản OCR thô (“Câu 1.”, “A. … B. …”).</p>
                        <p>Mở ở <b>Xử lí TeX</b> (bàn nháp mới) để thêm khung cho từng câu và xem trước, rồi chép lại vào đề và mở Thiết lập đề lần nữa.</p>
                        {onOpenScratch && <button type="button" className="btn btn-accent" onClick={() => onOpenScratch(cur.file.text)}>Mở ở Xử lí TeX</button>}</>
                    : <p>Không tìm thấy câu nào dạng <code>\begin{'{'}ex{'}'}…\end{'{'}ex{'}'}</code> trong <code>{cur.rel}</code>.</p>}
                </div>
              ) : (
                <>
                  <section className="su-sec">
                    <h4><label className="sw"><input type="checkbox" checked={useFrame} onChange={(e) => setUseFrame(e.target.checked)} />Khung tiêu đề</label>
                      <span className="su-hint">{scan.frame.kind === 'name' ? 'điền vào \\begin{name} có sẵn' : scan.frame.kind === 'marker' ? 'thay khung HEdu đã chèn' : 'chèn khung mới ở đầu đề'}</span></h4>
                    {useFrame && (
                      <div className="su-grid">
                        <label>Sở / Phòng <input className="xl-in" value={frame.dept} onChange={setF('dept')} /></label>
                        <label>Trường <input className="xl-in" value={frame.school} onChange={setF('school')} /></label>
                        <label>Tổ <input className="xl-in" value={frame.group} onChange={setF('group')} /></label>
                        <label className="su-wide">Kỳ thi / tên đề <input className="xl-in" value={frame.title} onChange={setF('title')} /></label>
                        <label>Môn <input className="xl-in" value={frame.subject} onChange={setF('subject')} /></label>
                        <label>Thời gian (phút) <input className="xl-in" type="number" min={0} max={600} value={frame.minutes} onChange={setF('minutes')} /></label>
                        <label>Ghi chú <input className="xl-in" value={frame.note} placeholder="(Đề thi có 4 trang)" onChange={setF('note')} /></label>
                        {scan.frame.kind !== 'name' && <label>Mã đề <input className="xl-in" value={frame.code} placeholder="tuỳ chọn" onChange={setF('code')} /></label>}
                      </div>
                    )}
                  </section>

                  <section className="su-sec">
                    <h4>Các phần <span className="su-hint">{scan.blocks.length} câu · nhận theo lệnh \choice, \choiceTF, \shortans; không lệnh là Tự luận</span></h4>
                    <table className="su-parts">
                      <thead><tr><th>Phần</th><th>Loại</th><th>Số câu</th><th>Đoạn mở đầu (<code>{'{n}'}</code> = số câu)</th></tr></thead>
                      <tbody>
                        {present.map((p, i) => (
                          <tr key={p}>
                            <td><b>{ROMAN[i]}</b></td><td>{PART_KIND[p]}</td><td className="su-n">{counts[p]}</td>
                            <td><input className="xl-in" value={intro[p].title} aria-label={`Tên phần ${ROMAN[i]}`} onChange={(e) => setI(p, 'title', e.target.value)} />
                              <input className="xl-in su-sent" value={intro[p].sentence} aria-label={`Câu dẫn phần ${ROMAN[i]}`} onChange={(e) => setI(p, 'sentence', e.target.value)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {off.length > 0 && <p className="su-warn">Câu {off.slice(0, 8).join(', ')}{off.length > 8 ? '…' : ''} nằm lẫn sang phần khác: khi ghi, câu sẽ được <b>sắp lại theo phần</b> (chuyển nguyên khối, không sửa chữ nào trong câu).</p>}
                    {handHeads > 0 && (
                      <div className="su-heads">Đề đã có {handHeads} tiêu đề phần gõ tay:
                        <label className="sw"><input type="radio" name="su-h" checked={heads === 'update'} onChange={() => setHeads('update')} />Cập nhật (thay bằng đoạn mới)</label>
                        <label className="sw"><input type="radio" name="su-h" checked={heads === 'keep'} onChange={() => setHeads('keep')} />Giữ nguyên (chỉ thêm phần còn thiếu)</label>
                      </div>
                    )}
                    {scan.issues.length > 0 && <ul className="su-issues">{scan.issues.slice(0, 5).map((x, i) => <li key={i}>Dòng {x.line}: {x.message}</li>)}</ul>}
                    {planErr && <p className="su-err">{planErr}</p>}
                    <details className="su-list">
                      <summary>Xem và đổi phần từng câu</summary>
                      <ol>
                        {scan.blocks.map((b, i) => (
                          <li key={b.start} className={off.includes(i + 1) ? 'off' : ''}>
                            <select className="xl-in" value={parts[i]} aria-label={`Phần của câu ${i + 1}`} onChange={(e) => setParts(parts.map((x, k) => (k === i ? (e.target.value as PartKey) : x)))}>
                              {SETUP_PARTS.map((p) => <option key={p} value={p}>{PART_KIND[p]}</option>)}
                            </select>
                            <span className="su-line">dòng {b.line}</span>
                            <span className="su-snip">{b.snippet || '…'}</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                    {present.length > 0 && <details className="su-list"><summary>Mã đoạn mở đầu sẽ chèn</summary><pre className="su-pre">{present.map((p, i) => introCode(ROMAN[i], intro[p], counts[p])).join('\n')}</pre></details>}
                  </section>
                </>
              )}
            </>
          )}
        </div>
        <div className="qm-foot">{foot}</div>
      </div>
    </>
  );
}
