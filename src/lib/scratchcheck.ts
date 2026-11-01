// Màn "Xử lí TeX": soát nội dung từng câu của bàn nháp bằng đúng bộ kiểm của màn Nhập liệu (check.checkQuestion):
// công thức KaTeX dịch không được, ngoặc/môi trường lệch, thiếu \True, thiếu lời giải, hình TikZ… CHỈ BÁO, không tự sửa.
import { checkQuestion, worstLevel, type Issue, type IssueLevel } from './check';
import { parseExTest } from './extest';

export interface CheckRun { complete: boolean; issues: Map<number, Issue[]>; /** văn bản từng câu lúc soát (câu đã sửa sau đó thì kết quả không còn áp dụng) */ snap: Map<number, string> }

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Soát các khối (n, text, line0 = dòng đầu khối, từ 1). Chạy từng đợt nhỏ để giao diện không đứng; `signal.aborted` ⇒ dừng, complete=false. */
export async function checkScratchBlocks(blocks: readonly { n: number; text: string; line0: number }[], opt: { signal?: { aborted: boolean }; onProgress?: (done: number, total: number) => void; chunk?: number } = {}): Promise<CheckRun> {
  const issues = new Map<number, Issue[]>();
  const snap = new Map<number, string>();
  const chunk = opt.chunk ?? 25;
  for (let i = 0; i < blocks.length; i++) {
    if (opt.signal?.aborted) return { complete: false, issues, snap };
    const b = blocks[i];
    snap.set(b.n, b.text);
    const list = checkQuestion(parseExTest(b.text), b.text, b.line0 - 1);
    if (list.length) issues.set(b.n, list);
    if ((i + 1) % chunk === 0) { opt.onProgress?.(i + 1, blocks.length); await tick(); }
  }
  opt.onProgress?.(blocks.length, blocks.length);
  return { complete: true, issues, snap };
}

/** Câu "cần xem": có lỗi hoặc cảnh báo (không tính ghi chú). */
export const needsLook = (list: readonly Issue[] | undefined): boolean => { const w = list ? worstLevel([...list]) : null; return w === 'loi' || w === 'canh'; };
export const worstOf = (list: readonly Issue[] | undefined): IssueLevel | null => (list && list.length ? worstLevel([...list]) : null);
