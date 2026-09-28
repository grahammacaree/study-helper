/**
 * Fold-then-truncate budgets for agent prompts.
 * Prefer host structure (teaching sections, Lean signatures, display math)
 * before a naive head cut — same idea as CRW's budgetDiffForAgent.
 */

export type PromptBudgetKind = "teaching" | "lean" | "prose";

export type PromptBudgetMode =
  | "full"
  | "folded"
  | "folded_truncated"
  | "head_truncated";

export interface PromptBudgetResult {
  text: string;
  mode: PromptBudgetMode;
  rawChars: number;
  sentChars: number;
}

/** Fit text into maxChars for an agent prompt. Fold structured noise first. */
export function budgetTextForAgent(
  text: string,
  maxChars: number,
  kind: PromptBudgetKind = "prose",
): PromptBudgetResult {
  const raw = text.trimEnd();
  const rawChars = raw.length;
  if (rawChars <= maxChars) {
    return { text: raw, mode: "full", rawChars, sentChars: rawChars };
  }

  const folded = foldByKind(raw, kind);
  const noteFolded = `\n…[folded for budget: ${kind} ${rawChars}→${folded.length} chars]`;
  if (folded.length + noteFolded.length <= maxChars) {
    const textOut = folded + noteFolded;
    return {
      text: textOut,
      mode: "folded",
      rawChars,
      sentChars: textOut.length,
    };
  }

  if (folded.length < rawChars) {
    const room = Math.max(0, maxChars - 120);
    const textOut = `${folded.slice(0, room)}\n…[truncated folded ${kind}; raw ${rawChars} chars, folded ${folded.length}]`;
    return {
      text: textOut,
      mode: "folded_truncated",
      rawChars,
      sentChars: textOut.length,
    };
  }

  const textOut = `${raw.slice(0, maxChars)}\n…[truncated ${rawChars - maxChars} chars]`;
  return {
    text: textOut,
    mode: "head_truncated",
    rawChars,
    sentChars: textOut.length,
  };
}

/** Convenience for prompt assembly — returns only the budgeted string. */
export function clipForAgent(
  text: string,
  maxChars: number,
  kind: PromptBudgetKind = "prose",
): string {
  const t = text.trim();
  if (!t) return "";
  return budgetTextForAgent(t, maxChars, kind).text;
}

function foldByKind(text: string, kind: PromptBudgetKind): string {
  if (kind === "teaching") return foldTeaching(text);
  if (kind === "lean") return foldLean(text);
  return foldProse(text);
}

/** Collapse large display-math blocks; keep surrounding prose. */
export function foldProse(text: string): string {
  return text.replace(/\$\$([\s\S]*?)\$\$/g, (_m, body: string) => {
    const inner = body.trim();
    if (inner.length <= 160) return `$$\n${inner}\n$$`;
    const head = inner.slice(0, 80).replace(/\s+/g, " ").trim();
    return `$$ /* display math folded (${inner.length} chars): ${head}… */ $$`;
  });
}

/**
 * Teaching pages: keep intro + section skeleton; compress Vocab / Theorems /
 * Examples / numbered proof steps before any head cut.
 */
export function foldTeaching(text: string): string {
  const parts = splitMarkdownSections(text);
  return parts
    .map((sec) => {
      const title = sec.title?.toLowerCase() ?? "";
      if (title === "vocabulary") return foldVocabSection(sec);
      if (title === "theorems") return foldTheoremsSection(sec);
      if (title === "examples") return foldExamplesSection(sec);
      if (title === "see also" || title === "from lectures") return sec;
      return {
        ...sec,
        body: foldProse(sec.body ?? ""),
      };
    })
    .map(formatSection)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Keep docstring + theorem/lemma signature; collapse a long `by` tactic body.
 */
export function foldLean(text: string): string {
  const byAt = /:=\s*by\b/.exec(text);
  if (!byAt || byAt.index == null) {
    if (text.length <= 2_400) return text;
    return `${text.slice(0, 2_000)}\n-- [lean body folded; ${text.length} chars]`;
  }
  const head = text.slice(0, byAt.index + byAt[0].length).trimEnd();
  const body = text.slice(byAt.index + byAt[0].length);
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length <= 12 && body.length <= 800) return text;
  const sketch = leanTacticSketch(lines);
  return `${head}\n${sketch}\n-- [${lines.length} tactic lines folded; ${body.length} chars]`;
}

interface MdSection {
  title?: string;
  level: number;
  body: string;
}

function splitMarkdownSections(text: string): MdSection[] {
  const lines = text.replace(/\n$/, "").split("\n");
  const sections: MdSection[] = [];
  let cur: MdSection = { level: 0, body: "" };
  const flush = (): void => {
    const body = cur.body.replace(/^\n+/, "").trimEnd();
    if (cur.title || body.trim()) sections.push({ ...cur, body });
  };
  for (const line of lines) {
    const h = /^(#{1,4})\s+(.+)$/.exec(line);
    if (h && h[1].length <= 2) {
      flush();
      cur = { title: h[2].trim(), level: h[1].length, body: "" };
      continue;
    }
    cur.body += `${line}\n`;
  }
  flush();
  return sections.length ? sections : [{ level: 0, body: text }];
}

function formatSection(sec: MdSection): string {
  const body = (sec.body ?? "").trim();
  if (!sec.title) return body;
  const marks = "#".repeat(Math.max(1, Math.min(4, sec.level || 2)));
  return body ? `${marks} ${sec.title}\n\n${body}` : `${marks} ${sec.title}`;
}

function foldVocabSection(sec: MdSection): MdSection {
  const bullets = sec.body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*•]\s+/.test(l));
  if (bullets.length <= 8 && sec.body.length <= 900) {
    return { ...sec, body: sec.body.trim() };
  }
  const terms = bullets
    .map((b) =>
      b
        .replace(/^[-*•]\s+/, "")
        .replace(/^\*\*(.+?)\*\*.*$/, "$1")
        .split(/[:—–]/)[0]
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 12);
  return {
    ...sec,
    body: `vocab (${bullets.length} terms): ${terms.join("; ")}${
      bullets.length > terms.length ? "; …" : ""
    }`,
  };
}

function foldTheoremsSection(sec: MdSection): MdSection {
  if (sec.body.length <= 1_200) {
    return { ...sec, body: foldProofSteps(foldProse(sec.body)) };
  }
  const blocks = sec.body.split(/(?=^###\s+)/m).filter((b) => b.trim());
  if (blocks.length <= 1 && !/^###\s+/m.test(sec.body)) {
    return { ...sec, body: foldProofSteps(foldProse(sec.body)) };
  }
  const folded = blocks
    .map((block) => {
      const titled = /^###\s+(.+?)(?:\n+([\s\S]*))?$/.exec(block.trim());
      if (!titled) return foldProofSteps(foldProse(block.trim()));
      const name = titled[1].trim();
      let rest = (titled[2] ?? "").trim();
      const proofAt = /\n#{3,4}\s+Proof\b/i.exec(`\n${rest}`);
      let claim = rest;
      let proof = "";
      if (proofAt && proofAt.index != null) {
        const at = proofAt.index > 0 ? proofAt.index - 1 : 0;
        claim = rest.slice(0, at).trim();
        proof = rest.slice(at).trim();
      }
      const claimShort = foldProse(claim);
      if (!proof) return `### ${name}\n\n${claimShort}`;
      const stepN = (proof.match(/^\d+[.)]\s*$/gm) ?? []).length;
      const proofNote =
        stepN > 0
          ? `#### Proof\n\n[${stepN} numbered steps folded]`
          : `#### Proof\n\n[${proof.length} chars folded]`;
      return `### ${name}\n\n${claimShort}\n\n${proofNote}`;
    })
    .join("\n\n");
  return { ...sec, body: folded };
}

function foldExamplesSection(sec: MdSection): MdSection {
  const bullets = sec.body
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  const items: string[] = [];
  let cur: string[] = [];
  const flush = (): void => {
    if (!cur.length) return;
    items.push(cur.join("\n").trim());
    cur = [];
  };
  for (const line of bullets) {
    if (/^[-*•]\s+/.test(line.trim())) {
      flush();
      cur = [line];
    } else if (cur.length) {
      cur.push(line);
    }
  }
  flush();
  if (items.length <= 2 && sec.body.length <= 1_200) {
    return { ...sec, body: foldProse(sec.body.trim()) };
  }
  const kept = items.slice(0, 2).map((item) => foldProse(item));
  const rest = items.length - kept.length;
  const body =
    rest > 0
      ? `${kept.join("\n\n")}\n\n…[${rest} further example(s) folded]`
      : kept.join("\n\n");
  return { ...sec, body };
}

function foldProofSteps(text: string): string {
  const steps = text.match(/^\d+[.)]\s*$/gm);
  if (!steps || steps.length < 4) return text;
  // Keep claim-like prose before the first numbered step; summarize the rest.
  const first = text.search(/^\d+[.)]\s*$/m);
  if (first < 0) return text;
  const head = text.slice(0, first).trim();
  const note = `[${steps.length} numbered proof steps folded]`;
  return head ? `${head}\n\n${note}` : note;
}

function leanTacticSketch(lines: string[]): string {
  const interesting = lines.filter((l) =>
    /^\s*(have|intro|refine|apply|exact|rw|simp|calc|obtain|let|·|'\s|cases|induction)\b/.test(
      l,
    ),
  );
  const budget = Math.min(8, Math.max(3, Math.ceil(lines.length / 8)));
  if (!interesting.length) {
    return lines
      .slice(0, budget)
      .map((l) => (l.length > 72 ? `${l.slice(0, 70)}…` : l))
      .join("\n");
  }
  const step = interesting.length / budget;
  const picked: string[] = [];
  for (let i = 0; i < budget && i * step < interesting.length; i += 1) {
    const line = interesting[Math.floor(i * step)]!;
    picked.push(line.length > 72 ? `${line.slice(0, 70)}…` : line);
  }
  return picked.join("\n");
}
