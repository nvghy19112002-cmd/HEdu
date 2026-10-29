// Cây mục lục kiểu thư mục cho màn Ngân hàng: "Tất cả", Lớp → (Phân môn) → Chương → Bài → Dạng, mỗi mục có số câu;
// ô "Tìm thư mục…" (không dấu, theo tên hoặc mã); mặc định ẩn mục chưa có câu. Chọn một mục = lọc theo mục đó.
import { memo, useEffect, useMemo, useState } from 'react';
import { fullTree, pathKeys, selectedKey, visibleTree, type NodePath, type TreeNode } from '../lib/banktree';
import type { Taxonomy } from '../lib/types';

const nf = new Intl.NumberFormat('vi-VN');
const OPEN_KEY = 'hedu.banktree.open.v1';

function loadOpen(): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]'); return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 2000) : []); } catch { return new Set(); }
}
function saveOpen(s: Set<string>) {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s].slice(0, 2000))); } catch { /* chỉ là tiện lợi */ }
}

const Folder = ({ open }: { open: boolean }) => (
  <svg className="bt-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    {open
      ? <path fill="currentColor" d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2H19.5A1.5 1.5 0 0 1 21 8.5V9H6.2a1.5 1.5 0 0 0-1.43 1.05L3 15.7z M4.4 19 6.6 11.3A1 1 0 0 1 7.56 10.6H21.4a.8.8 0 0 1 .77 1.02L20.1 18.3a1 1 0 0 1-.96.7z" />
      : <path fill="currentColor" d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2H19.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />}
  </svg>
);
const Layers = () => (
  <svg className="bt-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 2.5 8 12 13l9.5-5z" /><path d="m2.5 12 9.5 5 9.5-5" /><path d="m2.5 16 9.5 5 9.5-5" />
  </svg>
);

interface Props {
  tax: Taxonomy;
  path: NodePath;
  counts: ReadonlyMap<string, number>;
  total: number;
  /** đang tìm trong toàn kho: cây tạm không áp dụng (vẫn xem/chọn được) */
  off?: boolean;
  onPick(p: NodePath | null): void;
}

export const BankTree = memo(function BankTree({ tax, path, counts, total, off, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [open, setOpen] = useState<Set<string>>(loadOpen);
  const sel = selectedKey(path);
  const onPath = useMemo(() => pathKeys(path), [path]);
  // mục đang chọn luôn được mở đường tới nó (kể cả khi chọn từ nơi khác, vd thẻ câu hay Ctrl K)
  useEffect(() => { setOpen((s) => { let changed = false; const n = new Set(s); for (const k of onPath) if (!n.has(k)) { n.add(k); changed = true; } if (changed) saveOpen(n); return changed ? n : s; }); }, [onPath]);
  const tree = useMemo(() => fullTree(tax, counts), [tax, counts]);
  const shown = useMemo(() => visibleTree(tree, { query, showEmpty, selected: sel, selectedPath: onPath }), [tree, query, showEmpty, sel, onPath]);
  const searching = !!query.trim();
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); saveOpen(n); return n; });

  const row = (x: TreeNode, depth: number) => {
    const has = x.children.length > 0;
    const isOpen = has && (searching || open.has(x.key));
    const isSel = sel === x.key;
    return (
      <li key={x.key} role="treeitem" aria-level={depth + 1} aria-selected={isSel} aria-expanded={has ? isOpen : undefined}>
        <div className={`bt-row k-${x.kind}${isSel ? ' is-sel' : ''}${x.count === 0 ? ' is-empty' : ''}`} style={{ paddingLeft: 4 + depth * 12 }}>
          {has
            ? <button type="button" className="bt-caret" aria-label={isOpen ? `Thu gọn ${x.label}` : `Mở ${x.label}`} tabIndex={-1} onClick={() => toggle(x.key)}><svg className={isOpen ? 'is-open' : undefined} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
            : <span className="bt-caret" aria-hidden="true" />}
          <button type="button" className="bt-name" title={`${x.code} · ${x.label}`} onClick={() => { onPick(x.path); if (has && !isOpen) toggle(x.key); }}>
            <Folder open={isOpen} />
            <span className="bt-label">{x.label}</span>
            <span className="bt-n">{nf.format(x.count)}</span>
          </button>
        </div>
        {isOpen && <ul role="group" style={{ ["--guide" as string]: `${14 + depth * 12}px` }}>{x.children.map((c) => row(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className={`bt${off ? ' is-off' : ''}`}>
      <label className="bt-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className="sr-only">Tìm thư mục</span>
        <input type="search" placeholder="Tìm thư mục…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ul className="bt-tree" role="tree" aria-label="Cây mục lục">
        <li role="treeitem" aria-level={1} aria-selected={sel === null}>
          <div className={`bt-row k-all${sel === null ? ' is-sel' : ''}`}>
            <button type="button" className="bt-name" onClick={() => onPick(null)}><Layers /><span className="bt-label">Tất cả</span><span className="bt-n">{nf.format(total)}</span></button>
          </div>
        </li>
        {shown.map((x) => row(x, 0))}
        {searching && shown.length === 0 && <li className="bt-none" role="none">Không có mục nào khớp “{query.trim()}”.</li>}
      </ul>
      <label className="bt-empty-sw"><input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> Hiện cả mục chưa có câu</label>
    </div>
  );
});
