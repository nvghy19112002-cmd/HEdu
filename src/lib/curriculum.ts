// Kho chứa cây mục lục đang dùng. Cây nằm trong dữ liệu của người dùng (sửa được),
// khi chưa có thì lấy cây mặc định đi kèm bản cài.
import { useSyncExternalStore } from 'react';
import type { Location, Taxonomy } from './types';
import { buildDefault, chaptersOfGrade, indexOf, type ChapterRef, type Place, type TaxIndex } from './taxonomy';

let current: Taxonomy = buildDefault();
let ix: TaxIndex = indexOf(current);
let snapshot = { tax: current, ix };
const subs = new Set<() => void>();

export function getTaxonomy(): Taxonomy {
  return current;
}

export function setTaxonomy(next: Taxonomy) {
  current = next;
  ix = indexOf(next);
  snapshot = { tax: current, ix };
  subs.forEach((f) => f());
}

export function resetTaxonomy() {
  setTaxonomy(buildDefault());
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}

/** Dùng trong component để vẽ lại khi cây đổi. */
export function useTaxonomy() {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export function place(id: string | undefined): Place | undefined {
  return id ? ix.get(id) : undefined;
}

export const findChapter = (id: string) => place(id)?.chapter;
export const findLesson = (id: string) => place(id)?.lesson;
export const findForm = (id: string) => place(id)?.form;

export function grades(): number[] {
  return current.grades.map((g) => g.grade);
}

export function getGrade(grade: number) {
  return current.grades.find((g) => g.grade === grade) ?? current.grades[0];
}

export function chapters(grade: number): ChapterRef[] {
  return chaptersOfGrade(current, grade);
}

/** Vị trí hợp lệ đầu tiên, dùng khi mở màn soạn thảo hoặc khi vị trí cũ không còn. */
export function firstLocation(grade?: number, chapterId?: string, lessonId?: string): Location {
  const g = grade != null ? getGrade(grade) : current.grades[current.grades.length - 1];
  const list = chaptersOfGrade(current, g?.grade ?? 0);
  const ch = list.find((c) => c.id === chapterId) ?? list[0];
  const ls = ch?.lessons.find((l) => l.id === lessonId) ?? ch?.lessons[0];
  const fm = ls?.forms[0];
  return { grade: g?.grade ?? 0, chapterId: ch?.id ?? '', lessonId: ls?.id ?? '', formId: fm?.id ?? '' };
}

/** Vị trí còn tồn tại trong cây hiện tại không? (cây có thể đã bị sửa hoặc thay) */
export function locationExists(loc: Location): boolean {
  const p = place(loc.formId) ?? place(loc.lessonId) ?? place(loc.chapterId);
  return !!p;
}

/** Nhãn ngắn "Lớp 12 · Chương 1 · Bài 2" cho danh sách câu hỏi. */
export function locLabel(loc: Location): string {
  const p = place(loc.lessonId) ?? place(loc.chapterId);
  if (!p) return 'Chưa gán vị trí';
  const bits = [`Lớp ${p.grade.grade}`, p.chapter?.name, p.lesson?.name].filter(Boolean) as string[];
  return bits.join(' · ');
}

export type { ChapterRef };
