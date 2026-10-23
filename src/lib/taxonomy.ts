// Cây mục lục (khung chương trình) — dữ liệu sửa được, không viết cứng trong code.
// Năm cấp: Lớp → Phân môn → Chương → Bài → Dạng.
// Mã câu hỏi ghép từ mã các cấp: [Lớp][Phân môn][Chương][Mức độ][Bài]-[Dạng], ví dụ 2D1H1-1.
// Đổi sách giáo khoa = nạp cây khác (hoặc sửa ngay trong app), không phải sửa code.
import { RAW_DEFAULT, DEFAULT_TAXONOMY_NAME, type RawGrade } from './curriculum-default';
import type { Branch, Chapter, Form, Grade, Lesson, Taxonomy, TaxKind } from './types';

/** Thứ tự các cấp, dùng cho nhãn trên giao diện và khi kiểm tra cây. */
export const KINDS: TaxKind[] = ['grade', 'branch', 'chapter', 'lesson', 'form'];
export const KIND_LABEL: Record<TaxKind, string> = {
  grade: 'Lớp',
  branch: 'Phân môn',
  chapter: 'Chương',
  lesson: 'Bài',
  form: 'Dạng',
};

/** Mã mỗi cấp chỉ một ký tự để ghép thành mã câu hỏi đọc được. */
export const CODE_RE = /^[0-9A-Za-z]$/;

export function gradeNumber(code: string): number {
  const n = Number(code);
  if (!Number.isFinite(n)) return 0;
  return n <= 2 ? n + 10 : n;
}

export function gradeCode(grade: number): string {
  return grade >= 10 ? String(grade - 10) : String(grade);
}

/** Tên hiển thị của một cấp học: dùng tên trong khung chương trình (vd "Lớp 12", "Đại học năm 1"), thiếu thì ghép từ số. */
export function gradeLabel(g: { name: string; grade: number }): string {
  return g.name?.trim() || `Lớp ${g.grade}`;
}

/** Bỏ tiền tố "Chương 1. ", "Bài 2. ", "Dạng 3. " để hiện gọn trong bảng, ô chọn. */
export function shortName(name: string): string {
  return name.replace(/^(Lớp|Chương|Chuyên đề|Bài|Dạng)\s*\d+\s*[.:-]?\s*/i, '').trim() || name;
}

/** Nhãn ngắn của phân môn: lấy phần đầu trước dấu "/" hay "&". */
export function branchShort(name: string): string {
  return name.split(/[/&]/)[0].trim() || name;
}

let counter = 0;
/** Khoá nội bộ của một nút: không đổi khi sửa tên hay mã, nên câu hỏi không bị mất vị trí. */
export function newId(kind: TaxKind): string {
  counter += 1;
  return `${kind[0]}~${Date.now().toString(36)}${counter.toString(36)}`;
}

// ---------- dựng cây mặc định ----------

export function buildDefault(raw: RawGrade[] = RAW_DEFAULT): Taxonomy {
  const grades: Grade[] = raw.map(([gc, gname, branches]) => ({
    id: `g${gc}`,
    code: gc,
    name: gname,
    grade: gradeNumber(gc),
    branches: branches.map(([bc, bname, chapters]) => ({
      id: `b${gc}${bc}`,
      code: bc,
      name: bname,
      chapters: chapters.map(([cc, cname, lessons]) => ({
        id: `c${gc}${bc}${cc}`,
        code: cc,
        name: cname,
        lessons: lessons.map(([lc, lname, forms]) => ({
          id: `l${gc}${bc}${cc}${lc}`,
          code: lc,
          name: lname,
          forms: forms.map(([fc, fname]) => ({ id: `f${gc}${bc}${cc}${lc}${fc}`, code: fc, name: fname })),
        })),
      })),
    })),
  }));
  return { name: DEFAULT_TAXONOMY_NAME, grades };
}

// ---------- tra cứu ----------

export interface Place {
  kind: TaxKind;
  grade: Grade;
  branch?: Branch;
  chapter?: Chapter;
  lesson?: Lesson;
  form?: Form;
}

export type TaxIndex = Map<string, Place>;

export function indexOf(tax: Taxonomy): TaxIndex {
  const ix: TaxIndex = new Map();
  for (const grade of tax.grades) {
    ix.set(grade.id, { kind: 'grade', grade });
    for (const branch of grade.branches) {
      ix.set(branch.id, { kind: 'branch', grade, branch });
      for (const chapter of branch.chapters) {
        ix.set(chapter.id, { kind: 'chapter', grade, branch, chapter });
        for (const lesson of chapter.lessons) {
          ix.set(lesson.id, { kind: 'lesson', grade, branch, chapter, lesson });
          for (const form of lesson.forms) {
            ix.set(form.id, { kind: 'form', grade, branch, chapter, lesson, form });
          }
        }
      }
    }
  }
  return ix;
}

/** Danh sách chương của một lớp, kèm mã phân môn (giao diện cũ vẫn làm việc theo chương). */
export interface ChapterRef extends Chapter {
  mon: string;
  monName: string;
  grade: number;
}

export function chaptersOfGrade(tax: Taxonomy, grade: number): ChapterRef[] {
  const g = tax.grades.find((x) => x.grade === grade);
  if (!g) return [];
  return g.branches.flatMap((b) => b.chapters.map((c) => ({ ...c, mon: b.code, monName: b.name, grade })));
}

// ---------- sửa cây ----------

type AnyNode = Grade | Branch | Chapter | Lesson | Form;

function childrenOf(node: AnyNode, kind: TaxKind): AnyNode[] | null {
  if (kind === 'grade') return (node as Grade).branches;
  if (kind === 'branch') return (node as Branch).chapters;
  if (kind === 'chapter') return (node as Chapter).lessons;
  if (kind === 'lesson') return (node as Lesson).forms;
  return null;
}

function childKey(kind: TaxKind): 'branches' | 'chapters' | 'lessons' | 'forms' | null {
  return kind === 'grade' ? 'branches' : kind === 'branch' ? 'chapters' : kind === 'chapter' ? 'lessons' : kind === 'lesson' ? 'forms' : null;
}

export function childKind(kind: TaxKind): TaxKind | null {
  const i = KINDS.indexOf(kind);
  return i >= 0 && i < KINDS.length - 1 ? KINDS[i + 1] : null;
}

/** Chép cây, thay đúng một nút. fn trả về null nghĩa là xoá nút đó. */
function mapTree(tax: Taxonomy, id: string, fn: (node: AnyNode, kind: TaxKind) => AnyNode | null): Taxonomy {
  const walk = (nodes: AnyNode[], kind: TaxKind): AnyNode[] => {
    const out: AnyNode[] = [];
    for (const n of nodes) {
      if (n.id === id) {
        const r = fn(n, kind);
        if (r) out.push(r);
        continue;
      }
      const key = childKey(kind);
      const kids = childrenOf(n, kind);
      const sub = kind === 'grade' ? gradeNumber((n as Grade).code) : 0;
      out.push(key && kids ? ({ ...n, [key]: walk(kids, childKind(kind)!), ...(kind === 'grade' ? { grade: sub } : {}) } as AnyNode) : n);
    }
    return out;
  };
  return { ...tax, grades: walk(tax.grades, 'grade') as Grade[] };
}

export function renameNode(tax: Taxonomy, id: string, name: string): Taxonomy {
  return mapTree(tax, id, (n, kind) => ({ ...n, name: name.trim() || n.name, ...(kind === 'grade' ? {} : {}) }));
}

export function setNodeCode(tax: Taxonomy, id: string, code: string): Taxonomy {
  const c = code.trim().toUpperCase();
  if (!CODE_RE.test(c)) return tax;
  return mapTree(tax, id, (n, kind) => (kind === 'grade' ? { ...n, code: c, grade: gradeNumber(c) } : { ...n, code: c }));
}

export function removeNode(tax: Taxonomy, id: string): Taxonomy {
  return mapTree(tax, id, () => null);
}

export function moveNode(tax: Taxonomy, id: string, dir: -1 | 1): Taxonomy {
  const swap = (nodes: AnyNode[], kind: TaxKind): AnyNode[] => {
    const i = nodes.findIndex((n) => n.id === id);
    if (i >= 0) {
      const j = i + dir;
      if (j < 0 || j >= nodes.length) return nodes;
      const copy = nodes.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    }
    const key = childKey(kind);
    if (!key) return nodes;
    return nodes.map((n) => {
      const kids = childrenOf(n, kind);
      return kids ? ({ ...n, [key]: swap(kids, childKind(kind)!) } as AnyNode) : n;
    });
  };
  return { ...tax, grades: swap(tax.grades, 'grade') as Grade[] };
}

function emptyChild(kind: TaxKind, code: string, name: string): AnyNode {
  const id = newId(kind);
  if (kind === 'branch') return { id, code, name, chapters: [] } as Branch;
  if (kind === 'chapter') return { id, code, name, lessons: [] } as Chapter;
  if (kind === 'lesson') return { id, code, name, forms: [] } as Lesson;
  if (kind === 'form') return { id, code, name } as Form;
  return { id, code, name, grade: gradeNumber(code), branches: [] } as Grade;
}

/** Mã trống tiếp theo trong một nhóm: 1…9 rồi 0, sau đó A…Z. */
export function nextCode(used: string[]): string {
  const taken = new Set(used.map((c) => c.toUpperCase()));
  for (const c of [...'1234567890', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']) if (!taken.has(c)) return c;
  return '?';
}

export function addChild(tax: Taxonomy, parentId: string | null, name: string): Taxonomy {
  if (parentId === null) {
    const code = nextCode(tax.grades.map((g) => g.code));
    return { ...tax, grades: [...tax.grades, emptyChild('grade', code, name) as Grade] };
  }
  return mapTree(tax, parentId, (n, kind) => {
    const ck = childKind(kind);
    const key = childKey(kind);
    if (!ck || !key) return n;
    const kids = (childrenOf(n, kind) ?? []) as AnyNode[];
    const child = emptyChild(ck, nextCode(kids.map((k) => k.code)), name);
    return { ...n, [key]: [...kids, child] } as AnyNode;
  });
}

// ---------- nạp / xuất JSON ----------

/** Định dạng mô tả cách ghép mã, xuất kèm để file dùng được với phần mềm khác. */
const FORMAT = {
  separator: '',
  open: '[',
  close: ']',
  levelSeparators: ['', '', '', '-'],
  difficultyAfterLevel: 3,
  readMode: 'strict',
  requireLeaf: true,
  requireDifficulty: true,
};

interface JsonNode { code?: unknown; name?: unknown; children?: unknown }

export function toJson(tax: Taxonomy): string {
  const node = (code: string, name: string, children?: unknown[]) => (children && children.length ? { code, name, children } : { code, name });
  return JSON.stringify(
    {
      _chuThich: 'Cây mục lục của HEdu. Nạp lại bằng nút "Nạp cây từ file…" trong mục Chương trình.',
      name: tax.name,
      format: FORMAT,
      levels: [
        { code: 'N', name: 'Nhận biết', ord: 0 },
        { code: 'H', name: 'Thông hiểu', ord: 1 },
        { code: 'V', name: 'Vận dụng', ord: 2 },
        { code: 'C', name: 'Vận dụng cao', ord: 3 },
      ],
      nodes: tax.grades.map((g) =>
        node(g.code, g.name, g.branches.map((b) =>
          node(b.code, b.name, b.chapters.map((c) =>
            node(c.code, c.name, c.lessons.map((l) =>
              node(l.code, l.name, l.forms.map((f) => node(f.code, f.name))))))))),
      ),
    },
    null,
    1,
  );
}

export interface ParseResult { tax: Taxonomy; warnings: string[] }

/** Đọc file cây (định dạng của HEdu hoặc của MathHub — cùng dạng nodes/code/name/children). */
export function fromJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File không phải JSON hợp lệ.');
  }
  const root = data as { nodes?: unknown; name?: unknown };
  const nodes = root?.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) throw new Error('File không có mục "nodes", hoặc cây rỗng.');

  const warnings: string[] = [];
  const read = (raw: unknown, kind: TaxKind, path: string): AnyNode | null => {
    const n = raw as JsonNode;
    const code = String(n?.code ?? '').trim().toUpperCase();
    const name = String(n?.name ?? '').trim();
    if (!code || !name) {
      warnings.push(`Bỏ qua một ${KIND_LABEL[kind].toLowerCase()} thiếu mã hoặc tên (ở ${path || 'gốc'}).`);
      return null;
    }
    if (!CODE_RE.test(code)) {
      warnings.push(`Mã "${code}" ở ${path}${code} dài hơn một ký tự nên bị bỏ qua.`);
      return null;
    }
    const kids = Array.isArray(n?.children) ? n.children : [];
    const ck = childKind(kind);
    const list = ck ? kids.map((k) => read(k, ck, path + code)).filter((x): x is AnyNode => x !== null) : [];
    const id = newId(kind);
    if (kind === 'grade') return { id, code, name, grade: gradeNumber(code), branches: list as Branch[] };
    if (kind === 'branch') return { id, code, name, chapters: list as Chapter[] };
    if (kind === 'chapter') return { id, code, name, lessons: list as Lesson[] };
    if (kind === 'lesson') return { id, code, name, forms: list as Form[] };
    return { id, code, name };
  };

  const grades = nodes.map((g) => read(g, 'grade', '')).filter((x): x is Grade => x !== null);
  if (!grades.length) throw new Error('Không đọc được lớp nào trong file.');
  const seen = new Set<string>();
  for (const g of grades) {
    if (seen.has(g.code)) warnings.push(`Có hai lớp cùng mã "${g.code}".`);
    seen.add(g.code);
  }
  return { tax: { name: String(root?.name ?? 'Khung chương trình'), grades }, warnings };
}

/** Đếm số nút mỗi cấp, để hiện "30 chương · 99 bài · 532 dạng". */
export function countNodes(tax: Taxonomy) {
  let branches = 0;
  let chapters = 0;
  let lessons = 0;
  let forms = 0;
  for (const g of tax.grades) {
    branches += g.branches.length;
    for (const b of g.branches) {
      chapters += b.chapters.length;
      for (const c of b.chapters) {
        lessons += c.lessons.length;
        for (const l of c.lessons) forms += l.forms.length;
      }
    }
  }
  return { grades: tax.grades.length, branches, chapters, lessons, forms };
}
