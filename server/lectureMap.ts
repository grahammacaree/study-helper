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

function sameToken(a: string, b: string): boolean {
  return a === b || a === `${b}s` || b === `${a}s`;
}

function foldedHas(haystack: string, needle: string): boolean {
  if (!needle) return false;
  if (` ${haystack} `.includes(` ${needle} `)) return true;
  // "matrix exponentials" is the idea "matrix exponential". A one-word
  // plural stays distinct so "exponentials" does not become the memoryless exponential.
  if (!needle.includes(" ")) return false;
  const hay = haystack.split(" ").filter(Boolean);
  const need = needle.split(" ").filter(Boolean);
  if (hay.length < need.length) return false;
  for (let i = 0; i <= hay.length - need.length; i += 1) {
    if (need.every((tok, k) => sameToken(hay[i + k], tok))) return true;
  }
  return false;
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

function fieldRoot(id: string, concepts: Record<string, ConceptDef>): string {
  const seen = new Set<string>();
  let cur = id;
  while (concepts[cur]?.parentId && !seen.has(cur)) {
    seen.add(cur);
    cur = concepts[cur].parentId as string;
  }
  return cur;
}

function childCount(id: string, concepts: Record<string, ConceptDef>): number {
  let n = 0;
  for (const def of Object.values(concepts)) {
    if (def.parentId === id) n += 1;
  }
  return n;
}

/**
 * A later course sometimes grows a second node whose name *is* an idea that
 * already lives under another field ("Eigenvalues" beside "Eigenvalues and
 * diagonalization"). That copy is the same node. Neighbors (linear systems
 * pointing at eigenvalues, graph theory pointing at BFS) do not match this
 * way and stay put.
 */
export function canonicalConceptId(
  id: string,
  concepts: Record<string, ConceptDef>,
  seen: Set<string> = new Set(),
): string {
  const def = concepts[id];
  if (!def || seen.has(id) || !isStudyConcept(def.name, id)) return id;
  seen.add(id);
  const self = scoreTitle(def.name, id, def.name);
  const mine = fieldRoot(id, concepts);
  const kids = childCount(id, concepts);
  let bestId = id;
  let bestScore = self;
  let bestKids = kids;
  for (const [otherId, other] of Object.entries(concepts)) {
    if (otherId === id || seen.has(otherId)) continue;
    if (!isStudyConcept(other.name, otherId)) continue;
    if (fieldRoot(otherId, concepts) === mine) continue;
    const score = scoreTitle(def.name, otherId, other.name);
    if (score < 14 || score < self) continue;
    const kidsOther = childCount(otherId, concepts);
    const fuller = other.name.length > concepts[bestId].name.length;
    const better =
      score > bestScore ||
      (score === bestScore && (kidsOther > bestKids || (kidsOther === bestKids && fuller)));
    if (!better) continue;
    bestId = otherId;
    bestScore = score;
    bestKids = kidsOther;
  }
  return bestId === id ? id : canonicalConceptId(bestId, concepts, seen);
}

/** Leaf or category tags a lecture title clearly names. Continuation inherits `prior`. */
export function suggestedConceptIds(
  title: string,
  concepts: Record<string, ConceptDef>,
  prior?: string[],
): string[] {
  if (isReviewLectureTitle(title)) return [];
  const scored: { id: string; score: number }[] = [];
  for (const [id, def] of Object.entries(concepts)) {
    if (!isStudyConcept(def.name, id)) continue;
    const score = scoreTitle(title, id, def.name);
    if (score <= 0) continue;
    // Category roots need a clear name hit; do not skip them entirely —
    // Cryptography / Probability are real tags when the title says so.
    if (!def.parentId && score < 14) continue;
    scored.push({ id, score });
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
    .map((row) => canonicalConceptId(row.id, concepts));
  const deduped: string[] = [];
  for (const id of ids) {
    if (!deduped.includes(id)) deduped.push(id);
  }
  ids.splice(0, ids.length, ...deduped);
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
    const canon = canonicalConceptId(id, concepts);
    if (!canon || !concepts[canon] || out.includes(canon)) return;
    out.push(canon);
  };
  for (const id of suggested) add(id);
  // Keep curated tags the title does not name (e.g. Cryptography on
  // "Number theory II"). Only drop embedded false positives like
  // `geometric` inside `geometrical`.
  for (const id of existing) {
    const def = concepts[id];
    if (!def) continue;
    if (title && isEmbeddedName(title, id, def.name) && scoreTitle(title, id, def.name) <= 0) {
      continue;
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
