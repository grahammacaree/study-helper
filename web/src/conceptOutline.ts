import type { ConceptDef } from "./types";

/** Same beats as `server/conceptOutline.ts` — keep them in lockstep. */
export function seedConceptOutline(
  name: string,
  parentName?: string,
  relatedNames: string[] = [],
): string[] {
  const beats = [
    `Getting ${name} straight`,
    "When you'd actually use this",
    "The mix-up that usually bites",
  ];
  if (parentName) beats.push(`How this hangs off ${parentName}`);
  const hop = relatedNames.filter((n) => n !== name).slice(0, 2);
  if (hop.length === 1) beats.push(`And ${hop[0]} nearby`);
  else if (hop.length > 1) beats.push(`And ${hop[0]}, ${hop[1]} nearby`);
  return beats;
}

export function relatedNamesFor(
  concepts: Record<string, ConceptDef>,
  id: string,
): string[] {
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
  return ids.slice(0, 12).map((cid) => concepts[cid].name);
}
