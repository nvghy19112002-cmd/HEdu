// Mẫu ma trận đề: lưu ma trận hiện tại thành mẫu có tên, áp dụng (thay hoặc thêm), đổi tên, nhân bản, xóa có xác nhận.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTaxonomy } from '../lib/curriculum';
import type { Draft } from '../lib/examdraft';
import { newRowId } from '../lib/examdraft';
import { applyTemplate, checkCompat, createTemplate, deleteTemplate, duplicateTemplate, listTemplates, renameTemplate, snapshotFrom, templatesWritable, unsupportedCount, useTemplates, type ApplyMode, type Template } from '../lib/examtemplates';
import { POLICY_LABEL } from '../lib/examgen';

const dateText = (t: number) => new Date(t).toLocaleDateString('vi-VN');

export function ExamTemplatesDialog({ draft, onApply, onClose, onToast }: {
  draft: Draft;
  /** next = bản nháp sau khi áp dụng, prev = bản trước đó (để hoàn tác) */
  onApply(next: Draft, prev: Draft, note: string): void;
  onClose(): void;
  onToast(m: string): void;
}) {
  const ver = useTemplates();
  const { tax } = useTaxonomy();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const list = useMemo(() => listTemplates(), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = useMemo(() => unsupportedCount(), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const writable = templatesWritable();

  useEffect(() => {
    first.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [busy, onClose]);

  const run = async (f: () => Promise<{ ok: boolean; why?: string }>, okMsg: string) => {
    setBusy(true); setMsg(null);
    try { const r = await f(); if (r.ok) onToast(okMsg); else setMsg(r.why ?? 'Không thực hiện được.'); return r.ok; } finally { setBusy(false); }
  };

  const save = async () => {
    const ok = await run(() => createTemplate(snapshotFrom(draft, tax, name)), `Đã lưu mẫu “${name.trim()}”.`);
    if (ok) setName('');
  };
  const apply = (t: Template, mode: ApplyMode) => {
    const has = draft.rows.length > 0;
    const locks = Object.values(draft.locked).flat().length;
    if (mode === 'replace' && has && !window.confirm(`Thay ma trận hiện tại (${draft.rows.length} dòng${locks ? `, ${locks} câu đã khóa sẽ được bỏ khóa` : ''}) bằng mẫu “${t.name}”?\n\nThông tin trường/kỳ thi và hạt giống được giữ. Sau khi áp dụng bạn có thể bấm “Hoàn tác áp dụng mẫu”.`)) return;
    const r = applyTemplate(t, draft, tax, mode, newRowId);
    onApply(r.draft, draft, `Đã ${mode === 'replace' ? 'thay ma trận bằng' : 'thêm vào ma trận'} mẫu “${t.name}” (${r.added} dòng${r.bad ? `, ${r.bad} dòng không còn hợp lệ với cây hiện tại — được giữ để bạn xem lại` : ''}).`);
    onClose();
  };
  const remove = async (t: Template) => {
    if (!window.confirm(`Xóa mẫu “${t.name}”? Việc này không thể hoàn tác (bản sao lưu cũ vẫn giữ mẫu nếu có).`)) return;
    await run(() => deleteTemplate(t.id), `Đã xóa mẫu “${t.name}”.`);
  };

  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label="Mẫu ma trận đề" style={{ maxWidth: 680 }}>
        <h3>Mẫu ma trận đề</h3>
        <div className="cfm-body">
          {!writable && <p className="te-bad" role="alert">Tệp mẫu hiện không ghi được (không đọc được tệp mẫu hoặc đang khôi phục dữ liệu). HEdu không ghi đè tệp đó. Bạn vẫn xem được các mẫu đã có (nếu đọc được) nhưng chưa tạo/sửa được.</p>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="lbl" style={{ flex: '1 1 260px' }}>Lưu ma trận hiện tại thành mẫu ({draft.rows.length} dòng)
              <input ref={first} className="inp" type="text" maxLength={80} placeholder="Tên mẫu, vd Giữa kỳ I lớp 12" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && draft.rows.length) void save(); }} />
            </label>
            <button type="button" className="btn btn-dark" disabled={busy || !writable || !name.trim() || draft.rows.length === 0} onClick={() => { void save(); }}>Lưu mẫu</button>
          </div>
          <p className="te-note" style={{ marginTop: 6 }}>Mẫu chỉ lưu các dòng ma trận, chính sách lấy câu, điểm, số mã và lựa chọn trộn. Không lưu câu khóa, ngoại lệ, UID câu, thông tin trường hay kỳ thi.</p>
          {msg && <p className="te-bad" role="alert" style={{ marginTop: 8 }}>{msg}</p>}

          <div style={{ marginTop: 14 }}><b>Mẫu đã lưu ({list.length})</b></div>
          {list.length === 0 && <p className="te-note">Chưa có mẫu nào.</p>}
          <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflow: 'auto' }}>
            {list.map((t) => {
              const c = checkCompat(t, tax);
              return (
                <li key={t.id} className="panel" style={{ padding: 12, gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    {edit?.id === t.id ? (
                      <span style={{ display: 'flex', gap: 6, flex: '1 1 240px' }}>
                        <input className="inp" type="text" aria-label="Tên mới của mẫu" maxLength={80} value={edit.text} onChange={(e) => setEdit({ id: t.id, text: e.target.value })} />
                        <button type="button" className="btn btn-sm btn-dark" disabled={busy} onClick={() => { void run(() => renameTemplate(t.id, edit.text), 'Đã đổi tên mẫu.').then((ok) => { if (ok) setEdit(null); }); }}>Lưu tên</button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEdit(null)}>Hủy</button>
                      </span>
                    ) : <b style={{ overflowWrap: 'anywhere' }}>{t.name}</b>}
                    <span className="te-note">{t.rows.length} dòng · {t.codes} mã · cập nhật {dateText(t.updatedAt)}</span>
                  </div>
                  <div className="te-note">{POLICY_LABEL[t.policy]}{c.bad > 0 && <span className="te-bad"> · {c.bad} dòng không còn hợp lệ với cây hiện tại ({c.rows.filter((r) => r.state === 'mat').length} đã xóa, {c.rows.filter((r) => r.state === 'doi-vi-tri').length} đổi vị trí)</span>}{c.bad === 0 && c.taxChanged && ' · cây chương trình đã đổi nhưng mọi dòng vẫn hợp lệ'}</div>
                  {pick === t.id ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label="Cách áp dụng mẫu">
                      <button type="button" className="btn btn-sm btn-dark" disabled={busy} onClick={() => apply(t, 'replace')}>Thay ma trận hiện tại</button>
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => apply(t, 'add')}>Thêm vào ma trận hiện tại</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPick(null)}>Hủy</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-sm btn-dark" disabled={busy} onClick={() => setPick(t.id)}>Áp dụng…</button>
                      <button type="button" className="btn btn-sm" disabled={busy || !writable} onClick={() => setEdit({ id: t.id, text: t.name })}>Đổi tên</button>
                      <button type="button" className="btn btn-sm" disabled={busy || !writable} onClick={() => { void run(() => duplicateTemplate(t.id), 'Đã nhân bản mẫu.'); }}>Nhân bản</button>
                      <button type="button" className="btn btn-sm btn-ghost" disabled={busy || !writable} onClick={() => { void remove(t); }}>Xóa…</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {hidden > 0 && <p className="te-note" style={{ marginTop: 8 }}>{hidden} mẫu thuộc định dạng mới hơn bản HEdu này nên chưa dùng được; HEdu giữ nguyên chúng.</p>}
        </div>
        <div className="cfm-acts"><button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Đóng</button></div>
      </div>
    </>
  );
}
