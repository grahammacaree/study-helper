import type {
  CatalogCourse,
  ConceptDef,
  LectureStatus,
} from "./types";

export interface LibraryNode {
  id: string;
  name: string;
  children: LibraryNode[];
}

const UNLOCK_STATUS: LectureStatus[] = ["complete"];

export function unlockedConceptIds(
  courses: CatalogCourse[],
  concepts: Record<string, ConceptDef>,
  extraIds: string[] = [],
): Set<string> {
  const linked = new Set<string>();
  for (const course of courses) {
    for (const lec of course.lectures) {
      if (!UNLOCK_STATUS.includes(lec.status)) continue;
      for (const id of lec.conceptIds) linked.add(id);
    }
  }
  const out = new Set<string>();
  for (const id of linked) {
    let cur: string | undefined = id;
    const seen = new Set<string>();
    while (cur && concepts[cur] && !seen.has(cur)) {
      seen.add(cur);
      out.add(cur);
      cur = concepts[cur].parentId;
    }
  }
  for (const id of extraIds) out.add(id);
  return out;
}

export function libraryForest(
  concepts: Record<string, ConceptDef>,
  unlocked: Set<string>,
): LibraryNode[] {
  const children = new Map<string | undefined, string[]>();
  for (const id of Object.keys(concepts)) {
    if (!unlocked.has(id)) continue;
    const parent = concepts[id].parentId;
    const key = parent && unlocked.has(parent) ? parent : undefined;
    const list = children.get(key) ?? [];
    list.push(id);
    children.set(key, list);
  }
  function branch(ids: string[]): LibraryNode[] {
    return ids
      .slice()
      .sort((a, b) => concepts[a].name.localeCompare(concepts[b].name))
      .map((id) => ({
        id,
        name: concepts[id].name,
        children: branch(children.get(id) ?? []),
      }));
  }
  return branch(children.get(undefined) ?? []);
}

export function ancestorIds(
  concepts: Record<string, ConceptDef>,
  id: string | undefined,
): string[] {
  const out: string[] = [];
  let cur = id ? concepts[id]?.parentId : undefined;
  const seen = new Set<string>();
  while (cur && concepts[cur] && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = concepts[cur].parentId;
  }
  return out;
}
