import { emptyProfile, knowledgeSlice } from "../server/learner.js";
import {
  CLIP,
  DEBRIEF_INSTRUCTIONS,
  STANDARD_PROOF_INSTRUCTIONS,
  assembleStandingContext,
} from "../server/agent.js";
import { expandConceptIds, lectureOf, loadCatalog } from "../server/catalog.js";
import { budgetTextForAgent } from "../server/promptBudget.js";

const catalog = await loadCatalog();
const lecture = lectureOf(catalog, "algorithms-6006", 4);
const ids = expandConceptIds(catalog, lecture.conceptIds);
const ctx = {
  profile: emptyProfile(),
  courseBlurb: catalog.blurbs["algorithms-6006"] ?? "",
  lectureTitle: `${lecture.n}. ${lecture.title}`,
  concepts: ids
    .map((id) => `${id}: ${catalog.concepts[id]?.name ?? id}`)
    .join("\n"),
  knowledgeSlice: knowledgeSlice([], ids),
};
const standing = assembleStandingContext(ctx);
const firstDebrief = [standing, DEBRIEF_INSTRUCTIONS, `Summary:\n${"x".repeat(800)}`].join(
  "\n\n",
);
const followUp = "Standing context is already in this conversation. Use it; do not quote the profile.";
console.log(`standing_chars ${standing.length}`);
console.log(`first_debrief_chars ${firstDebrief.length}`);
console.log(`followup_reminder_chars ${followUp.length}`);
console.log(`clip_profile ${CLIP.profile} clip_course ${CLIP.course} clip_summary ${CLIP.summary}`);

const withSeeAlso = Object.keys(catalog.concepts).find(
  (id) => (catalog.concepts[id]?.seeAlso?.length ?? 0) > 0,
);
const expandedSeeAlso = withSeeAlso
  ? expandConceptIds(catalog, [withSeeAlso]).length
  : 0;
const conceptStandingExpanded = assembleStandingContext({
  profile: emptyProfile(),
  courseBlurb: "No course in Graham's library tags this concept. Do not name a course.",
  concepts: withSeeAlso
    ? expandConceptIds(catalog, [withSeeAlso])
        .map((id) => `${id}: ${catalog.concepts[id]?.name ?? id}`)
        .join("\n")
    : "",
  knowledgeSlice: knowledgeSlice(
    [],
    withSeeAlso ? expandConceptIds(catalog, [withSeeAlso]) : [],
  ),
  teachings: "x".repeat(CLIP.teachings),
  task: "concept",
});
const conceptStandingSelf = assembleStandingContext({
  profile: emptyProfile(),
  courseBlurb: "No course in Graham's library tags this concept. Do not name a course.",
  concepts: withSeeAlso
    ? `${withSeeAlso}: ${catalog.concepts[withSeeAlso]?.name ?? withSeeAlso}`
    : "",
  knowledgeSlice: knowledgeSlice([], withSeeAlso ? [withSeeAlso] : []),
  teachings: "x".repeat(CLIP.teachings),
  task: "concept",
});
console.log(`concept_seealso_expanded_ids ${expandedSeeAlso}`);
console.log(`concept_standing_expanded_chars ${conceptStandingExpanded.length}`);
console.log(`concept_standing_self_chars ${conceptStandingSelf.length}`);
console.log(
  `concept_standing_saved_chars ${conceptStandingExpanded.length - conceptStandingSelf.length}`,
);
const standardProofPrompt = [
  STANDARD_PROOF_INSTRUCTIONS,
  `Claim:\n${"x".repeat(200)}`,
  `Mathlib \`ProbabilityTheory.strong_law_ae\` informal:\n${"y".repeat(200)}`,
  `Lean:\n${"z".repeat(CLIP.lean)}`,
].join("\n\n");
console.log(`standard_proof_chars ${standardProofPrompt.length}`);
console.log(`clip_lean ${CLIP.lean}`);

const fatLean = [
  "/-- **Strong law.** Etemadi. -/",
  "theorem strong_law_ae (X : ℕ → Ω → E) : True := by",
  ...Array.from({ length: 200 }, (_, i) => `  have h${i} : True := by trivial`),
  "  exact trivial",
].join("\n");
const leanBudget = 600;
const leanNaive = fatLean.slice(0, leanBudget);
const leanFold = budgetTextForAgent(fatLean, leanBudget, "lean");
console.log(`lean_raw_chars ${fatLean.length}`);
console.log(`lean_budget ${leanBudget}`);
console.log(`lean_naive_chars ${leanNaive.length}`);
console.log(`lean_fold_mode ${leanFold.mode} lean_fold_chars ${leanFold.sentChars}`);
console.log(
  `lean_fold_saved_vs_naive ${Math.max(0, leanNaive.length - leanFold.sentChars)}`,
);

const fatTeaching = [
  "Intro paragraph about hashing under a load factor.",
  "",
  "## Vocabulary",
  ...Array.from({ length: 20 }, (_, i) => `- **term${i}**: long gloss ${"word ".repeat(20)}${i}`),
  "",
  "## Theorems",
  "### Weak law of large numbers",
  "",
  "Sample means converge in probability.",
  "",
  "#### Proof",
  "",
  ...Array.from({ length: 8 }, (_, i) => `${i + 1}.\n\n$$\na_${i}=b_${i}\n$$\n`),
  "",
  "## Examples",
  "- Worked: $\\alpha=n/m$ for $n=12$, $m=16$ is $3/4$.",
  "- Another worked case that fills space " + "x".repeat(200),
  "- Third worked case " + "y".repeat(200),
].join("\n");
const teachBudget = 900;
const teachNaive = fatTeaching.slice(0, teachBudget);
const teachFold = budgetTextForAgent(fatTeaching, teachBudget, "teaching");
console.log(`teaching_raw_chars ${fatTeaching.length}`);
console.log(`teaching_budget ${teachBudget}`);
console.log(`teaching_naive_chars ${teachNaive.length}`);
console.log(`teaching_fold_mode ${teachFold.mode} teaching_fold_chars ${teachFold.sentChars}`);
console.log(
  `teaching_fold_saved_vs_naive ${Math.max(0, teachNaive.length - teachFold.sentChars)}`,
);
console.log(
  `teaching_fold_keeps_wlln ${/Weak law/.test(teachFold.text) ? 1 : 0}`,
);
console.log(
  `lean_fold_keeps_theorem ${/strong_law_ae/.test(leanFold.text) ? 1 : 0}`,
);
console.log(
  `teaching_naive_keeps_wlln ${/Weak law/.test(teachNaive) ? 1 : 0}`,
);
console.log(
  `lean_naive_keeps_theorem ${/strong_law_ae/.test(leanNaive) ? 1 : 0}`,
);
