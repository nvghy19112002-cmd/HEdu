// Cây mục lục của Thư viện đề thi (cùng kiểu với cây Ngân hàng): Lớp → Ôn tập theo bài học / Đề kiểm tra / Đề ôn tập / Thi thử,
// Thư mục riêng, Chưa xếp lớp. Mỗi mục có số đề; ô tìm mục; mặc định ẩn chương/bài chưa có đề.
import { memo, useEffect, useMemo, useState } from 'react';
import type { ExamNode } from '../lib/examtree';

const nf = new Intl.NumberFormat('vi-VN');
const OPEN_KEY = 'hedu.examtree.open.v1';
function loadOpen(): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null'); return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 2000) : ['g:12', 'g:12/kt', 'g:11', 'g:10']); } catch { return new Set(['g:12']); }
}
function saveOpen(s: Set<string>) { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s].slice(0, 2000))); } catch { /* chỉ là tiện lợi */ } }
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

const Ico = ({ kind, open }: { kind: ExamNode['kind']; open: boolean }) => kind === 'slot' || kind === 'lesson'
  ? <svg className="bt-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M9.5 12h6M9.5 15.5h6" /></svg>
  : <svg className="bt-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">{open
    ? <path fill="currentColor" d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2H19.5A1.5 1.5 0 0 1 21 8.5V9H6.2a1.5 1.5 0 0 0-1.43 1.05L3 15.7z M4.4 19 6.6 11.3A1 1 0 0 1 7.56 10.6H21.4a.8.8 0 0 1 .77 1.02L20.1 18.3a1 1 0 0 1-.96.7z" />
    : <path fill="currentColor" d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2H19.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />}</svg>;

interface Props {
  tree: readonly ExamNode[];
  total: number;
  sel: string | null;
  showEmpty: boolean;
  onShowEmpty(v: boolean): void;
  onPick(key: string | null): void;
}

/** Lọc cây theo chữ tìm: giữ nút khớp và đường tới nó. */
function search(ns: readonly ExamNode[], q: string): ExamNode[] {
  if (!q) return [...ns];
  const out: ExamNode[] = [];
  for (const n of ns) {
    if (fold(n.label).includes(q)) { out.push(n); continue; }
    const kids = search(n.children, q);
    if (kids.length) out.push({ ...n, children: kids });
  }
  return out;
}

export const ExamTree = memo(function ExamTree({ tree, total, sel, showEmpty, onShowEmpty, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(loadOpen);
  // mở đường tới mục đang chọn
  useEffect(() => {
    if (!sel) return;
    const path: string[] = [];
    const walk = (ns: readonly ExamNode[], acc: string[]): boolean => { for (const n of ns) { if (n.key === sel) { path.push(...acc); return true; } if (walk(n.children, [...acc, n.key])) return true; } return false; };
    walk(tree, []);
    setOpen((s) => { if (path.every((k) => s.has(k))) return s; const n = new Set(s); path.forEach((k) => n.add(k)); saveOpen(n); return n; });
  }, [sel, tree]);
  const q = fold(query.trim());
  const shown = useMemo(() => search(tree, q), [tree, q]);
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); saveOpen(n); return n; });

  const row = (x: ExamNode, depth: number) => {
    const has = x.children.length > 0;
    const isOpen = has && (!!q || open.has(x.key));
    const isSel = sel === x.key;
    return (
      <li key={x.key} role="treeitem" aria-level={depth + 1} aria-selected={isSel} aria-expanded={has ? isOpen : undefined}>
        <div className={`bt-row k-${x.kind === 'grade' ? 'grade' : x.kind === 'group' ? 'branch' : x.kind === 'chapter' ? 'chapter' : 'lesson'}${isSel ? ' is-sel' : ''}${x.count === 0 ? ' is-empty' : ''}`} style={{ paddingLeft: 4 + depth * 12 }}>
          {has
            ? <button type="button" className="bt-caret" aria-label={isOpen ? `Thu gọn ${x.label}` : `Mở ${x.label}`} tabIndex={-1} onClick={() => toggle(x.key)}>{isOpen ? '⌄' : '›'}</button>
            : <span className="bt-caret" aria-hidden="true" />}
          <button type="button" className="bt-name" title={x.label} onClick={() => { onPick(x.key); if (has && !isOpen) toggle(x.key); }}>
            <Ico kind={x.kind} open={isOpen} />
            <span className="bt-label">{x.label}</span>
            <span className="bt-n">{nf.format(x.count)}</span>
          </button>
        </div>
        {isOpen && <ul role="group">{x.children.map((c) => row(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="bt">
      <label className="bt-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className="sr-only">Tìm mục</span>
        <input type="search" placeholder="Tìm mục…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ul className="bt-tree" role="tree" aria-label="Cây đề thi">
        <li role="treeitem" aria-level={1} aria-selected={sel === null}>
          <div className={`bt-row k-all${sel === null ? ' is-sel' : ''}`}>
            <button type="button" className="bt-name" onClick={() => onPick(null)}>
              <svg className="bt-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2.5 8 12 13l9.5-5z" /><path d="m2.5 12 9.5 5 9.5-5" /><path d="m2.5 16 9.5 5 9.5-5" /></svg>
              <span className="bt-label">Tất cả đề</span><span className="bt-n">{nf.format(total)}</span>
            </button>
          </div>
        </li>
        {shown.map((x) => row(x, 0))}
        {q && shown.length === 0 && <li className="bt-none" role="none">Không có mục nào khớp “{query.trim()}”.</li>}
      </ul>
      <label className="bt-empty-sw"><input type="checkbox" checked={showEmpty} onChange={(e) => onShowEmpty(e.target.checked)} /> Hiện cả chương/bài chưa có đề</label>
    </div>
  );
});
