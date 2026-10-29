// Ma trận đề theo TỪNG CÂU (kiểu TIAD): mỗi phần là bảng Câu 1…N; mỗi câu chọn Dạng bài (lớp → chương → bài → dạng), mức độ,
// xem số câu trong kho và câu đang được chọn. Hai cách lấy câu: Ngẫu nhiên (máy chọn, khóa được từng câu) hoặc Tự chọn (giáo viên chọn
// từng câu). Cấu trúc: Form THPT 2025 (12/4/6) hoặc Tùy chỉnh. Chọn nhiều câu để đặt Dạng bài/mức độ một lần.
// Mọi câu vẫn là dòng ma trận số câu = 1 nên đi qua đúng bộ phân bổ, khóa câu, mẫu ma trận và xuất đề (examslots.ts).
import { memo, useMemo, useState } from 'react';
import { IcAlert, IcDice, IcLock, IcUnlock, IcX } from './Icons';
import { chapters as chaptersOf, grades } from '../lib/curriculum';
import { fmtScore, PART_NAME, PARTS, partOf, type PartKey, type Row, type Scoring } from '../lib/examgen';
import { scopeParts } from '../lib/examdraft';
import { difficultyLabel, formOf, FORM_THPT, MAX_PER_PART, partSlots, sameForm, type LevelStats } from '../lib/examslots';
import { stemSnippet } from '../lib/snippet';
import { LEVELS, LEVEL_LABEL, type Level, type Question, type Taxonomy } from '../lib/types';

export type PickMode = 'random' | 'manual';
const LV_SHORT: Record<Level | 'any', string> = { NB: 'NB', TH: 'TH', VD: 'VD', VDC: 'VDC', any: 'Mọi mức' };
const snip = stemSnippet;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

/** Chọn phạm vi (Dạng bài) cho một hay nhiều câu. Chỉ chọn trong cây hiện có; không tự đoán. */
export function ScopePicker({ defaultGrade, initial, title, onPick, onCancel }: { defaultGrade: number; initial?: Row['scope']; title?: string; onPick(scope: Row['scope']): void; onCancel(): void }) {
  const [grade, setGrade] = useState(initial?.kind === 'grade' ? Number(initial.id) : defaultGrade);
  const [chap, setChap] = useState(initial?.kind === 'chapter' ? initial.id : '');
  const [les, setLes] = useState('');
  const [form, setForm] = useState('');
  const chs = chaptersOf(grade);
  const lessons = chs.find((c) => c.id === chap)?.lessons ?? [];
  const forms = lessons.find((l) => l.id === les)?.forms ?? [];
  const scope: Row['scope'] = form ? { kind: 'form', id: form } : les ? { kind: 'lesson', id: les } : chap ? { kind: 'chapter', id: chap } : { kind: 'grade', id: String(grade) };
  return (
    <div className="te-pick" role="group" aria-label={title ?? 'Chọn Dạng bài'}>
      {title && <b className="te-pick-t">{title}</b>}
      <label className="lbl">Lớp<select className="sel" value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setChap(''); setLes(''); setForm(''); }}>{[...grades()].reverse().map((g) => <option key={g} value={g}>Lớp {g}</option>)}</select></label>
      <label className="lbl">Chương<select className="sel" value={chap} onChange={(e) => { setChap(e.target.value); setLes(''); setForm(''); }}><option value="">Cả lớp</option>{chs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="lbl">Bài<select className="sel" value={les} disabled={!chap} onChange={(e) => { setLes(e.target.value); setForm(''); }}><option value="">Cả chương</option>{lessons.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label className="lbl">Dạng<select className="sel" value={form} disabled={!les} onChange={(e) => setForm(e.target.value)}><option value="">Mọi dạng</option>{forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <div className="te-pick-acts">
        <button type="button" className="btn btn-dark btn-sm" onClick={() => onPick(scope)}>Dùng phạm vi này</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Hủy</button>
      </div>
    </div>
  );
}

/** Số câu một phần: −/+ hoặc gõ số rồi Enter/rời ô (không áp dụng giữa lúc gõ, tránh xóa nhầm ô). */
function PartCount({ label, value, onSet }: { label: string; value: number; onSet(n: number): void }) {
  const [txt, setTxt] = useState<string | null>(null);
  const commit = () => { if (txt === null) return; const n = Math.max(0, Math.min(MAX_PER_PART, Math.round(Number(txt)) || 0)); setTxt(null); if (n !== value) onSet(n); };
  return (
    <span className="sm-n"><span>{label}</span>
      <span className="stepper">
        <button type="button" aria-label={`Bớt một câu ${label}`} disabled={value <= 0} onClick={() => onSet(value - 1)}>−</button>
        <input className="sm-n-in" type="number" min={0} max={MAX_PER_PART} aria-label={`Số câu ${label}`} value={txt ?? String(value)} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setTxt(null); }} />
        <button type="button" aria-label={`Thêm một câu ${label}`} disabled={value >= MAX_PER_PART} onClick={() => onSet(value + 1)}>+</button>
      </span>
    </span>
  );
}

interface Props {
  rows: readonly Row[];
  tax: Taxonomy;
  defaultGrade: number;
  scoring: Scoring;
  mode: PickMode;
  /** câu đang được chọn cho từng ô (theo id ô) */
  picks: Readonly<Record<string, readonly string[]>>;
  locked: Readonly<Record<string, readonly string[]>>;
  byUid: ReadonlyMap<string, Question>;
  stockOf(r: Row): number;
  candidatesOf(r: Row): Question[];
  onMode(m: PickMode): void;
  /** sửa danh sách ô; `removed` = id ô bị bỏ/đổi yêu cầu (gỡ câu khóa) */
  onForm(f: Record<PartKey, number>): void;
  onPatch(ids: ReadonlySet<string>, patch: Partial<Pick<Row, 'scope' | 'level'>>): void;
  onDelete(id: string): void;
  onMove(id: string, dir: -1 | 1): void;
  onChoose(rowId: string, uid: string): void;
  onUnlock(rowId: string): void;
  onLock(rowId: string, uid: string): void;
  onReroll(uid: string): void;
}

export const SlotMatrix = memo(function SlotMatrix(p: Props) {
  const { rows, tax, defaultGrade, scoring, mode, picks, locked, byUid } = p;
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [scopeFor, setScopeFor] = useState<string | 'bulk' | null>(null);
  const [chooseFor, setChooseFor] = useState<string | null>(null);
  const [needle, setNeedle] = useState('');
  const form = formOf(rows);
  const thpt = sameForm(form, FORM_THPT);
  const [custom, setCustom] = useState(!thpt && rows.length > 0);
  const ids = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const selN = [...sel].filter((x) => ids.has(x)).length;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePart = (pk: PartKey, on: boolean) => setSel((s) => { const n = new Set(s); for (const r of partSlots(rows, pk)) if (on) n.add(r.id); else n.delete(r.id); return n; });
  const chooseRow = chooseFor ? rows.find((r) => r.id === chooseFor) : undefined;
  const cands = useMemo(() => {
    if (!chooseRow) return [];
    const q = fold(needle.trim());
    const cur = picks[chooseRow.id]?.[0];
    const all = p.candidatesOf(chooseRow).filter((c) => c.uid !== cur);
    return q ? all.filter((c) => fold(`${c.seq} ${snip(c.latex, 400)}`).includes(q)) : all;
  }, [chooseRow, needle, p, picks]);

  const scopeName = (r: Row) => {
    const sp = scopeParts(r.scope, tax);
    return sp ? { main: sp.main, path: sp.path.join(' › ') } : { main: r.label ? `${r.label}` : 'Mục không còn trong cây', path: '' };
  };

  const slotRow = (r: Row, i: number) => {
    const uid = picks[r.id]?.[0];
    const q = uid ? byUid.get(uid) : undefined;
    const isLocked = !!locked[r.id]?.length;
    const stock = p.stockOf(r);
    const sn = scopeName(r);
    const on = sel.has(r.id);
    return (
      <div key={r.id} className={`sm-row${on ? ' is-sel' : ''}${r.flag ? ' flagged' : ''}${!q ? ' is-empty' : ''}`} role="row">
        <span className="sm-c sm-chk" role="cell"><input type="checkbox" checked={on} aria-label={`Chọn câu ${i + 1}`} onChange={() => toggle(r.id)} /></span>
        <span className="sm-c sm-no" role="cell">Câu {i + 1}</span>
        <span className="sm-c sm-scope" role="cell">
          <button type="button" className="sm-scope-btn" title={`${sn.path ? sn.path + ' › ' : ''}${sn.main} — bấm để đổi Dạng bài`} onClick={() => setScopeFor(scopeFor === r.id ? null : r.id)}>
            <b>{sn.main}</b>{sn.path && <small>{sn.path}</small>}
          </button>
          {r.flag && <span className="te-flag warn" title="Mục của câu này đã bị xóa hoặc đổi vị trí trong cây. Hãy chọn lại Dạng bài; chưa xuất được đề khi còn câu này.">{r.flag === 'mat' ? 'không còn trong cây' : 'đã đổi vị trí'}</span>}
        </span>
        <span className="sm-c sm-lv" role="cell">
          <select className={`sel lv-${r.level}`} aria-label={`Mức độ câu ${i + 1}`} value={r.level} onChange={(e) => p.onPatch(new Set([r.id]), { level: e.target.value as Level | 'any' })}>
            {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}<option value="any">Mọi mức</option>
          </select>
        </span>
        <span className={`sm-c sm-stock${stock === 0 ? ' bad' : stock < 3 ? ' low' : ''}`} role="cell" title="Số câu trong kho khớp Dạng bài + loại + mức độ (theo mức lấy câu đang chọn)">{stock}</span>
        <span className="sm-c sm-q" role="cell">
          {q ? (
            <button type="button" className="sm-q-btn" title="Bấm để chọn câu khác" onClick={() => { setChooseFor(chooseFor === r.id ? null : r.id); setNeedle(''); }}>
              {isLocked ? <span className="sm-auto is-lock" title="Câu đã khóa / do bạn chọn">khóa</span> : <span className="sm-auto" title="Máy chọn ngẫu nhiên">máy</span>}
              <span className="sm-q-lv">{LV_SHORT[q.level]}</span>
              <span className="sm-q-t">#{q.seq} · {snip(q.latex, 110)}</span>
            </button>
          ) : (
            <button type="button" className="sm-q-btn none" onClick={() => { setChooseFor(chooseFor === r.id ? null : r.id); setNeedle(''); }}>
              {stock === 0 ? <><IcAlert size={14} />Kho không có câu phù hợp</> : mode === 'manual' ? 'Chưa chọn câu — bấm để chọn' : 'Chưa có câu (thiếu do trùng ô khác)'}
            </button>
          )}
        </span>
        <span className="sm-c sm-acts" role="cell">
          {q && (isLocked
            ? <button type="button" className="ico" title="Bỏ khóa (máy được chọn câu khác)" aria-label="Bỏ khóa" onClick={() => p.onUnlock(r.id)}><IcLock /></button>
            : <button type="button" className="ico" title="Khóa câu này" aria-label="Khóa" onClick={() => p.onLock(r.id, q.uid)}><IcUnlock /></button>)}
          {q && mode === 'random' && <button type="button" className="ico" title="Đổi ngẫu nhiên câu khác" aria-label="Đổi ngẫu nhiên" onClick={() => p.onReroll(q.uid)}><IcDice /></button>}
          <button type="button" className="ico" title="Lên" aria-label="Lên" onClick={() => p.onMove(r.id, -1)}>↑</button>
          <button type="button" className="ico" title="Xuống" aria-label="Xuống" onClick={() => p.onMove(r.id, 1)}>↓</button>
          <button type="button" className="ico" title="Bỏ câu này khỏi ma trận" aria-label="Bỏ câu" onClick={() => p.onDelete(r.id)}><IcX /></button>
        </span>
        {scopeFor === r.id && (
          <div className="sm-pop">
            <ScopePicker defaultGrade={defaultGrade} initial={r.scope} title={`Dạng bài cho Câu ${i + 1}`} onCancel={() => setScopeFor(null)} onPick={(sc) => { p.onPatch(new Set([r.id]), { scope: sc }); setScopeFor(null); }} />
          </div>
        )}
        {chooseFor === r.id && (
          <div className="sm-pop te-swap" role="region" aria-label="Chọn câu cho ô">
            <div className="te-swap-h">
              <b>Chọn câu khác cho Câu {i + 1} · {cands.length} câu phù hợp</b>
              <input className="inp sm-find" type="search" placeholder="Tìm theo số câu hoặc chữ…" value={needle} onChange={(e) => setNeedle(e.target.value)} autoFocus />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setChooseFor(null)}>Đóng</button>
            </div>
            {cands.length === 0 ? <p className="te-note">Không còn câu nào khác khớp Dạng bài và mức độ của ô này.</p> : (
              <ul>
                {cands.slice(0, 60).map((c) => (
                  <li key={c.uid}><span className="sm-q-lv">{LV_SHORT[c.level]}</span><span className="te-snip">#{c.seq} · {snip(c.latex, 160)}</span><button type="button" className="btn btn-sm" onClick={() => { p.onChoose(r.id, c.uid); setChooseFor(null); }}>Chọn</button></li>
                ))}
                {cands.length > 60 && <li className="te-note">Còn {cands.length - 60} câu nữa — gõ chữ để tìm.</li>}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="smx">
      <div className="sm-bar">
        <div className="sm-opt"><span>Lấy câu</span>
          <div className="seg sm" role="group" aria-label="Cách lấy câu">
            <button type="button" aria-pressed={mode === 'random'} title="Máy chọn ngẫu nhiên câu đúng Dạng bài + mức độ cho từng ô; khóa được câu ưng ý" onClick={() => p.onMode('random')}>Ngẫu nhiên</button>
            <button type="button" aria-pressed={mode === 'manual'} title="Giáo viên tự chọn câu cho từng ô" onClick={() => p.onMode('manual')}>Tự chọn</button>
          </div>
        </div>
        <div className="sm-opt"><span>Cấu trúc</span>
          <div className="seg sm" role="group" aria-label="Cấu trúc đề">
            <button type="button" aria-pressed={thpt && !custom} title="12 trắc nghiệm · 4 đúng/sai · 6 trả lời ngắn" onClick={() => { setCustom(false); p.onForm(FORM_THPT); }}>Form THPT 2025</button>
            <button type="button" aria-pressed={!thpt || custom} onClick={() => setCustom(true)}>Tùy chỉnh</button>
          </div>
        </div>
        {(custom || !thpt) && (
          <div className="sm-form" role="group" aria-label="Số câu mỗi phần">
            {PARTS.map((pk) => <PartCount key={pk} label={PART_NAME[pk].split(' · ')[1]} value={form[pk]} onSet={(n) => p.onForm({ ...form, [pk]: n })} />)}
          </div>
        )}
      </div>

      {selN > 0 && (
        <div className="sm-bulk" role="region" aria-label="Sửa nhiều câu">
          <b>Đã chọn {selN} câu</b>
          <button type="button" className="btn btn-sm" onClick={() => setScopeFor(scopeFor === 'bulk' ? null : 'bulk')}>Đặt Dạng bài…</button>
          <label className="sm-n">Mức độ
            <select className="sel" value="" onChange={(e) => { if (e.target.value) p.onPatch(new Set([...sel].filter((x) => ids.has(x))), { level: e.target.value as Level | 'any' }); }}>
              <option value="">— đổi thành —</option>{LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}<option value="any">Mọi mức</option>
            </select>
          </label>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSel(new Set())}>Bỏ chọn</button>
          {scopeFor === 'bulk' && <div className="sm-pop"><ScopePicker defaultGrade={defaultGrade} title={`Dạng bài cho ${selN} câu đã chọn`} onCancel={() => setScopeFor(null)} onPick={(sc) => { p.onPatch(new Set([...sel].filter((x) => ids.has(x))), { scope: sc }); setScopeFor(null); }} /></div>}
        </div>
      )}

      {rows.length === 0 && (
        <div className="te-empty">
          <b>Ma trận đang trống.</b>
          <span>Bấm “Form THPT 2025” để có ngay 12 câu trắc nghiệm, 4 câu đúng/sai, 6 câu trả lời ngắn (rồi đặt Dạng bài cho từng câu), hoặc “Tùy chỉnh” để tự đặt số câu mỗi phần.</span>
        </div>
      )}

      {PARTS.map((pk) => {
        const rs = partSlots(rows, pk);
        if (!rs.length) return null;
        const allOn = rs.every((r) => sel.has(r.id));
        const got = rs.filter((r) => picks[r.id]?.length).length;
        return (
          <div key={pk} className="sm-part" role="table" aria-label={PART_NAME[pk]}>
            <div className="sm-part-h">
              <b>{PART_NAME[pk]}</b>
              <span>{rs.length} câu · {fmtScore(rs.length * scoring[pk])} điểm</span>
              <span className={got < rs.length ? 'te-lack' : 'okmark'}>{got}/{rs.length} câu đã có</span>
            </div>
            <div className="sm-row sm-head" role="row">
              <span className="sm-c sm-chk" role="columnheader"><input type="checkbox" checked={allOn} aria-label={`Chọn cả ${PART_NAME[pk]}`} onChange={(e) => togglePart(pk, e.target.checked)} /></span>
              <span className="sm-c sm-no" role="columnheader">Câu</span>
              <span className="sm-c sm-scope" role="columnheader">Dạng bài</span>
              <span className="sm-c sm-lv" role="columnheader">Mức độ</span>
              <span className="sm-c sm-stock" role="columnheader" title="Số câu trong kho">Kho</span>
              <span className="sm-c sm-q" role="columnheader">Câu hỏi</span>
              <span className="sm-c sm-acts" role="columnheader" />
            </div>
            {rs.map((r, i) => slotRow(r, i))}
          </div>
        );
      })}
      {rows.some((r) => partOf(r.type) === 'p4') && <p className="te-note">Tự luận tính theo điểm tối đa mỗi câu (đặt ở bước Cấu hình &amp; Xuất).</p>}
    </div>
  );
});

/** Bảng "Thống kê và đánh giá đề": tỉ lệ Nhận biết–Thông hiểu / Vận dụng–Vận dụng cao (vòng tròn), số câu theo mức, độ khó. */
export function SlotStats({ s, filled, total }: { s: LevelStats; filled: number; total: number }) {
  const known = s.total - s.unknown;
  return (
    <div className="panel sm-stats" aria-label="Thống kê và đánh giá đề">
      <h2>Thống kê và đánh giá đề</h2>
      <div className="sm-donut-w">
        <div className="sm-donut" style={{ background: known ? `conic-gradient(var(--sm-easy) 0 ${s.easyPct}%, var(--sm-hard) ${s.easyPct}% 100%)` : 'var(--line)' }} role="img" aria-label={`Nhận biết–Thông hiểu ${s.easyPct}%, Vận dụng–Vận dụng cao ${s.hardPct}%`}>
          <span><b>{known ? `${s.easyPct}/${s.hardPct}` : '—'}</b><small>{total} câu</small></span>
        </div>
        <ul className="sm-legend">
          <li><i style={{ background: 'var(--sm-easy)' }} />Nhận biết – Thông hiểu <b>{s.NB + s.TH}</b> ({s.easyPct}%)</li>
          <li><i style={{ background: 'var(--sm-hard)' }} />Vận dụng – Vận dụng cao <b>{s.VD + s.VDC}</b> ({s.hardPct}%)</li>
          {s.unknown > 0 && <li className="te-note">{s.unknown} câu chưa rõ mức (ô “Mọi mức” chưa có câu)</li>}
          <li className="te-note">Tham khảo: đề kiểm tra thường 70/30.</li>
        </ul>
      </div>
      <div className="sm-lvs">
        {(['NB', 'TH', 'VD', 'VDC'] as const).map((l) => <span key={l} className={`sm-lvb lv-${l}`}><b>{s[l]}</b>{LEVEL_LABEL[l]}</span>)}
      </div>
      <div className="sm-diff" aria-label={`Độ khó ${s.difficulty}/10`}>
        <div className="sm-diff-h"><span>Độ khó đề</span><b>{known ? `${s.difficulty.toLocaleString('vi-VN')}/10 · ${difficultyLabel(s.difficulty)}` : '—'}</b></div>
        <div className="sm-diff-bar"><i style={{ left: `${s.difficulty * 10}%` }} /></div>
        <div className="sm-diff-k"><span>Dễ</span><span>Vừa</span><span>Khó</span></div>
      </div>
      <p className={filled < total ? 'te-lack' : 'okmark'}>{filled}/{total} câu đã có câu hỏi</p>
    </div>
  );
}
