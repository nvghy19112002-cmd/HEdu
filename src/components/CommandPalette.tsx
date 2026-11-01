// Ô lệnh Ctrl+K: tìm câu hỏi theo nội dung/ID, chuyển màn hình nhanh.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, type Screen } from '../app-context';
import { featureOn } from '../lib/features';
import { useBank } from '../lib/store';
import { questionCode, seqLabel } from '../lib/id';
import { parseExTest } from '../lib/extest';
import { TYPE_LABEL } from '../lib/types';

const SCREENS: { s: Screen; name: string }[] = [
  { s: 'editor', name: 'Soạn câu hỏi mới' }, // không ở thanh bên nhưng vẫn gọi được từ đây
  { s: 'bank', name: 'Mở ngân hàng câu hỏi' },
  { s: 'examlib', name: 'Mở Thư viện đề thi' },
  { s: 'exam', name: 'Tạo đề theo ma trận' },
  { s: 'import', name: 'Nhập câu từ LaTeX' },
  { s: 'tex', name: 'Xử lí TeX: soạn và kiểm các khối câu hỏi' },
  { s: 'curriculum', name: 'Xem khung chương trình' },
  { s: 'trash', name: 'Mở Thùng rác' },
  { s: 'system', name: 'Cài đặt: cập nhật, sao lưu và khôi phục' },
];

function plain(latex: string): string {
  return parseExTest(latex).stem.replace(/\$([^$]*)\$/g, '$1').replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

export function CommandPalette({ onClose }: { onClose(): void }) {
  const { go } = useApp();
  const { questions } = useBank();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const items = useMemo(() => {
    const f = fold(q.trim());
    const scr = SCREENS.filter((x) => (x.s !== 'exam' || featureOn('exam')) && (!f || fold(x.name).includes(f))).map((x) => ({ key: 's' + x.s, label: x.name, sub: 'Màn hình', run: () => go({ screen: x.s }) }));
    const qs = f
      ? questions
          .map((x) => ({ x, text: plain(x.latex), code: questionCode(x, x.level) }))
          .filter(({ x, text, code }) => fold(text).includes(f) || fold(code).includes(f) || seqLabel(x.seq).includes(f))
          .slice(0, 8)
          .map(({ x, text, code }) => ({ key: x.uid, label: text || '(đề trống)', sub: `${code} · ${TYPE_LABEL[x.type]}`, run: () => go({ screen: 'bank', openUid: x.uid }) }))
      : [];
    return [...qs, ...scr];
  }, [q, questions, go]);

  const run = (i: number) => { const it = items[i]; if (it) { it.run(); onClose(); } };

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Tìm nhanh">
        <input
          ref={input}
          value={q}
          placeholder="Gõ để tìm câu hỏi, ID (2D1B1…) hoặc màn hình…"
          aria-label="Tìm nhanh"
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            else if (e.key === 'Enter') run(sel);
          }}
        />
        <ul role="listbox" aria-label="Kết quả">
          {items.map((it, i) => (
            <li key={it.key}>
              <button type="button" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => run(i)}>
                <span className="ptext">{it.label}</span>
                <span className="sub">{it.sub}</span>
              </button>
            </li>
          ))}
          {!items.length && <li style={{ padding: '14px 12px', color: 'var(--ink-3)' }}>Không tìm thấy.</li>}
        </ul>
      </div>
    </div>
  );
}
