import type { Catalog } from "./catalog.js";
import { isReviewLectureTitle, isStudyConcept } from "./conceptShape.js";
import { lectureIsComplete } from "./lectureProgress.js";
import type { LectureStatus } from "./types.js";

export const MAX_QUIZ = 5;
export const DEBRIEF_LOCAL = 3;
export const DEBRIEF_DECAY = 2;
export const DEBRIEF_QUIZ_P = 0.2;
/** How much coldness can boost a review pick, relative to structural importance. */
export const REVIEW_COLD_WEIGHT = 2;

export function shouldOfferDebriefQuiz(rng: () => number = Math.random): boolean {
  return rng() < DEBRIEF_QUIZ_P;
}

/** How much a concept does in this course: lecture tags, children, seeAlso. */
export function importanceForCourse(
  catalog: Catalog,
  courseId: string,
  courseHits: string[],
): Record<string, number> {
  const hit = new Set(courseHits);
  const out: Record<string, number> = {};
  for (const id of hit) {
    let tags = 0;
    for (const lec of catalog.lectures[courseId] ?? []) {
      if (lec.conceptIds.includes(id)) tags += 1;
    }
    let children = 0;
    let links = 0;
    for (const other of hit) {
      if (catalog.concepts[other]?.parentId === id) children += 1;
      if (catalog.concepts[id]?.seeAlso?.includes(other)) links += 1;
      if (catalog.concepts[other]?.seeAlso?.includes(id)) links += 1;
    }
    out[id] = tags * 3 + children * 2 + links;
  }
  return out;
}

export function reviewScore(
  id: string,
  freshness: Record<string, number>,
  importance: Record<string, number>,
): number {
  const cold = 1 - (freshness[id] ?? 0);
  return (importance[id] ?? 0) + cold * REVIEW_COLD_WEIGHT;
}

/** Concepts that appear on a complete lecture — not ancestor-only unlocks. */
export function hitConceptIds(
  catalog: Catalog,
  progress: Record<string, Record<string, LectureStatus>>,
  courseId?: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const courses = courseId
    ? catalog.courses.filter((c) => c.id === courseId)
    : catalog.courses;
  for (const course of courses) {
    for (const lec of catalog.lectures[course.id] ?? []) {
      const status = progress[course.id]?.[String(lec.n)];
      if (!lectureIsComplete(status)) continue;
      if (isReviewLectureTitle(lec.title)) continue;
      for (const id of lec.conceptIds) {
        if (!catalog.concepts[id] || seen.has(id)) continue;
        if (!isStudyConcept(catalog.concepts[id].name, id)) continue;
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export function relatedToLecture(
  catalog: Catalog,
  lectureIds: string[],
  hit: Set<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  function add(id: string | undefined): void {
    if (!id || !catalog.concepts[id] || seen.has(id)) return;
    if (!lectureIds.includes(id) && !hit.has(id)) return;
    seen.add(id);
    out.push(id);
  }
  for (const id of lectureIds) add(id);
  for (const id of lectureIds) {
    for (const other of catalog.concepts[id]?.seeAlso ?? []) add(other);
    add(catalog.concepts[id]?.parentId);
    for (const [cid, def] of Object.entries(catalog.concepts)) {
      if (def.parentId === id) add(cid);
    }
  }
  return out;
}

export function pickDebriefMix(opts: {
  related: string[];
  decayed: string[];
}): string[] {
  const local: string[] = [];
  for (const id of opts.related) {
    if (local.length >= DEBRIEF_LOCAL) break;
    if (local.includes(id)) continue;
    local.push(id);
  }
  const used = new Set(local);
  const decay: string[] = [];
  for (const id of opts.decayed) {
    if (decay.length >= DEBRIEF_DECAY) break;
    if (used.has(id)) continue;
    used.add(id);
    decay.push(id);
  }
  return [...local, ...decay];
}

export function pickCourseReview(
  courseHits: string[],
  freshness: Record<string, number>,
  importance: Record<string, number> = {},
): string[] {
  const unique = [...new Set(courseHits)];
  unique.sort((a, b) => {
    const sa = reviewScore(a, freshness, importance);
    const sb = reviewScore(b, freshness, importance);
    if (sa !== sb) return sb - sa;
    return a.localeCompare(b);
  });
  return unique.slice(0, MAX_QUIZ);
}
