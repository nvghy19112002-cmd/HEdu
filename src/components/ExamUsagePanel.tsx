// PR 4B: ô "Tránh câu đã dùng trong…" ở màn Tạo đề. Mặc định tắt. Dữ liệu là bản quét các đề đang hoạt động trong Thư viện (không có kho riêng).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildIndex, describeScope, scanUsage, type UsageIndex, type UsageProject, type UsageScope } from '../lib/examusage';

export interface UsageState { projects: UsageProject[]; loading: boolean; error: string | null; scannedAt: number | null }

/** Quét khi bật (và khi bấm Làm mới). Tắt thì không quét. Lỗi quét được giữ lại để màn hình chặn xuất thay vì lặng lẽ không lọc. */
export function useUsageScan(on: boolean): UsageState & { refresh(): void } {
  const [st, setSt] = useState<UsageState>({ projects: [], loading: false, error: null, scannedAt: null });
  const refresh = useCallback(() => {
    setSt((x) => ({ ...x, loading: true, error: null }));
    scanUsage().then((r) => setSt({ projects: r.projects, loading: false, error: null, scannedAt: Date.now() }), (e) => setSt({ projects: [], loading: false, error: e instanceof Error ? e.message : String(e), scannedAt: null }));
  }, []);
  useEffect(() => { if (on) refresh(); }, [on, refresh]);
  // Thư viện có thể đổi ở màn khác: quay lại cửa sổ thì quét lại
  useEffect(() => {
    if (!on) return;
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [on, refresh]);
  return { ...st, refresh };
}

const uniq = (xs: (string | null)[]): string[] => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'vi'));
const toggle = (xs: string[], v: string): string[] => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]);

export function ExamUsagePanel({ scope, onScope, usage, idx }: { scope: UsageScope; onScope(s: UsageScope): void; usage: UsageState & { refresh(): void }; idx: UsageIndex }) {
  const folders = useMemo(() => uniq(usage.projects.flatMap((p) => { const parts = (p.folder ?? '').split('/').filter(Boolean); return parts.map((_, i) => parts.slice(0, i + 1).join('/')); })), [usage.projects]);
  const years = useMemo(() => uniq(usage.projects.map((p) => p.schoolYear)), [usage.projects]);
  const types = useMemo(() => uniq(usage.projects.map((p) => p.examType)), [usage.projects]);
  const nameOf = (id: string) => usage.projects.find((p) => p.id === id)?.name ?? id;
  const set = (p: Partial<UsageScope>) => onScope({ ...scope, ...p });
  const chips = (label: string, all: string[], cur: string[], key: 'folders' | 'years' | 'types') => (
    <fieldset className="us-group"><legend>{label}</legend>
      {all.length === 0 ? <span className="te-note">Chưa có đề nào ghi mục này.</span> : all.map((v) => (
        <label key={v} className="us-chip"><input type="checkbox" checked={cur.includes(v)} onChange={() => set({ [key]: toggle(cur, v) })} />{v}</label>
      ))}
    </fieldset>
  );
  return (
    <section className="us-panel" aria-label="Tránh câu đã dùng">
      <label className="us-on"><input type="checkbox" checked={scope.on} onChange={(e) => set({ on: e.target.checked })} /> <b>Tránh câu đã dùng trong…</b> <span className="te-note">(mặc định tắt; chỉ tính các đề đang có trong Thư viện, không tính Thùng rác)</span></label>
      {scope.on && (
        <div className="us-body">
          {usage.loading && <p className="te-note" role="status">Đang quét Thư viện đề…</p>}
          {usage.error && <p className="te-bad" role="alert">Không quét được Thư viện đề: {usage.error} Vì vậy chưa lọc được và chưa xuất được đề; tắt mục này nếu muốn tạo đề không kiểm tra câu đã dùng.</p>}
          {!usage.error && !usage.loading && (
            <>
              {chips('Thư mục ảo (gồm thư mục con)', folders, scope.folders, 'folders')}
              {chips('Năm học', years, scope.years, 'years')}
              {chips('Loại đề', types, scope.types, 'types')}
              <details className="us-group"><summary>Chọn riêng từng đề ({scope.ids.length} đã chọn)</summary>
                <ul className="us-list">{usage.projects.map((p) => (
                  <li key={p.id}><label><input type="checkbox" checked={scope.ids.includes(p.id)} onChange={() => set({ ids: toggle(scope.ids, p.id) })} /> {p.name}{p.source === 'none' && <span className="te-flag warn"> chưa thể đối chiếu</span>}</label></li>
                ))}</ul>
              </details>
              <p className="te-hint"><b>Cách kết hợp:</b> {describeScope(scope, nameOf)} Trong cùng một nhóm thì “hoặc”, giữa các nhóm thì “và”; đề chọn riêng được cộng thêm.</p>
              <p className="te-note">Đang đối chiếu <b>{idx.matched.length}</b> đề, <b>{idx.used.size}</b> câu đã dùng.
                {' '}<button type="button" className="linkbtn" onClick={usage.refresh}>Làm mới</button></p>
              {idx.matched.length > 0 && <details><summary>Danh sách đề được đối chiếu</summary><ul className="us-list">{idx.matched.map((p) => <li key={p.id}>{p.name} · {p.uids.length} câu{p.folder ? ` · ${p.folder}` : ''}</li>)}</ul></details>}
              {idx.unverifiable.length > 0 && <p className="te-bad" role="status">{idx.unverifiable.length} đề trong phạm vi chưa thể đối chiếu đầy đủ (không có UID đáng tin như đề nhập tay bằng tệp .tex, hoặc tệp hedu-de.json / sổ nguồn bị hỏng hay thiếu cấu trúc). HEdu không coi các đề này là “chưa từng dùng”: câu trong đó có thể vẫn bị lặp. {idx.unverifiable.slice(0, 5).map((p) => (p.note ? `${p.name} (${p.note})` : p.name)).join('; ')}{idx.unverifiable.length > 5 ? '…' : ''}</p>}
              {idx.withMissing.length > 0 && <p className="te-note" role="status">{idx.withMissing.length} đề có câu ghi trong sổ nguồn nhưng không còn thấy trong tệp đề; vẫn tính là đã dùng (thận trọng).</p>}
              {scope.on && idx.matched.length === 0 && <p className="te-note">Chưa có đề nào được chọn nên chưa loại câu nào.</p>}
              <p className="te-note">Câu bạn đã khóa tay vẫn được giữ. Câu đã sửa nội dung sau khi dùng vẫn tính theo UID; HEdu chưa xác định được việc “đã sửa sau khi dùng”.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
