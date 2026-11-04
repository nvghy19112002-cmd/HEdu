// Hộp "Lịch sử phiên bản": danh sách các bản cũ (mới nhất trước), so sánh theo dòng với bản đang soạn, và khôi phục một bản VÀO KHUNG SOẠN
// (chưa lưu: người dùng xem lại rồi mới bấm Lưu; muốn bỏ thì hoàn tác trong khung soạn).
import { useEffect, useMemo, useState } from 'react';
import { collapseDiff, diffLines, diffStat } from '../lib/linediff';

export interface HistVersion { key: string; /** nhãn hiện trong danh sách, vd "04/11/2026 14:05" */ label: string; /** tải nội dung (có thể bất đồng bộ) */ load(): Promise<string> }

export function HistoryDialog({ title, current, versions, onRestore, onClose }: { title: string; current: string; versions: HistVersion[]; onRestore(text: string): void; onClose(): void }) {
  const [sel, setSel] = useState<string | null>(versions[0]?.key ?? null);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!sel) { setText(null); return; }
    let dead = false;
    setText(null); setErr(null);
    versions.find((v) => v.key === sel)?.load().then((t) => { if (!dead) setText(t); }).catch((e) => { if (!dead) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { dead = true; };
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [onClose]);

  // so bản cũ (a) với bản đang soạn (b): + là dòng có ở bản đang soạn mà bản cũ không có; − là dòng bản cũ có mà bản đang soạn đã bỏ
  const ops = useMemo(() => (text === null ? null : diffLines(text, current)), [text, current]);
  const stat = ops ? diffStat(ops) : null;
  const view = useMemo(() => (ops ? collapseDiff(ops, 3) : null), [ops]);

  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: 980, width: 'min(980px, 96vw)' }}>
        <h3>{title}</h3>
        <div className="cfm-body hist-body">
          {versions.length === 0 ? <p>Chưa có bản cũ nào. Mỗi lần bạn Lưu mà nội dung có đổi, HEdu cất lại bản trước đó ở đây.</p> : (
            <>
              <ul className="hist-list" role="listbox" aria-label="Các bản cũ">
                {versions.map((v, i) => (
                  <li key={v.key}><button type="button" role="option" aria-selected={sel === v.key} className={sel === v.key ? 'on' : ''} onClick={() => setSel(v.key)}>{v.label}{i === 0 ? <span className="xl-meta"> · gần nhất</span> : null}</button></li>
                ))}
              </ul>
              <div className="hist-diff">
                {err && <p className="te-bad" role="alert">{err}</p>}
                {text === null && !err && <p className="xl-meta">Đang đọc bản cũ…</p>}
                {stat && <p className="xl-meta" role="status">So với bản đang soạn: bản cũ có <b>{stat.del}</b> dòng đã bỏ đi (đỏ) và <b>{stat.add}</b> dòng mới thêm sau đó (xanh).{!stat.add && !stat.del ? ' Hai bản giống hệt.' : ''}</p>}
                {view && (
                  <pre className="hist-pre" aria-label="Khác biệt giữa bản cũ và bản đang soạn">
                    {view.map((o, i) => o.t === 'skip'
                      ? <span key={i} className="hd-skip">… {o.n} dòng giống nhau …{'\n'}</span>
                      : <span key={i} className={`hd-${o.t}`}>{o.t === 'add' ? '+ ' : o.t === 'del' ? '− ' : '  '}{o.text}{'\n'}</span>)}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>
          <button type="button" className="btn btn-accent" disabled={text === null} onClick={() => { if (text !== null) { onRestore(text); onClose(); } }} title="Đưa bản này vào khung soạn (chưa lưu); bạn xem lại rồi bấm Lưu">Khôi phục bản này vào khung soạn</button>
        </div>
      </div>
    </>
  );
}
