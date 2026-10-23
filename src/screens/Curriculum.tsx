// Màn Khung chương trình: xem và SỬA cây mục lục.
// Cây nằm trong dữ liệu của bạn, nên đổi sách giáo khoa chỉ cần sửa ở đây hoặc nạp file cây khác.
import { useMemo, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { IcCheck, IcTrash, IcX } from '../components/Icons';
import { useTaxonomy } from '../lib/curriculum';
import { applyTaxonomy, useBank } from '../lib/store';
import {
  addChild, childKind, countNodes, fromJson, KIND_LABEL, moveNode, removeNode, renameNode,
  setNodeCode, shortName, toJson,
} from '../lib/taxonomy';
import type { Branch, Chapter, Form, Grade, Lesson, Question, Taxonomy, TaxKind } from '../lib/types';

type AnyNode = Grade | Branch | Chapter | Lesson | Form;

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(file, 'utf-8'); });
}

function kidsOf(node: AnyNode, kind: TaxKind): AnyNode[] {
  if (kind === 'grade') return (node as Grade).branches;
  if (kind === 'branch') return (node as Branch).chapters;
  if (kind === 'chapter') return (node as Chapter).lessons;
  if (kind === 'lesson') return (node as Lesson).forms;
  return [];
}

export function CurriculumScreen() {
  const { toast, showFile } = useApp();
  const { tax } = useTaxonomy();
  const { questions } = useBank();
  const [edit, setEdit] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const n = countNodes(tax);
  /** số câu đang nằm trong mỗi nút (để cảnh báo trước khi xoá) */
  const used = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (id: string) => { if (id) m.set(id, (m.get(id) ?? 0) + 1); };
    for (const q of questions as Question[]) { bump(q.chapterId); bump(q.lessonId); bump(q.formId); }
    return m;
  }, [questions]);

  const change = (next: Taxonomy, msg?: string) => { applyTaxonomy(next); if (msg) toast(msg); };
  const flip = (id: string) => setOpen((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });

  const onLoadFile = async (f: File) => {
    try {
      const { tax: next, warnings } = fromJson(await readFile(f));
      const c = countNodes(next);
      change(next, `Đã nạp cây mới: ${c.grades} lớp, ${c.chapters} chương, ${c.lessons} bài, ${c.forms} dạng.${warnings.length ? ` (${warnings.length} cảnh báo)` : ''}`);
      if (warnings.length) console.warn('Cảnh báo khi nạp cây:', warnings);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không đọc được file cây.');
    }
  };

  const Node = ({ node, kind, depth }: { node: AnyNode; kind: TaxKind; depth: number }) => {
    const ck = childKind(kind);
    const kids = kidsOf(node, kind);
    const expanded = open.has(node.id);
    const count = used.get(node.id) ?? 0;
    const isRenaming = renaming === node.id;
    return (
      <li>
        <div className={`ctrow d${depth}`}>
          <button type="button" className="ctcar" aria-expanded={expanded} disabled={!kids.length} onClick={() => flip(node.id)} aria-label={expanded ? 'Thu lại' : 'Mở ra'}>
            {kids.length ? '›' : '·'}
          </button>
          {edit ? (
            <input className="ctcode" value={node.code} maxLength={1} aria-label={`Mã ${KIND_LABEL[kind]}`}
              onChange={(e) => change(setNodeCode(tax, node.id, e.target.value))} />
          ) : (
            <span className="ctcode ro">{node.code}</span>
          )}
          {isRenaming ? (
            <form className="ctname-form" onSubmit={(e) => { e.preventDefault(); change(renameNode(tax, node.id, draft)); setRenaming(null); }}>
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Tên mới" />
              <button type="submit" className="ico" aria-label="Lưu tên"><IcCheck /></button>
              <button type="button" className="ico" aria-label="Huỷ" onClick={() => setRenaming(null)}><IcX /></button>
            </form>
          ) : (
            <button type="button" className="ctname" disabled={!edit} onClick={() => { setRenaming(node.id); setDraft(node.name); }}>
              {kind === 'form' || kind === 'lesson' ? shortName(node.name) : node.name}
            </button>
          )}
          {count > 0 && <span className="cnt" title="số câu đang ở đây">{count}</span>}
          {kids.length > 0 && <span className="ctkids">{kids.length} {KIND_LABEL[ck!].toLowerCase()}</span>}
          {edit && (
            <span className="ctacts">
              <button type="button" className="ico" aria-label="Lên" title="Lên" onClick={() => change(moveNode(tax, node.id, -1))}>↑</button>
              <button type="button" className="ico" aria-label="Xuống" title="Xuống" onClick={() => change(moveNode(tax, node.id, 1))}>↓</button>
              {ck && <button type="button" className="ico" aria-label={`Thêm ${KIND_LABEL[ck]}`} title={`Thêm ${KIND_LABEL[ck]}`} onClick={() => { change(addChild(tax, node.id, `${KIND_LABEL[ck]} mới`)); setOpen((s) => new Set(s).add(node.id)); }}>+</button>}
              {confirmDel === node.id ? (
                <button type="button" className="btn btn-sm btn-accent" onClick={() => { change(removeNode(tax, node.id), 'Đã xoá.'); setConfirmDel(null); }} onBlur={() => setConfirmDel(null)} autoFocus>
                  Xoá{count > 0 ? ` (${count} câu mất vị trí)` : ''}?
                </button>
              ) : (
                <button type="button" className="ico danger" aria-label="Xoá" title="Xoá" onClick={() => setConfirmDel(node.id)}><IcTrash /></button>
              )}
            </span>
          )}
        </div>
        {expanded && kids.length > 0 && ck && (
          <ul className="ctkidlist">
            {kids.map((k) => <Node key={k.id} node={k} kind={ck} depth={depth + 1} />)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1>Chương trình</h1>
          <span className="crumbs">{tax.name} · {n.grades} lớp · {n.chapters} chương · {n.lessons} bài · {n.forms} dạng</span>
        </div>
        <div className="head-actions">
          <button type="button" className={edit ? 'btn btn-dark' : 'btn btn-outline'} aria-pressed={edit} onClick={() => { setEdit(!edit); setRenaming(null); }}>
            {edit ? 'Xong' : 'Sửa cây'}
          </button>
        </div>
      </header>

      <div className="simple">
        <div className="panel">
          <h2>Cây mục lục</h2>
          {edit && <span className="sys-hint">Bấm vào tên để sửa, vào ô mã để đổi mã (một ký tự). Nút + thêm mục con.</span>}
          <ul className="cttree">
            {tax.grades.map((g) => <Node key={g.id} node={g} kind="grade" depth={0} />)}
          </ul>
          {edit && (
            <div className="head-actions">
              <button type="button" className="btn btn-sm" onClick={() => change(addChild(tax, null, 'Lớp mới'))}>+ Thêm lớp</button>
            </div>
          )}
        </div>
        <details className="panel ct-tools">
          <summary><h2>Đổi sách giáo khoa hay đổi khung — nạp, xuất, đưa về mặc định</h2></summary>
          <span className="sys-hint">
            Mã câu hỏi ghép từ mã các cấp: <span className="mono">[Lớp][Phân môn][Chương][Mức độ][Bài]-[Dạng]</span>, ví dụ <span className="mono">2D1H1-1</span>.
            Sửa cây là mã đổi theo, không cần cài lại app. Câu hỏi gắn với nút theo khoá riêng nên đổi tên hay đổi mã không làm mất vị trí của câu.
          </span>
          <div className="head-actions">
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>Nạp cây từ file JSON…</button>
            <button type="button" className="btn btn-sm" onClick={() => showFile({ title: 'Cây mục lục', name: 'cay-muc-luc.json', text: toJson(tax), mime: 'application/json' })}>Xuất cây ra JSON</button>
            {confirmReset ? (
              <>
                <button type="button" className="btn btn-sm btn-accent" onClick={() => { applyTaxonomy(null); setConfirmReset(false); toast('Đã đưa về cây mặc định.'); }}>Xác nhận đưa về mặc định</button>
                <button type="button" className="btn btn-sm" onClick={() => setConfirmReset(false)}>Huỷ</button>
              </>
            ) : (
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setConfirmReset(true)}>Đưa về cây mặc định</button>
            )}
            <input ref={file} type="file" accept=".json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) await onLoadFile(f); e.target.value = ''; }} />
          </div>
        </details>

      </div>
    </>
  );
}
