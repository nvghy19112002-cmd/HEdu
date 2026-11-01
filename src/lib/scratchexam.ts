// Màn "Xử lí TeX": lưu bàn nháp (hoặc các câu đã chọn) thành một ĐỀ trong Thư viện đề. Chỉ dựng danh sách tệp (thuần); việc tạo đề do Rust `exam_lib_create_files`.
// Nội dung câu hỏi được chép NGUYÊN VĂN vào cauhoi.tex; main.tex/khai báo giống kiểu "Lưu vào Thư viện đề" của Ngân hàng. Không ghi nguồn UID (câu của bàn nháp chưa thuộc ngân hàng).
import { heduFiles } from './hedusty';
import { MAIN_TEX, type ProjectFile } from './texproject';
import type { Question } from './types';
import type { ScratchScan } from './texscratch';

/** Tên đề mặc định từ tên bàn nháp + ngày. */
export function defaultExamName(draftName: string, now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${draftName.trim() || 'Bàn nháp'} ${p(now.getDate())}-${p(now.getMonth() + 1)}-${now.getFullYear()}`;
}

/** Lý do KHÔNG lưu được thành đề (null = được). */
export function whyNotExam(scan: ScratchScan, content: string): string | null {
  if (!content.trim()) return 'Bàn nháp đang trống.';
  if (scan.fullDoc.length) return 'Bàn nháp có cả \\documentclass hoặc \\begin{document}. Đề trong Thư viện đã có sẵn phần đầu; hãy chỉ giữ các khối câu hỏi rồi lưu lại.';
  if (!scan.blocks.some((b) => b.closed)) return 'Chưa có khối \\begin{ex}…\\end{ex} hoàn chỉnh để lưu.';
  return null;
}

/** Tệp của đề: main.tex + khai báo + cauhoi.tex (NGUYÊN VĂN `content`). `texts` = các khối ex (để suy ra gói cần thêm). */
export function buildScratchExam(content: string, texts: readonly string[], shared: string, extraPkgs: readonly string[] = []): ProjectFile[] {
  // heduFiles chỉ đọc `.latex` của từng câu để suy ra gói cần; dùng đối tượng giả tối thiểu thay vì ép bàn nháp thành câu ngân hàng
  const fake = texts.map((latex) => ({ latex })) as unknown as Question[];
  const extra = extraPkgs.map((p) => `\\usepackage{${p}}\n`).join('');
  const base = heduFiles(fake, shared).map((f) => (f.path === 'hedu-goithem.tex' && extra ? { ...f, text: f.text + extra } : f));
  return [
    { path: 'main.tex', text: MAIN_TEX },
    ...base,
    { path: 'cauhoi.tex', text: content.endsWith('\n') ? content : `${content}\n` },
  ];
}
