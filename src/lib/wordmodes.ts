// Các chế độ xuất Word (thuần, có kiểm thử): mỗi chế độ = có/không lời giải, tô đáp án, bản in đen trắng, hậu tố tên tệp.
export interface WordMode {
  id: string;
  label: string;
  hint: string;
  solution: boolean;
  mark: boolean;
  print: boolean;
  suffix: string;
}

export const WORD_MODES: WordMode[] = [
  { id: 'hs', label: 'Đề học sinh', hint: 'Không lời giải, không tô đáp án; có màu', solution: false, mark: false, print: false, suffix: '' },
  { id: 'hs-in', label: 'Bản in cho học sinh', hint: 'Không lời giải; đen trắng, không nền, tiết kiệm mực', solution: false, mark: false, print: true, suffix: '-in' },
  { id: 'loi-giai', label: 'Đề kèm lời giải', hint: 'Có lời giải, không tô đáp án đúng ở phương án', solution: true, mark: false, print: false, suffix: '-loi-giai' },
  { id: 'dap-an', label: 'Đề tô đáp án (không lời giải)', hint: 'Phương án đúng tô đậm gạch chân; không lời giải', solution: false, mark: true, print: false, suffix: '-dap-an' },
  { id: 'day-du', label: 'Bản đầy đủ (giáo viên)', hint: 'Tô đáp án đúng và kèm lời giải', solution: true, mark: true, print: false, suffix: '-day-du' },
  { id: 'day-du-in', label: 'Bản đầy đủ in đen trắng', hint: 'Tô đáp án, kèm lời giải; đen trắng để in', solution: true, mark: true, print: true, suffix: '-day-du-in' },
];

export const DEFAULT_WORD_MODES = ['hs', 'day-du'];

export const wordModeById = (id: string): WordMode | undefined => WORD_MODES.find((m) => m.id === id);

/** Tên tệp dự kiến (để báo trước cho người dùng). */
export const wordFileName = (code: string, m: WordMode): string => `de-${code}${m.suffix}.docx`;
