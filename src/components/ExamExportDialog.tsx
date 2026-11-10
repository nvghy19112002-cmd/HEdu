// Hộp Xuất đề (thiết kế giai đoạn 3, màn 19) cho một đề đã lưu trong Thư viện đề: PDF từng mã + ZIP, Word, Excel đáp án, Excel nền tảng, QR, phiếu tô.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { examDuplicate, chooseProjectFolder } from '../lib/examlib';
import { answerSheetTex } from '../lib/answersheet';
import { getSettings } from '../lib/tikz';
import { answersXlsx, codesShape, sheetPdf, platformXlsx, qrPng, QR_PLATFORMS, PLATFORM_XLSX, codesBackfill, codesExport, codesExportCancel, codesInfo, exportGate, PACK_LABEL, PACK_NOTE, phaseText, readyCodes, summarize, type CodesInfo, type ExportOut, type ExportProgress, type PackKind } from '../lib/examexport';
import { listen } from '../lib/platform';
import { exportWordCode, type WordOut } from '../lib/examword';
import { DEFAULT_WORD_MODES, WORD_MODES, wordModeById } from '../lib/wordmodes';
import { loadDefaultInfo, loadThemeId } from '../lib/examtheme';

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
  const [tile, setTile] = useState<'pdf' | 'word' | 'xlsx' | 'plat' | 'qr' | 'phieu'>('pdf');
  const [plat, setPlat] = useState<string>('tnmaker');
  // nơi lưu nhớ lần trước (chỉ là tiện lợi theo máy)
  useEffect(() => { try { const d = localStorage.getItem('hedu.exportdir'); if (d) setDest(d); } catch { /* bỏ qua */ } }, []);
  useEffect(() => { try { if (dest) localStorage.setItem('hedu.exportdir', dest); } catch { /* bỏ qua */ } }, [dest]);

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
    const di = loadDefaultInfo();
    const themed = { themeId: loadThemeId(), info: { schoolYear: di.year, teacher: di.teacher } };
    try {
      for (const code of chosen) {
        for (const m of modes) {
          setWProg(`Đang xuất Word · mã ${code} · ${m.label} (${res.length + 1}/${total})`);
          try { res.push({ code, mode: m.id, out: await exportWordCode(id, code, { solution: m.solution, mark: m.mark, print: m.print, suffix: m.suffix }, dest, (i, n) => setWProg(`Mã ${code}: dịch hình ${i}/${n}`), themed) }); }
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

  // ——— bố cục mới (thiết kế giai đoạn 3, màn 19): mã đề + nơi lưu · 6 ô kiểu xuất · tuỳ chọn của ô đang chọn · nút làm đúng việc ———
  type Tile = 'pdf' | 'word' | 'xlsx' | 'plat' | 'qr' | 'phieu';
  const TILES: { id: Tile; tag: string; name: string; note: string }[] = [
    { id: 'pdf', tag: 'PDF', name: 'Đề + đáp án', note: 'PDF từng mã; gói giáo viên (có đáp án) hoặc học sinh, nén ZIP.' },
    { id: 'word', tag: 'DOCX', name: 'Word', note: '6 kiểu: học sinh, in đen trắng, lời giải, tô đáp án…' },
    { id: 'xlsx', tag: 'XLSX', name: 'Excel đáp án', note: 'Một tệp: theo mã đề và theo câu, mọi mã.' },
    { id: 'plat', tag: 'XLSX', name: 'Nền tảng thi', note: 'TNMaker, SmartTest, AZOTA, OLM, YoungMix.' },
    { id: 'qr', tag: 'QR', name: 'Mã QR đáp án', note: 'Ảnh PNG cho TNMaker, SmartTest, YoungMix.' },
    { id: 'phieu', tag: 'PHIẾU', name: 'Phiếu tô A4', note: 'Đúng số câu của đề: SBD, mã đề, Phần I–III.' },
  ];
  const n = chosen.length;
  const qrList = PLATFORM_XLSX.filter((p) => (QR_PLATFORMS as readonly string[]).includes(p.id));
  const platOf = (list: readonly (typeof PLATFORM_XLSX)[number][]) => list.find((p) => p.id === plat) ?? list[0];
  const act: { label: string; ok: boolean; why?: string; run(): void } = (() => {
    const needDest = dest ? undefined : 'Chọn nơi lưu trước';
    switch (tile) {
      case 'pdf': return { label: busy ? 'Đang xuất…' : `Xuất ${PACK_LABEL[kind].toLowerCase()} · ${n} mã`, ok: gate.ok, why: gate.ok ? undefined : gate.why, run: () => { void run(); } };
      case 'word': return { label: busy ? 'Đang xuất…' : `Xuất Word ${n} mã × ${wModes.length} kiểu`, ok: !!dest && n > 0 && wModes.length > 0, why: needDest ?? (!n ? 'Chọn ít nhất một mã đề' : !wModes.length ? 'Chọn ít nhất một kiểu bản' : undefined), run: () => { void wordRun(); } };
      case 'xlsx': return { label: 'Xuất Excel đáp án', ok: !!dest, why: needDest, run: () => { void xlsx(); } };
      case 'plat': { const p = platOf(PLATFORM_XLSX); return { label: `Xuất Excel cho ${p.label}`, ok: !!dest, why: needDest, run: () => { void platRun(p); } }; }
      case 'qr': { const p = platOf(qrList); return { label: `Tạo mã QR cho ${p.label}`, ok: !!dest, why: needDest, run: () => { void qrRun(p); } }; }
      default: return { label: 'Tạo phiếu tô', ok: !!dest, why: needDest, run: () => { void sheetRun(); } };
    }
  })();

  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm xp-dlg" role="dialog" aria-modal="true" aria-label="Xuất đề">
        <h3>Xuất đề “{name}”{info ? <span className="xl-meta"> · {info.codes.length} mã</span> : null}</h3>
        <div className="cfm-body">
          {err && <p className="te-bad" role="alert">{err}</p>}
          {!info && !err && <p>Đang đọc dữ liệu mã đề…</p>}
          {info && !info.hasSpec && <p>{info.problems[0]}</p>}
          {info && info.hasSpec && (
            <>
              <div className="xp-top">
                <div className="xp-codes" role="group" aria-label="Mã đề">
                  <span className="xp-lbl">Mã đề</span>
                  {info.codes.map((c) => {
                    const ok = c.hasMain && !c.problem;
                    const r = out?.results.find((x) => x.code === c.code);
                    return (
                      <button key={c.code} type="button" className={`xp-chip${chosen.includes(c.code) ? ' on' : ''}`} aria-pressed={chosen.includes(c.code)} disabled={busy || !ok}
                        title={c.problem ?? (!c.hasMain ? 'Chưa có tệp chính riêng' : `${c.counts[0]}+${c.counts[1]}+${c.counts[2]}${c.counts[3] ? `+${c.counts[3]}` : ''} câu`)} onClick={() => toggle(c.code)}>
                        {c.code}{r ? <span className={r.status === 'ok' ? 'okmark' : 'te-bad'}> {r.status === 'ok' ? '✓' : '✗'}</span> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="xp-dest">
                  <span className="xp-lbl">Lưu vào</span>
                  <button type="button" className="btn btn-sm" ref={first} disabled={busy} onClick={() => { void pick(); }} title={dest ?? 'Chọn thư mục lưu'}>{dest ? dest.split(/[\\/]/).filter(Boolean).slice(-2).join('\\') : 'Chọn thư mục…'}</button>
                </div>
              </div>

              {missingMain.length > 0 && (
                <div className="te-warn" style={{ margin: '8px 0' }}>
                  <p><b>{missingMain.length} mã chưa có tệp chính riêng</b> (đề lưu từ phiên bản trước): {missingMain.map((c) => c.code).join(', ')}.</p>
                  {info.canBackfill
                    ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void backfill(); }}>Bổ sung tệp chính từng mã…</button>
                    : <p className="bad">Không bổ sung tự động được (thiếu dữ liệu đã lưu, hoặc đề đã chốt). {info.problems[0] ?? ''}</p>}
                </div>
              )}

              <div className="xp-tiles" role="radiogroup" aria-label="Kiểu xuất">
                {TILES.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={tile === t.id} className={`xp-tile${tile === t.id ? ' on' : ''}`} disabled={busy} onClick={() => setTile(t.id)}>
                    <span className="xp-tag">{t.tag}</span><b>{t.name}</b><span className="xp-note">{t.note}</span>
                  </button>
                ))}
              </div>

              <div className="xp-opts">
                {tile === 'pdf' && (
                  <div role="group" aria-label="Loại gói" className="xp-col">
                    {(['giao-vien', 'hoc-sinh'] as PackKind[]).map((k) => (
                      <label key={k} className="xp-radio">
                        <input type="radio" name="packkind" checked={kind === k} disabled={busy} onChange={() => setKind(k)} />
                        <span><b>{PACK_LABEL[k]}</b><br /><span className="xl-meta">{PACK_NOTE[k]}</span></span>
                      </label>
                    ))}
                    {kind === 'giao-vien' && <label className="sw">Kèm PDF lời giải từng mã (dịch thêm một lượt mỗi mã)<input type="checkbox" checked={sol} disabled={busy} onChange={(e) => setSol(e.target.checked)} /></label>}
                    {busy && prog && <p role="status" aria-live="polite">{phaseText(prog)}</p>}
                    {out && <p role="status" className={out.ok ? 'okmark' : 'te-bad'}>{summarize(out)}</p>}
                  </div>
                )}
                {tile === 'word' && (
                  <div className="xp-col">
                    {WORD_MODES.map((m) => (
                      <label key={m.id} className="sw" title={m.hint}>{m.label} <span className="xl-meta">· {m.hint}</span><input type="checkbox" checked={wModes.includes(m.id)} disabled={busy} onChange={() => toggleMode(m.id)} /></label>
                    ))}
                    <span className="xl-meta">Công thức là Equation của Word; dùng MathType thì chọn “Convert Equations”. Đề theo mẫu in thì Word cũng theo mẫu.</span>
                    {wProg && <span role="status" aria-live="polite">{wProg}</span>}
                    {wRes.map((r) => (
                      <div key={r.code + r.mode} className="xl-meta">
                        {r.out ? <span className="okmark">✓ Mã {r.code} · {wordModeById(r.mode)?.label}: {r.out.path}{r.out.warnings.length ? ` · Word không hiểu: ${r.out.warnings.join(', ')}` : ''}</span> : <span className="te-bad">Mã {r.code} · {wordModeById(r.mode)?.label}: {r.err}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {tile === 'xlsx' && <p className="xl-meta">Một tệp .xlsx gồm trang “Theo mã đề” và “Theo câu” cho mọi mã đề. Không cần biên dịch PDF.</p>}
                {(tile === 'plat' || tile === 'qr') && (
                  <div className="xp-col">
                    <div className="xp-codes" role="radiogroup" aria-label="Nền tảng">
                      {(tile === 'qr' ? qrList : PLATFORM_XLSX).map((p) => (
                        <button key={p.id} type="button" role="radio" aria-checked={platOf(tile === 'qr' ? qrList : PLATFORM_XLSX).id === p.id} className={`xp-chip${platOf(tile === 'qr' ? qrList : PLATFORM_XLSX).id === p.id ? ' on' : ''}`} disabled={busy} title={p.hint} onClick={() => setPlat(p.id)}>{p.label}</button>
                      ))}
                    </div>
                    <span className="xl-meta">{tile === 'qr' ? 'Ảnh PNG gồm mọi mã đề để quét vào nền tảng thay cho nhập Excel.' : `${platOf(PLATFORM_XLSX).hint}. Bố cục lấy từ tệp mẫu của nền tảng; nên nhập thử một lần.`}</span>
                  </div>
                )}
                {tile === 'phieu' && <p className="xl-meta">Phiếu trống A4 đúng số câu của đề: Số báo danh, Mã đề, Phần I (A–D), Phần II (Đúng/Sai), Phần III (đáp số). In cho học sinh tô bút chì.</p>}
              </div>
              <p className="xl-meta xp-foot-note">Không ghi đè tệp có sẵn{tile === 'pdf' ? ' · dịch song song, có thể bấm Dừng bất cứ lúc nào' : ''}.</p>
            </>
          )}
        </div>
        <div className="cfm-acts">
          {busy && tile === 'pdf' ? <button type="button" className="btn btn-outline" onClick={() => { void codesExportCancel(id); }}>Dừng</button> : <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Đóng</button>}
          <button type="button" className="btn btn-accent" disabled={busy || !info?.hasSpec || !act.ok} title={act.why} onClick={act.run}>{act.label}</button>
        </div>
      </div>
    </>
  );
}
