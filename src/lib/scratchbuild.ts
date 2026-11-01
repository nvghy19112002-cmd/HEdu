// Màn "Xử lí TeX" — Đợt 1b: ghép tệp để biên dịch bàn nháp (claude/de-xuat-man-xu-li-tex.md mục 10.2).
//   main.tex     = khai báo đề của HEdu (\input{khaibaochung} → hedu.sty …) + \input{content}
//   content.tex  = NGUYÊN VĂN nội dung khung soạn ⇒ lỗi "content.tex:N" là đúng dòng N của khung soạn, không phải cộng/trừ.
// Hàm thuần, có kiểm thử; việc ghi tệp + chạy TeX ở Rust (texscratch.rs), tên tệp cố định.
import type { Diag } from './examcompile';
import { goiThemTex, HEDU_STY, KHAIBAOCHUNG_THIN } from './hedusty';
import { addToGoiThem } from './missingpkg';
import { collectNeedsRaw } from './texproject';
import { KHAIBAOCHUNG_TEX } from './texproject.template';
import { blockAtLine, type ScratchScan } from './texscratch';

export const SCRATCH_MAIN = `\\documentclass[12pt,a4paper,twoside]{book}
\\input{khaibaochung}
\\begin{document}
\\input{content}
\\end{document}
`;

export interface ScratchFile { path: string; text: string }

/** Bộ tệp gửi Rust. `extraPkgs` = gói giáo viên đã bấm "Thêm" khi biên dịch báo thiếu (chỉ của bàn nháp). */
export function scratchFiles(content: string, sharedContent: string, extraPkgs: readonly string[] = []): ScratchFile[] {
  let goithem = goiThemTex(collectNeedsRaw([content], sharedContent));
  if (extraPkgs.length) goithem = addToGoiThem(goithem, extraPkgs).text;
  return [
    { path: 'main.tex', text: SCRATCH_MAIN },
    { path: 'khaibaochung.tex', text: KHAIBAOCHUNG_THIN },
    { path: 'hedu.sty', text: HEDU_STY },
    { path: 'hedu-khaibao.tex', text: KHAIBAOCHUNG_TEX },
    { path: 'hedu-goithem.tex', text: goithem },
    { path: 'content.tex', text: content },
  ];
}

/** Nơi một lỗi/cảnh báo nằm: trong nội dung (có dòng, có câu nếu dòng thuộc một khối) hay ở khai báo / không rõ. */
export type DiagWhere = { kind: 'noi-dung'; line: number; block: number | null } | { kind: 'khai-bao'; file: string; line: number | null } | { kind: 'khong-ro' };

export function whereOf(d: Diag, scan: ScratchScan): DiagWhere {
  const f = (d.file ?? '').replace(/^\.\//, '');
  if (f === 'content.tex' && d.line != null && d.line > 0) return { kind: 'noi-dung', line: d.line, block: blockAtLine(scan, d.line)?.n ?? null };
  if (f) return { kind: 'khai-bao', file: f, line: d.line };
  return { kind: 'khong-ro' };
}

export function whereLabel(w: DiagWhere): string {
  if (w.kind === 'noi-dung') return `${w.block != null ? `Câu ${w.block} · ` : ''}dòng ${w.line}`;
  if (w.kind === 'khai-bao') return `Khai báo (${w.file}${w.line != null ? `, dòng ${w.line}` : ''})`;
  return 'Không rõ vị trí';
}

/** Đoạn báo lỗi để giáo viên dán gửi Claude: loại lỗi + vị trí + vài dòng mã quanh đó. Không chứa đường dẫn trên máy. */
export function errorReport(ds: readonly Diag[], scan: ScratchScan, content: string, max = 5): string {
  const lines = content.split('\n');
  const out: string[] = ['Báo lỗi biên dịch (HEdu · Xử lí TeX)'];
  for (const d of ds.filter((x) => x.severity === 'error').slice(0, max)) {
    const w = whereOf(d, scan);
    out.push('', `- ${whereLabel(w)}: ${d.message}`);
    if (w.kind === 'noi-dung') {
      const a = Math.max(1, w.line - 2), b = Math.min(lines.length, w.line + 2);
      for (let k = a; k <= b; k++) out.push(`  ${k === w.line ? '>' : ' '} ${k} | ${lines[k - 1]}`);
    }
  }
  return out.join('\n');
}
