// “Xem chuẩn”: biên dịch NGUYÊN câu hỏi bằng TeX Live với đúng đầu file (ex_test, shared-content…).
// Khác bản xem nhanh (HEdu tự dựng gần đúng bằng KaTeX), kết quả ở đây là chữ và hình do chính TeX dịch,
// nên macro, \def, \newcommand có tham số, tdplot, tkz-tab… đều nằm đúng phạm vi như khi in thật.
// Không đổi cấu trúc dữ liệu: đầu file lấy từ cài đặt Hệ thống, không lưu theo từng câu.
import { classifyTexLog } from './texcheck';
import { asTikzErr, defaultPreamble, getSettings, isTikzReady, type TikzErr, type TikzOut } from './tikz';
import { invoke } from './platform';

export type Category = 'thieu-texlive' | 'thieu-goi' | 'thieu-lenh' | 'loi-ma' | 'loi-svg' | 'qua-gio' | 'khac';

export interface Failure {
  category: Category;
  /** tên ngắn, hiện cho người dùng */
  label: string;
  /** giải thích dễ hiểu */
  detail: string;
  /** câu của TeX/HEdu, và phần cuối file log */
  message: string;
  log: string;
}

/** Bật “[loigiai]” cho gói ex_test để TeX in đáp án đúng và lời giải. Không đụng gì nếu đầu file không có ex_test. */
export function withSolution(preamble: string): string {
  return preamble.replace(/\\usepackage(?:\[([^\]]*)\])?\{ex_test\}/, (_m, opts?: string) => {
    const list = (opts ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.includes('loigiai')) list.push('loigiai');
    return `\\usepackage[${list.join(',')}]{ex_test}`;
  });
}

/** Phân loại lỗi theo năm nhóm: thiếu gói/tệp, thiếu lệnh/macro, lỗi mã, lỗi SVG, quá giờ (và chưa có TeX Live). */
export function categorize(err: TikzErr): Failure {
  const base = { message: err.message, log: err.log };
  if (err.stage === 'thieu-texlive') return { ...base, category: 'thieu-texlive', label: 'Chưa có TeX Live', detail: 'Máy chưa có TeX Live hoặc HEdu chưa tìm thấy. Chọn thư mục bin ở mục Hệ thống.' };
  if (err.stage === 'qua-lau') return { ...base, category: 'qua-gio', label: 'Dịch quá lâu', detail: 'TeX chạy quá thời gian cho phép nên đã dừng. Câu có thể quá nặng, hoặc đang chờ nhập gì đó. Tăng giờ chót ở mục Hệ thống nếu cần.' };
  if (err.stage === 'svg') return { ...base, category: 'loi-svg', label: 'Dịch được, chuyển SVG lỗi', detail: 'TeX đã dịch xong nhưng bước đổi sang ảnh (dvisvgm) lỗi. Xem log.' };
  const info = classifyTexLog(err.message, err.log);
  if (info.kind === 'thieu-goi' || info.kind === 'thieu-tep') return { ...base, category: 'thieu-goi', label: info.label, detail: info.detail };
  if (info.kind === 'cu-phap' && info.command) return { ...base, category: 'thieu-lenh', label: 'Thiếu lệnh hoặc macro', detail: info.detail };
  if (info.kind === 'khac') return { ...base, category: 'khac', label: info.label, detail: err.message };
  return { ...base, category: 'loi-ma', label: info.label, detail: info.detail };
}

export type Result = { ok: true; svg: string; cached: boolean; ms: number } | { ok: false; fail: Failure };

export const CATEGORY_ORDER: Category[] = ['thieu-goi', 'thieu-lenh', 'loi-ma', 'loi-svg', 'qua-gio', 'thieu-texlive', 'khac'];

const memo = new Map<string, Promise<Result>>();
export const forgetCompiled = () => memo.clear();

async function opts(solution: boolean) {
  const s = getSettings();
  let pre: string | null = s.preamble.trim() || null;
  if (solution) {
    const text = pre ?? (await defaultPreamble());
    pre = withSolution(text);
  }
  return { preamble: pre, engine: s.engine, timeoutSecs: s.timeoutSecs, texBin: s.texBin.trim() || null };
}

/**
 * Biên dịch nguyên một câu (\begin{ex}…\end{ex}). Không bao giờ ném lỗi: lỗi trả về dạng `Result`
 * để một câu hỏng không làm hỏng cả đợt. `keep=false` thì không nhớ SVG trong bộ nhớ (dùng khi chạy hàng trăm câu).
 */
export function compileQuestion(latex: string, solution: boolean, keep = true): Promise<Result> {
  if (!isTikzReady()) {
    return Promise.resolve({ ok: false, fail: { category: 'thieu-texlive', label: 'Chỉ có ở bản cài Windows', detail: 'Biên dịch bằng TeX Live chỉ chạy trong bản cài trên máy.', message: '', log: '' } });
  }
  const k = `${solution ? 1 : 0}|${latex}`;
  if (keep) {
    const hit = memo.get(k);
    if (hit) return hit;
  }
  const p: Promise<Result> = (async (): Promise<Result> => {
    try {
      const o = await invoke<TikzOut>('tikz_render', { code: latex, defs: '', opts: await opts(solution) });
      return { ok: true, svg: keep ? o.svg : '', cached: o.cached, ms: o.ms };
    } catch (e) {
      return { ok: false, fail: categorize(asTikzErr(e)) };
    }
  })();
  if (keep) {
    memo.set(k, p);
    void p.then((r) => { if (!r.ok) memo.delete(k); });
  }
  return p;
}

export interface BatchProgress { done: number; total: number; ok: number; failed: number; byCategory: Partial<Record<Category, number>> }

/**
 * Biên dịch từng câu với tối đa `parallel` câu cùng lúc (phía Rust còn giới hạn 3). Có thể dừng giữa chừng.
 * Một câu lỗi không chặn các câu sau. `onEach` được gọi ngay khi từng câu xong.
 */
export async function compileBatch(
  items: string[],
  solution: boolean,
  hooks: { onEach: (i: number, r: Result) => void; signal: { stop: boolean }; parallel?: number },
): Promise<void> {
  let next = 0;
  const worker = async () => {
    for (;;) {
      if (hooks.signal.stop) return;
      const i = next++;
      if (i >= items.length) return;
      const r = await compileQuestion(items[i], solution, false);
      hooks.onEach(i, r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(hooks.parallel ?? 3, items.length) }, worker));
}
