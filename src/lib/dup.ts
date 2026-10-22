// Kiểm tra trùng lặp: so nội dung đề + phương án sau khi chuẩn hoá.
// - Trùng hẳn: giống hệt sau khi bỏ khoảng trắng, chú thích, lời giải.
// - Gần trùng: độ giống (Jaccard trên cụm 3 ký tự) từ 80% trở lên,
//   bắt được câu chỉ đổi vài con số hoặc đổi thứ tự chữ.
import { parseExTest } from './extest';
import type { Question } from './types';

export function normalizeForDup(latex: string): string {
  const p = parseExTest(latex);
  const core = [p.stem, ...p.options.map((o) => o.text).sort(), p.shortAnswer ?? ''].join('|');
  return core
    .toLowerCase()
    .replace(/\\(left|right|displaystyle|dfrac|tfrac)/g, (m) => (m.includes('frac') ? '\\frac' : ''))
    .replace(/\s+/g, '')
    .replace(/[{}]/g, '');
}

function grams(s: string): Set<string> {
  const g = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) g.add(s.slice(i, i + 3));
  return g;
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

const cache = new Map<string, string>();

export interface DupHit { question: Question; score: number }

export function findDuplicates(latex: string, bank: Question[], excludeUid?: string, threshold = 0.8): DupHit[] {
  const n = normalizeForDup(latex);
  if (n.replace(/\|/g, '').length < 12) return [];
  const hits: DupHit[] = [];
  for (const q of bank) {
    if (q.uid === excludeUid) continue;
    let m = cache.get(q.latex);
    if (m === undefined) { m = normalizeForDup(q.latex); cache.set(q.latex, m); }
    const score = similarity(n, m);
    if (score >= threshold) hits.push({ question: q, score });
  }
  return hits.sort((x, y) => y.score - x.score);
}
