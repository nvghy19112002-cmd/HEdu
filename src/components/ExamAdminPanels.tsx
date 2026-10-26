// Thùng rác đề và Sao lưu/khôi phục thư viện đề (E4). Đây là thùng rác và sao lưu RIÊNG của thư viện đề,
// không dính tới Thùng rác câu hỏi hay sao lưu của Ngân hàng câu hỏi (hedu.db).
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import {
  backupLabel, dateText, examBackupCreate, examBackupList, examBackupRestore, examBackupVerify, examTrashList, examTrashPurge, examTrashRestore, formatBytes,
  type BackupCheck, type BackupInfo, type TrashItem,
} from '../lib/examlib';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Shell({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm xl-panel" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <div className="xl-panel-body">{children}</div>
        <div className="cfm-acts"><button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button></div>
      </div>
    </>
  );
}

export function ExamTrashPanel({ onClose, onChanged, toast }: { onClose(): void; onChanged(restoredId?: string): void; toast(m: string): void }) {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [purge, setPurge] = useState<{ item: TrashItem; step: 1 | 2 } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setItems(await examTrashList()); setErr(null); } catch (e) { setErr(msg(e)); } }, []);
  useEffect(() => { void load(); }, [load]);

  const restore = async (it: TrashItem) => {
    setBusy(true);
    try { const s = await examTrashRestore(it.id); toast(`Đã khôi phục “${s.name}”.`); await load(); onChanged(s.id); } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  const doPurge = async () => {
    if (!purge) return;
    setBusy(true);
    try { await examTrashPurge(purge.item.id); toast(`Đã xoá vĩnh viễn “${purge.item.name}”.`); setPurge(null); await load(); onChanged(); } catch (e) { setErr(msg(e)); setPurge(null); } finally { setBusy(false); }
  };

  return (
    <Shell title="Thùng rác đề" onClose={onClose}>
      <p className="xl-meta">Đề bị xoá được giữ ở đây cho tới khi bạn xoá vĩnh viễn. HEdu không tự xoá. Đây là Thùng rác riêng của đề, không phải Thùng rác câu hỏi.</p>
      {err && <div className="note bad" role="alert"><div className="note-body"><span>{err}</span></div></div>}
      {items === null && !err && <p className="aid-wait" role="status">Đang đọc…</p>}
      {items?.length === 0 && <p className="xl-meta">Thùng rác đề đang trống.</p>}
      <ul className="xl-list">
        {items?.map((it) => (
          <li key={it.id} className="xl-row xl-static">
            <span className="xl-name">{it.name}</span>
            <span className="xl-meta">{it.fileCount} tệp · {formatBytes(it.totalBytes)} · xoá lúc {it.deletedAt ? dateText(it.deletedAt) : '—'}</span>
            <span className="xl-actions">
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => restore(it)}>Khôi phục</button>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setPurge({ item: it, step: 1 })}>Xoá vĩnh viễn…</button>
            </span>
          </li>
        ))}
      </ul>
      {purge?.step === 1 && (
        <ConfirmDialog title="Xoá vĩnh viễn?" danger confirmLabel="Tiếp tục" cancelLabel="Giữ lại" onCancel={() => setPurge(null)} onConfirm={() => setPurge({ ...purge, step: 2 })}>
          <p>Đề “{purge.item.name}” ({purge.item.fileCount} tệp) sẽ bị xoá khỏi máy. Việc này không hoàn tác được.</p>
        </ConfirmDialog>
      )}
      {purge?.step === 2 && (
        <ConfirmDialog title="Xác nhận lần cuối" danger confirmLabel="Xoá vĩnh viễn" cancelLabel="Giữ lại" busy={busy} onCancel={() => setPurge(null)} onConfirm={doPurge}>
          <p>Bạn chắc chắn xoá vĩnh viễn “{purge.item.name}”? Nên có bản sao lưu thư viện đề trước.</p>
        </ConfirmDialog>
      )}
    </Shell>
  );
}

export function ExamBackupPanel({ onClose, onChanged, toast }: { onClose(): void; onChanged(): void; toast(m: string): void }) {
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [check, setCheck] = useState<{ name: string; r: BackupCheck } | null>(null);
  const [pick, setPick] = useState<{ name: string; ids: Set<string> } | null>(null);
  const load = useCallback(async () => { try { setList(await examBackupList()); setErr(null); } catch (e) { setErr(msg(e)); } }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy('create'); setErr(null);
    try { const b = await examBackupCreate(); toast(`Đã sao lưu ${b.projects.length} đề (${b.files} tệp, ${formatBytes(b.bytes)}).`); await load(); }
    catch (e) { setErr(msg(e)); } finally { setBusy(null); }
  };
  const verify = async (name: string) => {
    setBusy(name); setErr(null);
    try { setCheck({ name, r: await examBackupVerify(name) }); } catch (e) { setErr(msg(e)); } finally { setBusy(null); }
  };
  const restore = async () => {
    if (!pick || !pick.ids.size) return;
    setBusy('restore'); setErr(null);
    try { const r = await examBackupRestore(pick.name, [...pick.ids]); toast(`Đã khôi phục ${r.length} đề thành dự án MỚI (đề hiện có không bị ghi đè).`); setPick(null); onChanged(); }
    catch (e) { setErr(msg(e)); } finally { setBusy(null); }
  };

  return (
    <Shell title="Sao lưu thư viện đề" onClose={onClose}>
      <p className="xl-meta">Sao lưu RIÊNG của thư viện đề (tệp .tex, ảnh, .sty, sổ và nguồn câu hỏi), không nằm trong sao lưu của Ngân hàng câu hỏi. HEdu giữ 5 bản gần nhất và chỉ dọn bản cũ SAU KHI bản mới thành công. Khôi phục luôn tạo đề MỚI.</p>
      <div className="xl-actions"><button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={create}>{busy === 'create' ? 'Đang sao lưu…' : 'Sao lưu ngay'}</button></div>
      {err && <div className="note bad" role="alert"><div className="note-body"><span>{err}</span></div></div>}
      {list === null && !err && <p className="aid-wait" role="status">Đang đọc…</p>}
      {list?.length === 0 && <p className="xl-meta">Chưa có bản sao lưu nào.</p>}
      <ul className="xl-list">
        {list?.map((b) => (
          <li key={b.name} className="xl-row xl-static">
            <span className="xl-name">{backupLabel(b.name)} (giờ UTC)</span>
            <span className="xl-meta">{b.projects.length} đề · {b.files} tệp · {formatBytes(b.bytes)}</span>
            {b.warnings.map((w, i) => <span key={i} className="xl-flags">{w}</span>)}
            <span className="xl-actions">
              <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => verify(b.name)}>{busy === b.name ? 'Đang kiểm…' : 'Kiểm tra'}</button>
              <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => setPick({ name: b.name, ids: new Set() })}>Khôi phục…</button>
            </span>
            {check?.name === b.name && (
              <div className={`note ${check.r.ok ? 'ok' : 'bad'}`} role="status"><div className="note-body">
                {check.r.ok ? <b>Bản sao lưu nguyên vẹn.</b> : <b>Bản sao lưu có tệp hỏng</b>}
                {check.r.changed.length > 0 && <span>Đã đổi: {check.r.changed.slice(0, 10).join(', ')}</span>}
                {check.r.missing.length > 0 && <span>Mất: {check.r.missing.slice(0, 10).join(', ')}</span>}
              </div></div>
            )}
          </li>
        ))}
      </ul>
      {pick && list && (
        <ConfirmDialog title="Khôi phục từ bản sao lưu" confirmLabel="Khôi phục thành đề mới" busy={busy === 'restore'} disabled={!pick.ids.size} onCancel={() => setPick(null)} onConfirm={restore}>
          <p className="xl-meta">Chọn đề cần khôi phục (mỗi đề thành một dự án mới, đối chiếu từng tệp với sổ sao lưu):</p>
          <ul className="xl-lines">
            {list.find((b) => b.name === pick.name)?.projects.map(([id, name]) => (
              <li key={id}><label><input type="checkbox" checked={pick.ids.has(id)} onChange={(e) => { const s = new Set(pick.ids); if (e.target.checked) s.add(id); else s.delete(id); setPick({ ...pick, ids: s }); }} /> {name}</label></li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </Shell>
  );
}
