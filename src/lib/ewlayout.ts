// Bố cục màn Biên tập đề: hiện/ẩn cây tệp, bề rộng khung PDF, chiều cao khung nhật ký (kéo để đổi), nhớ theo máy.

export interface EwLayout {
  /** cây tệp: null = tự động (chỉ hiện khi đề có từ 2 tệp trở lên) */
  tree: boolean | null;
  /** bề rộng khung PDF, % bề rộng màn */
  pdf: number;
  /** chiều cao khung nhật ký khi mở, px */
  log: number;
}

export const PDF_MIN = 22, PDF_MAX = 70, LOG_MIN = 90, LOG_MAX = 600;
export const DEFAULT_LAYOUT: EwLayout = { tree: null, pdf: 42, log: 200 };
const KEY = 'hedu.ewlayout';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const clampPdf = (p: number) => clamp(Math.round(p * 10) / 10, PDF_MIN, PDF_MAX);
/** chiều cao nhật ký không vượt quá nửa màn để còn chỗ soạn */
export const clampLog = (h: number, viewH = 900) => clamp(Math.round(h), LOG_MIN, Math.min(LOG_MAX, Math.max(LOG_MIN, Math.floor(viewH * 0.55))));

export function parseLayout(raw: string | null): EwLayout {
  try {
    const v = JSON.parse(raw || 'null');
    if (!v || typeof v !== 'object') return DEFAULT_LAYOUT;
    return {
      tree: typeof v.tree === 'boolean' ? v.tree : null,
      pdf: typeof v.pdf === 'number' && Number.isFinite(v.pdf) ? clampPdf(v.pdf) : DEFAULT_LAYOUT.pdf,
      log: typeof v.log === 'number' && Number.isFinite(v.log) ? clamp(Math.round(v.log), LOG_MIN, LOG_MAX) : DEFAULT_LAYOUT.log,
    };
  } catch { return DEFAULT_LAYOUT; }
}
export function loadLayout(): EwLayout { try { return parseLayout(localStorage.getItem(KEY)); } catch { return DEFAULT_LAYOUT; } }
export function saveLayout(l: EwLayout) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* bỏ qua */ } }

/** cây tệp có hiện không */
/** Đề chỉ có 1 tệp thì cây tệp vô ích (trùng với thẻ tệp của trình soạn) nên luôn ẩn, kể cả khi từng bật tay; từ 2 tệp: tự hiện, bật/tắt tay được. */
export const treeShown = (l: EwLayout, fileCount: number) => (fileCount <= 1 ? false : l.tree === null ? true : l.tree);

/** Tệp chính không có \documentclass (chỉ là nội dung đề) — dùng để giải thích lỗi "Missing \begin{document}". */
export const lacksPreamble = (text: string) => !/^[^%\n]*\\documentclass/m.test(text);
