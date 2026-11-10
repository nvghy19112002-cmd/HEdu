// Chỉ dùng cho test: đếm câu từng phần giống Rust `examexport::part_blocks` (theo \caulc/\cauds/\caukq/\cautl).
export function part_blocks_like(tex: string): number[] {
  const marks = ['\\caulc', '\\cauds', '\\caukq', '\\cautl'];
  const pos = marks.map((m, i) => ({ at: tex.search(new RegExp(m.replace(/\\/g, '\\\\') + '(?![A-Za-z])')), i })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at);
  const out = [0, 0, 0, 0];
  pos.forEach((p, n) => {
    const end = n + 1 < pos.length ? pos[n + 1].at : tex.length;
    out[p.i] = (tex.slice(p.at, end).match(/^\s*\\begin\{ex\}/gm) ?? []).length;
  });
  return out;
}
