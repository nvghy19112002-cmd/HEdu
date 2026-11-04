// Sổ Excel kết quả thống kê sau thi: "Tóm tắt", "Theo câu", "Theo học sinh".
import { FLAG_VI, type Analysis } from './examstats';
import { cellNum, cellText, S_BOLD, S_HEAD, S_LEFT, S_TITLE, type XBook, type XCell } from './xlsxbook';

const PART_VI: Record<string, string> = { p1: 'Nhiều lựa chọn', p2: 'Đúng/Sai', p3: 'Trả lời ngắn', p4: 'Tự luận' };

export function statsBook(a: Analysis, meta: { name: string; code: string }): XBook {
  const s = a.summary;
  const sum: XCell[][] = [
    [{ v: 'THỐNG KÊ SAU THI', s: S_TITLE }],
    [{ v: 'Đề', s: S_BOLD }, {}, { v: meta.name }],
    [{ v: 'Mã đề', s: S_BOLD }, {}, { v: meta.code }],
    [],
    [cellText('Chỉ số', S_HEAD), cellText('Giá trị', S_HEAD)],
    [cellText('Số học sinh', S_LEFT), cellNum(s.n)],
    [cellText('Điểm tối đa của đề', S_LEFT), cellNum(s.maxPossible)],
    [cellText('Điểm trung bình', S_LEFT), cellNum(s.mean)],
    [cellText('Trung vị', S_LEFT), cellNum(s.median)],
    [cellText('Độ lệch chuẩn', S_LEFT), cellNum(s.sd)],
    [cellText('Thấp nhất', S_LEFT), cellNum(s.min)],
    [cellText('Cao nhất', S_LEFT), cellNum(s.max)],
    [cellText('Độ tin cậy (Cronbach α)', S_LEFT), s.kr20 === null ? cellText('—') : cellNum(s.kr20)],
    [],
    [cellText('Phổ điểm (thang 10)', S_HEAD), cellText('Số học sinh', S_HEAD)],
    ...a.histogram.map((n, i) => [cellText(i === 9 ? '9 – 10' : `${i} – ${i + 1}`, S_LEFT), cellNum(n)]),
  ];
  const optKeys = (): string[] => [...new Set(a.items.flatMap((i) => Object.keys(i.options)))].sort();
  const ok = optKeys();
  const items: XCell[][] = [
    ['Câu', 'Loại', 'Đáp án', 'Tỉ lệ đúng', 'Số làm đúng', 'Độ phân biệt', 'Tương quan', 'Bỏ trống', ...ok.map((o) => `Chọn ${o}`), 'Nhận xét'].map((h) => cellText(h, S_HEAD)),
    ...a.items.map((i) => [
      cellText(i.q), cellText(PART_VI[i.part] ?? i.part, S_LEFT), cellText(i.key), cellNum(i.p), cellNum(i.fullCorrect), i.d === null ? cellText('—') : cellNum(i.d), i.r === null ? cellText('—') : cellNum(i.r), cellNum(i.blank),
      ...ok.map((o) => cellNum(i.options[o] ?? 0)), cellText(i.flags.map((f) => FLAG_VI[f]).join('; '), S_LEFT),
    ]),
  ];
  const stu: XCell[][] = [
    ['STT', 'Học sinh', 'Điểm', 'Điểm tối đa', 'Số câu đúng hoàn toàn'].map((h) => cellText(h, S_HEAD)),
    ...[...a.students].sort((x, y) => y.score - x.score).map((x, k) => [cellNum(k + 1), cellText(x.name, S_LEFT), cellNum(x.score), cellNum(x.max), cellNum(x.correct)]),
  ];
  return {
    sheets: [
      { name: 'Tóm tắt', rows: sum, widths: [34, 16] },
      { name: 'Theo câu', rows: items, widths: [8, 16, 10, 11, 11, 12, 11, 9, ...ok.map(() => 9), 48], freeze: [1, 1] },
      { name: 'Theo học sinh', rows: stu, widths: [6, 30, 10, 12, 20], freeze: [1, 0] },
    ],
  };
}
