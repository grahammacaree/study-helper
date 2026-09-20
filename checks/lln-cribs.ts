/**
 * One-off: label WLLN (Chebyshev) and SLLN (mathlib) steps with TypeSafe cribs.
 * Needs TYPESAFE_API_KEY. Does not print the key.
 */
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { splitMathEnvs } from "../server/texDisplay.js";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env"), quiet: true });

const API = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
/** Choice confidence is "was this label unique," not "is this a theorem." Floor from TypeSafe: below ~0.5 is a real split. */
const ACCEPT = 0.5;

const WLLN_CRIBS: Record<string, string> = {
  chebyshev: "Chebyshev's inequality",
  markov: "Markov's inequality",
  iid_variance: "variance of the i.i.d. sample mean",
  simplification:
    "remaining factors are constants independent of n (e.g. σ² and ε), so the bound vanishes or the expression simplifies",
  algebra: "algebra or a definition only",
  none: "none of these",
};

const SLLN_CRIBS: Record<string, string> = {
  etemadi: "Etemadi's strong law (measurable i.i.d. case)",
  measurable_mk: "strongly measurable representatives",
  identical_distribution: "identical distribution",
  integral_ae: "almost-sure integral agreement",
  chebyshev: "Chebyshev's inequality",
  borel_cantelli: "Borel–Cantelli",
  kronecker: "Kronecker's lemma",
  truncation: "truncation to finite variance",
  simplification:
    "remaining factors are constants, or an already-established identity is simplified",
  algebra: "algebra or a definition only",
  none: "none of these",
};

const WLLN = {
  id: "wlln",
  title: "Weak law (Stat 110 / Chebyshev)",
  claim:
    "For i.i.d. $X_i$ with finite mean $\\mu$ and finite variance $\\sigma^2$, $\\bar X_n \\to \\mu$ in probability.",
  source: "classical Chebyshev argument, not mathlib",
  cribs: WLLN_CRIBS,
  steps: [
    "\\operatorname{Var}(\\bar X_n)=\\frac{\\sigma^2}{n}",
    "\\mathbb{P}(|\\bar X_n-\\mu|\\ge\\varepsilon)\\le \\frac{\\operatorname{Var}(\\bar X_n)}{\\varepsilon^2}=\\frac{\\sigma^2}{n\\varepsilon^2}",
    "\\frac{\\sigma^2}{n\\varepsilon^2}\\to 0 \\quad(n\\to\\infty)",
  ],
};

type Proof = {
  id: string;
  title: string;
  claim: string;
  source: string;
  cribs: Record<string, string>;
  steps: string[];
};

type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

type NoulAnswer = { type: "noul"; noul: number };

async function sllnFromDisk(): Promise<Proof> {
  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "data/learner/concepts/lln.md",
  );
  const md = await readFile(path, "utf8");
  const tex = md.split("**Standard proof**")[1] ?? md;
  const steps = splitMathEnvs(tex).map((block) =>
    block
      .replace(/\\begin\{gathered\}/g, "")
      .replace(/\\end\{gathered\}/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return {
    id: "slln",
    title: "Strong law (mathlib strong_law_ae)",
    claim:
      "For i.i.d. integrable $X_i$ with mean $\\mu$, $\\bar X_n \\to \\mu$ almost surely.",
    source: "mathlib ProbabilityTheory.strong_law_ae (Etemadi + measurable mk)",
    cribs: SLLN_CRIBS,
    steps,
  };
}

function questions(proof: Proof): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < proof.steps.length; i++) {
    out[`crib_${i}`] = {
      type: "choice",
      instructions: {
        question: `Which named justification applies to proof step \`steps[${i}]\`? Pick simplification if leftover factors are constants (σ², ε, another c). Pick none if the step is setup or does not use that theorem.`,
        step: proof.steps[i],
      },
      criteria: proof.cribs,
    };
    out[`named_${i}`] = {
      type: "noul",
      instructions: {
        question: `Does proof step \`steps[${i}]\` apply a named theorem (not mere algebra, a definition, or a constant-factor simplification)?`,
        step: proof.steps[i],
      },
      criteria: {
        true: "A named theorem or lemma is the reason this line holds",
        false: "This line is setup, algebra, bookkeeping, a definition, or a simplification",
      },
    };
    out[`simplifies_${i}`] = {
      type: "noul",
      instructions: {
        question: `Is proof step \`steps[${i}]\` only a simplification because leftover quantities are constants (for example σ² and ε, or another c independent of n), so an already-written bound or identity vanishes or reduces?`,
        step: proof.steps[i],
      },
      criteria: {
        true: "The work is that σ, ε, c, or similar are constant, so n→∞ or an algebraic reduction finishes the step",
        false: "The step introduces a new theorem, a new random object, or a non-constant estimate",
      },
    };
  }
  return out;
}

async function evaluate(proof: Proof, key: string): Promise<{
  answers: Record<string, ChoiceAnswer | NoulAnswer>;
  input_tokens?: number;
  output_tokens?: number;
}> {
  const body = {
    model: MODEL,
    state: {
      claim: proof.claim,
      source: proof.source,
      steps: proof.steps,
    },
    questions: questions(proof),
  };
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "User-Agent": "study-helper-local",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`TypeSafe ${res.status}`);
  }
  const json = JSON.parse(raw) as {
    answers: Record<string, ChoiceAnswer | NoulAnswer>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    answers: json.answers,
    input_tokens: json.usage?.input_tokens,
    output_tokens: json.usage?.output_tokens,
  };
}

function show(
  proof: Proof,
  answers: Record<string, ChoiceAnswer | NoulAnswer>,
): void {
  console.log(`\n## ${proof.title}`);
  console.log(proof.claim.replace(/\$/g, ""));
  console.log(`source: ${proof.source}\n`);
  for (let i = 0; i < proof.steps.length; i++) {
    const crib = answers[`crib_${i}`] as ChoiceAnswer | undefined;
    const named = answers[`named_${i}`] as NoulAnswer | undefined;
    const simplifies = answers[`simplifies_${i}`] as NoulAnswer | undefined;
    const id = crib?.choice ?? "none";
    const conf = crib?.confidence ?? 0;
    const pNamed = named?.noul ?? 0;
    const pSimp = simplifies?.noul ?? 0;
    const namedHit =
      id !== "none" &&
      id !== "algebra" &&
      id !== "simplification" &&
      pNamed >= 0.5 &&
      conf >= ACCEPT;
    const simpHit =
      pSimp >= 0.5 || (id === "simplification" && conf >= ACCEPT);
    const top = Object.entries(crib?.probabilities ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, p]) => `${k} ${p.toFixed(2)}`)
      .join(", ");
    console.log(`  ${i + 1}. ${proof.steps[i]}`);
    if (top) console.log(`     P: ${top}`);
    if (namedHit) {
      console.log(
        `     by ${proof.cribs[id] ?? id}  (conf ${conf.toFixed(2)}, P(named) ${pNamed.toFixed(2)})`,
      );
    } else if (simpHit) {
      console.log(
        `     simplification (σ, ε, c constant)  (conf ${conf.toFixed(2)}, P(simp) ${pSimp.toFixed(2)})`,
      );
    } else {
      console.log(
        `     —  (pick ${id}, conf ${conf.toFixed(2)}, P(named) ${pNamed.toFixed(2)}, P(simp) ${pSimp.toFixed(2)})`,
      );
    }
  }
}

async function main(): Promise<void> {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "TYPESAFE_API_KEY is missing. Add it to .env (server-side only; do not commit).",
    );
  }
  const proofs: Proof[] = [WLLN, await sllnFromDisk()];
  let inTok = 0;
  let outTok = 0;
  for (const proof of proofs) {
    const result = await evaluate(proof, key);
    inTok += result.input_tokens ?? 0;
    outTok += result.output_tokens ?? 0;
    show(proof, result.answers);
  }
  console.log(`\nusage (reported): ${inTok} in / ${outTok} out`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
