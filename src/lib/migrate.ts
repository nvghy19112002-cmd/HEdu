// Phiên bản cấu trúc dữ liệu (schema). Mỗi khi đổi cấu trúc câu hỏi:
//   1) tăng CURRENT_SCHEMA,
//   2) thêm một hàm vào MIGRATIONS để nâng dữ liệu cũ lên,
//   3) thêm một kiểm thử trong lib.test.ts.
// Rust (src-tauri/src/lib.rs, SUPPORTED_SCHEMA) phải cùng số với CURRENT_SCHEMA.
// Dữ liệu có schema MỚI hơn app đang chạy sẽ bị từ chối mở (không ghi đè), để bản cũ
// không làm hỏng dữ liệu của bản mới.

export const CURRENT_SCHEMA = 1;

// MIGRATIONS[n] nâng dữ liệu từ schema n lên n + 1.
// Ví dụ khi có schema 2:  MIGRATIONS[1] = (s) => ({ ...s, questions: s.questions.map(addNewField) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MIGRATIONS: Record<number, (state: any) => any> = {};

export class SchemaNewerError extends Error {
  constructor(public found: number) {
    super(`Dữ liệu thuộc cấu trúc phiên bản ${found}, mới hơn bản app này (${CURRENT_SCHEMA}).`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate(raw: any, migrations = MIGRATIONS, current = CURRENT_SCHEMA): any {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.questions)) throw new Error('Dữ liệu không đúng định dạng HEdu.');
  let s = { ...raw };
  let v = Number.isInteger(s.schema) ? (s.schema as number) : 1; // bản đầu tiên chưa ghi schema
  if (v > current) throw new SchemaNewerError(v);
  while (v < current) {
    const step = migrations[v];
    if (!step) throw new Error(`Thiếu bước nâng cấp dữ liệu từ cấu trúc ${v} lên ${v + 1}.`);
    s = step(s);
    v++;
    s.schema = v;
  }
  s.schema = current;
  return s;
}
