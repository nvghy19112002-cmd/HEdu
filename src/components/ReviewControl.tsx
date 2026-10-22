import { useState } from 'react';
import { REVIEW_LABEL, reviewOf, type Question, type ReviewStatus } from '../lib/types';

export const ReviewBadge = ({ q, compact = false }: { q: Question; compact?: boolean }) => {
  const r = reviewOf(q);
  // Hàng danh sách: “Chưa kiểm tra” là mặc định nên chỉ hiện chấm xám nhỏ; Cần sửa / Đã duyệt hiện nhãn đủ chữ.
  if (compact && r === 'unreviewed') return <span className="rv-dot" role="img" aria-label="Kiểm duyệt: Chưa kiểm tra" title="Chưa kiểm tra" />;
  return <span className={`rv-chip rv-${r}`} title={`Kiểm duyệt: ${REVIEW_LABEL[r]}`}>{REVIEW_LABEL[r]}</span>;
};

/**
 * Chọn trạng thái kiểm duyệt cho MỘT câu. Đây là xác nhận của giáo viên, không phải kết quả máy:
 * “Đã duyệt” phải bấm xác nhận một bước. Báo “đã lưu” chỉ sau khi ghi xuống đĩa thành công.
 */
export function ReviewControl({ q, onChange }: { q: Question; onChange: (s: ReviewStatus | undefined) => Promise<boolean> }) {
  const cur = reviewOf(q);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; retry?: ReviewStatus | undefined } | null>(null);

  const apply = async (s: ReviewStatus | undefined) => {
    setAsk(false); setBusy(true); setMsg(null);
    const ok = await onChange(s);
    setBusy(false);
    setMsg(ok ? { ok: true, text: 'Đã lưu' } : { ok: false, text: 'Không lưu được — trạng thái chưa đổi.', retry: s });
    if (ok) setTimeout(() => setMsg((m) => (m && m.ok ? null : m)), 2000);
  };
  const pick = (s: 'unreviewed' | ReviewStatus) => {
    if (s === cur || busy) return;
    if (s === 'approved') { setAsk(true); return; }
    void apply(s === 'unreviewed' ? undefined : s);
  };

  return (
    <div className="rv" role="group" aria-label="Kiểm duyệt câu hỏi">
      <span className="rv-l">Kiểm duyệt</span>
      <div className="rv-seg">
        {(['unreviewed', 'needs_fix', 'approved'] as const).map((s) => (
          <button key={s} type="button" className={`rv-${s}`} aria-pressed={cur === s} disabled={busy} onClick={() => pick(s)}>{REVIEW_LABEL[s]}</button>
        ))}
      </div>
      {msg && (
        <span className={`rv-msg${msg.ok ? '' : ' bad'}`} role="status">
          {msg.text}
          {!msg.ok && <button type="button" className="linkbtn" onClick={() => void apply(msg.retry)}>Thử lại</button>}
        </span>
      )}
      {ask && (
        <div className="rv-ask" role="alertdialog" aria-label="Xác nhận đã duyệt">
          <span><b>Đã duyệt</b> là xác nhận của thầy/cô sau khi tự xem đề, đáp án, lời giải và hình — không phải kết quả máy kiểm tra.</span>
          <div className="head-actions">
            <button type="button" className="btn btn-sm btn-accent" onClick={() => void apply('approved')} autoFocus>Xác nhận đã duyệt</button>
            <button type="button" className="btn btn-sm" onClick={() => setAsk(false)}>Huỷ</button>
          </div>
        </div>
      )}
      <small className="rv-note">Sửa LaTeX / đổi loại câu → về “Chưa kiểm tra”</small>
    </div>
  );
}
