// Điều hướng giữa các màn hình và thông báo nhỏ dùng chung.
import { createContext, useContext } from 'react';

export type Screen = 'editor' | 'bank' | 'exam' | 'import' | 'curriculum' | 'system';

export interface Nav {
  screen: Screen;
  /** câu đang sửa trong màn Soạn (rỗng = câu mới) */
  editUid?: string;
  /** các câu chọn tay từ ngân hàng để đưa sang Tạo đề */
  examPick?: string[];
  /** mở sẵn ngăn sửa bên phải của câu này khi vào Ngân hàng */
  openUid?: string;
}

/**
 * Chặn rời đi khi còn thay đổi chưa lưu. Trả true nếu đi được ngay; trả false nghĩa là đã hiện hộp hỏi
 * và `proceed` sẽ được gọi sau nếu người dùng đồng ý.
 */
export type NavGuard = (proceed: () => void) => boolean;

export interface AppApi {
  nav: Nav;
  go(next: Nav): void;
  toast(msg: string): void;
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
