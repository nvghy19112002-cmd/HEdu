// Nét thẳng ngang/dọc (lưới, trục số, khung) của hình SVG do dvisvgm tạo thường chỉ dày ~0,4pt.
// Khi hiển thị, bề dày đó nhỏ hơn 1 điểm ảnh và nằm lệch nửa điểm ảnh, nên có nét đậm nét nhạt khác nhau
// (ví dụ lưới 2×7 ở câu 0D0V2-3). Cách xử lý chung, áp cho MỌI hình, không chỉnh tay từng hình:
//   chỉ với nét THẲNG NGANG/DỌC (không tô nền): bề dày tối thiểu 1 điểm ảnh thật của màn hình + `crispEdges`
//   để nét rơi đúng vào lưới điểm ảnh. Nét chéo, nét cong, hình tô nền KHÔNG bị đổi; mã nguồn không đổi.

const CMD = /([MmHhVvLlZz])([^MmHhVvLlZzCcSsQqTtAa]*)/g;
const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi;

/** `d` chỉ gồm các đoạn thẳng ngang/dọc (M H V L Z, tuyệt đối hoặc tương đối). */
export function isAxisAligned(d: string): boolean {
  if (/[CcSsQqTtAa]/.test(d)) return false;
  let x = 0, y = 0, sx = 0, sy = 0, any = false;
  CMD.lastIndex = 0;
  let m: RegExpExecArray | null;
  const EPS = 1e-4;
  while ((m = CMD.exec(d))) {
    const c = m[1];
    const n = (m[2].match(NUM) ?? []).map(Number);
    const rel = c === c.toLowerCase();
    const C = c.toUpperCase();
    if (C === 'Z') { x = sx; y = sy; continue; }
    if (C === 'H') { for (const v of n) { x = rel ? x + v : v; } any = true; continue; }
    if (C === 'V') { for (const v of n) { y = rel ? y + v : v; } any = true; continue; }
    for (let i = 0; i + 1 < n.length; i += 2) {
      const nx = rel ? x + n[i] : n[i];
      const ny = rel ? y + n[i + 1] : n[i + 1];
      if (C === 'M') {
        if (i === 0) { sx = nx; sy = ny; } else if (Math.abs(nx - x) > EPS && Math.abs(ny - y) > EPS) return false; // M thêm điểm = L
      } else if (Math.abs(nx - x) > EPS && Math.abs(ny - y) > EPS) return false;
      x = nx; y = ny; any = true;
    }
  }
  return any;
}

/** Nhóm cha có xoay/nghiêng thì nét ngang/dọc trong hệ toạ độ hình không còn ngang/dọc trên màn hình. */
function rotated(el: Element): boolean {
  for (let e: Element | null = el; e && e.tagName.toLowerCase() !== 'svg'; e = e.parentElement) {
    const t = e.getAttribute('transform');
    if (!t) continue;
    if (/rotate|skew/i.test(t)) return true;
    const mm = /matrix\(([^)]*)\)/i.exec(t);
    if (mm) { const v = (mm[1].match(NUM) ?? []).map(Number); if (Math.abs(v[1] ?? 0) > 1e-6 || Math.abs(v[2] ?? 0) > 1e-6) return true; }
  }
  return false;
}

/** Điểm ảnh thật của màn hình trên MỘT đơn vị toạ độ của SVG (đã tính cỡ hiển thị và zoom). */
function deviceScale(svg: SVGSVGElement): number {
  const vb = svg.viewBox?.baseVal;
  const w = svg.getBoundingClientRect().width;
  if (!vb || !vb.width || !w) return 0;
  return (w / vb.width) * (window.devicePixelRatio || 1);
}

/** Áp dụng cho mọi <svg> trong `root`. Chạy lại được nhiều lần (đổi cỡ, đổi zoom): luôn tính từ bề dày gốc. */
export function crispStrokes(root: Element): number {
  let n = 0;
  for (const svg of Array.from(root.querySelectorAll('svg'))) {
    const k = deviceScale(svg as SVGSVGElement);
    if (!k) continue;
    for (const p of Array.from(svg.querySelectorAll('path'))) {
      const el = p as SVGPathElement;
      let ok = el.dataset.crisp;
      if (ok === undefined) {
        const cs = getComputedStyle(el);
        const stroked = cs.stroke !== 'none' && cs.stroke !== '' && parseFloat(cs.strokeWidth) > 0;
        const unfilled = cs.fill === 'none';
        ok = stroked && unfilled && !rotated(el) && isAxisAligned(el.getAttribute('d') ?? '') ? '1' : '0';
        el.dataset.crisp = ok;
        if (ok === '1') el.dataset.sw = String(parseFloat(cs.strokeWidth));
      }
      if (ok !== '1') continue;
      const w0 = Number(el.dataset.sw);
      el.setAttribute('shape-rendering', 'crispEdges');
      el.style.strokeWidth = String(Math.max(w0, 1.05 / k));
      n++;
    }
  }
  return n;
}
