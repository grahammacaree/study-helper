import {
  lectureIsComplete,
  nextIncompleteLectureN,
  normalizeLectureStatus,
} from "../server/lectureProgress.js";

let failures = 0;

function fail(why: string): void {
  failures += 1;
  console.log(`FAIL ${why}`);
}

if (normalizeLectureStatus("debriefed") !== "complete") fail("debriefed is complete");
if (normalizeLectureStatus("shaky") !== "complete") fail("shaky debrief is complete");
if (normalizeLectureStatus("watched") !== "incomplete") fail("watched is incomplete");
if (normalizeLectureStatus("unseen") !== "incomplete") fail("unseen is incomplete");
if (normalizeLectureStatus(undefined) !== "incomplete") fail("missing is incomplete");
if (!lectureIsComplete("debriefed")) fail("legacy debriefed still unlocks");

const next = nextIncompleteLectureN([
  { n: 19, status: "complete" },
  { n: 21, status: "incomplete" },
  { n: 20, status: "incomplete" },
]);
if (next !== 20) fail(`next incomplete should be 20, got ${next}`);

const done = nextIncompleteLectureN([
  { n: 1, status: "complete" },
  { n: 2, status: "complete" },
]);
if (done !== null) fail("finished course has no next lecture");

if (failures) throw new Error(`${failures} lecture-progress check(s) failed`);
console.log("ok lecture progress is complete/incomplete, sequential");
