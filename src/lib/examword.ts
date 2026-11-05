// Xuất một mã đề ra Word (.docx) qua Pandoc (xem src-tauri/src/examword.rs): đọc de-<mã>.tex, dịch hình TikZ ra PNG, gửi sang Rust.
import { invoke } from './platform';
import { fileRead } from './examfiles';
import { renderTikz } from './tikz';
import { fillWidths, prepareBody, strangeCommands } from './wordfig';

export interface WordOpts { solution: boolean; mark: boolean }
export interface WordOut { path: string; bytes: number; warnings: string[] }
export interface PandocInfo { found: boolean; path: string; version: string }

export const pandocInfo = () => invoke<PandocInfo>('exam_word_info');

/** SVG (từ dvisvgm) → PNG 300 dpi trên nền trắng; trả base64 và chiều rộng thật (cm). */
export async function svgToPng(svg: string): Promise<{ b64: string; wcm: number }> {
  const w = /<svg[^>]*\swidth="([\d.]+)(pt|px)?"/.exec(svg);
  const h = /<svg[^>]*\sheight="([\d.]+)(pt|px)?"/.exec(svg);
  const vb = /viewBox="([\d.\-\s]+)"/.exec(svg)?.[1].trim().split(/\s+/).map(Number);
  const toPt = (v: string | undefined, unit: string | undefined, fb: number) => (v ? Number(v) * (unit === 'px' ? 0.75 : 1) : fb);
  const wpt = toPt(w?.[1], w?.[2], vb?.[2] ?? 200);
  const hpt = toPt(h?.[1], h?.[2], vb?.[3] ?? 150);
  const k = 300 / 72;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(wpt * k)); c.height = Math.max(1, Math.round(hpt * k));
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return { b64: c.toDataURL('image/png').split(',')[1], wcm: (wpt / 72) * 2.54 };
  } finally { URL.revokeObjectURL(url); }
}

/** Xuất một mã đề; `onFigure` báo tiến độ dịch hình. Ném lỗi (tiếng Việt) nếu không xuất được. */
export async function exportWordCode(id: string, code: string, opts: WordOpts, destDir: string, onFigure?: (i: number, n: number) => void): Promise<WordOut> {
  const tex = await fileRead(id, `de-${code}.tex`);
  const { body, figs } = prepareBody(tex.text);
  const pics: { name: string; b64: string }[] = [];
  const widths: number[] = [];
  for (let i = 0; i < figs.length; i++) {
    onFigure?.(i + 1, figs.length);
    let r;
    try { r = await renderTikz(figs[i].code); } catch (e) { throw new Error(`Không dịch được hình ${i + 1}/${figs.length} của mã ${code}: ${(e as { message?: string }).message ?? String(e)}`); }
    const p = await svgToPng(r.svg);
    pics.push({ name: figs[i].name, b64: p.b64 });
    widths.push(p.wcm);
  }
  const out = await invoke<WordOut>('exam_word_export', { id, input: { code, destDir, solution: opts.solution, mark: opts.mark, body: fillWidths(body, widths), figures: pics } });
  return { ...out, warnings: [...new Set([...out.warnings, ...strangeCommands(body).map((c) => `\\${c}`)])] };
}
