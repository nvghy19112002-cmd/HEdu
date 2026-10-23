// Xuất .tex theo 2 kiểu:
//  1) "Chỉ file câu hỏi": mã LaTeX NGUYÊN VĂN của từng câu, không thêm khai báo, không sửa ID.
//  2) "Thư mục biên dịch được": main.tex + khaibaochung.tex + cauhoi.tex (nguyên văn) + gói .sty đi kèm + CAN-CO-GI.md.
// File này chỉ SINH NỘI DUNG (hàm thuần, có test). Việc ghi ra đĩa do app Windows (Rust) làm.
import type { Question } from './types';
import { extractDecls, evidenceOf, fileOf, type DeclKind } from './packages';
import { KHAIBAOCHUNG_TEX } from './texproject.template';

/** Tệp đi kèm do app Windows chép vào thư mục (khớp danh sách nhúng trong src-tauri/src/support.rs). */
export const BUNDLED_FILES = ['ex_test.sty', 'ex_tkz-euclide.sty', 'tkz-linknodes.sty', 'tkz-tab-vn.sty', 'twemojis.sty', 'shared-content.tex'] as const;

export interface ProjectFile { path: string; text: string }

/** Kiểu 1: nguyên văn từng câu, cách nhau đúng một dòng trống. Không tiêu đề, không sửa gì. */
export function verbatimTex(qs: readonly Question[]): string {
  return qs.map((q) => q.latex).join('\n\n') + '\n';
}

export const MAIN_TEX = `\\documentclass[12pt,a4paper,twoside]{book}
\\input{khaibaochung}
%\\anloigiai
\\begin{document}
\\input{cauhoi}
\\end{document}
`;

/** Tên thư mục an toàn trên Windows: bỏ ký tự cấm, dấu cách thừa, dấu chấm cuối; rỗng thì dùng tên mặc định. */
export function safeFolderName(raw: string, fallback = 'bo-de-hedu'): string {
  const s = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (!s || s === '..') return fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(s)) return fallback;
  return s.slice(0, 80);
}

const BASE = new Set(['article', 'book', 'report', 'amsmath', 'amssymb', 'graphicx', 'xcolor']);

export interface Need { kind: DeclKind; name: string; file: string; bundled: boolean; from: 'khai-bao' | 'cau-hoi' | 'suy-ra'; why?: string }

/** Gom mọi gói/thư viện bộ đề cần: từ khai báo chung, từ chính các câu hỏi, và gói suy ra từ lệnh. */
export function collectNeeds(qs: readonly Question[], sharedContent: string): Need[] {
  const out = new Map<string, Need>();
  const bundled = new Set<string>(BUNDLED_FILES);
  const add = (kind: DeclKind, name: string, from: Need['from'], why?: string) => {
    const key = kind + ':' + name;
    if (out.has(key)) return;
    const file = fileOf(kind, name);
    out.set(key, { kind, name, file, bundled: bundled.has(file), from, ...(why ? { why } : {}) });
  };
  for (const d of extractDecls(KHAIBAOCHUNG_TEX)) if (d.kind !== 'input') add(d.kind, d.name, 'khai-bao');
  for (const d of extractDecls(sharedContent)) if (d.kind !== 'input') add(d.kind, d.name, 'khai-bao');
  for (const q of qs) for (const d of extractDecls(q.latex)) if (d.kind !== 'input') add(d.kind, d.name, 'cau-hoi');
  for (const q of qs) for (const e of evidenceOf(q.latex)) add('package', e.pkg, 'suy-ra', e.why);
  return [...out.values()];
}

/** Tên gói khi cài bằng tlmgr (nhiều tệp .sty nằm chung một gói). Không có trong bảng thì tên gói = tên tệp. */
const TLMGR: Record<string, string> = {
  tikz: 'pgf', 'zref-lastpage': 'zref', 'zref-user': 'zref', titletoc: 'titlesec', mathpazo: 'psnfss',
  enumerate: 'tools', xparse: 'l3packages', pifont: 'psnfss', fontawesome: 'fontawesome', 'tikz-3dplot': 'tikz-3dplot',
};
export const tlmgrName = (n: string) => TLMGR[n] ?? n;

const PKG_NOTE: Record<string, string> = {
  'tkz-tab': 'bảng biến thiên tkzTab',
  'tikz-3dplot': 'hình không gian 3D',
};

export function requirementsMd(qs: readonly Question[], sharedContent: string, folder: string): string {
  const needs = collectNeeds(qs, sharedContent);
  const ctan = needs.filter((n) => !n.bundled && (n.kind === 'package' || n.kind === 'class') && !BASE.has(n.name));
  const libs = needs.filter((n) => !n.bundled && (n.kind === 'tikzlib' || n.kind === 'pgfplotslib'));
  const bundled = needs.filter((n) => n.bundled);
  const extra = needs.filter((n) => n.from !== 'khai-bao' && !n.bundled);
  const L: string[] = [];
  L.push(`# Cần gì để biên dịch thư mục "${folder}"`, '');
  L.push(`Bộ này có ${qs.length} câu hỏi (file \`cauhoi.tex\`, chép nguyên văn từ ngân hàng HEdu).`, '');
  L.push('## Cách biên dịch', '');
  L.push('1. Cài TeX Live (hoặc MiKTeX) đầy đủ.', '2. Mở thư mục này, biên dịch file `main.tex` bằng **pdfLaTeX**: `pdflatex main.tex`.', '3. Chạy **2 lần** để số trang và tham chiếu đúng.', '4. Muốn in cả lời giải: bỏ dấu `%` trước `\\anloigiai` trong `main.tex`; muốn đề thuần: đổi `[loigiai]` thành `[dethi]` trong `khaibaochung.tex`.', '');
  L.push('## Các file trong thư mục', '');
  L.push('- `main.tex` — file gốc để biên dịch.', '- `khaibaochung.tex` — khai báo chung (gói, khổ giấy, tiêu đề, đầu/chân trang). Thông tin giáo viên ở đầu/chân trang là chỗ trống, thầy/cô tự điền.', '- `cauhoi.tex` — các câu hỏi, chép nguyên văn từ ngân hàng.', '- `shared-content.tex` — gói dùng chung cho nội dung câu hỏi (TikZ, pgfplots, hộp màu…).');
  L.push(`- ${BUNDLED_FILES.filter((f) => f.endsWith('.sty')).map((f) => '`' + f + '`').join(', ')} — gói riêng đi kèm, **để cùng thư mục với main.tex**, không cần cài.`, '');
  L.push('## Gói cần có sẵn trong TeX Live', '');
  L.push('Bản TeX Live đầy đủ đã có hết. Nếu dùng bản rút gọn, cài thêm bằng lệnh:', '');
  const names = [...new Set(ctan.map((n) => tlmgrName(n.name)))].sort();
  L.push('```', `tlmgr install ${names.join(' ')}`, '```', '');
  L.push('| Gói | Tệp | Ghi chú |', '|---|---|---|');
  for (const n of ctan) L.push(`| ${n.name} | ${n.file} | ${n.from === 'khai-bao' ? 'khai báo chung' : n.from === 'cau-hoi' ? 'khai báo trong câu hỏi' : (n.why ?? 'suy ra từ lệnh trong câu')}${PKG_NOTE[n.name] ? ' · ' + PKG_NOTE[n.name] : ''} |`);
  L.push('');
  if (libs.length) {
    L.push('## Thư viện TikZ / pgfplots', '', 'Nằm trong gói `pgf` (TikZ, pgfplots) nên không phải cài riêng: ' + libs.map((l) => l.name).join(', ') + '.', '');
  }
  if (extra.length) {
    L.push('## Riêng bộ câu hỏi này còn cần thêm', '');
    for (const n of extra) L.push(`- \`${n.file}\` (${n.from === 'cau-hoi' ? 'khai báo ngay trong câu hỏi' : (n.why ?? 'suy ra từ lệnh')})`);
    L.push('');
  }
  L.push('> Danh sách trên do HEdu đọc từ mã LaTeX (không phải kết quả biên dịch thử). Nếu có lỗi "File … not found", cài gói có tên đó rồi biên dịch lại.');
  return L.join('\n') + '\n';
}

/** Các file VĂN BẢN của kiểu 2. File .sty/shared-content.tex do app Windows chép thêm. */
export function buildProject(qs: readonly Question[], sharedContent: string, folder: string): ProjectFile[] {
  return [
    { path: 'main.tex', text: MAIN_TEX },
    { path: 'khaibaochung.tex', text: KHAIBAOCHUNG_TEX },
    { path: 'cauhoi.tex', text: verbatimTex(qs) },
    { path: 'CAN-CO-GI.md', text: requirementsMd(qs, sharedContent, folder) },
  ];
}
