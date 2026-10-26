// Nguồn gốc câu hỏi trong đề (E5): xem câu nào được chép từ Ngân hàng, còn nguyên văn hay "Có thể đã thay đổi", so sánh với câu gốc hiện tại,
// thay thủ công (có xem trước, qua trình soạn nên hoàn tác được và lưu sẽ chụp bản cũ), hoặc bỏ liên kết. HEdu KHÔNG tự đồng bộ.
import { useEffect, useState } from 'react';
import { bankDrift, lineDiff, STATE_LABEL, type SourceItem, type SourceStatus } from '../lib/examsources';
import { useBank } from '../lib/store';

interface Props {
  statuses: SourceStatus[] | null;
  error: string | null;
  onClose(): void;
  /** thay đoạn cũ bằng bản hiện tại của ngân hàng trong trình soạn; trả về false nếu không thấy đúng nguyên văn */
  onReplace(item: SourceItem, newLatex: string): boolean;
  onForget(item: SourceItem): void;
  onGoto(rel: string): void;
}

export function SourcesPanel({ statuses, error, onClose, onReplace, onForget, onGoto }: Props) {
  const { questions } = useBank();
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [onClose]);
  const key = (s: SourceItem) => `${s.uid}|${s.rel}|${s.sha256}`;

  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm xl-panel" role="dialog" aria-modal="true" aria-label="Nguồn câu hỏi">
        <h3>Nguồn câu hỏi trong đề</h3>
        <p className="xl-meta">Mỗi câu chép từ Ngân hàng được ghi UID và bản nguyên văn lúc chép. HEdu không tự cập nhật đề khi ngân hàng đổi.</p>
        {error && <div className="note bad" role="alert"><div className="note-body"><span>{error}</span></div></div>}
        {msg && <div className="note warn" role="status"><div className="note-body"><span>{msg}</span></div></div>}
        <div className="xl-panel-body">
          {statuses === null && !error && <p className="aid-wait" role="status">Đang đọc…</p>}
          {statuses?.length === 0 && <p className="xl-meta">Đề này chưa có câu nào ghi nguồn từ Ngân hàng.</p>}
          <ul className="xl-list">
            {statuses?.map((st) => {
              const drift = bankDrift(st.item, questions);
              const bank = questions.find((x) => x.uid === st.item.uid);
              const k = key(st.item);
              return (
                <li key={k} className="xl-row xl-static">
                  <span className="xl-name">{st.item.label} <span className="xl-meta">· {st.item.rel}</span></span>
                  <span className="xl-meta">
                    <b>{STATE_LABEL[st.state]}</b>
                    {drift === 'changed' && ' · Ngân hàng đã đổi so với bản đã chép'}
                    {drift === null && ' · Câu không còn trong Ngân hàng'}
                  </span>
                  <span className="xl-actions">
                    <button type="button" className="btn btn-sm" onClick={() => onGoto(st.item.rel)}>Mở tệp</button>
                    {drift === 'changed' && <button type="button" className="btn btn-sm" onClick={() => setOpen(open === k ? null : k)}>So sánh với câu gốc</button>}
                    <button type="button" className="btn btn-sm" onClick={() => onForget(st.item)}>Bỏ liên kết</button>
                  </span>
                  {open === k && bank && (
                    <div className="sp-diff">
                      <pre className="xl-ctx" aria-label="So sánh: bản trong đề và bản hiện tại của Ngân hàng">
                        {lineDiff(st.item.latex, bank.latex).map((d, i) => <span key={i} className={`sp-${d.kind}`}>{d.kind === 'del' ? '− ' : d.kind === 'add' ? '+ ' : '  '}{d.text}{'\n'}</span>)}
                      </pre>
                      <p className="xl-meta">Dòng bắt đầu bằng “−” là bản đang có trong đề, “+” là bản hiện tại trong Ngân hàng.</p>
                      <button type="button" className="btn btn-sm btn-primary" disabled={st.state !== 'verbatim'} title={st.state === 'verbatim' ? '' : 'Chỉ thay được khi đoạn trong đề còn nguyên văn'} onClick={() => {
                        const ok = onReplace(st.item, bank.latex);
                        setMsg(ok ? 'Đã thay trong trình soạn (chưa lưu). Bấm Ctrl+Z để hoàn tác; lưu sẽ chụp lại bản cũ của tệp.' : 'Không thấy đúng đoạn nguyên văn trong tệp đang mở nên không thay. Hãy mở tệp chứa câu này rồi thử lại.');
                        if (ok) setOpen(null);
                      }}>Thay bằng bản hiện tại của Ngân hàng</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="cfm-acts"><button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button></div>
      </div>
    </>
  );
}
