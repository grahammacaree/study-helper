import type { Catalog } from "./catalog.js";
import { lectureIsComplete } from "./lectureProgress.js";
import type { LectureStatus } from "./types.js";

export const MAX_QUIZ = 5;
export const DEBRIEF_LOCAL = 3;
export const DEBRIEF_DECAY = 2;
export const DEBRIEF_QUIZ_P = 0.2;


export function shouldOfferDebriefQuiz(rng: () => number = Math.random): boolean {
  return rng() < DEBRIEF_QUIZ_P;
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
      for (const id of lec.conceptIds) {
        if (!catalog.concepts[id] || seen.has(id)) continue;
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
): string[] {
  const unique = [...new Set(courseHits)];
  unique.sort((a, b) => {
    const fa = freshness[a] ?? 0;
    const fb = freshness[b] ?? 0;
    if (fa !== fb) return fa - fb;
    return a.localeCompare(b);
  });
  return unique.slice(0, MAX_QUIZ);
}
