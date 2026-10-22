// Khung chương trình mẫu (theo bộ Kết nối tri thức, CT GDPT 2018).
// Đây là dữ liệu tạm để chạy giao diện; bộ sách mặc định vẫn đang chờ chốt.
// Lớp 12 có đủ chương/bài; lớp 10, 11 mới có tên chương.
import type { Chapter, Form, Grade, Lesson } from './types';

type RawLesson = string | [string, string[]];

function chapter(grade: number, no: number, name: string, short: string, mon: 'D' | 'H', lessons: RawLesson[]): Chapter {
  const id = `g${grade}c${no}`;
  const ls: Lesson[] = (lessons.length ? lessons : ['Tổng hợp chương']).map((raw, i) => {
    const [lname, formNames] = typeof raw === 'string' ? [raw, [] as string[]] : raw;
    const lid = `${id}l${i + 1}`;
    const forms: Form[] = (formNames.length ? formNames : ['Tổng hợp']).map((f, j) => ({ id: `${lid}f${j + 1}`, no: j + 1, name: f }));
    return { id: lid, no: i + 1, name: lname, forms };
  });
  return { id, no, name, short, mon, lessons: ls };
}

export const CURRICULUM: Grade[] = [
  {
    grade: 10,
    chapters: [
      chapter(10, 1, 'Mệnh đề và tập hợp', 'Mệnh đề, tập hợp', 'D', ['Mệnh đề', 'Tập hợp và các phép toán trên tập hợp']),
      chapter(10, 2, 'Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', 'BPT bậc nhất hai ẩn', 'D', []),
      chapter(10, 3, 'Hệ thức lượng trong tam giác', 'Hệ thức lượng', 'H', []),
      chapter(10, 4, 'Vectơ', 'Vectơ', 'H', []),
      chapter(10, 5, 'Các số đặc trưng của mẫu số liệu không ghép nhóm', 'Số đặc trưng', 'D', []),
      chapter(10, 6, 'Hàm số, đồ thị và ứng dụng', 'Hàm số, đồ thị', 'D', []),
      chapter(10, 7, 'Phương pháp toạ độ trong mặt phẳng', 'Toạ độ trong mặt phẳng', 'H', []),
      chapter(10, 8, 'Đại số tổ hợp', 'Đại số tổ hợp', 'D', []),
      chapter(10, 9, 'Tính xác suất theo định nghĩa cổ điển', 'Xác suất cổ điển', 'D', []),
    ],
  },
  {
    grade: 11,
    chapters: [
      chapter(11, 1, 'Hàm số lượng giác và phương trình lượng giác', 'Lượng giác', 'D', []),
      chapter(11, 2, 'Dãy số. Cấp số cộng và cấp số nhân', 'Dãy số, cấp số', 'D', []),
      chapter(11, 3, 'Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm', 'Số đặc trưng ghép nhóm', 'D', []),
      chapter(11, 4, 'Quan hệ song song trong không gian', 'Quan hệ song song', 'H', []),
      chapter(11, 5, 'Giới hạn. Hàm số liên tục', 'Giới hạn', 'D', []),
      chapter(11, 6, 'Hàm số mũ và hàm số lôgarit', 'Mũ và lôgarit', 'D', []),
      chapter(11, 7, 'Quan hệ vuông góc trong không gian', 'Quan hệ vuông góc', 'H', []),
      chapter(11, 8, 'Các quy tắc tính xác suất', 'Quy tắc xác suất', 'D', []),
      chapter(11, 9, 'Đạo hàm', 'Đạo hàm', 'D', []),
    ],
  },
  {
    grade: 12,
    chapters: [
      chapter(12, 1, 'Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số', 'Ứng dụng đạo hàm', 'D', [
        ['Tính đơn điệu và cực trị của hàm số', ['Tìm khoảng đơn điệu từ công thức', 'Đọc đơn điệu từ bảng biến thiên, đồ thị', 'Tìm cực trị của hàm số', 'Bài toán chứa tham số']],
        ['Giá trị lớn nhất và giá trị nhỏ nhất của hàm số', ['GTLN, GTNN trên đoạn', 'Bài toán thực tế']],
        ['Đường tiệm cận của đồ thị hàm số', ['Tìm tiệm cận từ công thức', 'Đọc tiệm cận từ đồ thị']],
        ['Khảo sát sự biến thiên và vẽ đồ thị của hàm số', ['Nhận dạng đồ thị', 'Khảo sát hàm số']],
      ]),
      chapter(12, 2, 'Vectơ và hệ trục toạ độ trong không gian', 'Vectơ trong không gian', 'H', [
        'Vectơ trong không gian',
        ['Hệ trục toạ độ trong không gian', ['Toạ độ điểm, hình chiếu']],
        ['Biểu thức toạ độ của các phép toán vectơ', ['Tổng, hiệu, tích với số', 'Tích vô hướng, độ dài']],
      ]),
      chapter(12, 3, 'Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm', 'Số đặc trưng phân tán', 'D', [
        'Khoảng biến thiên và khoảng tứ phân vị',
        'Phương sai và độ lệch chuẩn',
      ]),
      chapter(12, 4, 'Nguyên hàm và tích phân', 'Nguyên hàm, tích phân', 'D', [
        ['Nguyên hàm', ['Nguyên hàm cơ bản', 'Tính chất nguyên hàm']],
        ['Tích phân', ['Tính tích phân cơ bản', 'Tính chất tích phân']],
        ['Ứng dụng hình học của tích phân', ['Diện tích hình phẳng', 'Thể tích khối tròn xoay']],
      ]),
      chapter(12, 5, 'Phương pháp toạ độ trong không gian', 'Toạ độ trong không gian', 'H', [
        'Phương trình mặt phẳng',
        'Phương trình đường thẳng trong không gian',
        'Công thức tính góc trong không gian',
        'Phương trình mặt cầu',
      ]),
      chapter(12, 6, 'Xác suất có điều kiện', 'Xác suất có điều kiện', 'D', [
        'Xác suất có điều kiện',
        'Công thức xác suất toàn phần và công thức Bayes',
      ]),
    ],
  },
];

export const GRADES = CURRICULUM.map((g) => g.grade);

export function getGrade(grade: number): Grade {
  return CURRICULUM.find((g) => g.grade === grade) ?? CURRICULUM[CURRICULUM.length - 1];
}

export function findChapter(id: string): Chapter | undefined {
  for (const g of CURRICULUM) for (const c of g.chapters) if (c.id === id) return c;
  return undefined;
}

export function findLesson(id: string): { chapter: Chapter; lesson: Lesson } | undefined {
  for (const g of CURRICULUM) for (const c of g.chapters) for (const l of c.lessons) if (l.id === id) return { chapter: c, lesson: l };
  return undefined;
}

export function findForm(lessonId: string, formId: string): Form | undefined {
  return findLesson(lessonId)?.lesson.forms.find((f) => f.id === formId);
}

/** Vị trí mặc định khi đổi lớp/chương: lấy phần tử đầu tiên. */
export function firstLocation(grade: number, chapterId?: string, lessonId?: string) {
  const g = getGrade(grade);
  const c = g.chapters.find((x) => x.id === chapterId) ?? g.chapters[0];
  const l = c.lessons.find((x) => x.id === lessonId) ?? c.lessons[0];
  return { grade: g.grade, chapterId: c.id, lessonId: l.id, formId: l.forms[0].id };
}
