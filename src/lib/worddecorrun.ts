// Word giống mẫu in (phần chạy trong app): dịch tài liệu "trang trí" bằng mẫu HyMath đang dùng, vẽ từng trang bằng pdf.js,
// cắt sát nét vẽ thành ảnh PNG 300 dpi rồi giao cho bước xuất Word (examword.rs áp màu, lề, đầu/chân trang).
import { invoke } from './platform';
import { getSettings } from './tikz';
import { WRAP_MAIN, wrapFiles, type WrapInfo } from './examwrap';
import { decorBody, findParts, findTitle, inkBox, themeAccent, type Box } from './worddecor';
import { loadLib } from '../components/PdfViewer';

const DPI = 300;
const PX_MM = DPI / 25.4;
const cm = (px: number) => Math.round((px / DPI) * 2.54 * 1000) / 1000;
const DECOR_NAME = 'hedu-trangtri.tex';

export interface DecorImgIn { name: string; w: number; h: number }
export interface Decor {
  figures: { name: string; b64: string }[];
  theme: { accent: string; code: string; titleW: number | null; partsW: number[]; head: DecorImgIn | null; foot: DecorImgIn | null };
}

function crop(src: HTMLCanvasElement, b: Box): string {
  const c = document.createElement('canvas');
  c.width = b.w; c.height = b.h;
  c.getContext('2d')!.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  return c.toDataURL('image/png').split(',')[1];
}

/** Thêm vài điểm ảnh lề quanh nét vẽ (bóng mờ, viền khử răng cưa) nhưng không vượt khung trang. */
const pad = (b: Box, W: number, H: number, p = 4): Box => {
  const x = Math.max(0, b.x - p), y = Math.max(0, b.y - p);
  return { x, y, w: Math.min(W, b.x + b.w + p) - x, h: Math.min(H, b.y + b.h + p) - y };
};

/** Dựng ảnh trang trí cho tệp đề `text` theo mẫu `themeId`. Ném lỗi tiếng Việt nếu không dịch được. */
export async function buildDecor(text: string, themeId: string, print: boolean, info: WrapInfo): Promise<Decor> {
  const title = findTitle(text);
  const parts = findParts(text);
  const body = decorBody(title, parts);
  const w = wrapFiles(DECOR_NAME, body, themeId, print ? 'de-in' : 'de', info);
  if (!w || !w.engine) throw new Error('Mẫu in đang chọn không phải mẫu HyMath nên không dựng được Word theo mẫu.');
  const files = [...w.files, { path: DECOR_NAME, text: body }];
  const texBin = getSettings().texBin.trim() || null;
  const buf = await invoke<ArrayBuffer>('word_decor_pdf', { files, main: WRAP_MAIN, texBin, engine: w.engine });
  const lib = await loadLib();
  const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useWorkerFetch: false, verbosity: 0 }).promise;
  const figures: Decor['figures'] = [];
  const theme: Decor['theme'] = { accent: themeAccent(themeId, print), code: title?.code ?? '', titleW: null, partsW: [], head: null, foot: null };
  try {
    const want = (title ? 1 : 0) + parts.length + 1;
    if (doc.numPages < want) throw new Error(`Phần trang trí của mẫu ra ${doc.numPages} trang, cần ${want}.`);
    for (let n = 1; n <= want; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: DPI / 72 });
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const g = cv.getContext('2d', { willReadFrequently: true })!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      const px = g.getImageData(0, 0, cv.width, cv.height).data;
      const W = cv.width, H = cv.height;
      if (n < want) {
        const b = inkBox(px, W, 0, H);
        if (!b) throw new Error(`Trang trang trí ${n} của mẫu bị trống.`);
        const bb = pad(b, W, H);
        const isTitle = title && n === 1;
        const name = isTitle ? 'decor-title.png' : `decor-part-${n - (title ? 1 : 0)}.png`;
        figures.push({ name, b64: crop(cv, bb) });
        if (isTitle) theme.titleW = cm(bb.w); else theme.partsW.push(cm(bb.w));
      } else {
        // trang cuối: chỉ có phần trái của đầu trang (trong 24 mm trên) và chân trang (trong 22 mm dưới)
        const hb = inkBox(px, W, 0, Math.round(24 * PX_MM));
        const fb = inkBox(px, W, H - Math.round(22 * PX_MM), H);
        if (hb) { const bb = pad(hb, W, H, 2); figures.push({ name: 'decor-head.png', b64: crop(cv, bb) }); theme.head = { name: 'decor-head.png', w: cm(bb.w), h: cm(bb.h) }; }
        if (fb) { const bb = pad(fb, W, H, 2); figures.push({ name: 'decor-foot.png', b64: crop(cv, bb) }); theme.foot = { name: 'decor-foot.png', w: cm(bb.w), h: cm(bb.h) }; }
      }
    }
  } finally { void doc.destroy(); }
  return { figures, theme };
}
