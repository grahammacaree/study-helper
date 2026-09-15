import {
  applyKnowledgePasses,
  mergeTeachingPasses,
  parseKnowledge,
  parseTeachingPasses,
  renderKnowledge,
  spreadTheoremProofs,
  upsertKnowledge,
} from "../server/learner.js";

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
  fail("a teaching bullet with Proof: should parse as proved");
}

if (failures) throw new Error(`${failures} knowledge check(s) failed`);
console.log("ok knowledge vocab and examples fold into teaching");
