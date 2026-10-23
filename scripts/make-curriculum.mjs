// Sinh file khung chương trình mặc định từ data/taxonomy.json.
// Chạy lại khi thay cây mặc định:  node scripts/make-curriculum.mjs
// (Cây đang dùng trong app nằm trong dữ liệu người dùng và sửa được ngay trong app;
//  file này chỉ là cây mặc định đi kèm bản cài.)
import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync('data/taxonomy.json', 'utf8'));
const out = 'src/lib/curriculum-default.ts';

const q = (s) => JSON.stringify(s);
const lines = [];
for (const grade of src.nodes) {
  const branches = [];
  for (const ban of grade.children ?? []) {
    const chapters = [];
    for (const ch of ban.children ?? []) {
      const lessons = [];
      for (const ls of ch.children ?? []) {
        const forms = (ls.children ?? []).map((f) => `[${q(f.code)},${q(f.name)}]`);
        lessons.push(`[${q(ls.code)},${q(ls.name)},[${forms.join(',')}]]`);
      }
      chapters.push(`\n      [${q(ch.code)},${q(ch.name)},[${lessons.join(',')}]]`);
    }
    branches.push(`\n    [${q(ban.code)},${q(ban.name)},[${chapters.join(',')}]]`);
  }
  lines.push(`\n  [${q(grade.code)},${q(grade.name)},[${branches.join(',')}]]`);
}

const text = `// TỰ SINH từ data/taxonomy.json bằng scripts/make-curriculum.mjs — đừng sửa tay.
// Đây là cây mặc định đi kèm bản cài. Cây đang dùng nằm trong dữ liệu của bạn và
// sửa được trong mục "Chương trình" (sửa tên, thêm/xoá, nạp từ file JSON, xuất ra JSON).
export type RawForm = [code: string, name: string];
export type RawLesson = [code: string, name: string, forms: RawForm[]];
export type RawChapter = [code: string, name: string, lessons: RawLesson[]];
export type RawBranch = [code: string, name: string, chapters: RawChapter[]];
export type RawGrade = [code: string, name: string, branches: RawBranch[]];

export const DEFAULT_TAXONOMY_NAME = ${q(src.name ?? 'Khung chương trình 2018')};

export const RAW_DEFAULT: RawGrade[] = [${lines.join(',')}
];
`;
writeFileSync(out, text);

const count = (n) => (n.children ?? []).reduce((s, c) => s + 1 + count(c), 0);
console.log(`${out}: ${src.nodes.length} lớp, ${src.nodes.reduce((s, g) => s + count(g), 0)} nút, ${(text.length / 1024).toFixed(0)} KB`);
