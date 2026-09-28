import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { invalidateCatalog, type Catalog } from "./catalog.js";
import { isReviewLectureTitle, isStudyConcept } from "./conceptShape.js";
import { projectRoot } from "./env.js";
import type { ConceptDef, Lecture } from "./types.js";

function fold(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const WEAK = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "into",
  "using",
  "about",
  "that",
  "this",
  "onto",
  "over",
]);

function distinctiveKeys(id: string, name: string): string[] {
  const keys: string[] = [];
  const add = (raw: string, min: number) => {
    const t = fold(raw);
    if (t.length >= min) keys.push(t);
  };
  add(name, 5);
  // "Complex exponentials and sinusoids" should still match a lecture that
  // only says "Complex Exponentials".
  const beforeAnd = fold(name).replace(/\band\b.+$/, "").trim();
  if (beforeAnd && beforeAnd !== fold(name)) add(beforeAnd, 8);
  const idPhrase = id.replace(/-/g, " ");
  if (idPhrase.includes(" ") || fold(name) === idPhrase) add(idPhrase, 5);
  const parts = id.split("-").filter(Boolean);
  for (let i = 0; i < parts.length - 1; i += 1) {
    add(`${parts[i]} ${parts[i + 1]}`, 8);
  }
  return [...new Set(keys)];
}

function foldedHas(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function scoreTitle(title: string, id: string, name: string): number {
  const t = fold(title);
  if (!t) return 0;
  let best = 0;
  for (const key of distinctiveKeys(id, name)) {
    if (foldedHas(t, key)) best = Math.max(best, 10 + key.length);
  }
  const words = fold(name)
    .split(" ")
    .filter((w) => w.length >= 4 && !WEAK.has(w));
  if (words.length) {
    const hit = words.filter((w) => foldedHas(t, w)).length;
    if (hit === words.length && words.length >= 2) {
      best = Math.max(best, 6 + hit);
    }
  }
  return best;
}

/** `geometric` inside `geometrical` / `hypergeometric` — not a real title hit. */
function isEmbeddedName(title: string, id: string, name: string): boolean {
  const t = fold(title);
  if (!t) return false;
  const needles = [
    ...distinctiveKeys(id, name),
    ...fold(name)
      .split(" ")
      .filter((w) => w.length >= 4 && !WEAK.has(w)),
  ];
  return needles.some((n) => t.includes(n) && !foldedHas(t, n));
}

/** Leaf tags a lecture title clearly names. Continuation inherits `prior`. */
export function suggestedConceptIds(
  title: string,
  concepts: Record<string, ConceptDef>,
  prior?: string[],
): string[] {
  if (isReviewLectureTitle(title)) return [];
  const scored: { id: string; score: number }[] = [];
  for (const [id, def] of Object.entries(concepts)) {
    if (!isStudyConcept(def.name, id)) continue;
    if (!def.parentId) continue;
    const score = scoreTitle(title, id, def.name);
    if (score > 0) scored.push({ id, score });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const ids = scored
    .filter((row) => {
      if (row.score < scored[0].score - 8) return false;
      return !scored.some(
        (other) => other.id !== row.id && concepts[other.id]?.parentId === row.id,
      );
    })
    .slice(0, 3)
    .map((row) => row.id);
  if (/^\s*continuation\b/i.test(title.trim()) && prior?.length) {
    const seen = new Set(ids);
    for (const id of prior) {
      if (concepts[id] && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    return ids.slice(0, 4);
  }
  return ids;
}

export function mergeLectureConceptIds(
  existing: string[],
  suggested: string[],
  concepts: Record<string, ConceptDef>,
  title = "",
): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    if (!id || !concepts[id] || out.includes(id)) return;
    out.push(id);
  };
  for (const id of suggested) add(id);
  for (const id of existing) {
    const def = concepts[id];
    if (!def) continue;
    if (title) {
      const score = scoreTitle(title, id, def.name);
      if (score <= 0) {
        if (suggested.length) continue;
        if (isEmbeddedName(title, id, def.name)) continue;
      }
    }
    add(id);
  }
  return out.filter((id) => {
    const childHit = out.some((other) => concepts[other]?.parentId === id);
    return !childHit;
  }).slice(0, 4);
}

export async function syncLectureConceptTags(catalog: Catalog): Promise<boolean> {
  let changed = false;
  for (const course of catalog.courses) {
    const lectures = catalog.lectures[course.id] ?? [];
    let dirty = false;
    let prior: string[] | undefined;
    const next: Lecture[] = lectures.map((lec) => {
      const suggested = suggestedConceptIds(lec.title, catalog.concepts, prior);
      const conceptIds = mergeLectureConceptIds(
        lec.conceptIds,
        suggested,
        catalog.concepts,
        lec.title,
      );
      prior = conceptIds.length ? conceptIds : prior;
      if (conceptIds.join() === lec.conceptIds.join()) return lec;
      dirty = true;
      return { ...lec, conceptIds };
    });
    if (!dirty) continue;
    changed = true;
    catalog.lectures[course.id] = next;
    await writeFile(
      join(projectRoot(), "courses", course.id, "lectures.json"),
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8",
    );
  }
  if (changed) invalidateCatalog();
  return changed;
}
