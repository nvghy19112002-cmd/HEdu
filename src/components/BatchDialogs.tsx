// Hộp thoại cho thao tác hàng loạt: Gắn nhãn (hiện CHƯA gắn vào thanh chọn — chủ dự án chưa cần), Chuyển vào Thùng rác. Có xem trước "bao nhiêu câu sẽ đổi" trước khi bấm.
import { useMemo, useState } from 'react';
import { parseTagInput, tagChangeCount, tagCounts, withTags } from '../lib/batchops';
import type { Question } from '../lib/types';
import { TRASH_CAP, trashCount } from '../lib/dupdecisions';
import { ConfirmDialog } from './ConfirmDialog';

const nf = new Intl.NumberFormat('vi-VN');

export function BatchTagDialog({ qs, busy, onRun, onCancel }: { qs: Question[]; busy: boolean; onRun: (fn: (q: Question) => Question | null) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const have = useMemo(() => tagCounts(qs), [qs]);
  const add = parseTagInput(text);
  const ops = { add, remove: [...remove] };
  const n = useMemo(() => tagChangeCount(qs, ops), [qs, text, remove]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (t: string) => setRemove((s) => { const x = new Set(s); x.has(t) ? x.delete(t) : x.add(t); return x; });
  const none = add.length === 0 && remove.size === 0;
  return (
    <ConfirmDialog
      title={`Gắn nhãn cho ${nf.format(qs.length)} câu`}
      confirmLabel={n > 0 ? `Áp dụng cho ${nf.format(n)} câu` : 'Chưa có gì để đổi'}
      busy={busy}
      disabled={n === 0}
      onConfirm={() => onRun(withTags(ops))}
      onCancel={onCancel}
    >
      <label className="bd-lab" htmlFor="bd-add">Thêm nhãn (ngăn cách bằng dấu phẩy)</label>
      <input id="bd-add" className="bd-in" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="vd: ôn thi, HK1" onKeyDown={(e) => { if (e.key === 'Enter' && n > 0 && !busy) { e.preventDefault(); onRun(withTags(ops)); } }} />
      {add.length > 0 && <div className="bd-chips" aria-label="Nhãn sẽ thêm">{add.map((t) => <span key={t} className="bd-chip is-add">+ {t}</span>)}</div>}
      {have.length > 0 && (
        <>
          <div className="bd-lab">Nhãn đang có trong các câu đã chọn — bấm để bỏ</div>
          <div className="bd-chips" role="group" aria-label="Nhãn sẽ bỏ">
            {have.slice(0, 40).map(({ tag, n: c }) => (
              <button key={tag} type="button" className={`bd-chip${remove.has(tag) ? ' is-rm' : ''}`} aria-pressed={remove.has(tag)} onClick={() => toggle(tag)}>
                {remove.has(tag) ? '− ' : ''}{tag} <small>{nf.format(c)}</small>
              </button>
            ))}
          </div>
          {have.length > 40 && <p className="bd-note">Chỉ hiện 40 nhãn dùng nhiều nhất.</p>}
        </>
      )}
      <p className="bd-sum" role="status">{none ? 'Nhập nhãn cần thêm hoặc chọn nhãn cần bỏ.' : n === 0 ? 'Các câu đã chọn đã đúng như vậy, không có gì thay đổi.' : `${nf.format(n)} / ${nf.format(qs.length)} câu sẽ thay đổi. Nhãn khác của từng câu được giữ nguyên.`}</p>
    </ConfirmDialog>
  );
}

/** Xoá hàng loạt = chuyển vào Thùng rác (khôi phục được). Có cổng sức chứa; việc lớn (≥ 50 câu) phải tick xác nhận. */
export const BIG_TRASH = 50;
export function BatchTrashDialog({ qs, busy, onRun, onCancel }: { qs: Question[]; busy: boolean; onRun: () => void; onCancel: () => void }) {
  const [sure, setSure] = useState(false);
  const have = trashCount();
  const room = Math.max(0, TRASH_CAP - have);
  const full = qs.length > room;
  const big = qs.length >= BIG_TRASH;
  return (
    <ConfirmDialog
      danger
      title={`Chuyển ${nf.format(qs.length)} câu vào Thùng rác?`}
      confirmLabel={`Chuyển ${nf.format(qs.length)} câu vào Thùng rác`}
      busy={busy}
      disabled={full || (big && !sure)}
      onConfirm={onRun}
      onCancel={onCancel}
    >
      <p>Các câu sẽ rời khỏi Ngân hàng nhưng được giữ trong Thùng rác, có thể khôi phục ở màn <b>Thùng rác</b> (thanh bên trái) (giữ nguyên số thứ tự và nội dung).</p>
      <p className="bd-sum" role="status">Thùng rác hiện có {nf.format(have)} / {nf.format(TRASH_CAP)} câu{full ? '.' : ` · sau khi chuyển: ${nf.format(have + qs.length)} / ${nf.format(TRASH_CAP)}.`}</p>
      {full && <p className="bd-bad" role="alert">Thùng rác chỉ còn chỗ cho {nf.format(room)} câu nên CHƯA thể chuyển {nf.format(qs.length)} câu. Hãy bỏ bớt câu đã chọn, hoặc mở màn Thùng rác để khôi phục/xoá hẳn bớt rồi thử lại. Không câu nào bị xoá.</p>}
      {big && !full && (
        <label className="bd-sure"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> Tôi đã xem lại: đúng {nf.format(qs.length)} câu này cần chuyển vào Thùng rác</label>
      )}
    </ConfirmDialog>
  );
}
