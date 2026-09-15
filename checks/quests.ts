import { parseQuests, renderQuests, formatConceptTeaching, isSafeConceptFileId } from "../server/learner.js";
import { conceptsFromDoneQuests, matchExistingConcept, slugConceptId } from "../server/questConcept.js";
import { loadCatalog } from "../server/catalog.js";
import {
  isQuestDisclaimer,
  questPaneTitle,
  stripQuestChrome,
} from "../web/src/questChrome.ts";
import { questCanMarkDone } from "../web/src/questReady.ts";

let failures = 0;

function fail(why: string): void {
  failures += 1;
  console.log(`FAIL ${why}`);
}

const md = `# Side quests

## open

### q-abc12345 Universal hashing
source: user
course: 6.006
concept: universal-hashing
## What "universal" means
A family is universal when any two keys collide with probability at most 1/m.
### 11.3.3 in CLRS
Still part of the same write-up.

## parked

(none)

## done

(none)
`;

const parsed = parseQuests(md);
if (parsed.length !== 1) fail(`expected 1 quest, got ${parsed.length}`);
const q = parsed[0];
if (q?.id !== "q-abc12345") fail(`id ${q?.id}`);
if (!q?.notes.includes('## What "universal" means')) {
  fail("heading in notes was dropped");
}
if (!q?.notes.includes("### 11.3.3 in CLRS")) {
  fail("CLRS heading was treated as a new quest");
}
if (q?.courseId !== "6.006") fail(`course ${q?.courseId}`);
if (q?.conceptId !== "universal-hashing") fail(`concept ${q?.conceptId}`);

const round = parseQuests(renderQuests(parsed));
if (round.length !== 1) fail(`roundtrip quest count ${round.length}`);
if (!round[0]?.notes.includes("### 11.3.3 in CLRS")) {
  fail("roundtrip dropped a markdown heading in notes");
}

const fenced = parseQuests(`# Side quests

## open

### q-demo Nested status words
source: user
  ## open
  This is still notes.

## parked

(none)
`);
if (fenced.length !== 1) fail(`indented ## open split the file (${fenced.length})`);
if (!fenced[0]?.notes.includes("## open")) {
  fail("indented status heading should stay in notes");
}

if (questPaneTitle("Universal hashing") !== "Side Quest: Universal Hashing") {
  fail(`pane title ${questPaneTitle("Universal hashing")}`);
}
if (!isQuestDisclaimer("Side quest: X. This does not skip the lecture map.")) {
  fail("disclaimer detector");
}
const stripped = stripQuestChrome(
  "# Universal hashing — side quest\n\n## What it is\nBody",
  "Universal hashing",
);
if (/side quest/i.test(stripped.split("\n")[0] ?? "")) {
  fail("should drop the repeating title");
}
if (!stripped.includes("## What it is")) fail("kept the real heading");

if (slugConceptId("Universal hashing") !== "universal-hashing") {
  fail(`slug ${slugConceptId("Universal hashing")}`);
}
if (matchExistingConcept({ hashing: { name: "Hashing" } }, "Hashing")?.id !== "hashing") {
  fail("exact concept name should match");
}
if (matchExistingConcept({ hashing: { name: "Hashing" } }, "hashing")?.id !== "hashing") {
  fail("concept slug should match");
}
if (matchExistingConcept({ hashing: { name: "Hashing" } }, "Ichiro Suzuki")) {
  fail("a person name should not match a concept locally");
}
const catalog = await loadCatalog();
const mapped = conceptsFromDoneQuests(catalog, [
  {
    id: "q-abc12345",
    title: "Universal hashing",
    status: "done",
    source: "user",
    courseId: "algorithms-6006",
    lectureN: 4,
    notes: "",
  },
]);
if (!mapped.questConceptIds.includes("universal-hashing")) {
  fail(`quest concept ids ${mapped.questConceptIds.join(",")}`);
}
if (mapped.concepts["universal-hashing"]?.parentId !== "hashing") {
  fail(`parent ${mapped.concepts["universal-hashing"]?.parentId}`);
}

if (questCanMarkDone({})) fail("empty session should not mark done");
if (questCanMarkDone({ questTeachbackOk: true })) {
  fail("teach-back alone should not mark done");
}
if (questCanMarkDone({ questQuizOk: true })) fail("quiz alone should not mark done");
if (!questCanMarkDone({ questTeachbackOk: true, questQuizOk: true })) {
  fail("both checks should mark done");
}

if (
  formatConceptTeaching(
    "Universal hashing",
    "# Universal hashing\n\nA family of hash functions.",
  ) !== "A family of hash functions."
) {
  fail("teaching should drop a heading that repeats the pane title");
}
if (
  formatConceptTeaching(
    "Hoeffding's inequality",
    "## Hoeffding’s inequality\n\nA tail bound.",
  ) !== "A tail bound."
) {
  fail("teaching should drop a curly-apostrophe title heading");
}
if (formatConceptTeaching("Hashing", "A hash family.") !== "A hash family.") {
  fail("teaching without a title heading should stay the body");
}
if (!isSafeConceptFileId("universal-hashing")) fail("slug should be a safe file id");
if (isSafeConceptFileId("../etc/passwd")) fail("path-like ids must be rejected");

if (failures) throw new Error(`${failures} quest check(s) failed`);
console.log("ok quest notes keep markdown headings");

