// Chọn câu từ Ngân hàng câu hỏi để chép NGUYÊN VĂN vào đề đang soạn (E5). Không phân tích lại LaTeX, không sửa chữ nào, chỉ chép.
// UID được ghi vào sổ nguồn của đề khi bạn lưu; ngân hàng đổi sau đó thì đề KHÔNG tự đổi.
import { useEffect, useMemo, useRef, useState } from 'react';
import { questionCode } from '../lib/id';
import { plainSnippet } from '../lib/snippet';
import { useBank } from '../lib/store';
import type { Question } from '../lib/types';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const SHOW = 80;
const MAX_PICK = 60;

export function BankPicker({ onClose, onInsert }: { onClose(): void; onInsert(qs: Question[]): void }) {
  const { questions } = useBank();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [peek, setPeek] = useState<Question | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [onClose]);

  const list = useMemo(() => {
    const f = fold(q.trim());
    const base = f ? questions.filter((x) => fold(x.latex).includes(f) || fold(questionCode(x, x.level)).includes(f) || String(x.seq).includes(f)) : questions;
    return [...base].sort((a, b) => b.seq - a.seq);
  }, [questions, q]);

  const toggle = (uid: string) => setPicked((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : p.length >= MAX_PICK ? p : [...p, uid]));
  const chosen = picked.map((u) => questions.find((x) => x.uid === u)).filter((x): x is Question => !!x);

  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm xl-panel" role="dialog" aria-modal="true" aria-label="Thêm câu từ Ngân hàng">
        <h3>Thêm câu từ Ngân hàng vào đề</h3>
        <p className="xl-meta">Câu được chép NGUYÊN VĂN vào vị trí con trỏ trong tệp đang mở; HEdu ghi UID nguồn khi bạn lưu. Ngân hàng đổi sau này không làm đề tự đổi.</p>
        <input ref={first} className="xl-in" type="search" aria-label="Tìm câu" placeholder="Tìm theo chữ trong câu, ID (vd 2D1H1) hoặc số thứ tự…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="xl-panel-body bp-body">
          <ul className="xl-list" aria-label="Câu hỏi trong ngân hàng">
            {list.slice(0, SHOW).map((x) => (
              <li key={x.uid} className="xl-row xl-static bp-row">
                <label><input type="checkbox" checked={picked.includes(x.uid)} onChange={() => toggle(x.uid)} /> <b>#{String(x.seq).padStart(4, '0')}</b> <span className="xl-meta">{questionCode(x, x.level)}</span></label>
                <button type="button" className="bp-snip" onClick={() => setPeek(x)}>{plainSnippet(x.latex).slice(0, 140)}</button>
              </li>
            ))}
          </ul>
          {list.length > SHOW && <p className="xl-meta">Còn {list.length - SHOW} câu nữa: gõ thêm từ khoá để thu hẹp.</p>}
          {list.length === 0 && <p className="xl-meta">Không có câu nào khớp.</p>}
          {peek && <pre className="xl-ctx" aria-label="LaTeX nguyên văn của câu">{peek.latex}</pre>}
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>
          <button type="button" className="btn btn-accent" disabled={!chosen.length} onClick={() => onInsert(chosen)}>Chèn {chosen.length || ''} câu tại con trỏ</button>
        </div>
      </div>
    </>
  );
}
