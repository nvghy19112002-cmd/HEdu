// Màn "Xử lí TeX": báo câu của bàn nháp có thể trùng câu trong ngân hàng (hoặc trùng nhau trong bàn nháp) TRƯỚC khi đưa vào ngân hàng.
// CHỈ ĐỌC: dùng đúng bộ so trùng của màn Nhập liệu (dupimport.analyzeDrafts); không đưa bàn nháp vào chỉ mục dùng chung, không sửa câu nào.
import { analyzeDrafts, BLOCKING } from './dupimport';
import type { QLike } from './dupindex';
import type { DupKind } from './dup2';

export interface DupMark { kind: DupKind; with: 'bank' | 'batch'; /** uid câu trong ngân hàng, hoặc số thứ tự câu trong bàn nháp */ other: string; score: number }
export interface DupRun { complete: boolean; marks: Map<number, DupMark[]>; /** văn bản từng câu lúc kiểm: câu đã sửa sau đó thì kết quả không còn áp dụng */ snap: Map<number, string> }

const id = (n: number) => `b${n}`;
const num = (s: string) => Number(s.slice(1));

export async function checkScratchDup(blocks: readonly { n: number; text: string }[], bank: QLike[], opt: { signal?: { aborted: boolean }; onProgress?: (frac: number, phase: string) => void } = {}): Promise<DupRun> {
  const marks = new Map<number, DupMark[]>();
  const snap = new Map<number, string>(blocks.map((b) => [b.n, b.text]));
  const r = await analyzeDrafts(blocks.map((b) => ({ id: id(b.n), latex: b.text })), bank, {
    signal: opt.signal,
    onProgress: (done, total, phase) => opt.onProgress?.(total ? done / total : 0, phase === 'bank' ? 'Đang đọc ngân hàng' : 'Đang so với ngân hàng và trong bàn nháp'),
  });
  if (!r.complete) return { complete: false, marks, snap };
  for (const row of r.rows) {
    if (!row) continue;
    const hs = row.hits.filter((h) => BLOCKING.includes(h.kind)).map<DupMark>((h) => ({ kind: h.kind, with: h.with, other: h.with === 'batch' ? String(num(h.other)) : h.other, score: h.result.score }));
    if (hs.length) marks.set(num(row.id), hs);
  }
  return { complete: true, marks, snap };
}
