import { useMemo, useState } from 'react';
import { useTaxonomy } from '../lib/curriculum';
import { commitRecs, effectiveOf, FORM_STATE_LABEL, getRec, keepNoId, LEVEL_STATE_LABEL, makeRec, SOURCE_LABEL, useIdReview, type Effective } from '../lib/idreview';
import { indexOf } from '../lib/taxonomy';
import { taxRevision } from '../lib/taxpath';
import type { Question } from '../lib/types';

/** Trạng thái xác minh có hiệu lực của một câu (tự cập nhật khi kho trạng thái hoặc cây đổi). */
export function useEffectiveOf() {
  const ver = useIdReview();
  const { tax } = useTaxonomy();
  const ctx = useMemo(() => ({ ix: indexOf(tax), taxRev: taxRevision(tax) }), [tax]);
  return useMemo(() => (q: Question): Effective => effectiveOf(q, getRec(q.uid), ctx), [ctx, ver]); // eslint-disable-line react-hooks/exhaustive-deps
}

const cls = (f: Effective['form']) => (f === 'gv' ? 'rv-approved' : f === 'xem-lai' ? 'rv-needs_fix' : 'rv-unreviewed');

/** Chấm nhỏ trên thẻ câu: chỉ hiện khi đáng chú ý (đã xác minh, cần xem lại, chưa phân loại). "Chưa xác minh" là mặc định nên không hiện. */
export function IdStateBadge({ eff }: { eff: Effective }) {
  if (eff.unclassified) return <span className="rv-chip rv-needs_fix" title="Chưa được đặt vào Dạng nào (mục Chưa có ID). Không ghi ID giả vào LaTeX.">Chưa có ID</span>;
  if (eff.form === 'xem-lai') return <span className="rv-chip rv-needs_fix" title="Dạng cần xem lại">Dạng: cần xem lại</span>;
  if (eff.form === 'gv') return <span className="rv-chip rv-approved" title="Giáo viên đã xác minh Dạng">Dạng: GV xác minh</span>;
  if (eff.form === 'may') return <span className="rv-chip rv-unreviewed" title="Máy phân loại, chưa được giáo viên xác minh">Dạng: máy</span>;
  return null;
}

/**
 * Xác nhận Dạng / mức độ của MỘT câu. Đây là xác nhận của giáo viên, không phải kết quả máy: chỉ nút này mới tạo trạng thái "giáo viên xác minh".
 * Dạng, mức độ và nội dung duyệt (ô bên cạnh) là ba việc riêng. Câu đã xác minh Dạng được dùng làm căn cứ kiểm chứng cho câu mới.
 */
export function IdReviewControl({ q, eff }: { q: Question; eff: Effective }) {
  const { tax } = useTaxonomy();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = async (o: { form: Effective['form']; level: Effective['level']; src?: 'tay' | 'soat' }, done: string) => {
    setBusy(true); setMsg(null);
    // ghi bền vững; ghi lỗi ⇒ trạng thái được TRẢ LẠI như cũ (không hiện "giáo viên xác minh" khi chưa lưu được).
    // Câu Chưa có ID giữ nguyên dấu đó: chỉ đặt vào Dạng thật (Sửa câu / hàng đợi) mới rời mục.
    const ok = await commitRecs([[q.uid, makeRec(q, { form: o.form, level: o.level, src: o.src ?? 'tay', taxRev: taxRevision(tax), ...keepNoId(eff) })]]);
    setBusy(false);
    setMsg(ok ? { ok: true, text: done } : { ok: false, text: 'Chưa ghi được xuống đĩa nên CHƯA đổi trạng thái. Hãy kiểm tra ổ đĩa rồi thử lại.' });
    if (ok) setTimeout(() => setMsg((m) => (m && m.ok ? null : m)), 2000);
  };

  return (
    <div className="rv" role="group" aria-label="Xác minh Dạng và mức độ" title="Xác nhận Dạng nghĩa là thầy/cô đã tự xem câu và thấy Dạng này đúng; câu sẽ được dùng làm căn cứ kiểm chứng cho câu mới. Đổi Dạng, đổi nội dung → về “Chưa xác minh”.">
      <span className="rv-l">Dạng</span>
      <span className={`rv-chip ${cls(eff.form)}`} title={eff.src ? `Nguồn: ${SOURCE_LABEL[eff.src]}` : 'Chưa có xác minh nào'}>{FORM_STATE_LABEL[eff.form]}</span>
      <span className="rv-l">Mức độ</span>
      <span className={`rv-chip ${eff.level === 'gv' ? 'rv-approved' : 'rv-unreviewed'}`}>{LEVEL_STATE_LABEL[eff.level]}</span>
      {eff.unclassified && <span className="rv-chip rv-needs_fix" title="Chưa được đặt vào Dạng nào: mở Sửa câu để chọn Dạng">Chưa có ID</span>}
      <div className="rv-seg">
        <button type="button" disabled={busy || eff.form === 'gv' || eff.unclassified} title={eff.unclassified ? 'Câu chưa có ID: chọn Dạng trong Sửa câu trước' : undefined} onClick={() => void apply({ form: 'gv', level: eff.level }, 'Đã xác minh Dạng')}>Xác nhận Dạng</button>
        <button type="button" disabled={busy || eff.level === 'gv'} onClick={() => void apply({ form: eff.form, level: 'gv' }, 'Đã xác minh mức độ')}>Xác nhận mức độ</button>
        <button type="button" disabled={busy || eff.form === 'xem-lai'} onClick={() => void apply({ form: 'xem-lai', level: eff.level }, 'Đã đánh dấu cần xem lại')}>Cần xem lại</button>
        <button type="button" disabled={busy || (eff.form === 'chua' && eff.level === 'chua')} onClick={() => void apply({ form: 'chua', level: 'chua' }, 'Đã bỏ xác nhận')}>Bỏ xác nhận</button>
      </div>
      {msg && <span className={`rv-msg${msg.ok ? '' : ' bad'}`} role="status">{msg.text}</span>}
    </div>
  );
}
