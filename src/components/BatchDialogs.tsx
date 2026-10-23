// Hộp thoại cho thao tác hàng loạt: Gắn nhãn, Đổi mức độ. Có xem trước "bao nhiêu câu sẽ đổi" trước khi bấm.
import { useMemo, useState } from 'react';
import { levelChangeCount, parseTagInput, tagChangeCount, tagCounts, withLevel, withTags } from '../lib/batchops';
import { LEVEL_LABEL, LEVELS, type Level, type Question } from '../lib/types';
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
      busy={busy || n === 0}
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

export function BatchLevelDialog({ qs, busy, onRun, onCancel }: { qs: Question[]; busy: boolean; onRun: (fn: (q: Question) => Question | null) => void; onCancel: () => void }) {
  const [lv, setLv] = useState<Level | null>(null);
  const cnt = useMemo(() => { const m = new Map<Level, number>(); qs.forEach((q) => m.set(q.level, (m.get(q.level) ?? 0) + 1)); return m; }, [qs]);
  const n = lv ? levelChangeCount(qs, lv) : 0;
  return (
    <ConfirmDialog
      title={`Đổi mức độ cho ${nf.format(qs.length)} câu`}
      confirmLabel={lv && n > 0 ? `Đổi ${nf.format(n)} câu sang ${LEVEL_LABEL[lv]}` : 'Chọn mức độ mới'}
      busy={busy || !lv || n === 0}
      onConfirm={() => lv && onRun(withLevel(lv))}
      onCancel={onCancel}
    >
      <div className="bd-lab">Mức độ mới</div>
      <div className="bd-levels" role="radiogroup" aria-label="Mức độ mới">
        {LEVELS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={lv === l} className={`bd-lv${lv === l ? ' is-on' : ''}`} onClick={() => setLv(l)}>
            {LEVEL_LABEL[l]}<small>{nf.format(cnt.get(l) ?? 0)} câu hiện tại</small>
          </button>
        ))}
      </div>
      <p className="bd-sum" role="status">{!lv ? 'Chọn mức độ muốn gán cho tất cả các câu đã chọn.' : n === 0 ? 'Các câu đã chọn đều đang ở mức này.' : `${nf.format(n)} / ${nf.format(qs.length)} câu sẽ đổi mức độ.`}</p>
      <p className="bd-note">Lưu ý: mã ID hiển thị (chữ N/H/V/C) đổi theo mức độ. Nội dung LaTeX, số thứ tự, trạng thái kiểm duyệt và nhãn không đổi.</p>
    </ConfirmDialog>
  );
}
