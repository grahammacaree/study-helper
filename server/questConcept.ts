import type { Catalog } from "./catalog.js";
import type { ConceptDef, SideQuest } from "./types.js";

export function slugConceptId(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "side-quest";
}

/** Exact name or slug hit in the library — no model. */
export function matchExistingConcept(
  concepts: Record<string, ConceptDef>,
  title: string,
): { id: string; name: string } | undefined {
  const trimmed = title.trim();
  if (!trimmed) return undefined;
  const slug = slugConceptId(trimmed);
  if (concepts[slug]) return { id: slug, name: concepts[slug].name };
  const lower = trimmed.toLowerCase();
  for (const [id, def] of Object.entries(concepts)) {
    if (def.name.toLowerCase() === lower) return { id, name: def.name };
  }
  return undefined;
}

export function conceptIdForQuest(
  quest: Pick<SideQuest, "id" | "title" | "conceptId">,
  taken: Set<string>,
): string {
  if (quest.conceptId) return quest.conceptId;
  const slug = slugConceptId(quest.title);
  if (!taken.has(slug)) return slug;
  const tagged = `quest-${quest.id.replace(/^q-/, "")}`;
  if (!taken.has(tagged)) return tagged;
  return quest.id;
}

export function parentIdForQuest(
  quest: Pick<SideQuest, "courseId" | "lectureN">,
  catalog: Catalog,
): string | undefined {
  if (!quest.courseId || quest.lectureN == null) return undefined;
  const lec = catalog.lectures[quest.courseId]?.find((l) => l.n === quest.lectureN);
  const parent = lec?.conceptIds[0];
  if (parent && catalog.concepts[parent]) return parent;
  return undefined;
}

export function conceptsFromDoneQuests(
  catalog: Catalog,
  quests: SideQuest[],
): {
  concepts: Record<string, ConceptDef>;
  questConceptIds: string[];
  missingIds: { quest: SideQuest; id: string }[];
} {
  const concepts: Record<string, ConceptDef> = {};
  for (const [id, def] of Object.entries(catalog.concepts)) {
    concepts[id] = { ...def, seeAlso: def.seeAlso ? [...def.seeAlso] : undefined };
  }
  const questConceptIds: string[] = [];
  const missingIds: { quest: SideQuest; id: string }[] = [];
  const taken = new Set(Object.keys(concepts));
  for (const quest of quests) {
    if (quest.status !== "done") continue;
    const id = conceptIdForQuest(quest, taken);
    taken.add(id);
    if (!quest.conceptId) missingIds.push({ quest, id });
    const parentId = parentIdForQuest(quest, catalog);
    if (!concepts[id]) {
      concepts[id] = {
        name: quest.title,
        ...(parentId ? { parentId } : {}),
      };
    }
    questConceptIds.push(id);
    if (parentId && concepts[parentId]) {
      const seeAlso = new Set(concepts[parentId].seeAlso ?? []);
      seeAlso.add(id);
      concepts[parentId] = { ...concepts[parentId], seeAlso: [...seeAlso] };
    }
  }
  return { concepts, questConceptIds, missingIds };
}
