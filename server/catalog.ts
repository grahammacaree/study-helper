import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot } from "./env.js";
import type { ConceptDef, CourseMeta, Lecture } from "./types.js";

export interface Catalog {
  courses: CourseMeta[];
  concepts: Record<string, ConceptDef>;
  lectures: Record<string, Lecture[]>;
  blurbs: Record<string, string>;
}

let cached: Catalog | undefined;

function coursesDir(): string {
  return join(projectRoot(), "courses");
}

export function invalidateCatalog(): void {
  cached = undefined;
}

export async function loadCatalog(): Promise<Catalog> {
  if (cached) return cached;
  const indexRaw = await readFile(join(coursesDir(), "index.json"), "utf8");
  const index = JSON.parse(indexRaw) as { courses: CourseMeta[] };
  const conceptsRaw = await readFile(join(coursesDir(), "concepts.json"), "utf8");
  const concepts = JSON.parse(conceptsRaw) as Record<string, ConceptDef>;
  const lectures: Record<string, Lecture[]> = {};
  const blurbs: Record<string, string> = {};
  for (const course of index.courses) {
    const lecRaw = await readFile(
      join(coursesDir(), course.id, "lectures.json"),
      "utf8",
    );
    lectures[course.id] = JSON.parse(lecRaw) as Lecture[];
    blurbs[course.id] = await readFile(
      join(coursesDir(), course.id, "course.md"),
      "utf8",
    );
  }
  cached = { courses: index.courses, concepts, lectures, blurbs };
  return cached;
}

export function expandConceptIds(
  catalog: Catalog,
  ids: string[],
): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(id);
    for (const other of catalog.concepts[id]?.seeAlso ?? []) out.add(other);
  }
  return [...out];
}

/** Parent, children, and catalog seeAlso — not every sibling under a fat root. */
export function relatedConcepts(
  concepts: Record<string, ConceptDef>,
  id: string,
): { id: string; name: string }[] {
  const def = concepts[id];
  if (!def) return [];
  const ids: string[] = [];
  const add = (other?: string) => {
    if (!other || other === id || !concepts[other] || ids.includes(other)) return;
    ids.push(other);
  };
  add(def.parentId);
  for (const other of def.seeAlso ?? []) add(other);
  for (const [cid, row] of Object.entries(concepts)) {
    if (row.parentId === id) add(cid);
  }
  return ids.slice(0, 12).map((cid) => ({ id: cid, name: concepts[cid].name }));
}

export function lectureOf(
  catalog: Catalog,
  courseId: string,
  n: number,
): Lecture {
  const list = catalog.lectures[courseId];
  const found = list?.find((l) => l.n === n);
  if (!found) throw new Error(`Unknown lecture ${courseId} #${n}.`);
  return found;
}

export function courseOf(catalog: Catalog, courseId: string): CourseMeta {
  const found = catalog.courses.find((c) => c.id === courseId);
  if (!found) throw new Error(`Unknown course ${courseId}.`);
  return found;
}
