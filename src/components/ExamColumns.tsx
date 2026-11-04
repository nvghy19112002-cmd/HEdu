// Chế độ xem "Cột" của Thư viện đề (như Finder): mỗi cấp của cây là một cột; chọn một mục thì cột kế bên hiện nội dung của nó,
// cột cuối liệt kê các đề trong mục đang chọn. Dùng chung vùng chọn, kéo-thả và menu chuột phải với các chế độ khác.
import { useEffect, useRef } from 'react';
import type { ExamNode } from '../lib/examtree';
import { nodePath } from '../lib/examtree';
import { STATUS_LABEL, type ExamSummary } from '../lib/examlib';

const nf = new Intl.NumberFormat('vi-VN');

export function ExamColumns({ tree, node, exams, picked, rowProps, onNode, tabIds, renderMeta }: {
  tree: readonly ExamNode[];
  node: string | null;
  exams: readonly ExamSummary[];
  picked: ReadonlySet<string>;
  rowProps(e: ExamSummary): React.HTMLAttributes<HTMLElement>;
  onNode(key: string | null): void;
  tabIds: readonly string[];
  renderMeta?(e: ExamSummary): string;
}) {
  const path = node ? nodePath(tree, node) : [];
  const cols: { nodes: readonly ExamNode[]; sel: string | null }[] = [];
  let level: readonly ExamNode[] = tree;
  for (let i = 0; level.length; i++) {
    const sel = path[i] ?? null;
    cols.push({ nodes: level, sel });
    const next = sel ? level.find((n) => n.key === sel)?.children ?? [] : [];
    level = next;
    if (!sel) break;
  }
  // cuộn sang phải để cột mới chọn luôn nhìn thấy
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { const w = wrap.current; if (w) w.scrollLeft = w.scrollWidth; }, [node, cols.length]);

  return (
    <div className="fx-cols" ref={wrap} role="group" aria-label="Duyệt theo cột">
      {cols.map((c, i) => (
        <div key={i} className="fx-col" role="tree" aria-label={`Cột ${i + 1}`}>
          {i === 0 && <button type="button" className={`fx-colrow${!node ? ' on' : ''}`} onClick={() => onNode(null)}>Tất cả đề</button>}
          {c.nodes.map((n) => (
            <button key={n.key} type="button" role="treeitem" aria-selected={c.sel === n.key} data-node={n.key} className={`fx-colrow${c.sel === n.key ? ' on' : ''}${n.count === 0 ? ' is-empty' : ''}`} onClick={() => onNode(n.key)}>
              <span className="fx-colnm">{n.label}</span>
              <span className="xl-meta">{nf.format(n.count)}</span>
              {n.children.length > 0 && <span aria-hidden="true">›</span>}
            </button>
          ))}
        </div>
      ))}
      <div className="fx-col fx-col-exams" role="listbox" aria-label="Đề trong mục đang chọn" aria-multiselectable="true">
        <div className="fx-colhead">Đề ({nf.format(exams.length)})</div>
        {exams.length === 0 && <p className="xl-meta" style={{ padding: 10 }}>Mục này chưa có đề.</p>}
        {exams.map((e) => (
          <button key={e.id} type="button" role="option" aria-selected={picked.has(e.id)} data-xid={e.id} className={`fx-colrow fx-colex${picked.has(e.id) ? ' on' : ''}`} {...rowProps(e)}>
            <span className="fx-colnm">{tabIds.includes(e.id) && <span className="xc-open" title="Đang mở ở một tab">● </span>}{e.name}</span>
            <span className={`xc-st st-${e.status}`}>{STATUS_LABEL[e.status]}</span>
            {renderMeta && <span className="xl-meta">{renderMeta(e)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
