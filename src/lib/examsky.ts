// Tạo đề in theo mẫu in HyMath đang dùng (Sky Panel), chủ dự án chốt 09–10/11/2026.
// - de-<mã>.tex: \TieuDeDeSo{Sở--Trường}{Kỳ thi}{Môn}{Thời gian}{Mã} + mỗi phần: lệnh đánh dấu \caulc/\cauds/\caukq/\cautl (để HEdu đếm câu
//   từng phần như cũ; trong mẫu là lệnh rỗng) + dòng PHẦN in đậm (mẫu dựng thành dải màu) + câu chép nguyên văn.
// - main.tex, main-<mã>.tex, main-dapan.tex: tài liệu đầy đủ theo mẫu (dịch bằng pdfLaTeX), có dòng \def\CheDo{mau}; khi biên dịch bản
//   Đề / Đề in / Lời giải, HEdu đổi dòng này trong bản dẫn xuất (Rust examprofile), tệp nguồn không bị sửa.
// Đề cũ (dựng bằng bộ khai báo HEdu) giữ nguyên cách in của chúng.
import { examFiles, mainFile, ownDefs, PARTS, variantFile, type ExamFile, type ExamInfo, type PartKey, type Variant } from './examgen';
import { introCode, loadIntro, type IntroSet } from './examsetup';
import { texText, wrapFiles, type WrapInfo } from './examwrap';

const MARK: Record<PartKey, string> = { p1: '\\caulc', p2: '\\cauds', p3: '\\caukq', p4: '\\cautl' };
const ROMAN = ['I', 'II', 'III', 'IV'];
const STUB = 'hedu-mau-du-lieu';
/** Lệnh của bộ khai báo HEdu mà tệp đề có dùng nhưng mẫu HyMath không có: làm lệnh rỗng. */
const PROVIDE = '\\providecommand{\\caulc}{}\\providecommand{\\cauds}{}\\providecommand{\\caukq}{}\\providecommand{\\cautl}{}\\providecommand{\\zlabel}[1]{}\n';

/** Dòng tên đơn vị: Sở và Trường nối bằng "--" (mẫu xuống dòng ở đó). */
export const schoolLine = (info: ExamInfo): string => [info.dept, info.school].map((x) => texText(x ?? '')).filter(Boolean).join('--');

/** Một mã đề theo mẫu HyMath. */
export function skyVariantTex(info: ExamInfo, v: Variant, intro: IntroSet = loadIntro()): string {
  const L: string[] = [
    `% Mã đề ${v.code} — do HEdu dựng từ Ngân hàng câu hỏi theo mẫu in. Câu hỏi chép nguyên văn.`,
    `\\def\\made{${v.code}}`,
    ...ownDefs(v),
    `\\TieuDeDeSo{${schoolLine(info)}}{${texText(info.title) || 'ĐỀ KIỂM TRA'}}{${texText(info.subject)}}{${info.minutes} phút}{${v.code}}`,
  ];
  let r = 0;
  for (const p of PARTS) {
    const n = v.parts[p].length;
    if (!n) continue;
    L.push('', MARK[p], introCode(ROMAN[r++], intro[p], n).trimEnd(), '');
    L.push(v.parts[p].map((s) => s.latex.replace(/\s+$/, '')).join('\n\n'));
  }
  L.push('', '\\ifdefined\\ExamEnd\\ExamEnd\\fi');
  return L.join('\n') + '\n';
}

/**
 * Bộ tệp đề theo mẫu `themeId`. null nếu mẫu không dựng được bằng pdfLaTeX (khi đó dùng kiểu cũ của HEdu để mọi chức năng xuất vẫn chạy).
 * Không gồm bộ khai báo HEdu: cả dự án chỉ có MỘT lệnh nạp ex_test (trong lõi mẫu) để HEdu chắc chắn cách bật/tắt lời giải.
 */
export function skyExamFiles(info: ExamInfo, variants: readonly Variant[], o: { withKeys: boolean }, themeId: string, winfo: WrapInfo, intro?: IntroSet): ExamFile[] | null {
  const w = wrapFiles(`${STUB}.tex`, '% dữ liệu đề\n', themeId, 'de', winfo, 'pdflatex');
  if (!w || w.engine !== 'pdflatex' || !w.modes) return null;
  const head = w.files[0].text;
  const at = head.indexOf(`\\input{${STUB}}`);
  if (at < 0 || !head.includes('\\def\\CheDo{mau}') || !head.includes('\\begin{document}')) return null;
  const doc = (inputs: string[]) => head.replace('\\begin{document}', `${PROVIDE}\\begin{document}`).replace(`\\input{${STUB}}`, inputs.map((x) => `\\input{${x}}`).join('\n\\newpage\n'));
  const base = examFiles(info, variants, o);
  const out: ExamFile[] = base.map((f) => {
    const v = variants.find((x) => f.path === variantFile(x.code));
    if (v) return { path: f.path, text: skyVariantTex(info, v, intro) };
    if (f.path === 'main.tex') return { path: f.path, text: doc(variants.map((x) => variantFile(x.code).replace(/\.tex$/, ''))) };
    const m = variants.find((x) => f.path === mainFile(x.code));
    if (m) return { path: f.path, text: doc([variantFile(m.code).replace(/\.tex$/, '')]) };
    if (f.path === 'main-dapan.tex') return { path: f.path, text: doc(['dapan']) };
    return f;
  });
  return [...out, ...w.files.slice(1)];
}
