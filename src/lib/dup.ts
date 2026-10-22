// Cầu nối cho Nhập liệu / Trình sửa câu. Bộ so sánh thật nằm ở dup2.ts.
// normalizeForDup + similarity là bộ dò CŨ, chỉ còn giữ để đối chiếu trong test (không dùng trong app).
// - Trùng hẳn: giống hệt sau khi bỏ khoảng trắng, chú thích, lời giải.
// - Gần trùng: độ giống (Jaccard trên cụm 3 ký tự) từ 80% trở lên,
//   bắt được câu chỉ đổi vài con số hoặc đổi thứ tự chữ.
import { parseExTest } from './extest';
import type { Question } from './types';
import { comparePair, fingerprint, type DupKind } from './dup2';

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

export interface DupHit { question: Question; score: number; kind: DupKind; reasons: string[] }

/**
 * Giữ nguyên chữ ký cũ cho Nhập liệu và Trình sửa câu, nhưng so sánh bằng bộ dò mới (dup2).
 * score === 1 CHỈ khi hai câu giống nguyên mã hoặc cùng câu (đề, phương án, hình, đáp án đều khớp).
 * Mâu thuẫn đáp án / cùng mẫu khác dữ kiện luôn < 1 nên không bao giờ bị coi là “trùng hẳn”.
 */
export function findDuplicates(latex: string, bank: Question[], excludeUid?: string, threshold = 0.8): DupHit[] {
  const a = fingerprint(latex);
  if (a.loose.size < 3) return [];
  const hits: DupHit[] = [];
  for (const q of bank) {
    if (q.uid === excludeUid) continue;
    const r = comparePair(a, fingerprint(q.latex));
    if (r.kind === 'unrelated' || r.kind === 'insufficient') continue;
    const sure = r.kind === 'raw' || r.kind === 'same';
    const score = sure ? 1 : Math.min(r.score, 0.99);
    if (score >= threshold || r.kind === 'conflict') hits.push({ question: q, score, kind: r.kind, reasons: r.reasons });
  }
  return hits.sort((x, y) => y.score - x.score);
}
