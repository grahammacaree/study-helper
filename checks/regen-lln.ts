/**
 * One-off: rewrite LLN and CLT teaching files to the proofstructure spec.
 * Does not print keys or teaching prose.
 */
import { createStudyAgent, writeStandardProof } from "../server/agent.js";
import { attachMathlibWriteups } from "../server/leanSearch.js";
import {
  loadLearner,
  saveLearner,
  teachingsForIds,
  writeConceptTeaching,
} from "../server/learner.js";
import { formatDisplayedTheorem } from "../server/proofDisplay.js";
import { splitMathEnvs } from "../server/texDisplay.js";
import { labelProofSteps } from "../server/typeSafe.js";

const WLLN_LABELS: Record<string, string> = {
  chebyshev: "Chebyshev's inequality",
  iid_variance: "variance of the i.i.d. sample mean",
  simplification: "simplification",
  algebra: "algebra or a definition only",
  none: "none of these",
};

const SLLN_LABELS: Record<string, string> = {
  etemadi: "Etemadi's strong law",
  measurable_mk: "strongly measurable representatives",
  identical_distribution: "identical distribution",
  integral_ae: "almost-sure integral agreement",
  simplification: "simplification",
  algebra: "algebra or a definition only",
  none: "none of these",
};

const WLLN_STEPS = [
  "\\operatorname{Var}(\\bar X_n)=\\frac{\\sigma^2}{n}",
  "\\mathbb{P}(|\\bar X_n-\\mu|\\ge\\varepsilon)\\le \\frac{\\sigma^2}{n\\varepsilon^2}\\to 0",
];

function keepHead(stored: string): string {
  const cut = stored.search(/\n## (Theorems|See also)\b/);
  return (cut >= 0 ? stored.slice(0, cut) : stored).trim();
}

function seeAlso(stored: string): string {
  const at = stored.search(/\n## See also\b/);
  return at >= 0 ? stored.slice(at).trim() : "";
}

function stepTex(raw: string): string {
  const t = raw.replace(/^\$+|\$+$/g, "").trim();
  if (t.startsWith("\\begin{")) return t;
  return `\\begin{gathered}\n${t}\n\\end{gathered}`;
}

async function withCribs(
  texes: string[],
  labels: Record<string, string>,
): Promise<Array<{ tex: string; crib?: string }>> {
  const cribs = await labelProofSteps(texes, labels);
  return texes.map((tex, i) => ({
    tex: stepTex(tex),
    ...(cribs[i] ? { crib: cribs[i] } : {}),
  }));
}

const learner = await loadLearner();
const teachings = await teachingsForIds(["lln", "clt"]);
const llnPrior = learner.knowledge.find((e) => e.id === "lln");
if (!llnPrior) throw new Error("no lln knowledge row");

const wllnSteps = await withCribs(WLLN_STEPS, WLLN_LABELS);
const wlln = formatDisplayedTheorem({
  title: "Weak law of large numbers",
  status: "proved",
  statement:
    "The average of a large number of independent random observations converges in probability to the expected population value when the $X_i$ are i.i.d. with finite variance $\\sigma^2$: $\\bar X_n$ gets arbitrarily close to $\\mu=\\mathbb{E}[X_1]$ with probability approaching one.",
  claimTex: "\\bar X_n \\xrightarrow{\\mathrm{P}} \\mu",
  steps: wllnSteps,
});

let slln = formatDisplayedTheorem({
  title: "Strong law of large numbers",
  status: "proved",
  statement:
    "The average of a large number of independent random observations converges almost surely to the expected population value when the $X_i$ are i.i.d. and integrable: $\\bar X_n(\\omega)\\to\\mu=\\mathbb{E}[X_1]$ for almost every outcome.",
  claimTex: "\\bar X_n \\xrightarrow{\\mathrm{a.s.}} \\mu",
});

const agent = await createStudyAgent();
let writeChain = Promise.resolve();
try {
  const [update] = await attachMathlibWriteups(
    [
      {
        id: "lln",
        status: llnPrior.status,
        note: llnPrior.note,
        theorems: [
          {
            claim:
              "Weak law of large numbers: for i.i.d. $X_i$ with finite mean $\\mu$ and finite variance $\\sigma^2$, $\\bar X_n \\to \\mu$ in probability.",
            status: "proved",
            proof:
              "Chebyshev: $\\operatorname{Var}(\\bar X_n)=\\sigma^2/n$, so $\\mathbb{P}(|\\bar X_n-\\mu|\\ge\\varepsilon)\\le \\sigma^2/(n\\varepsilon^2)\\to 0$.",
          },
          {
            claim:
              "Strong law of large numbers: for i.i.d. integrable $X_i$ with mean $\\mu$, $\\bar{X}_n \\to \\mu$ almost surely.",
            status: "proved",
            proof:
              "Truncate to finite-variance copies, Chebyshev on the $n^2$ subsequence, Borel–Cantelli for almost-sure subsequence convergence, Kronecker lemma to fill the gaps.",
          },
        ],
      },
    ],
    {
      writeProof: (hit, claim) => {
        const job = writeChain.then(() =>
          writeStandardProof({ agent, claim, hit }),
        );
        writeChain = job.then(
          () => undefined,
          () => undefined,
        );
        return job;
      },
    },
  );
  const strong = update.theorems?.find((th) => th.lemma);
  if (strong?.canonical) {
    const texes = splitMathEnvs(strong.canonical);
    const steps = await withCribs(texes, SLLN_LABELS);
    const prose = strong.canonical
      .replace(/\$\$[\s\S]*?\$\$/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    slln = formatDisplayedTheorem({
      title: "Strong law of large numbers",
      status: "proved",
      statement:
        "The average of a large number of independent random observations converges almost surely to the expected population value when the $X_i$ are i.i.d. and integrable: $\\bar X_n(\\omega)\\to\\mu=\\mathbb{E}[X_1]$ for almost every outcome.",
      claimTex: "\\bar X_n \\xrightarrow{\\mathrm{a.s.}} \\mu",
      steps,
      prose,
    });
  }
  const idx = learner.knowledge.findIndex((e) => e.id === "lln");
  learner.knowledge[idx] = {
    ...learner.knowledge[idx],
    ...update,
    theorems: update.theorems,
  };
  await saveLearner(learner);
  console.log(
    `ok lln lemmas=${(update.theorems ?? []).map((t) => t.lemma || "named-only").join(",")}`,
  );
} finally {
  try {
    await agent.close();
  } catch {
    /* already closed */
  }
}

const llnStored = teachings.lln ?? "";
const llnBody = [
  keepHead(llnStored),
  "## Theorems",
  wlln,
  slln,
  seeAlso(llnStored),
]
  .filter(Boolean)
  .join("\n\n");
await writeConceptTeaching("lln", llnBody, "Law of large numbers");

const cltStored = teachings.clt ?? "";
const clt = formatDisplayedTheorem({
  title: "Central limit theorem",
  status: "asserted",
  statement:
    "If the $X_i$ are i.i.d. with finite mean $\\mu$ and finite positive variance $\\sigma^2$, the scaled fluctuation of the sample average around $\\mu$ converges in distribution to a standard normal: typical deviations of $\\bar X_n$ are order $1/\\sqrt{n}$, not the vanishing of the LLN.",
  claimTex:
    "\\frac{\\bar X_n-\\mu}{\\sigma/\\sqrt{n}}\\xrightarrow{d}\\mathcal{N}(0,1)",
});
const cltBody = [keepHead(cltStored), "## Theorems", clt, seeAlso(cltStored)]
  .filter(Boolean)
  .join("\n\n");
await writeConceptTeaching("clt", cltBody, "Central limit theorem");
console.log("ok clt asserted (no named moves, so no mathlib proof)");
