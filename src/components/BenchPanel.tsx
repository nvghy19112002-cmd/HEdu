// Đo độ chính xác AI gán Dạng (nâng cao). Chỉ chạy khi giáo viên chọn tệp nhãn chuẩn và ĐỒNG Ý TỪNG model (hộp xin phép nêu số câu thật,
// số lượt, cấu hình đích). Không có nút chạy tự động; báo cáo lưu ra không chứa nội dung câu hỏi.
import { useRef, useState } from 'react';
import { useApp } from '../app-context';
import { getTaxonomy } from '../lib/curriculum';
import { getCurrentProfile } from '../lib/ai/client';
import { compareText, composition, GROUP_LABEL, parseBenchFile, reportText, runBench, type BenchCase, type BenchRun } from '../lib/ai/benchrun';
import { currentProfiles } from '../lib/ai/profiles';
import { AI_MODELS, loadAiPrefs, validModelId } from '../lib/ai/prefs';
import { getState } from '../lib/store';
import { batchesOf } from '../lib/ai/tasks/ganidrun';
import { AiConsentDialog } from './AiConsentDialog';

const nf = new Intl.NumberFormat('vi-VN');

export function BenchPanel() {
  const { showFile } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [cases, setCases] = useState<BenchCase[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [fname, setFname] = useState('');
  const [verified, setVerified] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [queue, setQueue] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [reports, setReports] = useState<{ model: string; text: string; run: BenchRun }[]>([]);
  const stop = useRef(false);
  const prefs = loadAiPrefs();
  const comp = composition(cases);
  const calls = cases.length ? batchesOf(cases.map((c) => ({ key: c.id, latex: c.latex, grade: c.grade, examples: [] }))).length : 0;
  const profile = currentProfiles().profiles.find((p) => p.id === getCurrentProfile());
  const ready = prefs.consent && !!profile && cases.length > 0 && !prog;

  const load = async (f: File | undefined) => {
    if (!f) return;
    const r = parseBenchFile(await f.text(), getTaxonomy());
    setCases(r.cases); setProblems(r.problems); setFname(f.name); setReports([]); setQueue([]);
  };
  const models = [...picked, ...(custom && validModelId(custom) && !picked.includes(custom) ? [custom] : [])];
  const startAll = () => { setReports([]); setQueue(models); setAsking(true); };

  const runOne = async (model: string) => {
    setAsking(false);
    stop.current = false;
    setProg({ done: 0, total: calls });
    const run: BenchRun = await runBench(getTaxonomy(), cases, model, getState().questions, { onProgress: (done, total) => setProg({ done, total }), shouldStop: () => stop.current });
    setProg(null);
    setReports((r) => [...r, { model, text: reportText(run, cases, verified, getTaxonomy()), run }]);
    const rest = queue.slice(1);
    setQueue(rest);
    if (rest.length && !run.error && !run.cancelled) setAsking(true); else setQueue([]);
  };
  const next = queue[0];

  return (
    <details className="panel-sub" aria-label="Đo độ chính xác AI">
      <summary>Đo độ chính xác AI gán Dạng (nâng cao)</summary>
      <span className="sys-hint">Dùng bộ câu đã có nhãn đúng do chính thầy/cô xác nhận để so các model Gemini trên CÙNG tập câu. Mỗi model chạy sẽ GỬI nội dung các câu trong tệp lên Google (gói miễn phí có thể được Google dùng để cải thiện sản phẩm), nên HEdu hỏi riêng từng model. HEdu không đổi model mặc định.</span>
      <div className="head-actions">
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" className="btn btn-sm" disabled={!!prog} onClick={() => file.current?.click()}>Chọn tệp nhãn chuẩn (.json)…</button>
        {fname && <span className="chk-pill">{fname}: {nf.format(cases.length)} câu hợp lệ</span>}
      </div>
      {problems.length > 0 && <ul className="bd-bad" aria-label="Mục bị bỏ qua">{problems.slice(0, 6).map((p) => <li key={p}>{p}</li>)}{problems.length > 6 && <li>… và {problems.length - 6} mục khác.</li>}</ul>}
      {cases.length > 0 && (
        <>
          <span className="sys-hint">Thành phần bộ nhãn: {Object.entries(comp.counts).map(([g, n]) => `${GROUP_LABEL[g] ?? g} ${n}`).join(' · ')}.{comp.missing.length ? ` Còn thiếu nhóm: ${comp.missing.join(', ')}.` : ''}{comp.enough ? '' : ' Chưa đủ 100 câu — kết quả chỉ để tham khảo.'}</span>
          <label className="bd-sure"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> <span>Tôi xác nhận các nhãn trong tệp là nhãn ĐÚNG do giáo viên đã kiểm tra (không tích thì báo cáo chỉ là ước lượng, không kết luận đạt).</span></label>
          <div className="ai-row"><b>Model cần đo</b></div>
          <div className="ai-bench-models">
            {AI_MODELS.map((m) => <label key={m.id} className="aid-all"><input type="checkbox" checked={picked.includes(m.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))} /> {m.label}</label>)}
            <input className="bd-in ai-model" value={custom} onChange={(e) => setCustom(e.target.value.trim())} placeholder="Mã model khác (tuỳ chọn)" aria-label="Mã model khác để đo" />
          </div>
          {!prefs.consent && <span className="chk-pill warn" role="status">Cần bật “Cho phép gửi nội dung câu hỏi tới Google” ở trên.</span>}
          {!profile && <span className="chk-pill warn" role="status">Chưa chọn cấu hình khoá API đang dùng.</span>}
          <div className="head-actions">
            {prog ? (
              <>
                <span className="chk-pill" role="status">Đang đo lượt {prog.done + 1}/{prog.total}…</span>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => { stop.current = true; }}>Dừng</button>
              </>
            ) : (
              <button type="button" className="btn btn-sm btn-accent" disabled={!ready || models.length === 0} onClick={startAll}>Đo {models.length || ''} model (hỏi trước từng model)…</button>
            )}
          </div>
        </>
      )}
      {reports.length > 1 && (() => { const t = compareText(reports.map((r) => r.run), cases, verified); return (
        <div className="bench-rep">
          <pre className="tr-pre" tabIndex={0} aria-label="So sánh model">{t}</pre>
          <button type="button" className="btn btn-sm" onClick={() => showFile({ title: 'So sánh model', name: 'so-sanh-model.md', text: t, mime: 'text/markdown' })}>Lưu bảng so sánh (.md)</button>
        </div>
      ); })()}
      {reports.map((r) => (
        <div key={r.model} className="bench-rep">
          <pre className="tr-pre" tabIndex={0} aria-label={`Báo cáo ${r.model}`}>{r.text}</pre>
          <button type="button" className="btn btn-sm" onClick={() => showFile({ title: `Báo cáo đo ${r.model}`, name: `do-ai-${r.model}.md`, text: r.text, mime: 'text/markdown' })}>Lưu báo cáo (.md, không chứa nội dung câu)</button>
        </div>
      ))}
      {asking && next && (
        <AiConsentDialog
          plan={{
            task: 'Đo độ chính xác gán Dạng', model: next, questions: cases.length, calls, target: profile?.name,
            sends: [
              `Nội dung LaTeX THẬT của ${nf.format(cases.length)} câu trong tệp nhãn (đề, phương án, lời giải; hình TikZ dài được rút gọn).`,
              'Tối đa 5 câu mẫu đã phân loại cho mỗi câu (lấy từ ngân hàng, đã loại chính các câu đang đo).',
              'Danh sách Chương › Bài › Dạng của lớp tương ứng. Đây là lượt đo model này; model khác sẽ hỏi riêng.',
            ],
          }}
          onSend={() => { void runOne(next); }}
          onCancel={() => { setAsking(false); setQueue([]); }}
        />
      )}
    </details>
  );
}
