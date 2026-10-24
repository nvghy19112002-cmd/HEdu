// Mục "AI (Gemini)" ở màn Hệ thống: khoá API (lưu trong kho mật khẩu Windows), model, đồng ý gửi dữ liệu, thử kết nối.
import { useEffect, useState } from 'react';
import { aiKeyClear, aiKeySet, aiKeyStatus, aiRun, AiError } from '../lib/ai/client';
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
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [askClear, setAskClear] = useState(false);
  const [askProbe, setAskProbe] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; msg: string } | null>(null);
  const [custom, setCustom] = useState(() => (AI_MODELS.some((m) => m.id === loadAiPrefs().model) ? '' : loadAiPrefs().model));

  useEffect(() => { if (desktop) aiKeyStatus().then((s) => setHasKey(s.hasKey)).catch(() => setHasKey(false)); }, [desktop]);
  const update = (p: Partial<AiPrefs>) => setPrefs((o) => { const n = { ...o, ...p }; saveAiPrefs(n); return n; });

  const saveKey = async () => {
    if (busy || !key.trim()) return;
    setBusy(true);
    try { await aiKeySet(key); setKey(''); setHasKey(true); setProbe(null); toast('Đã lưu khoá API vào kho mật khẩu của Windows.'); }
    catch (e) { toast(e instanceof AiError ? e.message : 'Không lưu được khoá.'); }
    setBusy(false);
  };
  const clearKey = async () => {
    setAskClear(false);
    try { await aiKeyClear(); setHasKey(false); setProbe(null); toast('Đã xoá khoá API khỏi máy này.'); }
    catch (e) { toast(e instanceof AiError ? e.message : 'Không xoá được khoá.'); }
  };
  const runProbe = async () => {
    setAskProbe(false);
    setBusy(true);
    setProbe(null);
    try {
      const r = await aiRun({ provider: 'gemini', model: prefs.model, ...PROBE, maxOutputTokens: 1024, timeoutSecs: 90, thinkingLevel: thinkingFor(prefs.model) });
      const v = JSON.parse(r.text) as { answer?: unknown };
      setProbe(v.answer === 2 ? { ok: true, msg: `Kết nối được (${r.model}). AI trả đúng khuôn JSON.` } : { ok: false, msg: 'Kết nối được nhưng AI trả lời không đúng khuôn — báo cho người phát triển.' });
    } catch (e) {
      setProbe({ ok: false, msg: e instanceof AiError ? e.message : e instanceof SyntaxError ? 'AI trả lời không đọc được.' : 'Không thử được.' });
    }
    setBusy(false);
  };

  if (!desktop) return <section className="panel" aria-label="AI (Gemini)"><h2>AI (Gemini)</h2><span className="sys-hint">Chỉ dùng được trong bản cài trên Windows.</span></section>;
  const known = AI_MODELS.some((m) => m.id === prefs.model);
  return (
    <section className="panel" aria-label="AI (Gemini)">
      <h2>AI (Gemini)</h2>
      <span className="sys-hint">Dùng cho các tính năng có nút “Hỏi AI” (trước tiên là Gán ID tự động). Không bật thì HEdu chỉ đối chiếu với ngân hàng trên máy, không gửi gì ra ngoài.</span>

      <div className="ai-row">
        <b>Khoá API</b>
        <span className={`chk-pill ${hasKey ? 'ok' : 'warn'}`} role="status">{hasKey == null ? 'Đang kiểm tra…' : hasKey ? 'Đã có khoá (lưu trong kho mật khẩu Windows)' : 'Chưa có khoá'}</span>
      </div>
      <span className="sys-hint">Tạo khoá miễn phí tại <span className="mono">aistudio.google.com</span> → Get API key, rồi dán vào đây. Khoá không hiện lại sau khi lưu, không nằm trong dữ liệu hay file sao lưu.</span>
      <div className="head-actions">
        <input className="bd-in ai-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? 'Dán khoá mới để thay' : 'Dán khoá API Gemini'} aria-label="Khoá API Gemini" />
        <button type="button" className="btn btn-sm btn-accent" disabled={busy || !key.trim()} onClick={() => { void saveKey(); }}>Lưu khoá</button>
        {hasKey && <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={() => setAskClear(true)}>Xoá khoá</button>}
      </div>

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
        <span>Cho phép gửi nội dung câu hỏi tới Google (Gemini) khi tôi bấm “Hỏi AI”. Gói miễn phí: Google có thể dùng nội dung để cải thiện sản phẩm và người duyệt có thể đọc. Mỗi lượt gửi HEdu vẫn hỏi lại số câu và nội dung.</span>
      </label>

      <div className="head-actions">
        <button type="button" className="btn btn-sm" disabled={busy || !hasKey} onClick={() => setAskProbe(true)}>{busy ? 'Đang thử…' : 'Thử kết nối'}</button>
        {probe && <span className={`chk-pill ${probe.ok ? 'ok' : 'bad'}`} role="status">{probe.msg}</span>}
      </div>

      {askClear && <ConfirmDialog danger title="Xoá khoá API khỏi máy này?" confirmLabel="Xoá khoá" onConfirm={() => { void clearKey(); }} onCancel={() => setAskClear(false)}><p>Các nút “Hỏi AI” sẽ không dùng được cho tới khi nhập khoá mới. Khoá trên tài khoản Google không bị thu hồi.</p></ConfirmDialog>}
      {askProbe && <AiConsentDialog plan={{ task: 'Thử kết nối', model: prefs.model, questions: 0, calls: 1, sends: ['Một câu hỏi thử “1 + 1 bằng mấy?” — KHÔNG có câu hỏi nào trong ngân hàng.'] }} onSend={() => { void runProbe(); }} onCancel={() => setAskProbe(false)} />}
    </section>
  );
}
