// Hộp chọn kiểu xuất .tex: (1) chỉ file câu hỏi nguyên văn, (2) thư mục biên dịch được (app Windows), (3) lưu vào Thư viện đề (app Windows).
import { useEffect, useRef, useState } from 'react';
import { invoke, isDesktop } from '../lib/platform';
import { createFromFiles, toSource } from '../lib/examsources';
import { buildProject, safeFolderName } from '../lib/texproject';
import type { Question } from '../lib/types';

export function ExportChoiceDialog({ qs, onFileOnly, onClose, onToast }: {
  qs: readonly Question[];
  onFileOnly(): void;
  onClose(): void;
  onToast(m: string): void;
}) {
  const desktop = isDesktop() && !!window.__TAURI__?.dialog?.open;
  const [kind, setKind] = useState<'file' | 'folder' | 'library'>('file');
  const [name, setName] = useState('bo-de-hedu');
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [busy, onClose]);

  const go = async () => {
    if (kind === 'file') { onFileOnly(); return; }
    if (kind === 'library') {
      setBusy(true);
      try {
        let shared = '';
        try { shared = await invoke<string>('tikz_default_preamble'); } catch { /* chỉ để liệt kê gói */ }
        const files = buildProject(qs, shared, safeFolderName(name));
        const s = await createFromFiles(name.trim() || 'Đề từ ngân hàng', files, 'main.tex', 'cauhoi.tex', qs.map(toSource));
        onToast(`Đã lưu vào Thư viện đề: “${s.name}”. Mở mục Đề thi để biên tập và biên dịch. Câu được chép nguyên văn, có ghi nguồn UID.`);
        onClose();
      } catch (e) {
        onToast(`Không lưu được vào Thư viện đề (${e instanceof Error ? e.message : String(e)}).`);
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const folder = safeFolderName(name);
      const parent = await window.__TAURI__!.dialog!.open!({ directory: true, multiple: false, title: 'Chọn nơi tạo thư mục bộ đề' });
      if (!parent || Array.isArray(parent)) { setBusy(false); return; }
      let shared = '';
      try { shared = await invoke<string>('tikz_default_preamble'); } catch { /* chỉ để liệt kê gói; thiếu thì bỏ qua */ }
      const files = buildProject(qs, shared, folder);
      const out = await invoke<string>('export_tex_folder', { parent, name: folder, files });
      onToast(`Đã tạo thư mục: ${out}`);
      onClose();
    } catch (e) {
      onToast(`Không tạo được thư mục (${e instanceof Error ? e.message : String(e)}).`);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="cfm-scrim" onClick={() => { if (!busy) onClose(); }} />
      <div className="cfm" role="dialog" aria-modal="true" aria-label="Xuất .tex">
        <h3>Xuất {qs.length} câu ra .tex</h3>
        <div className="cfm-body">
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
            <input ref={first} type="radio" name="exk" checked={kind === 'file'} onChange={() => setKind('file')} />
            <span><b>Chỉ file câu hỏi</b><br /><span style={{ color: 'var(--ink-3)' }}>Một file .tex chỉ có các câu hỏi, chép nguyên văn từ ngân hàng. Không khai báo gói, không sửa gì.</span></span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: desktop ? 1 : 0.55 }}>
            <input type="radio" name="exk" disabled={!desktop} checked={kind === 'folder'} onChange={() => setKind('folder')} />
            <span><b>Thư mục biên dịch được</b><br /><span style={{ color: 'var(--ink-3)' }}>Tạo thư mục có main.tex, khaibaochung.tex, cauhoi.tex, các gói .sty đi kèm và file CAN-CO-GI.md (liệt kê gói cần có). Mở main.tex biên dịch bằng pdfLaTeX là ra đề.{!desktop && ' (Chỉ có trong bản cài trên Windows.)'}</span></span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, opacity: desktop ? 1 : 0.55 }}>
            <input type="radio" name="exk" disabled={!desktop} checked={kind === 'library'} onChange={() => setKind('library')} />
            <span><b>Lưu vào Thư viện đề</b><br /><span style={{ color: 'var(--ink-3)' }}>Tạo một đề mới trong mục Đề thi (main.tex, khaibaochung.tex, cauhoi.tex) để biên tập và biên dịch PDF ngay trong HEdu. Câu được chép nguyên văn, HEdu ghi UID nguồn; ngân hàng đổi sau này không làm đề tự đổi.{!desktop && ' (Chỉ có trong bản cài trên Windows.)'}</span></span>
          </label>
          {(kind === 'folder' || kind === 'library') && (
            <label style={{ display: 'block', marginTop: 12 }}>
              {kind === 'library' ? 'Tên đề' : 'Tên thư mục'}
              <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4 }} aria-label={kind === 'library' ? 'Tên đề' : 'Tên thư mục'} />
            </label>
          )}
        </div>
        <div className="cfm-acts">
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Huỷ</button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => { void go(); }}>{busy ? 'Đang tạo…' : kind === 'file' ? 'Xem và lưu file' : kind === 'library' ? 'Lưu vào Thư viện đề' : 'Chọn nơi lưu…'}</button>
        </div>
      </div>
    </>
  );
}
