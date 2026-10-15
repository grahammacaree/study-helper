import type { ConceptDef, KnowledgeEntry } from "./types";

export interface LibraryHit {
  id: string;
  name: string;
  /** Short reason this row matched (name, theorem title, note snippet). */
  where: string;
}

function fold(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(raw: string): string[] {
  return fold(raw).split(" ").filter((w) => w.length >= 2);
}

function hayHasQuery(hay: string, queryTokens: string[]): boolean {
  if (!queryTokens.length) return false;
  const h = fold(hay);
  if (!h) return false;
  // Prefer contiguous phrase when the query was typed that way.
  if (h.includes(queryTokens.join(" "))) return true;
  return queryTokens.every((t) => h.includes(t));
}

function snippet(hay: string, queryTokens: string[], max = 72): string {
  const h = hay.replace(/\s+/g, " ").trim();
  const lower = h.toLowerCase();
  let i = -1;
  for (const t of queryTokens) {
    i = lower.indexOf(t);
    if (i >= 0) break;
  }
  if (i < 0) return h.slice(0, max);
  const start = Math.max(0, i - 16);
  const chunk = h.slice(start, start + max).trim();
  return `${start > 0 ? "…" : ""}${chunk}${start + max < h.length ? "…" : ""}`;
}

/**
 * Search unlocked library nodes by name, knowledge notes/theorems/vocab,
 * and stored teaching text. Rank name hits first.
 */
export function searchLibrary(
  query: string,
  unlocked: Set<string>,
  concepts: Record<string, ConceptDef>,
  knowledge: KnowledgeEntry[] = [],
  teachings: Record<string, string> = {},
): LibraryHit[] {
  const queryTokens = tokens(query);
  if (queryTokens.length < 1 || fold(query).length < 2) return [];
  const byId = new Map(knowledge.map((row) => [row.id, row]));
  const hits: Array<LibraryHit & { score: number }> = [];

  for (const id of unlocked) {
    const def = concepts[id];
    if (!def) continue;
    const name = def.name;
    const nameHay = `${name} ${id.replace(/-/g, " ")}`;
    if (hayHasQuery(nameHay, queryTokens)) {
      const nameFold = fold(name);
      hits.push({
        id,
        name,
        where: "name",
        score: 100 + (nameFold.startsWith(queryTokens[0]) ? 10 : 0),
      });
      continue;
    }

    const entry = byId.get(id);
    let where = "";
    let score = 0;
    if (entry) {
      for (const th of entry.theorems ?? []) {
        const blob = [th.title, th.claim, th.proof].filter(Boolean).join(" ");
        if (hayHasQuery(blob, queryTokens)) {
          where = th.title?.trim() || snippet(th.claim, queryTokens);
          score = 80;
          break;
        }
      }
      if (!score) {
        for (const term of entry.vocab ?? []) {
          if (hayHasQuery(term, queryTokens)) {
            where = term.split("—")[0]?.trim() || term.slice(0, 48);
            score = 70;
            break;
          }
        }
      }
      if (!score && hayHasQuery(entry.note, queryTokens)) {
        where = snippet(entry.note, queryTokens);
        score = 60;
      }
      if (!score && entry.example && hayHasQuery(entry.example, queryTokens)) {
        where = snippet(entry.example, queryTokens);
        score = 55;
      }
    }
    if (!score) {
      const teaching = teachings[id];
      if (teaching && hayHasQuery(teaching, queryTokens)) {
        where = snippet(teaching.replace(/^#+.*$/m, "").trim(), queryTokens);
        score = 50;
      }
    }
    if (score) hits.push({ id, name, where, score });
  }

  hits.sort(
    (a, b) =>
      b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  return hits.slice(0, 40).map(({ id, name, where }) => ({ id, name, where }));
}
