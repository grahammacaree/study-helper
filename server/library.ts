import type { Catalog } from "./catalog.js";
import { isReviewLectureTitle, isStudyConcept } from "./conceptShape.js";
import { lectureIsComplete } from "./lectureProgress.js";
import type { LectureStatus } from "./types.js";

export function unlockedConceptIds(
  catalog: Catalog,
  progress: Record<string, Record<string, LectureStatus>>,
  extraIds: string[] = [],
): Set<string> {
  const linked = new Set<string>();
  for (const course of catalog.courses) {
    for (const lec of catalog.lectures[course.id] ?? []) {
      const status = progress[course.id]?.[String(lec.n)];
      if (!lectureIsComplete(status)) continue;
      if (isReviewLectureTitle(lec.title)) continue;
      for (const id of lec.conceptIds) {
        if (!isStudyConcept(catalog.concepts[id]?.name ?? id, id)) continue;
        linked.add(id);
      }
    }
  }
  const out = new Set<string>();
  for (const id of linked) {
    let cur: string | undefined = id;
    const seen = new Set<string>();
    while (cur && catalog.concepts[cur] && !seen.has(cur)) {
      seen.add(cur);
      out.add(cur);
      cur = catalog.concepts[cur].parentId;
    }
  }
  for (const id of extraIds) {
    if (!isStudyConcept(catalog.concepts[id]?.name ?? id, id)) continue;
    out.add(id);
  }
  return out;
}

export function lecturesForConcept(
  catalog: Catalog,
  progress: Record<string, Record<string, LectureStatus>>,
  conceptId: string,
): { courseTitle: string; n: number; title: string }[] {
  const direct: { courseTitle: string; n: number; title: string }[] = [];
  const inherited: { courseTitle: string; n: number; title: string }[] = [];
  for (const course of catalog.courses) {
    for (const lec of catalog.lectures[course.id] ?? []) {
      const status = progress[course.id]?.[String(lec.n)];
      if (!lectureIsComplete(status) && !course.complete) continue;
      if (isReviewLectureTitle(lec.title)) continue;
      const row = { courseTitle: course.title, n: lec.n, title: lec.title };
      if (lec.conceptIds.includes(conceptId)) {
        direct.push(row);
        continue;
      }
      if (lectureTouchesConcept(catalog, lec.conceptIds, conceptId)) {
        inherited.push(row);
      }
    }
  }
  return direct.length ? direct : inherited;
}

/** Courses whose lectures tag this concept or a descendant. */
export function coursesForConcept(
  catalog: Catalog,
  conceptId: string,
): { id: string; title: string; instructors: string; sourceUrl: string }[] {
  const ids = new Set<string>();
  for (const course of catalog.courses) {
    for (const lec of catalog.lectures[course.id] ?? []) {
      if (lectureTouchesConcept(catalog, lec.conceptIds, conceptId)) {
        ids.add(course.id);
        break;
      }
    }
  }
  return catalog.courses
    .filter((c) => ids.has(c.id))
    .map((c) => ({
      id: c.id,
      title: c.title,
      instructors: c.instructors,
      sourceUrl: c.sourceUrl,
    }));
}

function lectureTouchesConcept(
  catalog: Catalog,
  tagged: string[],
  conceptId: string,
): boolean {
  for (const id of tagged) {
    let cur: string | undefined = id;
    const seen = new Set<string>();
    while (cur && catalog.concepts[cur] && !seen.has(cur)) {
      if (cur === conceptId) return true;
      seen.add(cur);
      cur = catalog.concepts[cur].parentId;
    }
  }
  return false;
}
