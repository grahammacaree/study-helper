function stripBy(raw: string): string {
  return raw.replace(/^by\s+/i, "").trim();
}

function isSimplification(label: string): boolean {
  return /^(simplification|simplifying\b|noting\b)/i.test(stripBy(label));
}

function cribPart(label: string): string {
  const t = stripBy(label);
  if (!t) return "";
  if (isSimplification(t)) return "noting $\\sigma$ and $\\varepsilon$ as constants";
  return t;
}

function joinAnd(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function splitCribLabels(raw: string): string[] {
  return raw
    .split(/\s*;\s*|\n+/)
    .map(stripBy)
    .filter(Boolean)
    .filter((label, i, all) => all.indexOf(label) === i);
}

/** One italic line: "by Chebyshev's inequality and noting $\sigma$ and $\varepsilon$ as constants". */
export function formatCribLine(labels: string[]): string | undefined {
  if (labels.length === 1 && /\sand\s/i.test(stripBy(labels[0]))) {
    const t = stripBy(labels[0]);
    return t ? `by ${t}` : undefined;
  }
  const named: string[] = [];
  let simp = "";
  for (const label of labels) {
    const part = cribPart(label);
    if (!part) continue;
    if (isSimplification(stripBy(label))) {
      simp = part;
      continue;
    }
    if (!named.includes(part)) named.push(part);
  }
  const parts = simp ? [...named, simp] : named;
  if (!parts.length) return undefined;
  return `by ${joinAnd(parts)}`;
}

export function formatDisplayedTheorem(opts: {
  title: string;
  status: "asserted" | "proved";
  statement: string;
  claimTex: string;
  steps?: Array<{ tex: string; crib?: string }>;
  prose?: string;
}): string {
  const bits = [
    `### ${opts.title.trim()}`,
    opts.statement.trim(),
    `$$\n${opts.claimTex.trim()}\n$$`,
  ];
  if (opts.status !== "proved") return bits.join("\n\n");
  const steps = opts.steps?.filter((s) => s.tex.trim()) ?? [];
  if (steps.length) {
    bits.push("#### Proof");
    steps.forEach((step, i) => {
      bits.push(`${i + 1}.`);
      bits.push(`$$\n${step.tex.trim()}\n$$`);
      const crib = formatCribLine(splitCribLabels(step.crib ?? ""));
      if (crib) bits.push(`*${crib}*`);
    });
  }
  if (opts.prose?.trim()) bits.push(opts.prose.trim());
  return bits.join("\n\n");
}
