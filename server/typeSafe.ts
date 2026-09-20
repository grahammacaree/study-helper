import { typeSafeApiKey, typeSafeEnabled } from "./env.js";
import { theoremKey } from "./learner.js";
import { formatCribLine } from "./proofDisplay.js";
import type { ConceptTheorem, KnowledgeEntry, QuizItem } from "./types.js";

const API = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const TIMEOUT_MS = 4000;
const ACCEPT = 0.5;
const NOUL_YES = 0.7;
const NOUL_NO = 0.35;
const NONE = "none";

export const ADEQUATE_TEACHBACK = "That's the idea.";

type ChoiceAnswer = {
  type?: string;
  choice?: string;
  confidence?: number;
};

type NoulAnswer = {
  type?: string;
  noul?: number;
};

type Answers = Record<string, ChoiceAnswer | NoulAnswer | undefined>;

export type HitPick =
  | { kind: "index"; i: number }
  | { kind: "none" }
  | { kind: "skip" };

export type QuestScreen =
  | { kind: "reject"; reason: string }
  | { kind: "existing"; id: string }
  | { kind: "accept"; name: string };

export function acceptChoice(
  choice: string | undefined,
  confidence: number | undefined,
  min = ACCEPT,
): string | undefined {
  const id = choice?.trim();
  if (!id || id === NONE) return undefined;
  if ((confidence ?? 0) < min) return undefined;
  return id;
}

export function noulYes(p: number | undefined, min = NOUL_YES): boolean {
  return (p ?? 0) >= min;
}

export function noulNo(p: number | undefined, max = NOUL_NO): boolean {
  return (p ?? 1) <= max;
}

export function decideLeanPick(
  choice: string | undefined,
  confidence: number | undefined,
  n: number,
): HitPick {
  if (!n) return { kind: "skip" };
  const pick = acceptChoice(choice, confidence);
  if (pick?.startsWith("h")) {
    const i = Number(pick.slice(1));
    if (Number.isInteger(i) && i >= 0 && i < n) return { kind: "index", i };
  }
  if (choice?.trim() === NONE && (confidence ?? 0) >= ACCEPT) {
    return { kind: "none" };
  }
  return { kind: "skip" };
}

export function decideQuestScreen(opts: {
  study?: number;
  match?: string;
  matchConf?: number;
  knownIds: string[];
  title: string;
}): QuestScreen | undefined {
  const existing = acceptChoice(opts.match, opts.matchConf);
  if (existing && opts.knownIds.includes(existing) && !noulNo(opts.study)) {
    return { kind: "existing", id: existing };
  }
  if (noulNo(opts.study)) {
    return { kind: "reject", reason: "That's not a concept for the library." };
  }
  if (
    noulYes(opts.study) &&
    (!opts.match || opts.match === NONE) &&
    (opts.matchConf ?? 0) >= ACCEPT
  ) {
    return { kind: "accept", name: titleCase(opts.title) };
  }
  return undefined;
}

export function decideAdequate(restates?: number, question?: number): boolean {
  return noulYes(restates) && noulNo(question);
}

export function decideDropCalc(
  items: QuizItem[],
  calc: Array<number | undefined>,
): QuizItem[] {
  return decideScreenQuiz(
    items,
    calc.map((p) => ({ calc: p })),
  );
}

export function decideScreenQuiz(
  items: QuizItem[],
  rows: Array<{ calc?: number; tests?: number; keyed?: number }>,
): QuizItem[] {
  if (!items.length) return items;
  const kept = items.filter((_, i) => {
    const row = rows[i] ?? {};
    if (noulYes(row.calc)) return false;
    if (noulNo(row.tests)) return false;
    if (noulNo(row.keyed)) return false;
    return true;
  });
  return kept.length ? kept : items;
}

export function decideStepCribs(
  hits: Array<{ id: string; p?: number; label: string }>,
  min = ACCEPT,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hit of hits) {
    if (hit.id === NONE || hit.id === "algebra") continue;
    if ((hit.p ?? 0) < min) continue;
    const label = hit.label.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

export function formatStepCrib(labels: string[]): string | undefined {
  return formatCribLine(labels);
}

export function decideStepCrib(opts: {
  choice?: string;
  confidence?: number;
  pNamed?: number;
  pSimp?: number;
  labels: Record<string, string>;
}): string | undefined {
  const hits: Array<{ id: string; p?: number; label: string }> = [];
  const id = opts.choice?.trim();
  if (id && id !== NONE && (opts.confidence ?? 0) >= ACCEPT) {
    hits.push({
      id,
      p: opts.pNamed ?? opts.confidence,
      label: opts.labels[id] ?? id,
    });
  }
  if ((opts.pSimp ?? 0) >= ACCEPT) {
    hits.push({
      id: "simplification",
      p: opts.pSimp,
      label: opts.labels.simplification ?? "simplification",
    });
  }
  return formatStepCrib(decideStepCribs(hits));
}

export function decideRemapIndex(
  choice: string | undefined,
  confidence: number | undefined,
  n: number,
): number | undefined {
  const pick = acceptChoice(choice, confidence);
  if (!pick?.startsWith("t")) return undefined;
  const i = Number(pick.slice(1));
  if (!Number.isInteger(i) || i < 0 || i >= n) return undefined;
  return i;
}

async function systemOne(
  state: unknown,
  questions: Record<string, unknown>,
): Promise<Answers | undefined> {
  const key = typeSafeApiKey();
  if (!typeSafeEnabled() || !key || !Object.keys(questions).length) {
    return undefined;
  }
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "study-helper-local",
      },
      body: JSON.stringify({ model: MODEL, state, questions }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { answers?: Answers };
    return json.answers;
  } catch {
    return undefined;
  }
}

function noulOf(answers: Answers | undefined, id: string): number | undefined {
  const row = answers?.[id];
  if (!row || row.type === "choice") return undefined;
  return (row as NoulAnswer).noul;
}

function choiceOf(
  answers: Answers | undefined,
  id: string,
): ChoiceAnswer | undefined {
  const row = answers?.[id];
  if (!row || (row.type && row.type !== "choice")) return undefined;
  return row as ChoiceAnswer;
}

export async function pickLeanHit(
  claim: string,
  hits: Array<{ lemma: string; informal: string }>,
): Promise<HitPick> {
  if (!hits.length) return { kind: "skip" };
  const criteria: Record<string, string | null> = {
    [NONE]: "None of these is the same theorem as the claim.",
  };
  hits.forEach((hit, i) => {
    criteria[`h${i}`] = `${hit.lemma}: ${hit.informal.slice(0, 180)}`;
  });
  const answers = await systemOne(
    { claim: claim.trim().slice(0, 500) },
    {
      pick: {
        type: "choice",
        instructions: "Which listed mathlib result is the same theorem as `claim`?",
        criteria,
      },
    },
  );
  if (!answers) return { kind: "skip" };
  const row = choiceOf(answers, "pick");
  return decideLeanPick(row?.choice, row?.confidence, hits.length);
}

export async function screenQuestTopic(
  title: string,
  concepts: Array<{ id: string; name: string }>,
): Promise<QuestScreen | undefined> {
  const trimmed = title.trim().slice(0, 200);
  if (!trimmed) return undefined;
  const known = concepts.slice(0, 200);
  const criteria: Record<string, string | null> = {
    [NONE]: "Not already a listed concept.",
  };
  for (const row of known) {
    criteria[row.id] = row.name;
  }
  const answers = await systemOne(
    { title: trimmed },
    {
      study: {
        type: "noul",
        instructions:
          "Is `title` a CS or maths study concept (a definition, structure, technique, or theorem) that could live in a personal library?",
        criteria: {
          true: "A reusable idea you can meet again in lectures",
          false: "A person, place, company, sport, news item, recap lecture, or trivia",
        },
      },
      match: {
        type: "choice",
        instructions:
          "If `title` is already one of these library concepts (same idea, even if wording differs), pick it.",
        criteria,
      },
    },
  );
  if (!answers) return undefined;
  const match = choiceOf(answers, "match");
  return decideQuestScreen({
    study: noulOf(answers, "study"),
    match: match?.choice,
    matchConf: match?.confidence,
    knownIds: known.map((row) => row.id),
    title: trimmed,
  });
}

export async function adequateParaphrase(
  prompt: string,
  answer: string,
): Promise<boolean> {
  const answers = await systemOne(
    {
      prompt: prompt.trim().slice(0, 500),
      answer: answer.trim().slice(0, 800),
    },
    {
      restates: {
        type: "noul",
        instructions:
          "Does `answer` restate the idea in `prompt` in the learner's own words, well enough to lock it in?",
        criteria: {
          true: "The correction or idea is present in their own words",
          false: "Thin, wrong, missing, or only 'ok' / 'next' / 'lgtm'",
        },
      },
      question: {
        type: "noul",
        instructions: "Is `answer` mainly a clarifying question rather than a restatement?",
        criteria: {
          true: "They are asking something",
          false: "They are stating the idea",
        },
      },
    },
  );
  if (!answers) return false;
  return decideAdequate(noulOf(answers, "restates"), noulOf(answers, "question"));
}

export async function screenQuizItems(
  items: QuizItem[],
  names: Record<string, string>,
): Promise<QuizItem[]> {
  if (!items.length) return items;
  const questions: Record<string, unknown> = {};
  items.forEach((_, i) => {
    questions[`calc_${i}`] = {
      type: "noul",
      instructions: `Is \`items[${i}].prompt\` asking the learner to compute a number, invert a matrix, row-reduce, expand, integrate, or plug into a formula?`,
      criteria: {
        true: "A calculation or symbolic grind",
        false: "A conceptual question (definition, implication, which tool)",
      },
    };
    questions[`tests_${i}`] = {
      type: "noul",
      instructions: `Does answering \`items[${i}].prompt\` test whether the learner has the concept \`items[${i}].concept\` — not a neighboring idea, not generic maths trivia, and not a question you could ace without that concept?`,
      criteria: {
        true: "Getting it right requires this concept",
        false: "Off-topic, tests a different idea, or too vague to tell",
      },
    };
    questions[`keyed_${i}`] = {
      type: "noul",
      instructions: `Given \`items[${i}].choices\`, is \`items[${i}].correctId\` actually the right answer to \`items[${i}].prompt\` for \`items[${i}].concept\`?`,
      criteria: {
        true: "The keyed choice is the correct one",
        false: "The keyed choice is wrong, ambiguous, or several choices are equally right",
      },
    };
  });
  const answers = await systemOne(
    {
      items: items.map((item) => ({
        concept: (names[item.conceptId] || item.conceptId).slice(0, 80),
        prompt: item.prompt.slice(0, 400),
        choices: item.choices
          .map((c) => `${c.id}: ${c.text.slice(0, 160)}`)
          .join("\n")
          .slice(0, 700),
        correctId: item.correctId.slice(0, 16),
      })),
    },
    questions,
  );
  if (!answers) return items;
  return decideScreenQuiz(
    items,
    items.map((_, i) => ({
      calc: noulOf(answers, `calc_${i}`),
      tests: noulOf(answers, `tests_${i}`),
      keyed: noulOf(answers, `keyed_${i}`),
    })),
  );
}

export async function labelProofSteps(
  steps: string[],
  labels: Record<string, string>,
): Promise<Array<string | undefined>> {
  if (!steps.length) return [];
  const tricks = Object.entries(labels).filter(
    ([id]) => id !== NONE && id !== "algebra",
  );
  const questions: Record<string, unknown> = {};
  steps.forEach((_, i) => {
    for (const [id, label] of tricks) {
      questions[`s${i}_${id}`] = {
        type: "noul",
        instructions: `Does proof step \`steps[${i}]\` use this move: ${label}?`,
        criteria: {
          true: "This line relies on that move",
          false: "This line does not use that move",
        },
      };
    }
  });
  const answers = await systemOne({ steps: steps.map((s) => s.slice(0, 240)) }, questions);
  if (!answers) return steps.map(() => undefined);
  return steps.map((_, i) =>
    formatStepCrib(
      decideStepCribs(
        tricks.map(([id, label]) => ({
          id,
          p: noulOf(answers, `s${i}_${id}`),
          label,
        })),
      ),
    ),
  );
}

export async function remapTheoremClaims(
  incoming: ConceptTheorem[],
  prior: ConceptTheorem[],
): Promise<ConceptTheorem[]> {
  if (!incoming.length || !prior.length) return incoming;
  const seen = new Set<string>();
  const pool: ConceptTheorem[] = [];
  for (const row of prior) {
    const key = theoremKey(row.claim, row.title);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(row);
    if (pool.length >= 40) break;
  }
  const criteria: Record<string, string | null> = {
    [NONE]: "A different claim.",
  };
  pool.forEach((row, i) => {
    criteria[`t${i}`] = [row.title, row.claim].filter(Boolean).join(": ").slice(0, 220);
  });
  const questions: Record<string, unknown> = {};
  incoming.forEach((th, i) => {
    questions[`m${i}`] = {
      type: "choice",
      instructions: `If this claim is the same mathematical statement as an existing row, pick it.\n${[th.title, th.claim].filter(Boolean).join("\n").slice(0, 400)}`,
      criteria,
    };
  });
  const answers = await systemOne({ n: incoming.length }, questions);
  if (!answers) return incoming;
  return incoming.map((th, i) => {
    const row = choiceOf(answers, `m${i}`);
    const idx = decideRemapIndex(row?.choice, row?.confidence, pool.length);
    if (idx == null) return th;
    return {
      ...th,
      claim: pool[idx].claim,
      ...(pool[idx].title ? { title: pool[idx].title } : {}),
    };
  });
}

export async function alignKnowledgeTheorems(
  prior: KnowledgeEntry[],
  updates: KnowledgeEntry[],
): Promise<KnowledgeEntry[]> {
  const incoming = updates.flatMap((u) => u.theorems ?? []);
  if (!incoming.length) return updates;
  const pool = prior.flatMap((e) => e.theorems ?? []);
  const remapped = await remapTheoremClaims(incoming, pool);
  let i = 0;
  return updates.map((u) => {
    if (!u.theorems?.length) return u;
    const theorems = u.theorems.map(() => remapped[i++]);
    return { ...u, theorems };
  });
}

function titleCase(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}
