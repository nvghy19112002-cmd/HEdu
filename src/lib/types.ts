// Kiểu dữ liệu dùng chung cho toàn app.

/** tn = trắc nghiệm 4 phương án, ds = đúng/sai 4 ý, tln = trả lời ngắn, tl = tự luận */
export type QType = 'tn' | 'ds' | 'tln' | 'tl';
export type Level = 'NB' | 'TH' | 'VD' | 'VDC';

export const TYPE_LABEL: Record<QType, string> = {
  tn: 'Trắc nghiệm',
  ds: 'Đúng / Sai',
  tln: 'Trả lời ngắn',
  tl: 'Tự luận',
};

export const LEVEL_LABEL: Record<Level, string> = {
  NB: 'Nhận biết',
  TH: 'Thông hiểu',
  VD: 'Vận dụng',
  VDC: 'Vận dụng cao',
};

export const LEVELS: Level[] = ['NB', 'TH', 'VD', 'VDC'];
export const TYPES: QType[] = ['tn', 'ds', 'tln', 'tl'];

/** Vị trí của câu trong khung chương trình */
export interface Location {
  grade: number;
  chapterId: string;
  lessonId: string;
  formId: string;
}

export interface Question extends Location {
  /** khoá nội bộ, không đổi */
  uid: string;
  /** số thứ tự tăng dần trong ngân hàng, hiển thị dạng #0007 */
  seq: number;
  latex: string;
  type: QType;
  level: Level;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Lesson { id: string; no: number; name: string; forms: Form[] }
export interface Form { id: string; no: number; name: string }
export interface Chapter { id: string; no: number; name: string; short: string; mon: 'D' | 'H'; lessons: Lesson[] }
export interface Grade { grade: number; chapters: Chapter[] }
