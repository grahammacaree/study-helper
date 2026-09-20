import {
  applyKnowledgePasses,
  isProofSketch,
  mergeTeachingPasses,
  parseKnowledge,
  parseTeachingPasses,
  renderKnowledge,
  spreadTheoremProofs,
  upsertKnowledge,
} from "../server/learner.js";
import {
  claimMatchesHit,
  extractLeanDecl,
  flattenLeanHits,
  mathlibModulePath,
  needsStandardWriteup,
} from "../server/leanSearch.js";
import { wrapStandardTex } from "../server/texDisplay.js";

let failures = 0;

function fail(why: string): void {
  failures += 1;
  console.log(`FAIL ${why}`);
}

const merged = mergeTeachingPasses(
  "A chain is a process.\n\n## See also\n- [Probability](concept:probability)",
  {
    vocab: ["irreducible: can reach any state from any other"],
    examples: ["random walk on an undirected graph"],
  },
);
if (!merged.includes("## Vocabulary")) fail("vocab heading missing");
if (!merged.includes("**irreducible**")) fail("vocab term should be bold");
if (!merged.includes("can reach any state")) fail("vocab needs a definition");
if (!merged.includes("## Examples")) fail("examples heading missing");
if (!merged.includes("undirected graph")) fail("example missing");
if (merged.indexOf("## Vocabulary") > merged.indexOf("## See also")) {
  fail("vocab should sit above See also");
}

const withThm = mergeTeachingPasses("A chain.", {
  theorems: [
    "If $Q$ is reversible wrt $s$ then $s$ is stationary. Proof: $\\sum_i s_i q_{ij}=s_j$.",
  ],
  examples: ["random walk on an undirected graph"],
});
if (!withThm.includes("## Theorems")) fail("theorem heading missing");
if (withThm.indexOf("## Theorems") > withThm.indexOf("## Examples")) {
  fail("theorems should sit above examples");
}

const again = mergeTeachingPasses(merged, {
  vocab: ["absorbing"],
  examples: ["random walk on an undirected graph"],
});
const passes = parseTeachingPasses(again);
if (passes.vocab.some((row) => /^absorbing$/i.test(row.replace(/\*+/g, "")))) {
  fail("a term without a definition should not land");
}
if (!passes.vocab.some((row) => /irreducible/i.test(row) && /can reach/i.test(row))) {
  fail("defined vocab should stay");
}
if (passes.examples.filter((row) => /undirected graph/i.test(row)).length !== 1) {
  fail("duplicate example should collapse");
}

const cleaned = applyKnowledgePasses(
  "A chain.\n\n## Vocabulary\n- irreducible\n- periodic\n",
  undefined,
);
if (cleaned.includes("## Vocabulary") || cleaned.includes("irreducible")) {
  fail("nameless vocab bullets should drop on open");
}

const knowledge = upsertKnowledge(
  [
    {
      id: "markov-chains",
      status: "known",
      note: "overview",
      vocab: ["irreducible: can reach any state from any other"],
    },
  ],
  [
    {
      id: "markov-chains",
      status: "known",
      note: "vocab pass",
      example: "PageRank as a chain",
      vocab: ["absorbing: once entered, you stay"],
    },
  ],
);
const row = knowledge.find((e) => e.id === "markov-chains");
if (!row?.vocab?.some((v) => /irreducible/i.test(v) && /can reach/i.test(v))) {
  fail("knowledge vocab should keep definitions");
}
if (!row?.vocab?.some((v) => /absorbing/i.test(v) && /stay/i.test(v))) {
  fail("knowledge vocab should accumulate definitions");
}
if (row?.example !== "PageRank as a chain") fail("new example should stick");

const round = parseKnowledge(renderKnowledge(knowledge));
const back = round.find((e) => e.id === "markov-chains");
if (!back?.vocab?.some((v) => /absorbing/i.test(v))) {
  fail("knowledge vocab should round-trip");
}
if (back?.example !== "PageRank as a chain") fail("example should round-trip");

const folded = applyKnowledgePasses("The process.", row);
if (!folded.includes("## Vocabulary") || !folded.includes("## Examples")) {
  fail("knowledge passes should fold onto empty teaching");
}
if (!folded.includes("**absorbing**")) fail("folded vocab should include the glossed term");

const longEx =
  "Random walk on an undirected graph: $q_{ij} = 1/d_i$ along an edge. Detailed balance $s_i q_{ij} = s_j q_{ji}$ holds for $s_i = d_i / \\sum_j d_j$, so that $s$ is stationary — a reversible chain where you can write $s$ down instead of grinding $sQ = s$.";
const longMerge = mergeTeachingPasses("A chain.", { examples: [longEx] });
if (!longMerge.includes("grinding $sQ = s$")) {
  fail("a working example should not clip mid-word");
}
const existing = `A chain.\n\n## Examples\n- ${longEx}`;
const reopened = applyKnowledgePasses(
  existing,
  {
    id: "markov-chains",
    status: "known",
    note: "n",
    example:
      "Four abstract chains: connected ‘nice’ chain; two disjoint 3-node components.",
  },
  { skipFresh: true },
);
if (reopened.includes("Four abstract chains")) {
  fail("reopening stored teaching should not resurrect a cartoon example");
}

const thmRound = upsertKnowledge(
  [],
  [
    {
      id: "markov-chains",
      status: "known",
      note: "n",
      theorems: [
        {
          claim: "Finite irreducible chain: unique stationary $s$ exists.",
          status: "asserted",
        },
      ],
    },
  ],
);
const thmBack = parseKnowledge(renderKnowledge(thmRound)).find(
  (e) => e.id === "markov-chains",
);
if (
  !thmBack?.theorems?.some(
    (t) => t.status === "asserted" && /unique stationary/i.test(t.claim),
  )
) {
  fail("asserted theorems should round-trip on the knowledge row");
}

const provedLater = upsertKnowledge(thmRound, [
  {
    id: "markov-matrices",
    status: "known",
    note: "other course",
    theorems: [
      {
        claim: "Finite irreducible chain: unique stationary $s$ exists.",
        status: "proved",
        proof: "$s_i = 1/r_i$ and uniqueness from irreducibility.",
      },
    ],
  },
]);
const noDowngrade = upsertKnowledge(provedLater, [
  {
    id: "markov-matrices",
    status: "known",
    note: "named again without a sketch",
    theorems: [
      {
        claim: "Finite irreducible chain: unique stationary $s$ exists.",
        status: "asserted",
      },
    ],
  },
]).find((e) => e.id === "markov-matrices");
if (noDowngrade?.theorems?.[0]?.status !== "proved" || !noDowngrade.theorems[0].proof) {
  fail("a later asserted pass must not drop an existing proof");
}

const spread = spreadTheoremProofs(provedLater, [
  {
    id: "markov-matrices",
    status: "known",
    note: "n",
    theorems: [
      {
        claim: "Finite irreducible chain: unique stationary $s$ exists.",
        status: "proved",
        proof: "$s_i = 1/r_i$ and uniqueness from irreducibility.",
      },
    ],
  },
]);
const other = spread.list.find((e) => e.id === "markov-chains")?.theorems?.[0];
if (other?.status !== "proved" || !other.proof) {
  fail("a proof on another concept should upgrade a matching asserted claim");
}
if (!spread.changedIds.includes("markov-chains")) {
  fail("spread should name the other concept whose teaching needs a fold");
}

const parsedThm = parseTeachingPasses(withThm).theorems[0];
if (parsedThm?.status !== "proved" || !parsedThm.proof) {
  fail("a teaching block with Moves: should parse as proved");
}

const stdBlock = mergeTeachingPasses("A mean.", {
  theorems: [
    {
      claim: "Sample means converge almost surely.",
      status: "proved",
      proof: "Borel–Cantelli on a subsequence.",
      lemma: "ProbabilityTheory.strong_law_ae",
      canonical:
        "Reduce to nonnegative parts, then a dyadic subsequence.\n\n$$\n\\bar X_n \\to \\mu \\quad a.s.\n$$",
    },
  ],
});
if (stdBlock.includes("ProbabilityTheory.strong_law_ae") && !stdBlock.includes("`ProbabilityTheory.strong_law_ae`")) {
  fail("lemma names must sit in backticks so underscores are not TeX");
}
if (!stdBlock.includes("**Standard proof**")) fail("standard proof heading missing");
if (!stdBlock.includes("$$")) fail("standard proof should keep display TeX");
const stdParsed = parseTeachingPasses(stdBlock).theorems[0];
if (!stdParsed?.canonical?.includes("$$") || stdParsed.lemma !== "ProbabilityTheory.strong_law_ae") {
  fail("standard TeX proof should round-trip on the teaching file");
}
const stdKnow = parseKnowledge(
  renderKnowledge([
    {
      id: "lln",
      status: "unseen",
      note: "n",
      theorems: [stdParsed],
    },
  ]),
).find((e) => e.id === "lln")?.theorems?.[0];
if (!stdKnow?.canonical?.includes("$$")) {
  fail("knowledge.md should keep a multiline standard proof");
}

if (isProofSketch("uniqueness")) fail("a shrug is not a proof");
if (isProofSketch("by definition")) fail("by definition is not a proof");
if (!isProofSketch("Chapman–Kolmogorov; uniqueness from irreducibility")) {
  fail("named moves should count as a proof");
}
if (!isProofSketch("Bayes")) fail("a named theorem is a move");

const shrugged = upsertKnowledge(
  [],
  [
    {
      id: "markov-chains",
      status: "known",
      note: "n",
      theorems: [
        {
          claim: "Finite irreducible chain: unique stationary $s$ exists.",
          status: "proved",
          proof: "uniqueness",
        },
      ],
    },
  ],
).find((e) => e.id === "markov-chains");
if (shrugged?.theorems?.[0]?.status !== "asserted" || shrugged.theorems[0].proof) {
  fail("a shrug must not mark the claim proved");
}

const titledBlock = mergeTeachingPasses("Averages converge.", {
  theorems: [
    {
      title: "Weak law of large numbers",
      claim: "The average of i.i.d. observations with finite variance converges in probability to $\\mu$.\n\n$$\n\\bar X_n \\xrightarrow{\\mathrm{P}} \\mu\n$$",
      status: "proved",
      lemma: "ProbabilityTheory.strong_law_ae",
      canonical:
        "1.\n\n$$\n\\operatorname{Var}(\\bar X_n)=\\frac{\\sigma^2}{n}\n$$\n\n*by Chebyshev's inequality*\n\n∎",
    },
  ],
});
if (!titledBlock.includes("### Weak law of large numbers")) {
  fail("named theorems should keep their title");
}
if (titledBlock.includes("You named")) fail("named-move leftovers must not sit on the claim");
if (titledBlock.includes("From mathlib") || titledBlock.includes("strong_law_ae")) {
  fail("mathlib sourcing should stay off the teaching page");
}
if (!titledBlock.includes("\\bar X_n")) fail("the claim display must survive a teaching merge");
const titledParsed = parseTeachingPasses(titledBlock).theorems[0];
if (titledParsed?.title !== "Weak law of large numbers") {
  fail("titled teaching should parse the theorem name");
}
if (!titledParsed?.claim.includes("$$") || /#{3,4}\s+Proof\b/.test(titledParsed.claim)) {
  fail("the claim should be the statement, not the proof");
}
if (!titledParsed?.canonical?.includes("Chebyshev")) {
  fail("the proof write-up should round-trip under the claim");
}

const cauchyHit = {
  informal_name: "Cauchy-Schwarz Inequality",
  informal_description:
    "For any vectors x and y in a real inner product space, ⟨x,y⟩² ≤ ⟨x,x⟩⟨y,y⟩.",
  name: ["real_inner_mul_inner_self_le"],
};
if (!claimMatchesHit("Cauchy-Schwarz inequality", cauchyHit)) {
  fail("a named inequality should match its mathlib informal name");
}
if (
  claimMatchesHit("finite irreducible Markov chain unique stationary", cauchyHit)
) {
  fail("an unrelated lecture claim must not take Cauchy-Schwarz");
}

const nested = flattenLeanHits([
  [[{ distance: 0.1, result: { kind: "theorem", informal_name: "Cauchy-Schwarz Inequality" } }]],
]);
if (nested[0]?.informal_name !== "Cauchy-Schwarz Inequality") {
  fail("leansearch nested hits should flatten");
}

if (mathlibModulePath(["Mathlib", "Probability", "StrongLaw"]) !== "Mathlib/Probability/StrongLaw.lean") {
  fail("mathlib module path should be a safe .lean path");
}
if (mathlibModulePath(["Mathlib", "../etc", "passwd"])) {
  fail("mathlib module path must reject path segments");
}
const extracted = extractLeanDecl(
  [
    "/-- helper -/",
    "theorem other : True := by trivial",
    "/-- **Strong law.** Etemadi. -/",
    "theorem strong_law_ae (X : ℕ → Ω → E) : True := by",
    "  trivial",
    "theorem strong_law_Lp : True := by trivial",
  ].join("\n"),
  "ProbabilityTheory.strong_law_ae",
);
if (!extracted?.includes("Etemadi") || !extracted.includes("theorem strong_law_ae")) {
  fail("extractLeanDecl should take the named theorem and its docstring");
}
if (extracted?.includes("strong_law_Lp")) {
  fail("extractLeanDecl should stop before the next theorem");
}
if (!needsStandardWriteup("an informal sentence with $X_n$")) {
  fail("an informal docstring is not a TeX proof write-up");
}
if (needsStandardWriteup("Reduce.\n\n$$\n\\bar X_n\\to\\mu\n$$")) {
  fail("display TeX is already a write-up");
}
const stacked = wrapStandardTex(
  "\\begin{gathered}a\\end{gathered}\\begin{gathered}b\\end{gathered}",
);
if ((stacked.match(/\$\$/g) ?? []).length !== 4) {
  fail("adjacent gathered blocks should become two display maths");
}
if (stacked.indexOf("$$") >= 0 && stacked.includes("\\end{gathered}\\begin{gathered}")) {
  fail("stacked displays must not keep environments on one row");
}
const rows = wrapStandardTex("\\begin{gathered}a\\\\b\\end{gathered}");
if ((rows.match(/\$\$/g) ?? []).length !== 4) {
  fail("gathered \\\\ rows should become two display maths");
}

if (failures) throw new Error(`${failures} knowledge check(s) failed`);
console.log("ok knowledge vocab and examples fold into teaching");
