// Màn "Xử lí TeX": mở tệp .tex vào bàn nháp và lưu bàn nháp ra tệp .tex. Phần THUẦN + việc đọc tệp qua lớp nhập sẵn có.
import { chooseFiles, readSource } from './importfiles';
import { isDesktop } from './platform';

/** Nối `add` vào cuối `cur`, cách nhau một dòng trống; không thêm/bớt chữ nào của hai phần (chỉ chuẩn hoá xuống dòng cuối của phần cũ). */
export function appendText(cur: string, add: string): string {
  if (!add.trim()) return cur;
  if (!cur.trim()) return add;
  return `${cur.replace(/\s+$/, '')}\n\n${add.replace(/^\s*\n/, '')}`;
}

/** Tên tệp gợi ý khi lưu: ban-nhap-YYYYMMDD-HHMM.tex */
export function exportName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `ban-nhap-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.tex`;
}

export interface OpenedFile { name: string; text: string; /** bảng mã đoán (windows-1258) cần giáo viên xem lại chữ */ guessed: boolean }

/** Bản Windows: hộp chọn tệp rồi đọc từng tệp (tự nhận UTF-8/UTF-16/Windows-1258). Bản trình duyệt: trả null (màn hình dùng ô chọn tệp của trình duyệt). */
export async function openTexFiles(): Promise<OpenedFile[] | null> {
  if (!isDesktop()) return null;
  const paths = await chooseFiles();
  const out: OpenedFile[] = [];
  for (const path of paths) {
    const r = await readSource(path);
    out.push({ name: path.split(/[\\/]/).pop() ?? path, text: r.text, guessed: r.encoding === 'windows-1258' });
  }
  return out;
}
