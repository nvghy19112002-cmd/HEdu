// Gán ID nhờ AI ngoài (Claude qua gói Pro / Claude Code): HEdu xuất "lô cần gán ID" → AI đề xuất Dạng từng câu → HEdu nhập
// tệp đề xuất vào hàng đợi Xác minh. AI KHÔNG BAO GIỜ ghi thẳng vào câu: đề xuất trùng Dạng đang lưu ⇒ "Máy phân loại" (nguồn
// "AI ngoài"); khác ⇒ "Cần xem lại" kèm Dạng đề xuất (`prop`) để giáo viên chọn. Câu giáo viên đã xác minh không bị đụng.
//
// Đo độ đúng: lô trộn NGẦM một phần câu giáo viên đã xác minh (cùng định dạng, đã bỏ ID cũ) — AI không biết câu nào là câu đối chứng;
// khi nhập, HEdu so đề xuất với Dạng giáo viên đã xác minh để báo tỉ lệ đúng theo Chương / Bài / Dạng.
// Quy tắc nền: claude/quy-tac-gan-id-chuan.md (nguồn "ai-ngoai", "máy" không tự thành "gv").
import { contentKeys, gradeOfEff, keepNoId, makeRec, type Effective, type ReviewRec } from './idreview';
import { idlessVariants } from './idtex';
import { stemSnippet } from './snippet';
import { locationOfForm } from './taxpath';
import type { TaxIndex } from './taxonomy';
import { LEVELS, TYPE_LABEL, type Level, type Question, type Taxonomy } from './types';

export const LOT_FORMAT = 'hedu-gan-id';
export const PROPOSAL_FORMAT = 'hedu-gan-id-de-xuat';
export type Conf = 'cao' | 'vua' | 'thap';
const CONFS: Conf[] = ['cao', 'vua', 'thap'];
export const CONF_LABEL: Record<Conf, string> = { cao: 'chắc chắn cao', vua: 'khá chắc', thap: 'chưa chắc' };

/** `lop` null = câu Chưa có ID chưa rõ lớp (AI chọn Dạng ở lớp hợp nhất) */
export interface LotItem { k: string; fp: string; lop: number | null; loai: string; latex: string }
export interface LotForm { id: string; ma: string; duong: string; vd: string[] }
export interface LotFile {
  format: typeof LOT_FORMAT; v: 1; lo: string; taoLuc: string; taxRev: string;
  /** "kiem-tra-lai": lô gồm cả câu giáo viên đã xác minh, nhờ AI soát lại Dạng và mức độ (không có câu đối chứng ngầm) */
  kieu?: 'kiem-tra-lai';
  huongDan: string[];
  dang: LotForm[];
  cau: LotItem[];
}
export interface ProposalItem { k: string; fp: string; dang: string; muc?: Level; chac: Conf; lyDo: string }
export interface ProposalFile { format: typeof PROPOSAL_FORMAT; v: 1; lo: string; boi?: string; cau: ProposalItem[] }

const shuffle = <T,>(a: T[], seed: number): T[] => {
  let s = seed >>> 0 || 1;
  const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** Mã Dạng không kèm mức độ: [Lớp][Phân môn][Chương]·[Bài]-[Dạng] (· là chỗ chữ mức độ N/H/V/C). */
function formRows(tax: Taxonomy, grades: ReadonlySet<number>): (LotForm & { grade: number })[] {
  const out: (LotForm & { grade: number })[] = [];
  for (const g of tax.grades) {
    if (!grades.has(g.grade)) continue;
    for (const b of g.branches) for (const c of b.chapters) for (const l of c.lessons) for (const f of l.forms) {
      out.push({ grade: g.grade, id: f.id, ma: `${g.code}${b.code}${c.code}·${l.code}-${f.code}`, duong: `Lớp ${g.grade} › ${c.name} › ${l.name} › ${f.name}`, vd: [] });
    }
  }
  return out;
}

export const HUONG_DAN = [
  'Bạn phân loại câu hỏi Toán (Chương trình GDPT 2018) vào đúng MỘT Dạng trong danh sách "dang" của tệp này — đây là cây chương trình của giáo viên.',
  'Với mỗi câu trong "cau": đọc đề (LaTeX, đã bỏ ID cũ), chọn Dạng ("id" trong "dang") cùng lớp với câu ("lop"; nếu "lop" là null thì chọn ở lớp phù hợp nhất); đề xuất mức độ NB/TH/VD/VDC.',
  'Căn cứ chính là KIẾN THỨC câu hỏi kiểm tra (không phải chữ trong đề). "vd" là đề mẫu giáo viên đã xác minh của Dạng đó để tham khảo.',
  'Không đoán bừa: phân vân giữa nhiều Dạng thì chọn Dạng hợp nhất và để "chac":"thap"; ghi "lyDo" một câu ngắn (vì sao chọn Dạng này).',
  'Mức độ theo YÊU CẦU TƯ DUY của câu (không theo loại câu hay tên Dạng): NB = nhớ/nhận ra định nghĩa, kí hiệu, công thức, đọc kết quả trực tiếp (1 bước); TH = áp dụng trực tiếp một kiến thức trong tình huống quen thuộc, 2–3 bước, chuyển cách biểu diễn; VD = phối hợp nhiều kiến thức, có tham số phải lập điều kiện, đặt ẩn/mô hình hoá bài thực tế quen thuộc; VDC = tình huống mới, biện luận nhiều trường hợp, phối hợp nhiều bài/chương.',
  'Xét bước khó nhất BẮT BUỘC để ra đáp án; hai mức kề nhau đều hợp lý thì chọn mức thấp hơn. Câu nhiều ý (Đúng/Sai, tự luận a/b/c…): đề xuất mức của ý khó nhất và ghi "nhiều ý" trong "lyDo" — giáo viên sẽ chốt mức.',
  'Trả về MỘT tệp JSON: {"format":"hedu-gan-id-de-xuat","v":1,"lo":<giống "lo">,"boi":"Claude","cau":[{"k":<k>,"fp":<fp>,"dang":<id Dạng>,"muc":"NB|TH|VD|VDC","chac":"cao|vua|thap","lyDo":"…"}]}.',
  'Chép NGUYÊN "k" và "fp" của từng câu. Đủ một dòng cho mỗi câu; không thêm câu, không đổi đề.',
  'Ghi tệp kết quả tên "de-xuat-<lo>.json" (thay <lo> bằng giá trị "lo") vào CÙNG thư mục với tệp lô này.',
];

/** Mã lô "Kiểm tra lại" bắt đầu bằng K (lô gán ID thường bắt đầu bằng L): HEdu biết kiểu lô từ chính mã lô trong tệp đề xuất. */
export const RECHECK_PREFIX = 'K';
export const isRecheckLot = (lo: string): boolean => lo.startsWith(RECHECK_PREFIX);
export const HUONG_DAN_KIEM_TRA_LAI = 'Lô KIỂM TRA LẠI: các câu đã nằm trong ngân hàng (nhiều câu giáo viên đã xác minh). Phân loại độc lập từng câu như thường lệ, KHÔNG cố đoán Dạng đang lưu; HEdu tự so với Dạng và mức độ đang lưu, câu khác sẽ được đưa cho giáo viên xem lại.';

export interface BuildOpts { tax: Taxonomy; ix: TaxIndex; taxRev: string; effOf: (q: Question) => Effective; size: number; goldShare: number; lo: string; seed?: number; now?: Date; /** lấy MỌI câu đang lọc, kể cả câu đã xác minh; không trộn câu đối chứng */ recheck?: boolean }

/**
 * Lô cần gán ID: các câu CHƯA được giáo viên xác minh Dạng (theo thứ tự ưu tiên của hàng đợi), trộn ngầm câu đối chứng
 * (giáo viên đã xác minh) theo tỉ lệ `goldShare`. Đề đã bỏ vùng %[ID] để AI không dựa vào ID cũ.
 */
export function buildLot(pool: readonly Question[], o: BuildOpts): { lot: LotFile; need: number; gold: number } {
  const verified = (e: Effective) => e.form === 'gv' && !e.unclassified;
  const rank = (e: Effective) => (e.form === 'xem-lai' ? 0 : e.unclassified ? 1 : e.form === 'chua' ? 2 : 3);
  const needAll = pool.map((q) => ({ q, e: o.effOf(q) })).filter((x) => o.recheck || !verified(x.e)).sort((a, b) => rank(a.e) - rank(b.e));
  const needX = needAll.slice(0, Math.max(1, o.size));
  const need = needX.map((x) => x.q);
  // Lớp của câu: câu Chưa có ID dùng lớp chọn khi nhập (không dùng lớp của vị trí giữ chỗ); chưa rõ lớp ⇒ gửi Dạng của mọi lớp
  const lopOf = new Map(needX.map((x) => [x.q.uid, gradeOfEff(x.q, x.e)] as const));
  const grades = new Set([...lopOf.values()].some((g) => g == null) ? o.tax.grades.map((g) => g.grade) : [...lopOf.values()].filter((g): g is number => g != null));
  const goldPool = pool.filter((q) => grades.has(q.grade) && verified(o.effOf(q)));
  const goldN = o.recheck ? 0 : Math.min(goldPool.length, Math.round(need.length * o.goldShare));
  const gold = shuffle([...goldPool], (o.seed ?? 7) + 1).slice(0, goldN);
  const items = shuffle([...need, ...gold], o.seed ?? 7).map((q): LotItem => ({ k: q.uid, fp: contentKeys(q.latex).i, lop: lopOf.has(q.uid) ? lopOf.get(q.uid)! : q.grade, loai: TYPE_LABEL[q.type], latex: (idlessVariants(q.latex)[0] ?? q.latex).trim() }));
  // đề mẫu cho mỗi Dạng: tối đa 2 câu giáo viên đã xác minh (không lấy câu đối chứng đang nằm trong lô)
  const inLot = new Set(items.map((x) => x.k));
  const forms = formRows(o.tax, grades);
  const byForm = new Map(forms.map((f) => [f.id, f] as const));
  for (const q of pool) {
    const f = byForm.get(q.formId);
    if (!f || f.vd.length >= 2 || inLot.has(q.uid) || !verified(o.effOf(q))) continue;
    f.vd.push(stemSnippet(q.latex, 220));
  }
  const lot: LotFile = {
    format: LOT_FORMAT, v: 1, lo: o.lo, taoLuc: (o.now ?? new Date()).toISOString(), taxRev: o.taxRev,
    ...(o.recheck ? { kieu: 'kiem-tra-lai' as const } : {}),
    huongDan: o.recheck ? [HUONG_DAN[0], HUONG_DAN_KIEM_TRA_LAI, ...HUONG_DAN.slice(1)] : HUONG_DAN,
    dang: forms.map(({ id, ma, duong, vd }) => ({ id, ma, duong, vd })),
    cau: items,
  };
  return { lot, need: need.length, gold: gold.length };
}

/** Đọc tệp đề xuất; trả về lỗi tiếng Việt nếu sai định dạng (không đoán). */
export function parseProposal(text: string): { ok: true; p: ProposalFile; dropped: number } | { ok: false; why: string } {
  let j: unknown;
  try { j = JSON.parse(text.replace(/^﻿/, '')); } catch { return { ok: false, why: 'Tệp không phải JSON hợp lệ.' }; }
  const o = j as Record<string, unknown>;
  if (!o || typeof o !== 'object' || o.format !== PROPOSAL_FORMAT) return { ok: false, why: `Không phải tệp đề xuất của HEdu (cần "format": "${PROPOSAL_FORMAT}").` };
  if (!Array.isArray(o.cau)) return { ok: false, why: 'Thiếu danh sách "cau".' };
  let dropped = 0;
  const cau: ProposalItem[] = [];
  for (const x of o.cau as unknown[]) {
    const r = x as Record<string, unknown>;
    if (!r || typeof r.k !== 'string' || typeof r.fp !== 'string' || typeof r.dang !== 'string') { dropped++; continue; }
    const chac = CONFS.includes(r.chac as Conf) ? (r.chac as Conf) : 'thap';
    const muc = LEVELS.includes(r.muc as Level) ? (r.muc as Level) : undefined;
    cau.push({ k: r.k, fp: r.fp, dang: r.dang, chac, ...(muc ? { muc } : {}), lyDo: typeof r.lyDo === 'string' ? r.lyDo.slice(0, 300) : '' });
  }
  return { ok: true, p: { format: PROPOSAL_FORMAT, v: 1, lo: typeof o.lo === 'string' ? o.lo : '', ...(typeof o.boi === 'string' ? { boi: o.boi.slice(0, 40) } : {}), cau }, dropped };
}

export type SkipWhy = 'khong-con' | 'doi-noi-dung' | 'dang-la' | 'sai-lop' | 'trung';
export const SKIP_LABEL: Record<SkipWhy, string> = {
  'khong-con': 'câu không còn trong ngân hàng', 'doi-noi-dung': 'câu đã sửa sau khi xuất lô', 'dang-la': 'Dạng đề xuất không có trong cây',
  'sai-lop': 'Dạng đề xuất khác lớp của câu', trung: 'câu xuất hiện hai lần trong tệp',
};
export interface Accuracy { n: number; chuong: number; bai: number; dang: number; muc: number; sai: { uid: string; dung: string; deXuat: string }[] }
export interface ImportPlan {
  /** bản ghi sẽ đặt (câu chưa giáo viên xác minh; lô Kiểm tra lại: cả câu đã xác minh mà Claude thấy khác) */
  recs: [string, ReviewRec][];
  /** lô Kiểm tra lại (mã lô bắt đầu bằng K) */
  recheck: boolean;
  /** số câu Claude đề xuất mức độ khác mức đang lưu (giáo viên bấm K để dùng) */
  mucKhac: number;
  dongY: number; khac: number; theoChac: Record<Conf, { dongY: number; khac: number }>;
  skip: Partial<Record<SkipWhy, number>>;
  gold: Accuracy;
}

/**
 * Lập kế hoạch nhập đề xuất (không ghi gì). `who` là tên AI ghi vào lý do.
 * Lô thường: câu giáo viên đã xác minh trong lô là câu đối chứng — chỉ để đo. Lô Kiểm tra lại: câu đã xác minh vẫn được đo, và nếu Claude
 * thấy khác Dạng ⇒ "Cần xem lại" (Dạng đang lưu GIỮ NGUYÊN, giáo viên chọn); khác mức độ ⇒ chỉ thêm mức đề xuất (phím K). Không câu nào bị đổi.
 * Trạng thái mức độ đã có (giáo viên xác minh / máy) được giữ, không bị nhập đề xuất xoá.
 */
export function planImport(p: ProposalFile, pool: readonly Question[], o: { ix: TaxIndex; taxRev: string; effOf: (q: Question) => Effective; now?: number }): ImportPlan {
  const byUid = new Map(pool.map((q) => [q.uid, q] as const));
  const seen = new Set<string>();
  const recheck = isRecheckLot(p.lo);
  const plan: ImportPlan = { recs: [], recheck, mucKhac: 0, dongY: 0, khac: 0, theoChac: { cao: { dongY: 0, khac: 0 }, vua: { dongY: 0, khac: 0 }, thap: { dongY: 0, khac: 0 } }, skip: {}, gold: { n: 0, chuong: 0, bai: 0, dang: 0, muc: 0, sai: [] } };
  const skip = (w: SkipWhy) => { plan.skip[w] = (plan.skip[w] ?? 0) + 1; };
  const who = p.boi || 'AI ngoài';
  for (const it of p.cau) {
    if (seen.has(it.k)) { skip('trung'); continue; }
    seen.add(it.k);
    const q = byUid.get(it.k);
    if (!q) { skip('khong-con'); continue; }
    if (contentKeys(q.latex).i !== it.fp) { skip('doi-noi-dung'); continue; }
    const loc = locationOfForm(o.ix, it.dang);
    if (!loc) { skip('dang-la'); continue; }
    const e = o.effOf(q);
    const lop = gradeOfEff(q, e); // câu Chưa có ID: lớp chọn khi nhập, chưa rõ ⇒ nhận mọi lớp
    if (lop != null && loc.grade !== lop) { skip('sai-lop'); continue; }
    const pl = it.muc && it.muc !== q.level ? { propLevel: it.muc } : {}; // mức đề xuất chỉ giữ để giáo viên bấm dùng (phím K), không ghi vào câu
    if (pl.propLevel) plan.mucKhac++;
    const why = `${who} (${CONF_LABEL[it.chac]}): ${it.lyDo || 'không ghi lý do'}${pl.propLevel ? ` · đề xuất mức ${it.muc}` : ''}`;
    const at = o.now ? { at: o.now } : {};
    if (e.form === 'gv' && !e.unclassified) {
      // câu giáo viên đã xác minh: đo độ đúng; lô thường thì không đổi gì
      const g = plan.gold;
      g.n++;
      if (loc.chapterId === q.chapterId) g.chuong++;
      if (loc.lessonId === q.lessonId) g.bai++;
      if (it.dang === q.formId) g.dang++; else g.sai.push({ uid: q.uid, dung: q.formId, deXuat: it.dang });
      if (it.muc && it.muc === q.level) g.muc++;
      if (!recheck) continue;
      const rec = e.rec;
      if (it.dang === q.formId) {
        plan.dongY++; plan.theoChac[it.chac].dongY++;
        // đồng ý Dạng: giữ nguyên xác minh, chỉ thêm mức đề xuất nếu khác (mức đề xuất cũ còn treo mà nay đồng ý mức ⇒ bỏ đi)
        if (rec && (pl.propLevel || rec.propLevel)) plan.recs.push([q.uid, makeRec(q, { form: 'gv', level: e.level, src: rec.src, taxRev: o.taxRev, ...(rec.why ? { why: rec.why } : {}), ...(rec.orig ? { orig: rec.orig } : {}), ...pl, ...at })]);
        continue;
      }
      plan.khac++; plan.theoChac[it.chac].khac++;
      plan.recs.push([q.uid, makeRec(q, { form: 'xem-lai', level: e.level, src: 'ai-ngoai', taxRev: o.taxRev, why: `Kiểm tra lại · ${why}`, prop: it.dang, ...(rec?.orig ? { orig: rec.orig } : {}), ...pl, ...at })]);
      continue;
    }
    const same = it.dang === q.formId && !e.unclassified;
    if (same) { plan.dongY++; plan.theoChac[it.chac].dongY++; } else { plan.khac++; plan.theoChac[it.chac].khac++; }
    plan.recs.push([q.uid, same
      ? makeRec(q, { form: 'may', level: e.level, src: 'ai-ngoai', taxRev: o.taxRev, why, ...pl, ...at })
      : makeRec(q, { form: 'xem-lai', level: e.level, src: 'ai-ngoai', taxRev: o.taxRev, why, prop: it.dang, ...pl, ...keepNoId(e), ...at })]);
  }
  return plan;
}

export const pct = (a: number, n: number): string => (n ? `${Math.round((a / n) * 100)}%` : '—');

/** Sổ tay ngắn đi kèm lô (Markdown): cách nhờ Claude làm. */
export function lotReadme(lot: LotFile, need: number, gold: number): string {
  return [
    `# Lô gán ID ${lot.lo} — ${need + gold} câu`,
    '',
    'Mở Claude Code (hoặc claude.ai) và gửi kèm tệp JSON của lô này với lời nhờ:',
    '',
    '> Đọc tệp lô gán ID của HEdu, làm đúng "huongDan" trong tệp và ghi kết quả ra tệp `de-xuat-' + lot.lo + '.json` cùng thư mục.',
    '',
    'Sau đó trong HEdu: Ngân hàng → Gán ID nhờ Claude → Nhập tệp đề xuất. HEdu báo độ đúng trên các câu đối chứng rồi mới đưa đề xuất vào hàng đợi Xác minh;',
    'không câu nào bị đổi Dạng hay ID cho tới khi thầy/cô xác nhận.',
  ].join('\n') + '\n';
}

// ---------- thư mục trao đổi cố định (Claude Code đọc/ghi cùng thư mục) ----------
export interface XFile { name: string; bytes: number; mtimeMs: number }
export type LotState = 'cho-claude' | 'co-de-xuat' | 'da-nhap';
export const LOT_STATE_LABEL: Record<LotState, string> = { 'cho-claude': 'Chờ Claude làm', 'co-de-xuat': 'Claude đã làm — chờ nhập', 'da-nhap': 'Đã nhập' };
export interface LotRow { lo: string; lotFile: string | null; propFile: string | null; state: LotState; at: number }
export const lotFileName = (lo: string): string => `hedu-gan-id-${lo}.json`;
export const proposalFileName = (lo: string): string => `de-xuat-${lo}.json`;

/** Gom tệp trong thư mục trao đổi thành từng lô (mới nhất trước). `imported` = các lô đã nhập (lưu ở máy). */
export function lotRows(files: readonly XFile[], imported: ReadonlySet<string>): LotRow[] {
  const m = new Map<string, LotRow>();
  const row = (lo: string) => { let r = m.get(lo); if (!r) m.set(lo, (r = { lo, lotFile: null, propFile: null, state: 'cho-claude', at: 0 })); return r; };
  for (const f of files) {
    const a = /^hedu-gan-id-(.+)\.json$/i.exec(f.name), b = /^de-xuat-(.+)\.json$/i.exec(f.name);
    if (a) { const r = row(a[1]); r.lotFile = f.name; r.at = Math.max(r.at, f.mtimeMs); }
    else if (b) { const r = row(b[1]); r.propFile = f.name; r.at = Math.max(r.at, f.mtimeMs); }
  }
  for (const r of m.values()) r.state = imported.has(r.lo) ? 'da-nhap' : r.propFile ? 'co-de-xuat' : 'cho-claude';
  return [...m.values()].sort((x, y) => y.at - x.at || (x.lo < y.lo ? 1 : -1));
}
/** Lô mới nhất có đề xuất chưa nhập (để nút "Nhập đề xuất mới nhất"). */
export const latestPending = (rows: readonly LotRow[]): LotRow | null => rows.find((r) => r.state === 'co-de-xuat') ?? null;
