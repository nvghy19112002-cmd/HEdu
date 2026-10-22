// SVG do dvisvgm đặt id như clip1, clip2… (clipPath, pattern, marker). Khi nhiều hình được nhúng
// thẳng vào cùng một trang, các id trùng nhau và trình duyệt gắn url(#clip1) vào phần tử ĐẦU TIÊN
// của trang — hình sau bị cắt/tô sai theo hình trước. Thêm tiền tố riêng cho mỗi hình để tránh.
let seq = 0;
export const nextSvgPrefix = (): string => `f${++seq}-`;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function scopeSvgIds(svg: string, prefix: string): string {
  const ids = new Set<string>();
  for (const m of svg.matchAll(/\sid\s*=\s*(["'])([^"']+)\1/g)) ids.add(m[2]);
  if (!ids.size) return svg;
  let out = svg.replace(/(\sid\s*=\s*)(["'])([^"']+)\2/g, (_m, a, q, id) => `${a}${q}${prefix}${id}${q}`);
  // url(#id) trong thuộc tính và trong <style>
  out = out.replace(/url\(\s*(["']?)#([^)"'\s]+)\1\s*\)/g, (m, q, id) => (ids.has(id) ? `url(${q}#${prefix}${id}${q})` : m));
  // href="#id" / xlink:href="#id"
  out = out.replace(/((?:xlink:)?href\s*=\s*)(["'])#([^"']+)\2/g, (m, a, q, id) => (ids.has(id) ? `${a}${q}#${prefix}${id}${q}` : m));
  // bộ chọn #id trong <style>
  out = out.replace(/<style[\s\S]*?<\/style>/g, (blk) => {
    let b = blk;
    for (const id of ids) b = b.replace(new RegExp(`#${esc(id)}(?![\\w-])`, 'g'), `#${prefix}${id}`);
    return b;
  });
  return out;
}
