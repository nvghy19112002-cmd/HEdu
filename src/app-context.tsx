// Điều hướng giữa các màn hình và thông báo nhỏ dùng chung.
import { createContext, useContext } from 'react';

export type Screen = 'editor' | 'bank' | 'exam' | 'import' | 'examlib' | 'curriculum' | 'trash' | 'system';

export interface Nav {
  screen: Screen;
  /** câu đang sửa trong màn Soạn (rỗng = câu mới) */
  editUid?: string;
  /** các câu chọn tay từ ngân hàng để đưa sang Tạo đề */
  examPick?: string[];
  /** mở sẵn ngăn sửa bên phải của câu này khi vào Ngân hàng */
  openUid?: string;
  /** Câu mới: điền sẵn vị trí đang duyệt ở Ngân hàng (chỉ gợi ý; không đè bản nháp chưa lưu) */
  newAt?: NewAt;
  /** màn Soạn được mở từ Ngân hàng: hiện nút "Về Ngân hàng" */
  fromBank?: boolean;
  /** về Ngân hàng và dừng ở câu này (vd câu vừa lưu) */
  focusUid?: string;
}

export interface NewAt {
  grade: number;
  chapterId: string;
  lessonId: string;
  formId: string;
  /** gợi ý mức độ khi chỉ chọn đúng một mức ở bộ lọc */
  level?: 'NB' | 'TH' | 'VD' | 'VDC';
  /** tên vị trí để hiện cho người dùng, vd "Lớp 12 › Chương 1 › Bài 2" */
  label: string;
}

/**
 * Chặn rời đi khi còn thay đổi chưa lưu. Trả true nếu đi được ngay; trả false nghĩa là đã hiện hộp hỏi
 * và `proceed` sẽ được gọi sau nếu người dùng đồng ý.
 */
export type NavGuard = (proceed: () => void) => boolean;

export interface AppApi {
  nav: Nav;
  go(next: Nav): void;
  /** `action` = một nút ngắn kèm thông báo (vd. “Mở Thùng rác”) */
  toast(msg: string, action?: { label: string; run(): void }): void;
  openPalette(): void;
  /** đăng ký (hoặc gỡ bằng null) bộ chặn rời đi; mọi go() đều đi qua đó */
  setGuard(g: NavGuard | null): void;
  /** Mở hộp xem/sao chép/tải một file văn bản (.tex, sao lưu) */
  showFile(f: FileOut): void;
}

export interface FileOut { title: string; name: string; text: string; mime?: string }

export const AppCtx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(AppCtx);
  if (!v) throw new Error('AppCtx missing');
  return v;
}

/** Tải một chuỗi văn bản về máy dưới dạng file */
export function downloadText(name: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
