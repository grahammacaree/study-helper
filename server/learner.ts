import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { projectRoot } from "./env.js";
import { readAllSessions } from "./store.js";
import type {
  ConceptTheorem,
  KnowledgeEntry,
  KnowledgeStatus,
  LectureStatus,
  QuizLogEntry,
  SideQuest,
  QuizItem,
  TheoremStatus,
} from "./types.js";
import type { DecayMap } from "./decay.js";

const MAX_FILE_CHARS = 12_000;

export interface LearnerState {
  profile: string;
  knowledge: KnowledgeEntry[];
  progress: Record<string, Record<string, LectureStatus>>;
  quizLog: Record<string, QuizLogEntry>;
  decay: DecayMap;
  sideQuests: SideQuest[];
}

function learnerDir(): string {
  return join(projectRoot(), "data", "learner");
}

function profilePath(): string {
  return join(learnerDir(), "profile.md");
}

function knowledgePath(): string {
  return join(learnerDir(), "knowledge.md");
}

function progressPath(): string {
  return join(learnerDir(), "progress.json");
}

function quizLogPath(): string {
  return join(learnerDir(), "quiz-log.json");
}

function decayPath(): string {
  return join(learnerDir(), "decay.json");
}

function questsPath(): string {
  return join(learnerDir(), "side-quests.md");
}

function lectureSummaryPath(courseId: string, n: number): string {
  return join(learnerDir(), "lectures", courseId, `${n}.md`);
}

function conceptsDir(): string {
  return join(learnerDir(), "concepts");
}

export function isSafeConceptFileId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/i.test(id);
}

function conceptTeachingPath(id: string): string {
  if (!isSafeConceptFileId(id)) {
    throw new Error("Invalid concept id.");
  }
  return join(conceptsDir(), `${id}.md`);
}

export function emptyProfile(): string {
  return `# Study profile (Graham)

Private. Study helper only.
Self-directed, not an exam. Structural/conceptual first, then technique.
Chill, encouraging, and unwilling to let a backwards definition slide.
He will skip homework questions. That is fine.
Not a lecture diary.

## Patterns worth keeping

(none yet)

## Working on

Gaps with fresh evidence. Tag quiet sessions as (quiet: 0). After two quiet sessions, move to Do not hammer.

(none yet)

## Do not hammer

Cooled-off gaps. Do not nag unless a session hits the seam again.

(none yet)
`;
}

export function renderKnowledge(entries: KnowledgeEntry[]): string {
  const groups: Record<KnowledgeStatus, KnowledgeEntry[]> = {
    known: [],
    shaky: [],
    unseen: [],
  };
  for (const e of entries) groups[e.status].push(e);
  const parts = ["# Knowledge", ""];
  for (const status of ["known", "shaky", "unseen"] as const) {
    parts.push(`## ${status}`, "");
    if (!groups[status].length) {
      parts.push("(none yet)", "");
      continue;
    }
    for (const e of groups[status]) {
      parts.push(`- \`${e.id}\` — ${e.note || "(no note)"}`);
      if (e.example) parts.push(`  - example: ${e.example}`);
      if (e.theorems?.length) {
        for (const th of e.theorems) {
          parts.push(`  - theorem: (${th.status}) ${th.claim}`);
          if (th.proof) parts.push(`    proof: ${th.proof}`);
        }
      }
      if (e.vocab?.length) parts.push(`  - vocab: ${e.vocab.join("; ")}`);
    }
    parts.push("");
  }
  return clip(parts.join("\n"));
}

export function parseKnowledge(markdown: string): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  let status: KnowledgeStatus = "unseen";
  for (const line of markdown.split("\n")) {
    const heading = /^##\s+(known|shaky|unseen)\s*$/i.exec(line);
    if (heading) {
      status = heading[1].toLowerCase() as KnowledgeStatus;
      continue;
    }
    const item = /^-\s+`([^`]+)`\s+—\s+(.*)$/.exec(line);
    if (item) {
      entries.push({ id: item[1], status, note: item[2].trim() });
      continue;
    }
    const example = /^\s+-\s+example:\s+(.*)$/.exec(line);
    if (example && entries.length) {
      entries[entries.length - 1].example = example[1].trim();
      continue;
    }
    const theorem = /^\s+-\s+theorem:\s+(?:\((asserted|proved)\)\s+)?(.*)$/i.exec(
      line,
    );
    if (theorem && entries.length) {
      const cur = entries[entries.length - 1];
      const parsed = asStoredTheorem(theorem[1], theorem[2]);
      if (parsed) cur.theorems = [...(cur.theorems ?? []), parsed];
      continue;
    }
    const proofLine = /^\s+proof:\s+(.*)$/.exec(line);
    if (proofLine && entries.length) {
      const cur = entries[entries.length - 1];
      const last = cur.theorems?.at(-1);
      if (last && !last.proof) {
        last.proof = proofLine[1].trim();
        last.status = last.proof ? "proved" : last.status;
      }
      continue;
    }
    const vocab = /^\s+-\s+vocab:\s+(.*)$/.exec(line);
    if (vocab && entries.length) {
      entries[entries.length - 1].vocab = splitVocab(vocab[1]);
    }
  }
  return entries;
}

const QUEST_ID = /^q-[a-z0-9]+$/i;

function indentNotes(notes: string): string[] {
  return notes
    .trim()
    .split("\n")
    .map((line) => `  ${line}`);
}

export function renderQuests(quests: SideQuest[]): string {
  const parts = ["# Side quests", ""];
  for (const status of ["open", "parked", "done"] as const) {
    parts.push(`## ${status}`, "");
    const group = quests.filter((q) => q.status === status);
    if (!group.length) {
      parts.push("(none)", "");
      continue;
    }
    for (const q of group) {
      parts.push(`### ${q.id} ${q.title}`);
      parts.push(`source: ${q.source}`);
      if (q.courseId) parts.push(`course: ${q.courseId}`);
      if (q.lectureN != null) parts.push(`lecture: ${q.lectureN}`);
      if (q.conceptId) parts.push(`concept: ${q.conceptId}`);
      if (q.notes.trim()) parts.push(...indentNotes(q.notes));
      parts.push("");
    }
  }
  return clip(parts.join("\n"));
}

export function parseQuests(markdown: string): SideQuest[] {
  const quests: SideQuest[] = [];
  let status: SideQuest["status"] = "open";
  let current: SideQuest | undefined;
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    if (current && (raw.startsWith("  ") || raw.startsWith("\t"))) {
      const body = raw.startsWith("\t") ? raw.slice(1) : raw.slice(2);
      current.notes = current.notes ? `${current.notes}\n${body}` : body;
      continue;
    }
    const heading = /^##\s+(open|parked|done)\s*$/i.exec(line);
    if (heading) {
      if (current) quests.push(current);
      current = undefined;
      status = heading[1].toLowerCase() as SideQuest["status"];
      continue;
    }
    const start = /^###\s+(\S+)\s+(.*)$/.exec(line);
    if (start && QUEST_ID.test(start[1])) {
      if (current) quests.push(current);
      current = {
        id: start[1],
        title: start[2].trim(),
        status,
        source: "user",
        notes: "",
      };
      continue;
    }
    if (!current) continue;
    const field = /^(source|course|lecture|concept):\s*(.+)$/.exec(line.trim());
    if (field && !current.notes) {
      if (field[1] === "source" && (field[2] === "user" || field[2] === "model")) {
        current.source = field[2];
      } else if (field[1] === "course") current.courseId = field[2].trim();
      else if (field[1] === "lecture") current.lectureN = Number(field[2]);
      else if (field[1] === "concept") current.conceptId = field[2].trim();
      continue;
    }
    if (line.trim() && line.trim() !== "(none)") {
      current.notes = current.notes ? `${current.notes}\n${line}` : line;
    }
  }
  if (current) quests.push(current);
  return quests.filter((q) => QUEST_ID.test(q.id));
}

function assistantTextFromSession(raw: unknown): { questId?: string; text: string } {
  if (!raw || typeof raw !== "object") return { text: "" };
  const o = raw as {
    kind?: unknown;
    questId?: unknown;
    messages?: unknown;
  };
  if (o.kind !== "quest" || typeof o.questId !== "string") return { text: "" };
  if (!Array.isArray(o.messages)) return { text: "", questId: o.questId };
  const parts: string[] = [];
  for (const m of o.messages) {
    if (!m || typeof m !== "object") continue;
    const msg = m as { role?: unknown; kind?: unknown; text?: unknown };
    if (msg.role !== "assistant" || msg.kind !== "text") continue;
    if (typeof msg.text === "string" && msg.text.trim()) parts.push(msg.text.trim());
  }
  return { questId: o.questId, text: parts.join("\n\n") };
}

async function restoreEmptyQuestNotes(quests: SideQuest[]): Promise<boolean> {
  const empty = quests.filter((q) => !q.notes.trim());
  if (!empty.length) return false;
  const files = await readAllSessions();
  let changed = false;
  for (const q of empty) {
    let best = "";
    for (const raw of files) {
      const found = assistantTextFromSession(raw);
      if (found.questId !== q.id) continue;
      if (found.text.length > best.length) best = found.text;
    }
    if (best) {
      q.notes = best;
      changed = true;
    }
  }
  return changed;
}

export async function loadLearner(): Promise<LearnerState> {
  const [profile, knowledgeMd, progressRaw, quizRaw, decayRaw, questsMd] =
    await Promise.all([
      readOptional(profilePath()),
      readOptional(knowledgePath()),
      readOptional(progressPath()),
      readOptional(quizLogPath()),
      readOptional(decayPath()),
      readOptional(questsPath()),
    ]);
  const sideQuests = parseQuests(questsMd);
  const splitHeadings =
    (questsMd.match(/^###\s+/gm) || []).length > sideQuests.length;
  const state: LearnerState = {
    profile: profile || emptyProfile(),
    knowledge: parseKnowledge(knowledgeMd),
    progress: parseJson(progressRaw, {}),
    quizLog: parseJson(quizRaw, {}),
    decay: parseDecay(decayRaw),
    sideQuests,
  };
  if ((await restoreEmptyQuestNotes(sideQuests)) || splitHeadings) {
    await saveLearner(state);
  }
  return state;
}

export async function saveLearner(state: LearnerState): Promise<void> {
  await mkdir(learnerDir(), { recursive: true });
  await writeFile(profilePath(), clip(state.profile || emptyProfile()), "utf8");
  await writeFile(knowledgePath(), renderKnowledge(state.knowledge), "utf8");
  await writeFile(progressPath(), JSON.stringify(state.progress, null, 2), "utf8");
  await writeFile(quizLogPath(), JSON.stringify(state.quizLog, null, 2), "utf8");
  await writeFile(decayPath(), JSON.stringify(state.decay, null, 2), "utf8");
  await writeFile(questsPath(), renderQuests(state.sideQuests), "utf8");
}

export async function readLectureSummary(
  courseId: string,
  n: number,
): Promise<string> {
  return readOptional(lectureSummaryPath(courseId, n));
}

export async function writeLectureSummary(opts: {
  courseId: string;
  n: number;
  summary: string;
  corrections: string[];
}): Promise<void> {
  const path = lectureSummaryPath(opts.courseId, opts.n);
  await mkdir(dirname(path), { recursive: true });
  const prior = await readOptional(path);
  const correctionBlock = opts.corrections.length
    ? ["", "## Corrections", ...opts.corrections.map((c) => `- ${c}`)].join("\n")
    : "";
  const body = [
    `# ${opts.courseId} lecture ${opts.n}`,
    "",
    "## Summary",
    opts.summary.trim() || prior || "(empty)",
    correctionBlock,
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
  await writeFile(path, clip(body), "utf8");
}

export function stripLeadingTitle(text: string, title: string): string {
  const want = foldHeading(title);
  if (!want) return text.trim();
  let body = text.trim();
  while (body) {
    const atx = /^(#{1,6})\s+(.+?)(?:\n+|$)/.exec(body);
    if (atx && foldHeading(atx[2]) === want) {
      body = body.slice(atx[0].length).trim();
      continue;
    }
    const plain = /^(?:\*\*|__)?(.+?)(?:\*\*|__)?(?:\n+|$)/.exec(body);
    if (plain && foldHeading(plain[1]) === want && !plain[1].includes("\n")) {
      body = body.slice(plain[0].length).trim();
      continue;
    }
    break;
  }
  return body;
}

function foldHeading(s: string): string {
  return s
    .trim()
    .replace(/[*_`]/g, "")
    .replace(/['\u2018\u2019\u2032]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function formatConceptTeaching(title: string, notes: string): string {
  return stripLeadingTitle(notes, title);
}

const VOCAB_HEADING = /^## Vocabulary\s*$/i;
const THEOREMS_HEADING = /^## Theorems\s*$/i;
const EXAMPLES_HEADING = /^## Examples\s*$/i;

export function mergeTeachingPasses(
  text: string,
  pass: {
    vocab?: string[];
    theorems?: Array<string | ConceptTheorem>;
    examples?: string[];
  },
): string {
  const prior = parseTeachingPasses(text);
  const vocab = mergeVocab(prior.vocab, pass.vocab ?? []);
  const theorems = mergeTheorems(prior.theorems, pass.theorems ?? [], true);
  const examples = mergeTerms(prior.examples, pass.examples ?? []);
  const stripped = stripTeachingPasses(text);
  const seeAt = stripped.search(/\n## See also\b/i);
  const head = (seeAt >= 0 ? stripped.slice(0, seeAt) : stripped).trim();
  const tail = seeAt >= 0 ? stripped.slice(seeAt).trim() : "";
  const chunks = [head];
  if (vocab.length) {
    chunks.push(`## Vocabulary\n${vocab.map((row) => `- ${row}`).join("\n")}`);
  }
  if (theorems.length) {
    chunks.push(
      `## Theorems\n${theorems.map((row) => `- ${formatTheoremBullet(row)}`).join("\n")}`,
    );
  }
  if (examples.length) {
    chunks.push(
      `## Examples\n${examples.map((row) => `- ${row}`).join("\n")}`,
    );
  }
  if (tail) chunks.push(tail);
  return chunks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseTeachingPasses(text: string): {
  vocab: string[];
  theorems: ConceptTheorem[];
  examples: string[];
} {
  const vocab: string[] = [];
  const theorems: ConceptTheorem[] = [];
  const examples: string[] = [];
  let bucket: "vocab" | "theorems" | "examples" | undefined;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (VOCAB_HEADING.test(trimmed)) {
      bucket = "vocab";
      continue;
    }
    if (THEOREMS_HEADING.test(trimmed)) {
      bucket = "theorems";
      continue;
    }
    if (EXAMPLES_HEADING.test(trimmed)) {
      bucket = "examples";
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      bucket = undefined;
      continue;
    }
    const bullet = /^[-*•]\s+(.+)$/.exec(trimmed);
    if (!bucket || !bullet) continue;
    const body = bullet[1].trim();
    if (bucket === "vocab") vocab.push(body);
    else if (bucket === "examples") examples.push(body);
    else {
      const parsed = parseTheoremBullet(body);
      if (parsed) theorems.push(parsed);
    }
  }
  return { vocab, theorems, examples };
}

function stripTeachingPasses(text: string): string {
  return text
    .replace(/\n*## Vocabulary\s*\n(?:[-*•] .+\n?)*/gi, "\n")
    .replace(/\n*## Theorems\s*\n(?:[-*•] .+\n?)*/gi, "\n")
    .replace(/\n*## Examples\s*\n(?:[-*•] .+\n?)*/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitVocab(raw: string): string[] {
  return mergeVocab(
    [],
    raw
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function parseVocabPair(
  raw: string,
): { term: string; gloss: string } | undefined {
  const t = raw
    .replace(/^[-*•]\s+/, "")
    .replace(/^\*\*(.+?)\*\*\s*[:—–]\s*/, "$1: ")
    .trim();
  const m = /^(.+?)\s*[:—–]\s+(.+)$/.exec(t);
  if (!m) return undefined;
  const term = m[1].replace(/\*+/g, "").trim();
  const gloss = m[2].trim();
  if (!term || !gloss || term.length > 80) return undefined;
  return { term, gloss };
}

export function formatVocabPair(term: string, gloss: string): string {
  return `**${term.replace(/\*+/g, "").trim()}**: ${gloss.trim()}`.slice(0, 240);
}

function mergeVocab(prior: string[], next: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const row of [...prior, ...next]) {
    const pair = parseVocabPair(row);
    if (!pair) continue;
    byKey.set(pair.term.toLowerCase(), formatVocabPair(pair.term, pair.gloss));
  }
  return [...byKey.values()].slice(0, 12);
}

function mergeTerms(prior: string[], next: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const row of [...prior, ...next]) {
    const term = row.replace(/^[-*•]\s+/, "").trim();
    if (!term) continue;
    const key = term
      .replace(/[*_`]/g, "")
      .split(/[:—–]/)[0]
      .trim()
      .toLowerCase();
    if (!key) continue;
    byKey.set(key, term.slice(0, 800));
  }
  return [...byKey.values()].slice(0, 12);
}

function asStoredTheorem(
  statusRaw: string | undefined,
  claimRaw: string,
): ConceptTheorem | undefined {
  const parsed = normalizeTheorem({ claim: claimRaw });
  if (!parsed) return undefined;
  if (statusRaw?.toLowerCase() === "proved" && !parsed.proof) {
    return { ...parsed, status: "proved" };
  }
  return parsed;
}

export function parseTheoremBullet(raw: string): ConceptTheorem | undefined {
  const t = raw.replace(/^[-*•]\s+/, "").trim();
  const marked =
    /^\*\*(asserted|proved)\.\*\*\s+([\s\S]+)$/i.exec(t) ??
    /^(asserted|proved)\.\s+([\s\S]+)$/i.exec(t);
  const body = marked ? marked[2].trim() : t;
  const parsed = normalizeTheorem({ claim: body });
  if (!parsed) return undefined;
  if (marked?.[1].toLowerCase() === "proved" && !parsed.proof) {
    return { ...parsed, status: "proved" };
  }
  return parsed;
}

function formatTheoremBullet(th: ConceptTheorem): string {
  const tag = th.status === "proved" ? "Proved" : "Asserted";
  const proof = th.proof?.trim();
  return proof
    ? `**${tag}.** ${th.claim} Proof: ${proof}`.slice(0, 800)
    : `**${tag}.** ${th.claim}`.slice(0, 800);
}

function theoremKey(claim: string): string {
  const stripped = claim
    .replace(/\*\*(asserted|proved)\.\*\*/gi, "")
    .replace(/\bproof\s*:.*/i, "")
    .replace(/\$[^$]*\$/g, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
  return (stripped || claim.trim().toLowerCase()).slice(0, 96);
}

function normalizeTheorem(
  input: Partial<ConceptTheorem> & { claim?: string },
): ConceptTheorem | undefined {
  let claim = String(input.claim ?? "").trim();
  if (!claim) return undefined;
  let proof = input.proof?.trim();
  const split = /^(.*?)\s+Proof:\s+([\s\S]+)$/.exec(claim);
  if (split) {
    claim = split[1].trim();
    proof = proof || split[2].trim();
  }
  if (!claim) return undefined;
  const status: TheoremStatus = proof ? "proved" : "asserted";
  return { claim: claim.slice(0, 500), status, ...(proof ? { proof: proof.slice(0, 800) } : {}) };
}

function mergeTheorems(
  prior: Array<string | ConceptTheorem>,
  next: Array<string | ConceptTheorem>,
  addNew = true,
): ConceptTheorem[] {
  const byKey = new Map<string, ConceptTheorem>();
  for (const row of prior) {
    const parsed = typeof row === "string" ? parseTheoremBullet(row) : normalizeTheorem(row);
    if (!parsed) continue;
    byKey.set(theoremKey(parsed.claim), parsed);
  }
  for (const row of next) {
    const parsed = typeof row === "string" ? parseTheoremBullet(row) : normalizeTheorem(row);
    if (!parsed) continue;
    const key = theoremKey(parsed.claim);
    const old = byKey.get(key);
    if (old) byKey.set(key, combineTheorems(old, parsed));
    else if (addNew) byKey.set(key, parsed);
  }
  return [...byKey.values()].slice(0, 12);
}

function combineTheorems(
  prior: ConceptTheorem,
  next: ConceptTheorem,
): ConceptTheorem {
  const proof = next.proof?.trim() || prior.proof?.trim();
  return {
    claim: prior.claim,
    status: proof ? "proved" : "asserted",
    ...(proof ? { proof } : {}),
  };
}

export function spreadTheoremProofs(
  list: KnowledgeEntry[],
  incoming: KnowledgeEntry[],
): { list: KnowledgeEntry[]; changedIds: string[] } {
  const proved = incoming.flatMap((e) =>
    (e.theorems ?? []).filter((t) => t.proof?.trim()),
  );
  if (!proved.length) return { list, changedIds: [] };
  const incomingIds = new Set(incoming.map((e) => e.id));
  const changedIds: string[] = [];
  const next = list.map((e) => {
    if (!e.theorems?.length) return e;
    const theorems = mergeTheorems(e.theorems, proved, false);
    if (sameTheorems(e.theorems, theorems)) return e;
    if (!incomingIds.has(e.id)) changedIds.push(e.id);
    return { ...e, theorems };
  });
  return { list: next, changedIds };
}

function sameTheorems(a: ConceptTheorem[], b: ConceptTheorem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i];
    return (
      row.claim === other.claim &&
      row.status === other.status &&
      (row.proof ?? "") === (other.proof ?? "")
    );
  });
}

function knowledgePasses(entry: KnowledgeEntry | undefined): {
  vocab?: string[];
  theorems?: ConceptTheorem[];
  examples?: string[];
} {
  if (!entry) return {};
  return {
    vocab: entry.vocab,
    theorems: entry.theorems,
    examples: entry.example ? [entry.example] : [],
  };
}

export function applyKnowledgePasses(
  text: string,
  entry: KnowledgeEntry | undefined,
  opts?: { skipFresh?: boolean },
): string {
  const pass = knowledgePasses(entry);
  if (opts?.skipFresh) {
    pass.examples = undefined;
    pass.theorems = undefined;
  }
  const prior = parseTeachingPasses(text);
  const danglingVocab = prior.vocab.some((row) => !parseVocabPair(row));
  if (
    !pass.vocab?.length &&
    !pass.theorems?.length &&
    !pass.examples?.length &&
    !danglingVocab
  ) {
    return text;
  }
  return mergeTeachingPasses(text, pass);
}

export async function writeConceptTeaching(
  id: string,
  notes: string,
  title = "",
): Promise<void> {
  if (!isSafeConceptFileId(id)) return;
  const body = formatConceptTeaching(title, notes);
  if (!body) return;
  const path = conceptTeachingPath(id);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, clip(body), "utf8");
}

function conceptQuizPath(id: string): string {
  if (!isSafeConceptFileId(id)) {
    throw new Error("Invalid concept id.");
  }
  return join(conceptsDir(), `${id}.quiz.json`);
}

export async function readConceptQuiz(id: string): Promise<QuizItem[]> {
  if (!isSafeConceptFileId(id)) return [];
  const raw = await readOptional(conceptQuizPath(id));
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const o = row as Record<string, unknown>;
    const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
    const correctId = typeof o.correctId === "string" ? o.correctId : "";
    const choices = Array.isArray(o.choices)
      ? o.choices.flatMap((c) => {
          if (!c || typeof c !== "object") return [];
          const ch = c as Record<string, unknown>;
          const cid = typeof ch.id === "string" ? ch.id : "";
          const text = typeof ch.text === "string" ? ch.text : "";
          return cid && text ? [{ id: cid, text }] : [];
        })
      : [];
    if (!prompt || !correctId || choices.length < 2) return [];
    return [
      {
        conceptId: typeof o.conceptId === "string" ? o.conceptId : id,
        prompt,
        choices,
        correctId,
        noteHint: typeof o.noteHint === "string" ? o.noteHint : undefined,
        why: typeof o.why === "string" ? o.why : undefined,
        index: typeof o.index === "number" ? o.index : 1,
        total: typeof o.total === "number" ? o.total : 1,
      },
    ];
  });
}

export async function writeConceptQuiz(
  id: string,
  items: QuizItem[],
): Promise<void> {
  if (!isSafeConceptFileId(id) || !items.length) return;
  const path = conceptQuizPath(id);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(items, null, 2), "utf8");
}

export async function readConceptTeachings(): Promise<Record<string, string>> {
  let names: string[] = [];
  try {
    names = await readdir(conceptsDir());
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    throw err;
  }
  const out: Record<string, string> = {};
  await Promise.all(
    names.map(async (name) => {
      if (!name.endsWith(".md")) return;
      const id = name.slice(0, -3);
      if (!isSafeConceptFileId(id)) return;
      const text = (await readOptional(conceptTeachingPath(id))).trim();
      if (text) out[id] = text;
    }),
  );
  return out;
}

export async function teachingsForIds(
  ids: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      if (!isSafeConceptFileId(id)) return;
      const text = (await readOptional(conceptTeachingPath(id))).trim();
      if (text) out[id] = text;
    }),
  );
  return out;
}

export function teachingSlice(
  teachings: Record<string, string>,
  ids: string[],
  maxEach = 1_500,
): string {
  const parts: string[] = [];
  for (const id of ids) {
    const text = teachings[id]?.trim();
    if (!text) continue;
    const clipped = text.length <= maxEach ? text : `${text.slice(0, maxEach)}\n…[truncated]`;
    parts.push(`## \`${id}\`\n${clipped}`);
  }
  return parts.join("\n\n");
}

export function upsertKnowledge(
  list: KnowledgeEntry[],
  updates: KnowledgeEntry[],
): KnowledgeEntry[] {
  const map = new Map(list.map((e) => [e.id, e]));
  for (const u of updates) {
    const prior = map.get(u.id);
    map.set(u.id, {
      ...prior,
      ...u,
      example: u.example?.trim() || prior?.example,
      vocab: mergeVocab(prior?.vocab ?? [], u.vocab ?? []),
      theorems: mergeTheorems(prior?.theorems ?? [], u.theorems ?? [], true),
    });
  }
  return [...map.values()];
}

export function setLectureStatus(
  progress: LearnerState["progress"],
  courseId: string,
  n: number,
  status: LectureStatus,
): LearnerState["progress"] {
  const next = { ...progress, [courseId]: { ...(progress[courseId] ?? {}) } };
  next[courseId][String(n)] = status;
  return next;
}

export function recordQuiz(
  log: Record<string, QuizLogEntry>,
  conceptId: string,
  adequate: boolean,
  at = Date.now(),
): Record<string, QuizLogEntry> {
  const prior = log[conceptId] ?? { lastAt: 0, adequate: 0, thin: 0 };
  return {
    ...log,
    [conceptId]: {
      lastAt: at,
      adequate: prior.adequate + (adequate ? 1 : 0),
      thin: prior.thin + (adequate ? 0 : 1),
    },
  };
}

export function addQuest(
  quests: SideQuest[],
  input: { title: string; source: "user" | "model"; courseId?: string; lectureN?: number; notes?: string },
): SideQuest[] {
  const quest: SideQuest = {
    id: `q-${randomUUID().slice(0, 8)}`,
    title: input.title,
    status: "open",
    source: input.source,
    courseId: input.courseId,
    lectureN: input.lectureN,
    notes: input.notes ?? "",
  };
  return [...quests, quest];
}

export function removeQuest(quests: SideQuest[], id: string | undefined): SideQuest[] {
  if (!id) return quests;
  return quests.filter((q) => q.id !== id);
}

export function knowledgeSlice(
  entries: KnowledgeEntry[],
  ids: string[],
): string {
  if (!ids.length) return "(no concepts in this slice)";
  const byId = new Map(entries.map((e) => [e.id, e]));
  return ids
    .map((id) => {
      const e = byId.get(id);
      if (!e) return `- \`${id}\` — unseen`;
      const stub = /^side quest\.?$/i.test(e.note.trim());
      const base = stub
        ? `- \`${id}\` — ${e.status}`
        : `- \`${id}\` — ${e.status}: ${e.note}`;
      return e.vocab?.length ? `${base} · ${e.vocab.join("; ")}` : base;
    })
    .join("\n");
}

export function clip(text: string, max = MAX_FILE_CHARS): string {
  const t = text.trim();
  if (t.length <= max) return `${t}\n`;
  return `${t.slice(0, max)}\n\n…[truncated]\n`;
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseDecay(raw: string): DecayMap {
  const parsed = parseJson<DecayMap>(raw, {});
  const out: DecayMap = {};
  for (const [id, entry] of Object.entries(parsed)) {
    if (!entry || typeof entry !== "object") continue;
    const echoes = Array.isArray(entry.echoes)
      ? entry.echoes.filter(
          (e) => e && typeof e.at === "number" && typeof e.via === "string",
        )
      : [];
    out[id] = {
      directAt: typeof entry.directAt === "number" ? entry.directAt : undefined,
      seeded: Boolean(entry.seeded),
      echoes,
    };
  }
  return out;
}
