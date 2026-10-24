// Thanh "Hỏi AI" dùng chung cho nhiệm vụ gan-id (Ngân hàng và Nhập liệu): kiểm điều kiện (bản Windows, có khoá,
// đã bật đồng ý trong Cài đặt) → hộp xin phép cho ĐÚNG lượt này → gọi từng lượt có tiến độ + nút Dừng → trả kết quả.
import { useEffect, useRef, useState } from 'react';
import { aiKeyStatus, retryable } from '../lib/ai/client';
import { loadAiPrefs } from '../lib/ai/prefs';
import { GAN_ID_BATCH, GAN_ID_TASK } from '../lib/ai/tasks/ganid';
import { batchesOf, runGanId, type GanIdJob, type GanIdRun } from '../lib/ai/tasks/ganidrun';
import { getTaxonomy } from '../lib/curriculum';
import { isDesktop } from '../lib/platform';
import { AiConsentDialog } from './AiConsentDialog';

export function AiAskBar({ count, buildJobs, onResults, disabled }: { count: number; buildJobs(): GanIdJob[]; onResults(run: GanIdRun): void; disabled?: boolean }) {
  const desktop = isDesktop();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [ask, setAsk] = useState<{ jobs: GanIdJob[]; calls: number } | null>(null);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stop = useRef(false);
  const prefs = loadAiPrefs();

  useEffect(() => { if (desktop) aiKeyStatus().then((s) => setHasKey(s.hasKey)).catch(() => setHasKey(false)); }, [desktop]);

  if (!desktop) return <span className="sys-hint">Hỏi AI chỉ có trong bản cài trên Windows.</span>;
  const ready = hasKey === true && prefs.consent;
  const running = prog != null;

  const open = () => {
    const jobs = buildJobs();
    if (!jobs.length) { setMsg({ ok: false, text: 'Không có câu nào để hỏi AI.' }); return; }
    setMsg(null);
    setAsk({ jobs, calls: batchesOf(jobs).length });
  };
  const go = async (jobs: GanIdJob[]) => {
    setAsk(null);
    stop.current = false;
    setProg({ done: 0, total: batchesOf(jobs).length });
    const run = await runGanId(getTaxonomy(), jobs, prefs.model, { onProgress: (done, total) => setProg({ done, total }), shouldStop: () => stop.current });
    setProg(null);
    onResults(run);
    const got = run.results.size;
    if (run.error) setMsg({ ok: false, text: `${run.error.message} Đã có kết quả AI cho ${got}/${jobs.length} câu${retryable(run.error.kind) ? ' — có thể bấm Hỏi AI lại sau ít phút' : ''}.` });
    else if (run.cancelled) setMsg({ ok: false, text: `Đã dừng. Có kết quả AI cho ${got}/${jobs.length} câu.` });
    else setMsg({ ok: true, text: `AI đã trả lời ${got}/${jobs.length} câu (${run.done} lượt).${run.problems.length ? ` ${run.problems.length} ghi chú: ${run.problems.slice(0, 2).join(' ')}` : ''}` });
  };

  return (
    <div className="ai-ask">
      {running ? (
        <>
          <span className="chk-pill" role="status">AI đang xử lý lượt {prog.done + 1}/{prog.total}…</span>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => { stop.current = true; }}>Dừng</button>
        </>
      ) : (
        <button type="button" className="btn btn-sm" disabled={disabled || !ready || count === 0} onClick={open} title={ready ? `Gửi tới ${prefs.model}, mỗi lượt tối đa ${GAN_ID_BATCH} câu` : undefined}>Hỏi AI cho {count} câu</button>
      )}
      {!ready && hasKey !== null && <span className="sys-hint">Muốn dùng AI: vào Cài đặt → AI, nhập khoá và bật “Cho phép gửi nội dung câu hỏi”.</span>}
      {msg && <span className={`chk-pill ${msg.ok ? 'ok' : 'warn'}`} role="status">{msg.text}</span>}
      {ask && (
        <AiConsentDialog
          plan={{
            task: GAN_ID_TASK.label, model: prefs.model, questions: ask.jobs.length, calls: ask.calls,
            sends: [
              `Nội dung LaTeX của ${ask.jobs.length} câu (đề, phương án, lời giải; hình TikZ dài được rút gọn).`,
              'Tối đa 5 câu mẫu đã phân loại cho mỗi câu (lấy từ ngân hàng của thầy/cô).',
              'Danh sách Chương › Bài › Dạng của lớp đang xét (cây chương trình).',
            ],
          }}
          onSend={() => { void go(ask.jobs); }}
          onCancel={() => setAsk(null)}
        />
      )}
    </div>
  );
}
