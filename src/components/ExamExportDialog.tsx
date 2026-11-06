// Xuất PDF từng mã đề và gói ZIP (giáo viên / học sinh) cho một đề đã lưu trong Thư viện đề.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { examDuplicate, chooseProjectFolder } from '../lib/examlib';
import { answerSheetTex } from '../lib/answersheet';
import { getSettings } from '../lib/tikz';
import { answersXlsx, codesShape, sheetPdf, platformXlsx, qrPng, QR_PLATFORMS, PLATFORM_XLSX, codesBackfill, codesExport, codesExportCancel, codesInfo, exportGate, PACK_LABEL, PACK_NOTE, phaseText, readyCodes, summarize, type CodesInfo, type ExportOut, type ExportProgress, type PackKind } from '../lib/examexport';
import { listen } from '../lib/platform';
import { exportWordCode, type WordOut } from '../lib/examword';
import { DEFAULT_WORD_MODES, WORD_MODES, wordModeById } from '../lib/wordmodes';

export function ExamExportDialog({ id, name, onClose, onToast }: { id: string; name: string; onClose(): void; onToast(m: string): void }) {
  const [info, setInfo] = useState<CodesInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<PackKind>('giao-vien');
  const [sol, setSol] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [dest, setDest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<ExportProgress | null>(null);
  const [out, setOut] = useState<ExportOut | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  const [wModes, setWModes] = useState<string[]>(DEFAULT_WORD_MODES);
  const [wRes, setWRes] = useState<{ code: string; mode: string; out?: WordOut; err?: string }[]>([]);
  const [wProg, setWProg] = useState('');

  const load = useCallback(async () => {
    try {
      const i = await codesInfo(id);
      setInfo(i);
      setChosen((c) => (c.length ? c.filter((x) => i.codes.some((y) => y.code === x)) : readyCodes(i)));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let off: (() => void) | null = null;
    void listen<ExportProgress>('exam-export-progress', (p) => { if (p.id === id) setProg(p); }).then((f) => { off = f; });
    return () => { off?.(); };
  }, [id]);
  useEffect(() => {
    first.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [busy, onClose]);

  const gate = useMemo(() => exportGate(info, chosen, dest), [info, chosen, dest]);
  const missingMain = info?.codes.filter((c) => !c.hasMain) ?? [];

  const pick = async () => { const d = await chooseProjectFolder(); if (d) setDest(d); };

  const backfill = async () => {
    setBusy(true);
    try {
      const plan = await codesBackfill(id, false);
      if (!plan.willCreate.length) { onToast(plan.message); return; }
      const ok = window.confirm(`${plan.message}\n\nTệp sẽ tạo:\n${plan.willCreate.join('\n')}\n\nĐÃ đối chiếu được:\n${plan.verified.map((x) => `• ${x}`).join('\n')}\n\nCHƯA chứng minh được:\n${plan.limits.map((x) => `• ${x}`).join('\n')}\n\nHEdu chỉ THÊM tệp mới (tất cả hoặc không), không sửa hay ghi đè tệp nào. Trước khi ghi, HEdu tạo một bản sao của đề này để bạn quay lại được.\n\nTiếp tục?`);
      if (!ok) return;
      const copy = await examDuplicate(id, `${name} (trước khi bổ sung tệp chính)`);
      const done = await codesBackfill(id, true);
      onToast(`${done.message} Bản sao dự phòng: “${copy.name}”.`);
      await load();
    } catch (e) { onToast(`Không bổ sung được: ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(false); }
  };

  const run = async () => {
    if (!gate.ok || !dest) return;
    setBusy(true); setOut(null); setProg(null);
    try {
      const r = await codesExport(id, { kind, codes: chosen, withSolution: kind === 'giao-vien' && sol, destDir: dest });
      setOut(r);
      onToast(summarize(r));
    } catch (e) { setOut(null); setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); setProg(null); }
  };

  const xlsx = async () => {
    if (!dest) return;
    setBusy(true); setErr(null);
    try { const p = await answersXlsx(id, dest); onToast(`Đã xuất Excel đáp án: ${p}`); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const platRun = async (p: (typeof PLATFORM_XLSX)[number]) => {
    if (!dest) return;
    setBusy(true); setErr(null);
    try { const f = await platformXlsx(id, p.id, dest); onToast(`Đã xuất Excel đáp án cho ${p.label}: ${f}`); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const qrRun = async (p: (typeof PLATFORM_XLSX)[number]) => {
    if (!dest) return;
    setBusy(true); setErr(null);
    try { const f = await qrPng(id, p.id, dest); onToast(`Đã tạo mã QR đáp án cho ${p.label}: ${f}`); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const sheetRun = async () => {
    if (!dest) return;
    setBusy(true); setErr(null);
    try {
      const [p1, p2, p3] = await codesShape(id);
      const tex = answerSheetTex({ subtitle: name, subject: '', p1, p2, p3 });
      const f = await sheetPdf(tex, dest, `phieu-to-${p1}-${p2}-${p3}`, getSettings().texBin.trim() || null);
      onToast(`Đã tạo phiếu tô trắc nghiệm (${p1} câu Phần I, ${p2} câu Phần II, ${p3} câu Phần III): ${f}`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const wordRun = async () => {
    const modes = WORD_MODES.filter((m) => wModes.includes(m.id));
    if (!dest || !chosen.length || !modes.length) return;
    setBusy(true); setErr(null); setWRes([]);
    const res: { code: string; mode: string; out?: WordOut; err?: string }[] = [];
    const total = chosen.length * modes.length;
    try {
      for (const code of chosen) {
        for (const m of modes) {
          setWProg(`Đang xuất Word · mã ${code} · ${m.label} (${res.length + 1}/${total})`);
          try { res.push({ code, mode: m.id, out: await exportWordCode(id, code, { solution: m.solution, mark: m.mark, print: m.print, suffix: m.suffix }, dest, (i, n) => setWProg(`Mã ${code}: dịch hình ${i}/${n}`)) }); }
          catch (e) { res.push({ code, mode: m.id, err: e instanceof Error ? e.message : String(e) }); }
          setWRes([...res]);
        }
      }
      const ok = res.filter((r) => r.out).length;
      onToast(`Đã xuất Word ${ok}/${total} tệp vào ${dest}.`);
    } finally { setBusy(false); setWProg(''); }
  };

  const toggleMode = (m: string) => setWModes((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]));

  const toggle = (c: string) => setChosen((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));

  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label="Xuất từng mã đề" style={{ maxWidth: 640 }}>
        <h3>Xuất từng mã đề (PDF, Word) · {name}</h3>
        <div className="cfm-body">
          {err && <p className="te-bad" role="alert">{err}</p>}
          {!info && !err && <p>Đang đọc dữ liệu mã đề…</p>}
          {info && !info.hasSpec && <p>{info.problems[0]}</p>}
          {info && info.hasSpec && (
            <>
              <div role="group" aria-label="Loại gói" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {(['giao-vien', 'hoc-sinh'] as PackKind[]).map((k, i) => (
                  <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <input type="radio" name="packkind" checked={kind === k} disabled={busy} onChange={() => setKind(k)} ref={i === 0 ? undefined : undefined} />
                    <span><b>{PACK_LABEL[k]}</b><br /><span style={{ color: 'var(--ink-3)' }}>{PACK_NOTE[k]}</span></span>
                  </label>
                ))}
                {kind === 'giao-vien' && <label className="sw" style={{ paddingLeft: 26 }}>Kèm PDF lời giải từng mã (dịch thêm một lượt mỗi mã)<input type="checkbox" checked={sol} disabled={busy} onChange={(e) => setSol(e.target.checked)} /></label>}
              </div>

              {missingMain.length > 0 && (
                <div className="te-warn" style={{ marginBottom: 12 }}>
                  <p><b>{missingMain.length} mã chưa có tệp chính riêng</b> (đề lưu từ phiên bản trước): {missingMain.map((c) => c.code).join(', ')}.</p>
                  {info.canBackfill
                    ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void backfill(); }}>Bổ sung tệp chính từng mã…</button>
                    : <p className="bad">Không bổ sung tự động được (thiếu dữ liệu đã lưu, hoặc đề đã chốt). {info.problems[0] ?? ''}</p>}
                </div>
              )}

              <div style={{ marginBottom: 8 }}><b>Mã đề ({chosen.length}/{info.codes.length}, tối đa {info.maxCodes} mỗi lượt)</b></div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflow: 'auto' }}>
                {info.codes.map((c) => {
                  const r = out?.results.find((x) => x.code === c.code);
                  const ok = c.hasMain && !c.problem;
                  return (
                    <li key={c.code} style={{ display: 'flex', gap: 10, alignItems: 'center', opacity: ok ? 1 : 0.7 }}>
                      <input type="checkbox" aria-label={`Mã ${c.code}`} checked={chosen.includes(c.code)} disabled={busy || !ok} onChange={() => toggle(c.code)} />
                      <span style={{ fontFamily: 'var(--f-code)' }}>{c.code}</span>
                      <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>{c.counts[0]}+{c.counts[1]}+{c.counts[2]}{c.counts[3] ? `+${c.counts[3]}` : ''} câu</span>
                      {c.problem && <span className="te-bad" style={{ fontSize: 13 }}>{c.problem}</span>}
                      {!c.hasMain && !c.problem && <span className="te-bad" style={{ fontSize: 13 }}>chưa có tệp chính riêng</span>}
                      {r && <span style={{ marginLeft: 'auto', fontSize: 13, color: r.status === 'ok' ? 'var(--ok)' : 'var(--danger)' }}>{r.status === 'ok' ? `✓ ${r.pages ?? '?'} trang${r.cached ? ' (dùng lại)' : ''}` : r.status === 'cancelled' ? 'đã dừng' : `✗ ${r.message}`}</span>}
                    </li>
                  );
                })}
              </ul>

              <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void pick(); }}>Chọn thư mục lưu…</button>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>{dest ?? 'Chưa chọn'}</span>
                <button type="button" className="btn btn-sm btn-outline" style={{ marginLeft: 'auto' }} disabled={busy || !dest} title={dest ? 'Một tệp .xlsx: trang "Theo mã đề" và "Theo câu", mọi mã đề. Không cần biên dịch PDF.' : 'Chọn thư mục lưu trước'} onClick={() => { void xlsx(); }}>Chỉ xuất Excel đáp án</button>
              </div>
              <div className="fb-rowbox" style={{ marginTop: 12 }}>
                <b>Excel đáp án cho nền tảng thi</b>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Một tệp .xlsx đúng bố cục nhập đáp án của từng nền tảng, gồm mọi mã đề. Bố cục lấy từ tệp mẫu của các nền tảng; nên mở thử nhập vào nền tảng một lần.</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PLATFORM_XLSX.map((p) => <button key={p.id} type="button" className="btn btn-sm btn-outline" disabled={busy || !dest} title={dest ? p.hint : 'Chọn thư mục lưu trước'} onClick={() => { void platRun(p); }}>{p.label}</button>)}
                </div>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Mã QR đáp án (ảnh PNG, gồm mọi mã đề) để quét vào nền tảng thay cho nhập Excel:</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PLATFORM_XLSX.filter((p) => (QR_PLATFORMS as readonly string[]).includes(p.id)).map((p) => <button key={p.id} type="button" className="btn btn-sm btn-outline" disabled={busy || !dest} title={dest ? undefined : 'Chọn thư mục lưu trước'} onClick={() => { void qrRun(p); }}>QR {p.label}</button>)}
                </div>
              </div>
              <div className="fb-rowbox" style={{ marginTop: 12 }}>
                <b>Phiếu trả lời trắc nghiệm (PDF, A4)</b>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Phiếu trống đúng số câu của đề: Số báo danh, Mã đề, Phần I (A–D), Phần II (Đúng/Sai), Phần III (đáp số). In cho học sinh tô bút chì.</span>
                <div><button type="button" className="btn btn-sm btn-outline" disabled={busy || !dest} title={dest ? undefined : 'Chọn thư mục lưu trước'} onClick={() => { void sheetRun(); }}>Tạo phiếu tô…</button></div>
              </div>
              <div className="fb-rowbox" style={{ marginTop: 12 }}>
                <b>Word (.docx)</b>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Mỗi mã đề một tệp. Công thức là Equation của Word; dùng MathType thì chọn “Convert Equations” để đổi sang MathType.</span>
                {WORD_MODES.map((m) => (
                  <label key={m.id} className="sw" title={m.hint}>{m.label} <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>· {m.hint}</span><input type="checkbox" checked={wModes.includes(m.id)} disabled={busy} onChange={() => toggleMode(m.id)} /></label>
                ))}
                <div><button type="button" className="btn btn-sm btn-dark" disabled={busy || !dest || !chosen.length || !wModes.length} title={dest ? undefined : 'Chọn thư mục lưu trước'} onClick={() => { void wordRun(); }}>Xuất Word {chosen.length} mã × {wModes.length} chế độ…</button></div>
                {wProg && <span role="status" aria-live="polite">{wProg}</span>}
                {wRes.map((r) => (
                  <div key={r.code + r.mode} style={{ fontSize: 13 }}>
                    {r.out ? <span className="okmark">✓ Mã {r.code} · {wordModeById(r.mode)?.label}: {r.out.path}{r.out.warnings.length ? ` · Word không hiểu: ${r.out.warnings.join(', ')}` : ''}</span> : <span className="te-bad">Mã {r.code} · {wordModeById(r.mode)?.label}: {r.err}</span>}
                  </div>
                ))}
              </div>
              {!gate.ok && <p className="te-note" style={{ marginTop: 8 }}>{gate.why}</p>}
              {busy && prog && <p role="status" aria-live="polite" style={{ marginTop: 8 }}>{phaseText(prog)}</p>}
              {out && <p role="status" className={out.ok ? 'okmark' : 'te-bad'} style={{ marginTop: 8 }}>{summarize(out)}</p>}
              <p className="te-note" style={{ marginTop: 8 }}>HEdu ghi ZIP vào tệp tạm, đọc lại và đối chiếu từng tệp rồi mới đổi tên; không bao giờ ghi đè bản xuất cũ. Thời gian dịch phụ thuộc số mã và hình TikZ; có thể bấm Dừng bất cứ lúc nào.</p>
            </>
          )}
        </div>
        <div className="cfm-acts">
          {busy ? <button type="button" className="btn btn-outline" onClick={() => { void codesExportCancel(id); }}>Dừng</button> : <button type="button" className="btn btn-outline" ref={first} onClick={onClose}>Đóng</button>}
          <button type="button" className="btn btn-accent" disabled={busy || !gate.ok} title={gate.ok ? undefined : gate.why} onClick={() => { void run(); }}>{busy ? 'Đang xuất…' : `Xuất ${PACK_LABEL[kind].toLowerCase()}`}</button>
        </div>
      </div>
    </>
  );
}
