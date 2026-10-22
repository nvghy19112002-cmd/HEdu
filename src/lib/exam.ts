// Tạo đề theo ma trận (cấu trúc 3 phần, đề 2025), trộn câu, trộn phương án,
// sinh nhiều mã đề và bảng đáp án, xuất mã LaTeX.
import { buildExTest, parseExTest, type ParsedQuestion } from './extest';
import { findChapter } from './curriculum';
import { questionCode } from './id';
import type { Question } from './types';

export type Cell = 'nb' | 'th' | 'vd' | 'ds' | 'tln';
export const CELLS: Cell[] = ['nb', 'th', 'vd', 'ds', 'tln'];
export const CELL_LABEL: Record<Cell, string> = { nb: 'NB', th: 'TH', vd: 'VD', ds: 'Phần II', tln: 'Phần III' };

export interface MatrixRow { chapterId: string; nb: number; th: number; vd: number; ds: number; tln: number }

/** Điểm mỗi câu theo cấu trúc đề 2025 */
export const POINTS = { p1: 0.25, p2: 1, p3: 0.5 };

export function inCell(q: Question, chapterId: string, cell: Cell): boolean {
  if (q.chapterId !== chapterId) return false;
  switch (cell) {
    case 'nb': return q.type === 'tn' && q.level === 'NB';
    case 'th': return q.type === 'tn' && q.level === 'TH';
    case 'vd': return q.type === 'tn' && (q.level === 'VD' || q.level === 'VDC');
    case 'ds': return q.type === 'ds';
    case 'tln': return q.type === 'tln';
  }
}

export function available(bank: Question[], chapterId: string, cell: Cell): number {
  return bank.filter((q) => inCell(q, chapterId, cell)).length;
}

export interface Shortage { chapterId: string; cell: Cell; need: number; have: number }

export function shortages(bank: Question[], rows: MatrixRow[]): Shortage[] {
  const out: Shortage[] = [];
  for (const r of rows) for (const c of CELLS) {
    const have = available(bank, r.chapterId, c);
    if (r[c] > have) out.push({ chapterId: r.chapterId, cell: c, need: r[c], have });
  }
  return out;
}

// --- Ngẫu nhiên có hạt giống (để sinh lại đúng đề cũ khi cần) ---
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Picked { p1: Question[]; p2: Question[]; p3: Question[]; p4: Question[] }

export function pickByMatrix(bank: Question[], rows: MatrixRow[], seed: number): Picked {
  const rand = rng(seed);
  const picked: Picked = { p1: [], p2: [], p3: [], p4: [] };
  for (const r of rows) {
    for (const c of CELLS) {
      const pool = shuffle(bank.filter((q) => inCell(q, r.chapterId, c)), rand).slice(0, r[c]);
      if (c === 'ds') picked.p2.push(...pool);
      else if (c === 'tln') picked.p3.push(...pool);
      else picked.p1.push(...pool);
    }
  }
  return picked;
}

export function pickManual(questions: Question[]): Picked {
  return {
    p1: questions.filter((q) => q.type === 'tn'),
    p2: questions.filter((q) => q.type === 'ds'),
    p3: questions.filter((q) => q.type === 'tln'),
    p4: questions.filter((q) => q.type === 'tl'),
  };
}

export interface VariantItem { q: Question; parsed: ParsedQuestion; order: number[] }
export interface Variant { code: string; parts: VariantItem[][]; key: string[][] }

export interface VariantOptions { count: number; firstCode: number; shuffleQuestions: boolean; shuffleOptions: boolean; seed: number }

const LETTERS = ['A', 'B', 'C', 'D'];

export function makeVariants(picked: Picked, o: VariantOptions): Variant[] {
  const parts = [picked.p1, picked.p2, picked.p3, picked.p4];
  const out: Variant[] = [];
  for (let v = 0; v < o.count; v++) {
    const rand = rng(o.seed + 7919 * (v + 1));
    const vparts: VariantItem[][] = parts.map((list, pi) => {
      const ordered = o.shuffleQuestions ? shuffle(list, rand) : list;
      return ordered.map((q) => {
        const parsed = parseExTest(q.latex);
        const idx = parsed.options.map((_, i) => i);
        // Chỉ trộn phương án của câu trắc nghiệm (phần I); ý a–d của câu đúng/sai giữ nguyên.
        const order = pi === 0 && o.shuffleOptions ? shuffle(idx, rand) : idx;
        return { q, parsed, order };
      });
    });
    const key = vparts.map((items, pi) => items.map((it) => {
      if (pi === 0) {
        const k = it.order.findIndex((i) => it.parsed.options[i]?.correct);
        return k >= 0 ? LETTERS[k] : '?';
      }
      if (pi === 1) return it.order.map((i) => (it.parsed.options[i]?.correct ? 'Đ' : 'S')).join('');
      if (pi === 2) return it.parsed.shortAnswer ?? '?';
      return '—';
    }));
    out.push({ code: String(o.firstCode + v), parts: vparts, key });
  }
  return out;
}

export interface ExamInfo { school: string; title: string; minutes: number; grade: number }

const PART_TITLES = [
  'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.',
  'PHẦN II. Câu trắc nghiệm đúng sai.',
  'PHẦN III. Câu trắc nghiệm trả lời ngắn.',
  'PHẦN IV. Tự luận.',
];

export function partTitle(pi: number, from: number, to: number): string {
  const tail = pi === 1 ? ' Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.' : '';
  return `${PART_TITLES[pi]} Thí sinh trả lời từ câu ${from} đến câu ${to}.${tail}`;
}

export function examToTex(info: ExamInfo, variants: Variant[], opts: { withSolution: boolean; withKey: boolean }): string {
  const L: string[] = [];
  L.push('% Đề tạo bởi HEdu. Biên dịch bằng XeLaTeX hoặc pdfLaTeX với gói ex_test.');
  L.push('\\documentclass[12pt,a4paper]{article}');
  L.push('\\usepackage[utf8]{vietnam}');
  L.push('\\usepackage{amsmath,amssymb,tikz,tkz-tab,tikz-3dplot}');
  L.push('\\usepackage[top=1.5cm,bottom=1.5cm,left=2cm,right=1.5cm]{geometry}');
  L.push(opts.withSolution ? '\\usepackage[loigiai]{ex_test}' : '\\usepackage[dethi]{ex_test}');
  L.push('\\begin{document}');
  for (const v of variants) {
    L.push('');
    L.push(`% ===== Mã đề ${v.code} =====`);
    L.push('\\begin{center}');
    L.push(`\\textbf{${info.school || '[TÊN TRƯỜNG]'}}\\\\`);
    L.push(`\\textbf{${info.title.toUpperCase()}}\\\\`);
    L.push(`Môn: Toán ${info.grade} -- Thời gian: ${info.minutes} phút\\\\`);
    L.push(`\\fbox{Mã đề ${v.code}}`);
    L.push('\\end{center}');
    // Theo cấu trúc đề 2025, mỗi phần đánh số câu lại từ 1.
    v.parts.forEach((items, pi) => {
      if (!items.length) return;
      L.push('');
      L.push(`\\noindent\\textbf{${partTitle(pi, 1, items.length)}}`);
      L.push('\\setcounter{ex}{0}');
      for (const it of items) {
        L.push(buildExTest(it.parsed, { id: questionCode(it.q, it.q.level), order: it.order, withSolution: opts.withSolution }));
      }
    });
    L.push('\\newpage');
  }
  if (opts.withKey) {
    L.push('\\section*{Bảng đáp án}');
    for (const v of variants) {
      L.push(`\\noindent\\textbf{Mã đề ${v.code}.} `);
      v.key.forEach((k, pi) => {
        if (!k.length || pi === 3) return;
        L.push(`Phần ${['I', 'II', 'III'][pi]}: ${k.map((x, i) => `${i + 1}.${x}`).join('; ')}.\\\\`);
      });
      L.push('');
    }
  }
  L.push('\\end{document}');
  return L.join('\n');
}

export function chapterName(id: string): string {
  return findChapter(id)?.short ?? id;
}
