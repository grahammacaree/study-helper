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

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    throw err;
  }
}

export async function loadCatalog(): Promise<Catalog> {
  if (cached) return cached;
  const empty: Catalog = { courses: [], concepts: {}, lectures: {}, blurbs: {} };
  const indexRaw = await readOptional(join(coursesDir(), "index.json"));
  if (!indexRaw) {
    cached = empty;
    return cached;
  }
  const index = JSON.parse(indexRaw) as { courses: CourseMeta[] };
  const conceptsRaw = await readOptional(join(coursesDir(), "concepts.json"));
  const concepts = conceptsRaw
    ? (JSON.parse(conceptsRaw) as Record<string, ConceptDef>)
    : {};
  const lectures: Record<string, Lecture[]> = {};
  const blurbs: Record<string, string> = {};
  for (const course of index.courses) {
    const lecRaw = await readOptional(
      join(coursesDir(), course.id, "lectures.json"),
    );
    lectures[course.id] = lecRaw ? (JSON.parse(lecRaw) as Lecture[]) : [];
    blurbs[course.id] = (await readOptional(
      join(coursesDir(), course.id, "course.md"),
    )) ?? "";
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
