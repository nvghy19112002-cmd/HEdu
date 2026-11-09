// Xuất Word thẳng từ màn Tạo đề (đề chưa cần lưu vào Thư viện): chọn mã đề, chế độ, thư mục rồi xuất.
import { useEffect, useRef, useState } from 'react';
import { chooseProjectFolder } from '../lib/examlib';
import { exportWordText, type WordOut } from '../lib/examword';
import type { QImg } from '../lib/qimages';
import { DEFAULT_WORD_MODES, WORD_MODES, wordModeById } from '../lib/wordmodes';

export interface WordCode { code: string; text: string }
type Res = { code: string; mode: string; out?: WordOut; err?: string };

export function ExamWordDialog({ codes, images, onClose, onToast }: { codes: readonly WordCode[]; images: readonly QImg[]; onClose(): void; onToast(m: string): void }) {
  const [chosen, setChosen] = useState<string[]>(() => codes.map((c) => c.code));
  const [modes, setModes] = useState<string[]>(DEFAULT_WORD_MODES);
  const [dest, setDest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState('');
  const [res, setRes] = useState<Res[]>([]);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    first.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [busy, onClose]);

  const flip = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const ms = WORD_MODES.filter((m) => modes.includes(m.id));
  const total = chosen.length * ms.length;
  const why = !dest ? 'Chọn thư mục lưu trước' : !chosen.length ? 'Chọn ít nhất một mã đề' : !ms.length ? 'Chọn ít nhất một kiểu bản' : '';

  const run = async () => {
    if (why || busy || !dest) return;
    setBusy(true); setRes([]);
    const out: Res[] = [];
    try {
      for (const c of codes.filter((x) => chosen.includes(x.code))) {
        for (const m of ms) {
          setProg(`Đang xuất mã ${c.code} · ${m.label} (${out.length + 1}/${total})`);
          try { out.push({ code: c.code, mode: m.id, out: await exportWordText(c.text, c.code, { solution: m.solution, mark: m.mark, print: m.print, suffix: m.suffix }, dest, { images }, (i, n) => setProg(`Mã ${c.code}: dịch hình ${i}/${n}`)) }); }
          catch (e) { out.push({ code: c.code, mode: m.id, err: e instanceof Error ? e.message : String(e) }); }
          setRes([...out]);
        }
      }
      onToast(`Đã xuất Word ${out.filter((r) => r.out).length}/${total} tệp vào ${dest}.`);
    } finally { setBusy(false); setProg(''); }
  };

  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label="Xuất Word" style={{ maxWidth: 600 }}>
        <h3>Xuất Word (.docx)</h3>
        <div className="cfm-body">
          <p className="te-note" style={{ marginTop: 0 }}>Mỗi mã đề một tệp. Công thức là Equation của Word (sửa được); hình TikZ thành ảnh. Không cần lưu đề vào Thư viện trước.</p>
          <div style={{ margin: '8px 0 6px' }}><b>Mã đề ({chosen.length}/{codes.length})</b></div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {codes.map((c) => (
              <label key={c.code} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={chosen.includes(c.code)} disabled={busy} onChange={() => setChosen((x) => flip(x, c.code))} />
                <span style={{ fontFamily: 'var(--f-code)' }}>{c.code}</span>
              </label>
            ))}
          </div>
          <div style={{ margin: '14px 0 6px' }}><b>Kiểu bản</b></div>
          {WORD_MODES.map((m) => (
            <label key={m.id} className="sw" title={m.hint}>{m.label} <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>· {m.hint}</span><input type="checkbox" checked={modes.includes(m.id)} disabled={busy} onChange={() => setModes((x) => flip(x, m.id))} /></label>
          ))}
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { void chooseProjectFolder().then((d) => { if (d) setDest(d); }); }}>Chọn thư mục lưu…</button>
            <span style={{ fontSize: 13, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>{dest ?? 'Chưa chọn'}</span>
          </div>
          {prog && <p role="status" aria-live="polite" style={{ marginTop: 10 }}>{prog}</p>}
          {res.map((r) => (
            <div key={r.code + r.mode} style={{ fontSize: 13, marginTop: 4 }}>
              {r.out ? <span className="okmark">✓ Mã {r.code} · {wordModeById(r.mode)?.label}: {r.out.path}{r.out.warnings.length ? ` · Word không hiểu: ${r.out.warnings.join(', ')}` : ''}</span> : <span className="te-bad">Mã {r.code} · {wordModeById(r.mode)?.label}: {r.err}</span>}
            </div>
          ))}
          {why && !busy && <p className="te-note" style={{ marginTop: 8 }}>{why}.</p>}
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" ref={first} disabled={busy} onClick={onClose}>Đóng</button>
          <button type="button" className="btn btn-accent" disabled={busy || !!why} onClick={() => { void run(); }}>{busy ? 'Đang xuất…' : `Xuất ${total} tệp Word`}</button>
        </div>
      </div>
    </>
  );
}
