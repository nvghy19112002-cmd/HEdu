// Lưới chọn câu theo Dạng: mỗi hàng là một (Dạng, loại câu), mỗi cột một mức độ N/H/V/C; ô nhập số câu, bên cạnh là số câu
// đang có trong kho (đã tính chính sách lấy câu, câu bị loại và câu đã dùng). Giáo viên gõ số là xong, không phải dựng từng dòng.
// Mỗi ô khác 0 là MỘT dòng ma trận phạm vi Dạng (id cố định theo ô), nên vẫn đi qua đúng bộ phân bổ, khóa câu, mẫu ma trận như cũ.
import { memo, useMemo, useState } from 'react';
import type { Row } from '../lib/examgen';
import { cellId, setCell } from '../lib/examgrid';
import { LEVELS, TYPES, type Level, type QType, type Taxonomy } from '../lib/types';

export const TYPE_SHORT: Record<QType, string> = { tn: 'TN', ds: 'Đ/S', tln: 'Ngắn', tl: 'TL' };
const LEVEL_COL: Record<Level, string> = { NB: 'N', TH: 'H', VD: 'V', VDC: 'C' };
const LEVEL_TIP: Record<Level, string> = { NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao' };

interface GridRow { key: string; formId: string; code: string; name: string; type: QType }
interface GridChapter { id: string; title: string; rows: GridRow[] }

interface Props {
  tax: Taxonomy;
  stock: Map<string, Map<string, number>>;
  rows: readonly Row[];
  defaultGrade: number;
  onChange(rows: Row[]): void;
}

export const ExamMatrixGrid = memo(function ExamMatrixGrid({ tax, stock, rows, defaultGrade, onChange }: Props) {
  const [grade, setGrade] = useState<number | 'all'>(defaultGrade);
  const [type, setType] = useState<QType | 'all'>('all');
  const [q, setQ] = useState('');
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const picked = useMemo(() => { const m = new Map<string, number>(); for (const r of rows) if (r.id.startsWith('g|')) m.set(r.id, r.count); return m; }, [rows]);
  const pickedTotal = useMemo(() => [...picked.values()].reduce((a, b) => a + b, 0), [picked]);

  const chapters = useMemo<GridChapter[]>(() => {
    const out: GridChapter[] = [];
    const needle = q.trim().toLowerCase();
    for (const g of tax.grades) {
      if (grade !== 'all' && g.grade !== grade) continue;
      for (const b of g.branches) for (const c of b.chapters) {
        const rs: GridRow[] = [];
        for (const l of c.lessons) for (const f of l.forms) {
          const code = `${g.code}${b.code}${c.code}${l.code}-${f.code}`;
          if (needle && !`${code} ${l.name} ${f.name}`.toLowerCase().includes(needle)) continue;
          const st = stock.get(f.id);
          for (const t of TYPES) {
            if (type !== 'all' && t !== type) continue;
            const has = LEVELS.some((lv) => (st?.get(`${t}|${lv}`) ?? 0) > 0);
            const sel = LEVELS.some((lv) => picked.has(cellId(f.id, t, lv)));
            if (onlyPicked ? !sel : !has && !sel) continue;
            rs.push({ key: `${f.id}|${t}`, formId: f.id, code, name: `${l.name} · ${f.name}`, type: t });
          }
        }
        if (rs.length) out.push({ id: c.id, title: `Lớp ${g.grade} · ${c.name}`, rows: rs });
      }
    }
    return out;
  }, [tax, grade, type, q, onlyPicked, stock, picked]);

  const set = (formId: string, t: QType, lv: Level, v: number) => onChange(setCell(rows, formId, t, lv, v));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const expanded = (id: string) => open.has(id) || onlyPicked || !!q.trim();

  return (
    <div className="mg" aria-label="Chọn câu theo Dạng và mức độ">
      <div className="mg-bar">
        <label className="lbl">Lớp<select className="sel" value={grade} onChange={(e) => setGrade(e.target.value === 'all' ? 'all' : Number(e.target.value))}><option value="all">Tất cả</option>{[...tax.grades].reverse().map((g) => <option key={g.grade} value={g.grade}>Lớp {g.grade}</option>)}</select></label>
        <label className="lbl">Loại câu<select className="sel" value={type} onChange={(e) => setType(e.target.value as QType | 'all')}><option value="all">Tất cả</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_SHORT[t]}</option>)}</select></label>
        <label className="lbl mg-search">Tìm Dạng<input className="inp" type="search" placeholder="Tên bài, tên dạng hoặc mã…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <span className="mg-picked">Đã chọn: <b>{pickedTotal}</b> câu</span>
        <label className="mg-only"><input type="checkbox" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} /> Chỉ hiện đã chọn</label>
      </div>
      {chapters.length === 0 ? (
        <p className="te-note mg-empty">{onlyPicked ? 'Chưa chọn câu nào trong lưới.' : 'Không có Dạng nào có câu đủ điều kiện ở bộ lọc này (đổi lớp, loại câu hoặc mức lấy câu).'}</p>
      ) : (
        <div className="mg-tbl" role="table">
          <div className="mg-row mg-h" role="row"><span role="columnheader">Bài · Dạng</span><span role="columnheader">Loại</span>{LEVELS.map((lv) => <span key={lv} role="columnheader" title={LEVEL_TIP[lv]}>{LEVEL_COL[lv]}</span>)}</div>
          {chapters.map((c) => {
            const sel = c.rows.reduce((a, r) => a + LEVELS.reduce((x, lv) => x + (picked.get(cellId(r.formId, r.type, lv)) ?? 0), 0), 0);
            const isOpen = expanded(c.id);
            return (
              <div key={c.id} role="rowgroup">
                <button type="button" className="mg-ch" aria-expanded={isOpen} onClick={() => toggle(c.id)}>
                  <span className="mg-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>{c.title}<span className="mg-ch-n">{c.rows.length} hàng{sel ? ` · đã chọn ${sel} câu` : ''}</span>
                </button>
                {isOpen && c.rows.map((r) => {
                  const st = stock.get(r.formId);
                  return (
                    <div key={r.key} className="mg-row" role="row">
                      <span className="mg-name" title={`${r.code} · ${r.name}`}><code>{r.code}</code> {r.name}</span>
                      <span><i className={`mg-type t-${r.type}`}>{TYPE_SHORT[r.type]}</i></span>
                      {LEVELS.map((lv) => {
                        const have = st?.get(`${r.type}|${lv}`) ?? 0;
                        const v = picked.get(cellId(r.formId, r.type, lv)) ?? 0;
                        if (!have && !v) return <span key={lv} className="mg-none" aria-label="Không có câu">—</span>;
                        return (
                          <span key={lv} className={`mg-cell${v > have ? ' over' : ''}`}>
                            <input type="number" inputMode="numeric" min={0} max={200} aria-label={`${r.name}, ${TYPE_SHORT[r.type]}, ${LEVEL_TIP[lv]}: số câu (kho ${have})`} value={v || ''} placeholder="0"
                              onChange={(e) => set(r.formId, r.type, lv, Number(e.target.value))} />
                            <small>/{have}</small>
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
