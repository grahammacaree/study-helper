import {
  applyDecayHints,
  DAY_MS,
  ECHO_WEIGHT,
  entryFreshness,
  SEED_CURRENT_DAYS,
  SEED_PREVIOUS_DAYS,
} from "../server/decay.js";
import { loadCatalog } from "../server/catalog.js";
import type { LectureStatus } from "../server/types.js";

let failures = 0;

function fail(why: string): void {
  failures += 1;
  console.log(`FAIL ${why}`);
}

const catalog = await loadCatalog();
const now = Date.UTC(2026, 8, 12);
// algorithms-6006 lecture 9 is only `bfs` (previously). 6.042 lecture 6 is
// only `graph-theory` (currently), and that node seeAlso bfs.
const progress: Record<string, Record<string, LectureStatus>> = {
  "algorithms-6006": { "9": "complete" },
  "math-for-cs-6042": { "6": "complete" },
};

const { decay } = applyDecayHints({
  catalog,
  progress,
  decay: {},
  now,
});

const older = decay.bfs;
const newer = decay["graph-theory"];
if (!older?.directAt) fail("bfs should be seeded from Algorithms");
if (!newer?.directAt) fail("graph-theory should be seeded from 6.042");
if (!older.seeded || !newer.seeded) fail("historical dates are seeds, not sessions");

const olderAge = (now - (older.directAt ?? 0)) / DAY_MS;
const newerAge = (now - (newer.directAt ?? 0)) / DAY_MS;
if (Math.abs(olderAge - SEED_PREVIOUS_DAYS) > 0.5) {
  fail(`bfs seed age ${olderAge}, expected ${SEED_PREVIOUS_DAYS}`);
}
if (Math.abs(newerAge - SEED_CURRENT_DAYS) > 0.5) {
  fail(`graph-theory seed age ${newerAge}, expected ${SEED_CURRENT_DAYS}`);
}

const echo = older.echoes.find((e) => e.via === "graph-theory");
if (!echo) fail("graph-theory should echo onto bfs");

const withoutEcho = entryFreshness({ ...older, echoes: [] }, now);
const withEcho = entryFreshness(older, now);
if (withEcho <= withoutEcho) {
  fail("echo must raise freshness above the months-old direct study");
}
if (withEcho > withoutEcho + ECHO_WEIGHT + 0.01) {
  fail("echo must not count as a full restudy");
}

if (failures) throw new Error(`${failures} decay check(s) failed`);
console.log(
  `ok bfs freshness ${withEcho.toFixed(3)} (direct-only ${withoutEcho.toFixed(3)}), echoed via graph-theory`,
);
