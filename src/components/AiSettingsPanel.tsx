// Mục "AI (Gemini)" ở màn Cài đặt: tối đa 5 cấu hình khoá API (lưu trong kho mật khẩu Windows), model, đồng ý gửi dữ liệu, thử kết nối.
// Khoá chỉ đi MỘT CHIỀU xuống Rust; giao diện chỉ biết "đã có / chưa có khoá". HEdu KHÔNG tự chuyển sang cấu hình khác khi gặp lỗi hay hết lượt.
import { useEffect, useState } from 'react';
import { aiKeyClear, aiKeySet, aiKeyStatus, aiRun, AiError } from '../lib/ai/client';
import { addProfile, initProfiles, MAX_PROFILES, removeProfile, renameProfile, saveProfiles, selectActive, setEnabled, type AiProfile, type ProfileId, type ProfilesState } from '../lib/ai/profiles';
import { AI_MODELS, loadAiPrefs, saveAiPrefs, thinkingFor, validModelId, type AiPrefs } from '../lib/ai/prefs';
import { isDesktop } from '../lib/platform';
import { AiConsentDialog } from './AiConsentDialog';
import { ConfirmDialog } from './ConfirmDialog';

/** Lượt thử kết nối: câu hỏi giả, không có dữ liệu ngân hàng; kiểm cả khoá lẫn khuôn JSON. */
const PROBE = {
  system: 'Bạn là công cụ kiểm tra kết nối. Chỉ trả JSON đúng khuôn.',
  user: 'Một cộng một bằng mấy? Trả về số nguyên ở trường answer.',
  schema: { type: 'OBJECT', properties: { answer: { type: 'INTEGER' } }, required: ['answer'] },
};

export function AiSettingsPanel({ toast }: { toast(m: string): void }) {
  const desktop = isDesktop();
  const [prefs, setPrefs] = useState<AiPrefs>(() => loadAiPrefs());
  const [st, setSt] = useState<ProfilesState | null>(null);
  const [has, setHas] = useState<Partial<Record<ProfileId, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newKey, setNewKey] = useState('');
  const [replace, setReplace] = useState<{ id: ProfileId; key: string } | null>(null);
  const [rename, setRename] = useState<{ id: ProfileId; name: string } | null>(null);
  const [askDel, setAskDel] = useState<AiProfile | null>(null);
  const [askProbe, setAskProbe] = useState<AiProfile | null>(null);
  const [probe, setProbe] = useState<{ id: ProfileId; ok: boolean; msg: string } | null>(null);
  const [custom, setCustom] = useState(() => (AI_MODELS.some((m) => m.id === loadAiPrefs().model) ? '' : loadAiPrefs().model));

  const refreshKeys = async (s: ProfilesState) => {
    const out: Partial<Record<ProfileId, boolean>> = {};
    for (const p of s.profiles) { try { out[p.id] = (await aiKeyStatus(p.id)).hasKey; } catch { out[p.id] = false; } }
    setHas(out);
  };
  useEffect(() => {
    if (!desktop) return;
    let live = true;
    void initProfiles().then(async (s) => { if (!live) return; setSt(s); await refreshKeys(s); });
    return () => { live = false; };
  }, [desktop]);

  const update = (p: Partial<AiPrefs>) => setPrefs((o) => { const n = { ...o, ...p }; saveAiPrefs(n); return n; });
  const fail = (e: unknown, fallback: string) => toast(e instanceof AiError ? e.message : e instanceof Error && e.message ? e.message : fallback);
  /** Ghi tệp thông tin trước; chỉ khi ghi xong mới đổi giao diện. */
  const commit = async (next: ProfilesState): Promise<boolean> => {
    try { await saveProfiles(next); setSt(next); return true; } catch { toast('Không ghi được cấu hình AI, chưa thay đổi gì.'); return false; }
  };

  const add = async () => {
    if (busy || !st) return;
    const r = addProfile(st, newName, newProject);
    if (!r.ok) { toast(r.message); return; }
    if (!newKey.trim()) { toast('Hãy dán khoá API cho cấu hình mới.'); return; }
    setBusy(true);
    try {
      await aiKeySet(newKey, r.id);
      if (await commit(r.state)) { setNewName(''); setNewProject(''); setNewKey(''); setHas((h) => ({ ...h, [r.id!]: true })); toast('Đã lưu cấu hình và khoá vào kho mật khẩu của Windows.'); }
      else { await aiKeyClear(r.id!).catch(() => {}); } // không để khoá mồ côi khi chưa ghi được cấu hình
    } catch (e) { fail(e, 'Không lưu được khoá.'); }
    setBusy(false);
  };
  const replaceKey = async () => {
    if (!replace || busy || !replace.key.trim()) return;
    setBusy(true);
    try { await aiKeySet(replace.key, replace.id); setHas((h) => ({ ...h, [replace.id]: true })); setReplace(null); setProbe(null); toast('Đã thay khoá.'); }
    catch (e) { fail(e, 'Không lưu được khoá.'); }
    setBusy(false);
  };
  const del = async (p: AiProfile) => {
    setAskDel(null);
    if (!st) return;
    setBusy(true);
    try {
      await aiKeyClear(p.id); // xoá khoá trước: kho mật khẩu lỗi ⇒ giữ cả cấu hình lẫn khoá, báo chưa xoá được
      setHas((h) => ({ ...h, [p.id]: false }));
      if (await commit(removeProfile(st, p.id))) toast(`Đã xoá cấu hình “${p.name}” và khoá của nó khỏi máy này.`);
    } catch (e) { fail(e, 'Không xoá được khoá — cấu hình được giữ nguyên.'); }
    setBusy(false);
  };
  const choose = async (p: AiProfile) => {
    if (!st) return;
    const r = selectActive(st, p.id, has[p.id] === true);
    if (!r.ok) { toast(r.message); return; }
    if (await commit(r.state)) toast(`Đang dùng cấu hình “${p.name}”. Lượt hỏi AI tiếp theo sẽ gửi theo cấu hình này.`);
  };
  const runProbe = async (p: AiProfile) => {
    setAskProbe(null); setBusy(true); setProbe(null);
    try {
      const r = await aiRun({ provider: 'gemini', model: prefs.model, ...PROBE, maxOutputTokens: 1024, timeoutSecs: 90, thinkingLevel: thinkingFor(prefs.model), profileId: p.id });
      const v = JSON.parse(r.text) as { answer?: unknown };
      setProbe(v.answer === 2 ? { id: p.id, ok: true, msg: `Kết nối được (${r.model}). AI trả đúng khuôn JSON.` } : { id: p.id, ok: false, msg: 'Kết nối được nhưng AI trả lời không đúng khuôn — báo cho người phát triển.' });
    } catch (e) {
      setProbe({ id: p.id, ok: false, msg: e instanceof AiError ? e.message : e instanceof SyntaxError ? 'AI trả lời không đọc được.' : 'Không thử được.' });
    }
    setBusy(false);
  };

  if (!desktop) return <section className="panel" aria-label="AI (Gemini)"><h2>AI (Gemini)</h2><span className="sys-hint">Chỉ dùng được trong bản cài trên Windows.</span></section>;
  const known = AI_MODELS.some((m) => m.id === prefs.model);
  const list = st?.profiles ?? [];
  return (
    <section className="panel" aria-label="AI (Gemini)">
      <h2>AI (Gemini)</h2>
      <span className="sys-hint">Dùng cho các tính năng có nút “Hỏi AI” (trước tiên là Gán ID tự động). Không bật thì HEdu chỉ đối chiếu với ngân hàng trên máy, không gửi gì ra ngoài.</span>

      <div className="ai-row"><b>Cấu hình khoá API ({list.length}/{MAX_PROFILES})</b></div>
      <span className="sys-hint">Mỗi cấu hình là một khoá, lưu trong kho mật khẩu Windows (không hiện lại, không nằm trong dữ liệu hay file sao lưu). Bạn tự chọn cấu hình đang dùng; HEdu không tự chuyển sang cấu hình khác khi gặp lỗi hay hết lượt. Giới hạn của Google tính theo project, nên thêm khoá cùng project không tăng hạn mức.</span>
      {st === null && <span className="chk-pill" role="status">Đang đọc cấu hình…</span>}
      {st && list.length === 0 && <span className="chk-pill warn" role="status">Chưa có cấu hình nào — thêm khoá bên dưới.</span>}
      <ul className="ai-prof" aria-label="Các cấu hình khoá API">
        {list.map((p) => {
          const k = has[p.id];
          const act = st?.active === p.id;
          return (
            <li key={p.id} className={act ? 'is-active' : undefined}>
              <label className="ai-prof-pick">
                <input type="radio" name="ai-active" checked={act} disabled={busy || !p.enabled || k !== true} onChange={() => { void choose(p); }} aria-label={`Dùng cấu hình ${p.name}`} />
                <span><b>{p.name}</b>{p.project ? <small> · {p.project}</small> : null}</span>
              </label>
              <span className={`chk-pill ${k ? 'ok' : 'warn'}`}>{k === undefined ? 'Đang kiểm tra…' : k ? 'Đã có khoá' : 'Chưa có khoá'}</span>
              {act && <span className="chk-pill ok">Đang dùng</span>}
              {!p.enabled && <span className="chk-pill warn">Đang tắt</span>}
              <span className="ai-prof-acts">
                <button type="button" className="btn btn-sm" disabled={busy || !k || !p.enabled} onClick={() => setAskProbe(p)}>Thử kết nối</button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setRename({ id: p.id, name: p.name })}>Sửa tên</button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setReplace({ id: p.id, key: '' })}>Thay khoá</button>
                <button type="button" className="btn btn-sm" disabled={busy || !st} onClick={() => { if (st) void commit(setEnabled(st, p.id, !p.enabled)); }}>{p.enabled ? 'Tắt' : 'Bật'}</button>
                <button type="button" className="btn btn-sm btn-outline tr-danger" disabled={busy} onClick={() => setAskDel(p)}>Xoá…</button>
              </span>
              {probe?.id === p.id && <span className={`chk-pill ${probe.ok ? 'ok' : 'bad'}`} role="status">{probe.msg}</span>}
            </li>
          );
        })}
      </ul>
      {st && list.length > 0 && !st.active && <span className="chk-pill warn" role="status">Chưa chọn cấu hình đang dùng — các nút “Hỏi AI” chưa hoạt động.</span>}

      {st && list.length < MAX_PROFILES && (
        <div className="ai-add">
          <b>Thêm cấu hình</b>
          <div className="head-actions">
            <input className="bd-in" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder="Tên gợi nhớ (vd Project A)" aria-label="Tên cấu hình" />
            <input className="bd-in" value={newProject} maxLength={60} onChange={(e) => setNewProject(e.target.value)} placeholder="Tên project Google (tuỳ chọn, chỉ để nhớ)" aria-label="Tên project Google (tuỳ chọn)" />
          </div>
          <div className="head-actions">
            <input className="bd-in ai-key" type="password" autoComplete="off" spellCheck={false} value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="Dán khoá API Gemini" aria-label="Khoá API Gemini của cấu hình mới" />
            <button type="button" className="btn btn-sm btn-accent" disabled={busy || !newName.trim() || !newKey.trim()} onClick={() => { void add(); }}>Lưu cấu hình</button>
          </div>
          <span className="sys-hint">Tạo khoá miễn phí tại <span className="mono">aistudio.google.com</span> → Get API key. HEdu chưa gọi Google khi bạn chỉ lưu khoá; chỉ gọi khi bạn bấm Thử kết nối hoặc Hỏi AI và đồng ý.</span>
        </div>
      )}

      <div className="ai-row">
        <label className="qsel"><b>Model mặc định</b>
          <select value={known ? prefs.model : 'khac'} onChange={(e) => { if (e.target.value === 'khac') setCustom(prefs.model); else { setCustom(''); update({ model: e.target.value }); } }}>
            {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.note}</option>)}
            <option value="khac">Khác (nhập mã model)…</option>
          </select>
        </label>
        {(!known || custom) && (
          <input className="bd-in ai-model" value={custom || prefs.model} onChange={(e) => { const v = e.target.value.trim(); setCustom(v); if (validModelId(v)) update({ model: v }); }} aria-label="Mã model" placeholder="vd gemini-3.8-flash" />
        )}
      </div>
      {custom && !validModelId(custom) && <span className="bd-bad">Mã model chỉ gồm chữ thường, số, dấu chấm và gạch ngang.</span>}

      <label className="bd-sure ai-consent">
        <input type="checkbox" checked={prefs.consent} onChange={(e) => update({ consent: e.target.checked })} />
        <span>Cho phép gửi nội dung câu hỏi tới Google (Gemini) khi tôi bấm “Hỏi AI”. Gói miễn phí: Google có thể dùng nội dung để cải thiện sản phẩm và người duyệt có thể đọc. Mỗi lượt gửi HEdu vẫn hỏi lại số câu, nội dung và cấu hình đích.</span>
      </label>

      {replace && (
        <ConfirmDialog title="Thay khoá API của cấu hình này?" confirmLabel="Lưu khoá mới" busy={busy} disabled={!replace.key.trim()} onConfirm={() => { void replaceKey(); }} onCancel={() => setReplace(null)}>
          <input className="bd-in ai-key" type="password" autoComplete="off" spellCheck={false} autoFocus value={replace.key} onChange={(e) => setReplace({ ...replace, key: e.target.value })} placeholder="Dán khoá API mới" aria-label="Khoá API mới" />
        </ConfirmDialog>
      )}
      {rename && (
        <ConfirmDialog title="Đổi tên cấu hình" confirmLabel="Lưu tên" disabled={!rename.name.trim()} onConfirm={() => { const r = st ? renameProfile(st, rename.id, rename.name) : null; if (r && r.ok) { void commit(r.state).then((okk) => { if (okk) setRename(null); }); } else if (r) toast(r.message); }} onCancel={() => setRename(null)}>
          <input className="bd-in" autoFocus maxLength={40} value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} aria-label="Tên mới của cấu hình" />
        </ConfirmDialog>
      )}
      {askDel && <ConfirmDialog danger title={`Xoá cấu hình “${askDel.name}”?`} confirmLabel="Xoá cấu hình và khoá" cancelLabel="Giữ lại" onConfirm={() => { void del(askDel); }} onCancel={() => setAskDel(null)}><p>Khoá của cấu hình này bị xoá khỏi kho mật khẩu của máy. Khoá trên tài khoản Google không bị thu hồi.{st?.active === askDel.id ? ' Đây là cấu hình đang dùng — xoá xong, HEdu sẽ KHÔNG tự chọn cấu hình khác; các nút “Hỏi AI” dừng cho tới khi bạn chọn lại.' : ''}</p></ConfirmDialog>}
      {askProbe && <AiConsentDialog plan={{ task: 'Thử kết nối', model: prefs.model, questions: 0, calls: 1, target: askProbe.name, sends: ['Một câu hỏi thử “1 + 1 bằng mấy?” — KHÔNG có câu hỏi nào trong ngân hàng.'] }} onSend={() => { void runProbe(askProbe); }} onCancel={() => setAskProbe(null)} />}
    </section>
  );
}
