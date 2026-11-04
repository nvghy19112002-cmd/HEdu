// Hộp "Chia sẻ với đồng nghiệp": Gửi = xuất gói câu hỏi (.json) theo phạm vi; Nhận = đọc gói, xem kế hoạch gộp (câu mới / bản mới / xung đột / trùng), rồi nhận.
// Gộp theo uid, nhớ "bản nền" để biết ai đã sửa gì (bankshare.ts). Trước khi nhận tự chụp điểm khôi phục (SQLite).
import { useMemo, useState } from 'react';
import { buildPack, counts, nextBase, parsePack, plan, VERDICT_VI, type Choice, type SharePack } from '../lib/bankshare';
import { ensureRestorePoint } from '../lib/dbbackup';
import { getTaxonomy } from '../lib/curriculum';
import { loadShareBase, saveShareBase } from '../lib/sharebase';
import { recordVersion } from '../lib/qhistory';
import { saveTextFile } from '../lib/savefile';
import { isDesktop } from '../lib/platform';
import { getStorageMode } from '../lib/storage';
import { addMany, getState, restoreManyEx, updateMany } from '../lib/store';
import type { Question } from '../lib/types';

const mode = (): 'sqlite' | 'web' | 'none' => (isDesktop() ? (getStorageMode() === 'sqlite' ? 'sqlite' : 'none') : 'web');
const NAME_KEY = 'hedu.share.from';
const lsGet = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* không lưu được thì thôi */ } };

export function ShareDialog({ onClose, onToast }: { onClose(): void; onToast(m: string): void }) {
  const [tab, setTab] = useState<'send' | 'recv'>('send');
  const qs = getState().questions;
  const tax = getTaxonomy();
  // ---- gửi
  const [from, setFrom] = useState(() => lsGet(NAME_KEY));
  const [grade, setGrade] = useState<number | 'all'>('all');
  const [onlyOk, setOnlyOk] = useState(false);
  const picked = useMemo(() => qs.filter((q) => (grade === 'all' || q.grade === grade) && (!onlyOk || q.review === 'approved')), [qs, grade, onlyOk]);
  const send = async () => {
    lsSet(NAME_KEY, from);
    const pack = buildPack(picked, tax, from.trim() || 'Đồng nghiệp');
    const r = await saveTextFile(`hedu-chia-se-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(pack), () => undefined);
    if (r.kind === 'saved') onToast(`Đã xuất ${picked.length} câu: ${r.path}`); else if (r.kind === 'error') onToast(r.message);
  };
  // ---- nhận
  const [pack, setPack] = useState<SharePack | null>(null);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [base, setBase] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => (pack ? plan(pack, qs, tax, base) : []), [pack, qs, tax, base]);
  const c = useMemo(() => counts(rows), [rows]);
  const open = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setPack(null);
    const r = parsePack(await f.text());
    if ('error' in r) { setErr(r.error); return; }
    setBase(await loadShareBase(mode())); setChoice({}); setFileName(f.name); setPack(r.pack);
  };
  const apply = async () => {
    if (!pack) return;
    setBusy(true);
    try {
      const rp = await ensureRestorePoint('nhap-hang-loat');
      if (!rp.ok) { setErr(rp.message); return; }
      const now = Date.now();
      const st = getState();
      const fresh = rows.filter((r) => r.verdict === 'new' && r.loc);
      const added: Question[] = fresh.map((r, i) => ({ uid: r.uid, seq: st.nextSeq + i, latex: r.theirs.latex, type: r.theirs.type, level: r.theirs.level, tags: r.theirs.tags, createdAt: now, updatedAt: r.theirs.updatedAt || now, ...r.loc! }));
      const res = await restoreManyEx(added);
      if (!res.ok) { setErr('Chưa ghi được các câu mới xuống đĩa; chưa nhận gì.'); return; }
      const take = rows.filter((r) => r.verdict === 'update' || (r.verdict === 'conflict' && choice[r.uid] === 'theirs'));
      const theirs = new Map(take.map((r) => [r.uid, r.theirs]));
      const u = await updateMany(theirs.keys(), (q) => {
        const t = theirs.get(q.uid)!;
        recordVersion(q.uid, q.latex, q.updatedAt > 946684800000 ? q.updatedAt : now);
        const n: Question = { ...q, latex: t.latex, type: t.type, level: t.level, tags: t.tags, updatedAt: now };
        delete n.review; // nội dung đổi ⇒ phải duyệt lại
        return n;
      });
      if (!u.ok) { setErr('Chưa ghi được các câu cập nhật xuống đĩa.'); return; }
      const both = rows.filter((r) => r.verdict === 'conflict' && choice[r.uid] === 'both' && r.mine);
      if (both.length) addMany(both.map((r) => ({ grade: r.mine!.grade, chapterId: r.mine!.chapterId, lessonId: r.mine!.lessonId, formId: r.mine!.formId, latex: r.theirs.latex, level: r.theirs.level, tags: r.theirs.tags })));
      const nb = nextBase(base, rows, choice);
      await saveShareBase(mode(), nb);
      setBase(nb);
      onToast(`Đã nhận: ${res.restored.length} câu mới, ${u.changed} câu cập nhật${both.length ? `, ${both.length} câu giữ cả hai` : ''}.`);
      setPack(null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const conflicts = rows.filter((r) => r.verdict === 'conflict');
  const todo = c.new + c.update + conflicts.filter((r) => choice[r.uid] === 'theirs' || choice[r.uid] === 'both').length;

  return (
    <>
      <div className="cfm-scrim" onClick={onClose} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label="Chia sẻ với đồng nghiệp" style={{ maxWidth: 820, width: 'min(820px, 96vw)' }}>
        <h3>Chia sẻ ngân hàng với đồng nghiệp</h3>
        <div className="head-actions" style={{ marginBottom: 8 }}>
          <button type="button" className={`btn btn-sm ${tab === 'send' ? 'btn-dark' : 'btn-outline'}`} onClick={() => setTab('send')}>Gửi</button>
          <button type="button" className={`btn btn-sm ${tab === 'recv' ? 'btn-dark' : 'btn-outline'}`} onClick={() => setTab('recv')}>Nhận</button>
        </div>
        <div className="cfm-body" style={{ maxHeight: '64vh', overflow: 'auto' }}>
          {tab === 'send' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>Tên của bạn (hiện trong gói) <input className="xl-in" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Cô Lan" /></label>
              <label>Phạm vi <select className="xl-in" value={String(grade)} onChange={(e) => setGrade(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">Cả ngân hàng</option>{tax.grades.map((g) => <option key={g.id} value={g.grade}>{g.name}</option>)}</select></label>
              <label><input type="checkbox" checked={onlyOk} onChange={(e) => setOnlyOk(e.target.checked)} /> Chỉ câu đã duyệt</label>
              <p className="xl-meta">Sẽ gửi {picked.length} câu. Gói là một tệp .json: gửi qua Zalo, email hoặc để trong thư mục chung (Drive, OneDrive). Đồng nghiệp mở HEdu → Cài đặt → Dữ liệu & sao lưu → Chia sẻ ngân hàng → Nhận.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>Chọn gói của đồng nghiệp <input type="file" accept=".json" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ''; }} /></label>
              {pack && (
                <>
                  <p className="xl-meta">Gói “{fileName}” của <b>{pack.from}</b> ({new Date(pack.exportedAt).toLocaleString('vi-VN')}), {pack.questions.length} câu.</p>
                  <div className="chk-sum" role="status" style={{ flexWrap: 'wrap' }}>
                    {(Object.keys(c) as (keyof typeof c)[]).filter((k) => c[k]).map((k) => <span key={k} className="chk-pill">{VERDICT_VI[k]}: {c[k]}</span>)}
                  </div>
                  {conflicts.length > 0 && (
                    <>
                      <h4 style={{ margin: '4px 0' }}>Câu cả hai cùng sửa (chọn cách xử lý, mặc định giữ của bạn)</h4>
                      {conflicts.map((r) => (
                        <div key={r.uid} className="fb-rowbox">
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div><b>Của bạn</b><pre className="hist-pre">{r.mine!.latex}</pre></div>
                            <div><b>Của {pack.from}</b><pre className="hist-pre">{r.theirs.latex}</pre></div>
                          </div>
                          <select className="xl-in" value={choice[r.uid] ?? 'mine'} onChange={(e) => setChoice({ ...choice, [r.uid]: e.target.value as Choice })} aria-label="Cách xử lý">
                            <option value="mine">Giữ của bạn</option><option value="theirs">Lấy của đồng nghiệp (bản của bạn vào Lịch sử)</option><option value="both">Giữ cả hai (thêm câu mới)</option>
                          </select>
                        </div>
                      ))}
                    </>
                  )}
                  {c['no-place'] > 0 && <p className="te-warn">{c['no-place']} câu không có chỗ trong cây mục lục của bạn (khác lớp/chương/bài/dạng) nên sẽ bị bỏ qua.</p>}
                  <p className="xl-meta">Câu nhận về có trạng thái “Chưa kiểm tra”. Trước khi nhận, HEdu tự chụp điểm khôi phục.</p>
                </>
              )}
            </div>
          )}
          {err && <p className="te-warn" role="alert">{err}</p>}
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" onClick={onClose}>Đóng</button>
          {tab === 'send'
            ? <button type="button" className="btn btn-accent" disabled={!picked.length} onClick={() => { void send(); }}>Xuất gói…</button>
            : <button type="button" className="btn btn-accent" disabled={!pack || busy || todo === 0} onClick={() => { void apply(); }}>Nhận {todo ? `${todo} câu` : ''}</button>}
        </div>
      </div>
    </>
  );
}
