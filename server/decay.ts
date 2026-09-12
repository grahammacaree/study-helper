import type { Catalog } from "./catalog.js";
import { lectureIsComplete } from "./lectureProgress.js";
import type { ConceptDef, LectureStatus } from "./types.js";

export const DAY_MS = 86_400_000;
export const HALF_LIFE_DAYS = 60;
export const ECHO_WEIGHT = 0.5;
export const SEED_PREVIOUS_DAYS = 120;
export const SEED_CURRENT_DAYS = 14;
const MAX_ECHOES = 8;

export interface DecayEcho {
  at: number;
  via: string;
  courseId?: string;
  lectureN?: number;
  note?: string;
}

export interface DecayEntry {
  directAt?: number;
  seeded?: boolean;
  echoes: DecayEcho[];
}

export type DecayMap = Record<string, DecayEntry>;

export interface DecayView {
  freshness: number;
  directAt?: number;
  seeded?: boolean;
  lastEcho?: DecayEcho;
}


export function neighbors(
  concepts: Record<string, ConceptDef>,
  id: string,
): string[] {
  const out = new Set(concepts[id]?.seeAlso ?? []);
  for (const [other, def] of Object.entries(concepts)) {
    if (other === id) continue;
    if (def.seeAlso?.includes(id)) out.add(other);
  }
  return [...out];
}

export function freshnessFromAge(ageMs: number): number {
  if (ageMs <= 0) return 1;
  return Math.exp((-Math.LN2 * ageMs) / (HALF_LIFE_DAYS * DAY_MS));
}

export function entryFreshness(entry: DecayEntry | undefined, now: number): number {
  if (!entry) return 0;
  const direct = entry.directAt
    ? freshnessFromAge(now - entry.directAt)
    : 0;
  let echoAt = 0;
  for (const echo of entry.echoes) {
    if (echo.at > echoAt) echoAt = echo.at;
  }
  const echoed = echoAt ? ECHO_WEIGHT * freshnessFromAge(now - echoAt) : 0;
  return Math.max(direct, echoed);
}

export function decayViews(
  decay: DecayMap,
  now: number,
): Record<string, DecayView> {
  const out: Record<string, DecayView> = {};
  for (const [id, entry] of Object.entries(decay)) {
    const lastEcho = entry.echoes.reduce<DecayEcho | undefined>((best, echo) => {
      if (!best || echo.at > best.at) return echo;
      return best;
    }, undefined);
    out[id] = {
      freshness: entryFreshness(entry, now),
      directAt: entry.directAt,
      seeded: entry.seeded,
      lastEcho,
    };
  }
  return out;
}

function ensure(decay: DecayMap, id: string): DecayEntry {
  const cur = decay[id];
  if (cur) return cur;
  const created: DecayEntry = { echoes: [] };
  decay[id] = created;
  return created;
}

export function touchConcepts(
  decay: DecayMap,
  ids: string[],
  at: number,
  meta?: { courseId?: string; lectureN?: number },
): DecayMap {
  const next: DecayMap = { ...decay };
  for (const id of ids) {
    const entry = { ...ensure(next, id), echoes: [...(next[id]?.echoes ?? [])] };
    entry.directAt = at;
    entry.seeded = false;
    next[id] = entry;
  }
  return next;
}

export function echoNeighbors(opts: {
  decay: DecayMap;
  concepts: Record<string, ConceptDef>;
  touched: string[];
  at: number;
  allowed: Set<string>;
  courseId?: string;
  lectureN?: number;
}): DecayMap {
  const next: DecayMap = { ...opts.decay };
  const touched = new Set(opts.touched);
  for (const id of opts.touched) {
    for (const viaTarget of neighbors(opts.concepts, id)) {
      if (touched.has(viaTarget)) continue;
      if (!opts.allowed.has(viaTarget)) continue;
      const entry = {
        ...ensure(next, viaTarget),
        echoes: [...(next[viaTarget]?.echoes ?? [])],
      };
      const recent = entry.echoes[0];
      if (
        recent &&
        recent.via === id &&
        opts.at - recent.at < DAY_MS
      ) {
        continue;
      }
      entry.echoes = [
        {
          at: opts.at,
          via: id,
          courseId: opts.courseId,
          lectureN: opts.lectureN,
        },
        ...entry.echoes,
      ].slice(0, MAX_ECHOES);
      next[viaTarget] = entry;
    }
  }
  return next;
}

export function applyDecayHints(opts: {
  catalog: Catalog;
  progress: Record<string, Record<string, LectureStatus>>;
  decay: DecayMap;
  now?: number;
}): { decay: DecayMap; changed: boolean } {
  const now = opts.now ?? Date.now();
  let next: DecayMap = { ...opts.decay };
  let changed = false;

  const linking = new Map<string, Set<"currently" | "previously">>();
  for (const course of opts.catalog.courses) {
    if (course.track === "later") continue;
    const track = course.track === "previously" ? "previously" : "currently";
    for (const lec of opts.catalog.lectures[course.id] ?? []) {
      const status = opts.progress[course.id]?.[String(lec.n)];
      if (!lectureIsComplete(status)) continue;
      for (const id of lec.conceptIds) {
        const tracks = linking.get(id) ?? new Set();
        tracks.add(track);
        linking.set(id, tracks);
      }
    }
  }

  for (const [id, tracks] of linking) {
    const entry = next[id];
    if (entry?.directAt) continue;
    const days = tracks.has("currently")
      ? SEED_CURRENT_DAYS
      : SEED_PREVIOUS_DAYS;
    next = {
      ...next,
      [id]: {
        directAt: now - days * DAY_MS,
        seeded: true,
        echoes: entry?.echoes ? [...entry.echoes] : [],
      },
    };
    changed = true;
  }

  for (const id of Object.keys(next)) {
    const self = next[id];
    if (!self?.directAt) continue;
    for (const other of neighbors(opts.catalog.concepts, id)) {
      const neighbour = next[other];
      if (!neighbour?.directAt) continue;
      if (neighbour.directAt <= self.directAt) continue;
      const already = (self.echoes ?? []).some((e) => e.via === other);
      if (already) continue;
      next = {
        ...next,
        [id]: {
          ...self,
          echoes: [
            { at: neighbour.directAt, via: other },
            ...(self.echoes ?? []),
          ].slice(0, MAX_ECHOES),
        },
      };
      changed = true;
    }
  }

  return { decay: next, changed };
}
