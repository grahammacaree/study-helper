/**
 * Fold-then-truncate prompt budgets (no live API).
 * Run: npm run check:prompt-budget
 */
import {
  budgetTextForAgent,
  foldLean,
  foldProse,
  foldTeaching,
} from "../server/promptBudget.js";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `   ${detail}` : ""}`);
  if (!ok) failed += 1;
}

const teaching = [
  "A hash family maps keys into buckets under a load factor.",
  "",
  "## Vocabulary",
  ...Array.from({ length: 14 }, (_, i) => `- **term${i}**: gloss number ${i} with enough words to look real`),
  "",
  "## Theorems",
  "### Weak law of large numbers",
  "",
  "Sample means converge in probability.",
  "",
  "$$",
  "\\bar X_n \\xrightarrow{\\mathrm{P}} \\mu",
  "$$",
  "",
  "#### Proof",
  "",
  "1.",
  "",
  "$$",
  "a=b",
  "$$",
  "",
  "*by Chebyshev*",
  "",
  "2.",
  "",
  "$$",
  "b=c",
  "$$",
  "",
  "3.",
  "",
  "$$",
  "c=d",
  "$$",
  "",
  "4.",
  "",
  "$$",
  "d=e",
  "$$",
  "",
  "## Examples",
  "- Worked: compute $\\alpha=n/m$ for a table of size $m=16$ holding $n=12$ keys — load is $3/4$, so chaining stays short in expectation.",
  "- Cartoon diagram of a bucket array (skip — not a method).",
  "- Another worked reduction that should fold away when over budget.",
  "",
  "## See also",
  "- [Algorithms](concept:algorithms)",
].join("\n");

const foldedTeaching = foldTeaching(teaching);
check(
  "foldTeaching keeps theorem name",
  /Weak law of large numbers/.test(foldedTeaching),
);
check(
  "foldTeaching compresses vocab list",
  /vocab \(\d+ terms\)/.test(foldedTeaching) &&
    foldedTeaching.length < teaching.length,
  `raw=${teaching.length} folded=${foldedTeaching.length}`,
);
check(
  "foldTeaching folds proof steps",
  /numbered (?:proof )?steps folded/i.test(foldedTeaching),
);
check(
  "foldTeaching keeps a worked example signal",
  /load|\\alpha|worked/i.test(foldedTeaching),
);

const lean = [
  "/-- **Strong law.** Etemadi. -/",
  "theorem strong_law_ae (X : ℕ → Ω → E) : True := by",
  ...Array.from({ length: 40 }, (_, i) => `  have h${i} : True := by trivial`),
  "  exact trivial",
].join("\n");

const foldedLean = foldLean(lean);
check(
  "foldLean keeps theorem head",
  /theorem strong_law_ae/.test(foldedLean) && /:= by/.test(foldedLean),
);
check(
  "foldLean collapses tactic body",
  foldedLean.length < lean.length && /tactic lines folded/i.test(foldedLean),
  `raw=${lean.length} folded=${foldedLean.length}`,
);

const prose = `Before.\n\n$$\n${"x".repeat(400)}\n$$\n\nAfter.`;
check(
  "foldProse collapses fat display math",
  foldProse(prose).length < prose.length && /display math folded/i.test(foldProse(prose)),
);

const paddedTeaching = `${teaching}\n\n${"pad paragraph. ".repeat(200)}`;
const budgeted = budgetTextForAgent(paddedTeaching, 900, "teaching");
check(
  "budget prefers fold over blind head cut",
  budgeted.mode === "folded" || budgeted.mode === "folded_truncated",
  `mode=${budgeted.mode} raw=${budgeted.rawChars} sent=${budgeted.sentChars}`,
);
check(
  "budget stays under maxChars",
  budgeted.sentChars <= 900 + 5,
  `sent=${budgeted.sentChars}`,
);
check(
  "budget keeps Weak law signal",
  /Weak law|vocab|proof steps folded/i.test(budgeted.text),
);
check(
  "budget full when under limit",
  budgetTextForAgent("short", 50_000, "teaching").mode === "full",
);

const leanBudget = budgetTextForAgent(lean + "\n" + "  skip\n".repeat(200), 600, "lean");
check(
  "lean budget folds before truncating",
  leanBudget.mode === "folded" || leanBudget.mode === "folded_truncated",
  `mode=${leanBudget.mode}`,
);
check(
  "lean budget keeps strong_law_ae",
  /strong_law_ae/.test(leanBudget.text),
);

if (failed) throw new Error(`${failed} prompt-budget check(s) failed`);
console.log("\nok prompt-budget folds");
