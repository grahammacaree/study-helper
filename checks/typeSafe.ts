import {
  acceptChoice,
  decideAdequate,
  decideDropCalc,
  decideLeanPick,
  decideQuestScreen,
  decideRemapIndex,
  decideScreenQuiz,
  decideStepCribs,
  formatStepCrib,
  knownAfterSlips,
  noulNo,
  noulYes,
  splitDebriefCorrections,
} from "../server/typeSafe.js";
import type { QuizItem } from "../server/types.js";

let failures = 0;

function fail(why: string): void {
  failures += 1;
  console.log(`FAIL ${why}`);
}

if (acceptChoice("none", 0.99)) fail("none is never a named pick");
if (acceptChoice("h0", 0.49)) fail("choice below 0.5 is not accepted");
if (acceptChoice("h0", 0.5) !== "h0") fail("choice at 0.5 is accepted");

const hit = decideLeanPick("h1", 0.8, 3);
if (hit.kind !== "index" || hit.i !== 1) fail("confident h1 should pick that hit");
if (decideLeanPick("none", 0.7, 3).kind !== "none") {
  fail("confident none should refuse every mathlib hit");
}
if (decideLeanPick("h0", 0.2, 3).kind !== "skip") {
  fail("low-confidence pick should fall through to overlap");
}
if (decideLeanPick("h9", 0.9, 2).kind !== "skip") {
  fail("out-of-range hit id should fall through");
}

const trivia = decideQuestScreen({
  study: 0.1,
  match: "none",
  matchConf: 0.8,
  knownIds: ["hashing"],
  title: "lebron james",
});
if (trivia?.kind !== "reject") fail("low study noul should reject trivia");

const alias = decideQuestScreen({
  study: 0.8,
  match: "hashing",
  matchConf: 0.7,
  knownIds: ["hashing"],
  title: "hash tables",
});
if (alias?.kind !== "existing" || alias.id !== "hashing") {
  fail("a known concept alias should skip the quest agent");
}

const fresh = decideQuestScreen({
  study: 0.9,
  match: "none",
  matchConf: 0.6,
  knownIds: ["hashing"],
  title: "coupling from the past",
});
if (fresh?.kind !== "accept" || fresh.name !== "Coupling From The Past") {
  fail("a confident new study topic should skip the quest agent");
}

const unsure = decideQuestScreen({
  study: 0.55,
  match: "none",
  matchConf: 0.2,
  knownIds: ["hashing"],
  title: "maybe this",
});
if (unsure) fail("a middling verdict should fall through to the agent");

if (!decideAdequate(0.8, 0.1)) fail("a restatement that is not a question is adequate");
if (decideAdequate(0.8, 0.8)) fail("a clarifying question is not adequate");
if (decideAdequate(0.4, 0.1)) fail("a thin restatement is not adequate");
if (noulYes(0.69)) fail("0.69 is not a yes");
if (!noulNo(0.35)) fail("0.35 is a no");

function item(prompt: string, id: string): QuizItem {
  return {
    conceptId: id,
    prompt,
    choices: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    correctId: "a",
    index: 1,
    total: 2,
  };
}

const mixed = [
  item("Compute the inverse of this 3×3 matrix.", "lin-alg"),
  item("Which hypothesis does Chebyshev need?", "chebyshev"),
];
const filtered = decideDropCalc(mixed, [0.9, 0.1]);
if (filtered.length !== 1 || filtered[0].conceptId !== "chebyshev") {
  fail("calculation items should drop when a conceptual item remains");
}
if (decideDropCalc(mixed, [0.9, 0.85]).length !== 2) {
  fail("dropping every item should fail open");
}
if (decideDropCalc([mixed[0]], [0.99]).length !== 1) {
  fail("a singleton bank should fail open when the only item is a calculation");
}

const neighbor = [
  item("Which hypothesis does Markov need?", "chebyshev"),
  item("Which hypothesis does Chebyshev need?", "chebyshev"),
];
const offTopic = decideScreenQuiz(neighbor, [
  { tests: 0.1, keyed: 0.9 },
  { tests: 0.85, keyed: 0.9 },
]);
if (offTopic.length !== 1 || !offTopic[0].prompt.includes("Chebyshev")) {
  fail("an item that tests a neighbor should drop");
}

const badKey = decideScreenQuiz(
  [item("Which bound needs a second moment?", "chebyshev")],
  [{ tests: 0.9, keyed: 0.1 }],
);
if (badKey.length !== 1) {
  fail("a wrong keyed answer on a singleton should fail open");
}
const mixedKey = decideScreenQuiz(mixed, [
  { calc: 0.1, tests: 0.8, keyed: 0.1 },
  { calc: 0.1, tests: 0.8, keyed: 0.9 },
]);
if (mixedKey.length !== 1 || mixedKey[0].conceptId !== "chebyshev") {
  fail("a confidently wrong keyed answer should drop when another item remains");
}

if (decideRemapIndex("t0", 0.6, 2) !== 0) fail("confident t0 remaps to that claim");
if (decideRemapIndex("none", 0.9, 2) != null) fail("none must not remap");
if (decideRemapIndex("t3", 0.9, 2) != null) fail("out-of-range remap is ignored");

const twoTricks = decideStepCribs([
  { id: "chebyshev", p: 0.8, label: "Chebyshev's inequality" },
  { id: "simplification", p: 0.7, label: "simplification" },
  { id: "none", p: 0.9, label: "none of these" },
]);
if (twoTricks.join(";") !== "Chebyshev's inequality;simplification") {
  fail("independent noul hits should all appear on the crib");
}
if (formatStepCrib(twoTricks) !== "by Chebyshev's inequality and noting $\\sigma$ and $\\varepsilon$ as constants") {
  fail("several tricks should fold into one by-line");
}

const split = splitDebriefCorrections(
  ["Sign of the Green's function is minus, not plus.", "Reduction goes the other way."],
  [0.85, 0.2],
);
if (split.slips.length !== 1 || !split.slips[0].includes("Green")) {
  fail("a peaked slip noul should peel arithmetic off the gate");
}
if (split.conceptual.length !== 1 || !split.conceptual[0].includes("Reduction")) {
  fail("a conceptual correction should stay on the gate");
}
const quiet = splitDebriefCorrections(
  [
    "Transcription: “propsition” → proposition.",
    "Sign of the Green's function is minus, not plus.",
  ],
  [0.2, 0.85],
  [0.9, 0.1],
);
if (quiet.slips.length !== 1 || !quiet.slips[0].includes("Green")) {
  fail("spelling noise should drop; arithmetic slips should stay");
}
if (quiet.conceptual.length) {
  fail("a one-off spelling typo should not reach the correction gate");
}
const coerced = knownAfterSlips(
  [{ id: "green", status: "shaky", note: "sign" }],
  { slips: split.slips, conceptual: [] },
);
if (coerced[0].status !== "known") {
  fail("arithmetic-only slips should not leave the concept shaky");
}
if (
  knownAfterSlips([{ id: "green", status: "shaky", note: "direction" }], split)[0]
    .status !== "shaky"
) {
  fail("a conceptual correction should still be allowed to mark shaky");
}
if (
  knownAfterSlips([{ id: "green", status: "shaky", note: "unsure" }], {
    slips: [],
    conceptual: [],
  })[0].status !== "shaky"
) {
  fail("no-slip debriefs should not coerce known");
}

if (failures) throw new Error(`${failures} TypeSafe check(s) failed`);
console.log("ok TypeSafe gates fail open and skip the agent on a peaked answer");
