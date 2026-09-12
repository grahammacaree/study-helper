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
const progress: Record<string, Record<string, LectureStatus>> = {
  "learning-from-data": { "2": "complete" },
  "stat-110": { "28": "complete", "29": "complete" },
};

const { decay } = applyDecayHints({
  catalog,
  progress,
  decay: {},
  now,
});

const hoeffding = decay.hoeffding;
const chebyshev = decay.chebyshev;
if (!hoeffding?.directAt) fail("hoeffding should be seeded from LFD");
if (!chebyshev?.directAt) fail("chebyshev should be seeded from Stat 110");
if (!hoeffding.seeded || !chebyshev.seeded) fail("historical dates are seeds, not sessions");

const hoeffAge = (now - (hoeffding.directAt ?? 0)) / DAY_MS;
const chebAge = (now - (chebyshev.directAt ?? 0)) / DAY_MS;
if (Math.abs(hoeffAge - SEED_PREVIOUS_DAYS) > 0.5) {
  fail(`hoeffding seed age ${hoeffAge}, expected ${SEED_PREVIOUS_DAYS}`);
}
if (Math.abs(chebAge - SEED_CURRENT_DAYS) > 0.5) {
  fail(`chebyshev seed age ${chebAge}, expected ${SEED_CURRENT_DAYS}`);
}

const echo = hoeffding.echoes.find((e) => e.via === "chebyshev");
if (!echo) fail("Chebyshev should echo onto Hoeffding");

const withoutEcho = entryFreshness({ ...hoeffding, echoes: [] }, now);
const withEcho = entryFreshness(hoeffding, now);
if (withEcho <= withoutEcho) {
  fail("echo must raise freshness above the months-old direct study");
}
if (withEcho > withoutEcho + ECHO_WEIGHT + 0.01) {
  fail("echo must not count as a full restudy");
}

if (failures) throw new Error(`${failures} decay check(s) failed`);
console.log(
  `ok hoeffding freshness ${withEcho.toFixed(3)} (direct-only ${withoutEcho.toFixed(3)}), echoed via chebyshev`,
);
