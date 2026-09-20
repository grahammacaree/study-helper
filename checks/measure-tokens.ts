import { emptyProfile, knowledgeSlice } from "../server/learner.js";
import {
  CLIP,
  DEBRIEF_INSTRUCTIONS,
  STANDARD_PROOF_INSTRUCTIONS,
  assembleStandingContext,
} from "../server/agent.js";
import { expandConceptIds, lectureOf, loadCatalog } from "../server/catalog.js";

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
