import { Agent, Cursor, CursorAgentError } from "@cursor/sdk";
import { asOutline } from "./conceptOutline.js";
import { cursorApiKey, cursorModel, projectRoot } from "./env.js";
import {
  clip,
  formatVocabPair,
  parseTheoremBullet,
  parseVocabPair,
} from "./learner.js";
import type {
  ConceptTheorem,
  DebriefCard,
  KnowledgeEntry,
  OfferedCourse,
  OfferedQuest,
  QuizItem,
  TeachbackResult,
} from "./types.js";

type LocalAgent = Awaited<ReturnType<typeof Agent.create>>;

type RunResult = Awaited<ReturnType<Awaited<ReturnType<LocalAgent["send"]>>["wait"]>>;

export interface AgentPriming {
  walkContext: boolean;
  cardsSince: number;
}

export const REPRIME_AFTER_CARDS = 6;

export function newPriming(): AgentPriming {
  return { walkContext: false, cardsSince: 0 };
}

export function advancePriming(primed: AgentPriming): void {
  if (primed.walkContext && primed.cardsSince + 1 >= REPRIME_AFTER_CARDS) {
    primed.walkContext = false;
    primed.cardsSince = 0;
    return;
  }
  primed.cardsSince = primed.walkContext ? primed.cardsSince + 1 : 0;
  primed.walkContext = true;
}

export async function authStatus(): Promise<{
  configured: boolean;
  models?: string[];
  error?: string;
}> {
  const apiKey = cursorApiKey();
  if (!apiKey) return { configured: false };
  try {
    const models = await Cursor.models.list({ apiKey });
    return { configured: true, models: models.map((m) => m.id).slice(0, 20) };
  } catch (err) {
    return {
      configured: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function requireKey(): string {
  const apiKey = cursorApiKey();
  if (!apiKey) {
    throw new Error(
      "CURSOR_API_KEY is not set. Copy .env.example to .env and paste a key from https://cursor.com/dashboard/api",
    );
  }
  return apiKey;
}

export const CLIP = {
  profile: 2_200,
  course: 800,
  summary: 8_000,
  ask: 4_000,
  questNotes: 1_500,
  teachings: 2_000,
  rewriteProfile: 2_200,
  rewriteEvidence: 2_000,
} as const;

export async function createStudyAgent(): Promise<LocalAgent> {
  return Agent.create({
    apiKey: requireKey(),
    model: { id: cursorModel() },
    name: "Study helper",
    // mcp only so customTools work. No read/grep/shell — the host already
    // passed the slice. Default tools would let the model walk the repo.
    tools: ["mcp"],
    local: { cwd: projectRoot() },
  });
}

export interface ContextSlice {
  profile: string;
  courseBlurb: string;
  lectureTitle?: string;
  concepts: string;
  knowledgeSlice: string;
  teachings?: string;
  /** Host task. Concept-library notes are not side quests. */
  task?: "concept";
}

export function assembleStandingContext(ctx: ContextSlice): string {
  return [
    "You are Graham's study companion. Self-directed — no exam, no homework police. Skip problem sets: fine.",
    "Chill, specific. Do not let a backwards definition stand (reduction direction, hardness vs completeness, proven vs conjectured).",
    "Use $...$ / $$...$$ for every formula, including superscripts ($Z^{2}$). Never leave TeX commands or ^{} bare. Memory is the slice below, not old chats. Do not dump copyrighted notes.",
    ctx.task === "concept"
      ? "This turn is a concept from his library (a course topic). It is not a side quest. Never call it a side quest."
      : "",
    `Profile:\n${clip(ctx.profile, CLIP.profile)}`,
    `Course:\n${clip(ctx.courseBlurb, CLIP.course)}`,
    ctx.lectureTitle ? `Lecture: ${ctx.lectureTitle}` : "",
    `Concepts in play:\n${ctx.concepts}`,
    `Known in this slice:\n${ctx.knowledgeSlice}`,
    ctx.teachings
      ? `Teachings on file (do not regenerate; use these):\n${clip(ctx.teachings, CLIP.teachings)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function contextBlock(opts: {
  primed: AgentPriming;
  ctx: ContextSlice;
}): string {
  if (opts.primed.walkContext) {
    return "Standing context is already in this conversation. Use it; do not quote the profile.";
  }
  return assembleStandingContext(opts.ctx);
}

export const DEBRIEF_INSTRUCTIONS = [
  "Graham wrote a summary of the lecture. Check conceptual mistakes against standard knowledge for these tags.",
  "Not an exam. Do not score or nag about skipped homework. Call publish_debrief once. Chat text is ignored. Use $...$ for maths.",
  "corrections: 0–5 real inverted definitions. Empty if sound. Do not invent.",
  "gaps: 0–5 structural pieces that matter, not a completeness rubric.",
  "summaryNote: 2–4 sentences, encouraging, structural.",
  "offeredQuests: only if his summary explicitly asks to chase a side topic (title + why). Empty otherwise. Do not upsell detours.",
  "knowledgeUpdates: one row per concept in play. known or shaky. one-line note. Wrong important idea → shaky.",
  "vocab: 0–8 {term, gloss} pairs from THIS summary. gloss is a one-line definition in his words (or a close paraphrase of what he wrote). Skip a word he named but did not characterize. Empty if this was not a vocabulary pass. Do not invent a glossary.",
  "theorems: 0–4 {claim, proof} from THIS summary, preferred over extra examples when both exist. claim is the actual statement (existence, uniqueness, detailed balance ⇒ stationary, …). proof is only a sketch he wrote — empty if he only named the result (host stores that as asserted; a later summary that proves the same claim, even on another course, upgrades it). Skip ‘there is a theorem’ with no statement. Never invent a proof. Do not send a status field.",
  "example: at most one per concept, from THIS summary. Keep it only if it carries a method or theorem (a computation, a reusable model, a special case that proves a claim). Skip restating the lecturer's cartoon diagrams or numbered sketches that exist only to name vocabulary — those belong in a vocab gloss if anywhere. Never invent.",
].join("\n\n");

export async function runDebrief(opts: {
  agent: LocalAgent;
  primed: AgentPriming;
  ctx: ContextSlice;
  summary: string;
}): Promise<{ card: DebriefCard; updates: KnowledgeEntry[] }> {
  const holder: {
    card?: DebriefCard;
    updates?: KnowledgeEntry[];
  } = {};
  const run = await opts.agent.send(
    [
      contextBlock({ primed: opts.primed, ctx: opts.ctx }),
      DEBRIEF_INSTRUCTIONS,
      `Summary:\n${clip(opts.summary, CLIP.summary)}`,
    ].join("\n\n"),
    {
      local: {
        customTools: {
          publish_debrief: {
            description: "Publish debrief. Call once.",
            inputSchema: {
              type: "object",
              properties: {
                corrections: { type: "array", items: { type: "string" } },
                gaps: { type: "array", items: { type: "string" } },
                summaryNote: { type: "string" },
                offeredQuests: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      why: { type: "string" },
                    },
                    required: ["title", "why"],
                  },
                },
                    knowledgeUpdates: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          status: { type: "string" },
                          note: { type: "string" },
                          example: { type: "string" },
                          vocab: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                term: { type: "string" },
                                gloss: { type: "string" },
                              },
                              required: ["term", "gloss"],
                            },
                          },
                          theorems: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                claim: { type: "string" },
                                proof: { type: "string" },
                              },
                              required: ["claim"],
                            },
                          },
                        },
                        required: ["id", "status", "note"],
                      },
                    },
              },
              required: ["corrections", "gaps", "summaryNote", "knowledgeUpdates"],
            },
            execute: (args) => {
              holder.card = {
                corrections: asStrings(args.corrections),
                gaps: asStrings(args.gaps),
                summaryNote: String(args.summaryNote),
                offeredQuests: asQuests(args.offeredQuests),
              };
              holder.updates = asUpdates(args.knowledgeUpdates);
              return "Debrief recorded. Stop.";
            },
          },
        },
      },
    },
  );
  const result = await waitRun(run);
  if (!holder.card || !holder.updates) {
    throw new Error(missingTool("publish_debrief", result));
  }
  return { card: holder.card, updates: holder.updates };
}

export async function gradeTeachback(opts: {
  agent: LocalAgent;
  primed: AgentPriming;
  ctx: ContextSlice;
  prompt: string;
  expected?: string;
  answer: string;
}): Promise<TeachbackResult> {
  const holder: { value?: TeachbackResult } = {};
  const run = await opts.agent.send(
    [
      contextBlock({ primed: opts.primed, ctx: opts.ctx }),
      "Grade Graham's paraphrase of a correction. Call publish_teachback once.",
      "This is not an exam. adequate: he has the idea in his own words.",
      "kind: adequate | thin | question_before | question_after.",
      "If it is a clarifying question: question_before, answer in message, stay.",
      "Thin or wrong: kind thin, correct ONE beat in message, stay. Chill, specific.",
      "Every formula in $...$ or $$...$$ ($Z^{2}$, $\\sqrt{V/n}$). Never bare TeX.",
      "Do not advance on ok / next / lgtm alone — that is thin.",
      `Prompt he was answering:\n${opts.prompt}`,
      opts.expected ? `What a solid answer includes:\n${opts.expected}` : "",
      `His text:\n${clip(opts.answer, CLIP.ask)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    {
      local: {
        customTools: {
          publish_teachback: {
            description: "Publish teach-back grade. Call once.",
            inputSchema: {
              type: "object",
              properties: {
                adequate: { type: "boolean" },
                kind: { type: "string" },
                message: { type: "string" },
              },
              required: ["adequate", "kind", "message"],
            },
            execute: (args) => {
              const kind = String(args.kind) as TeachbackResult["kind"];
              holder.value = {
                adequate: Boolean(args.adequate),
                kind: validKind(kind),
                message: String(args.message),
              };
              return "Grade recorded. Stop.";
            },
          },
        },
      },
    },
  );
  const result = await waitRun(run);
  if (!holder.value) throw new Error(missingTool("publish_teachback", result));
  return holder.value;
}

export const QUIZ_INSTRUCTIONS = [
  "Write a friendly multiple-choice refresh for EACH concept below. Call publish_quiz_set once with the full list.",
  "Concepts, not calculations. Never ask him to compute a number, invert a matrix, row-reduce, expand, integrate, or plug into a formula. He has solvers for that, and those items are a bad fit for an LLM anyway.",
  "Ask which definition is right, which implication is backwards, or how he would set the attack up (which object, which hypothesis, which tool) — not the arithmetic.",
  "No tricks, no timers. Four choices per item. Exactly one correctId. known → structural contrast; shaky → definition in disguise; unseen → light conceptual.",
  "noteHint: where in his notes if we have a lecture number. why: one or two sentences, $...$ ok.",
].join("\n\n");

export async function writeQuizSet(opts: {
  agent: LocalAgent;
  primed: AgentPriming;
  ctx: ContextSlice;
  concepts: { id: string; name: string }[];
}): Promise<QuizItem[]> {
  const holder: { value?: QuizItem[] } = {};
  const list = opts.concepts
    .map((c, i) => `${i + 1}. ${c.id} (${c.name})`)
    .join("\n");
  const run = await opts.agent.send(
    [
      contextBlock({ primed: opts.primed, ctx: opts.ctx }),
      QUIZ_INSTRUCTIONS,
      `Concepts:\n${list}`,
    ].join("\n\n"),
    {
      local: {
        customTools: {
          publish_quiz_set: {
            description: "Publish all quiz items. Call once.",
            inputSchema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      conceptId: { type: "string" },
                      prompt: { type: "string" },
                      choices: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            text: { type: "string" },
                          },
                          required: ["id", "text"],
                        },
                      },
                      correctId: { type: "string" },
                      noteHint: { type: "string" },
                      why: { type: "string" },
                    },
                    required: ["conceptId", "prompt", "choices", "correctId", "why"],
                  },
                },
              },
              required: ["items"],
            },
            execute: (args) => {
              holder.value = asQuizItems(args.items, opts.concepts);
              return "Quiz set recorded. Stop.";
            },
          },
        },
      },
    },
  );
  const result = await waitRun(run);
  if (!holder.value?.length) throw new Error(missingTool("publish_quiz_set", result));
  return holder.value;
}

export async function answerAsk(opts: {
  agent: LocalAgent;
  primed: AgentPriming;
  ctx: ContextSlice;
  question: string;
}): Promise<string> {
  const holder: { value?: string } = {};
  const run = await opts.agent.send(
    [
      contextBlock({ primed: opts.primed, ctx: opts.ctx }),
      "Answer a study question. Call publish_reply once. Do not grade teach-back.",
      "Chill and specific. Use $...$ / $$...$$ for maths. Do not let a backwards definition stand.",
      "Explain structure. If he asks for a side quest, tell him to start one from the chip or the left nav — do not teach the detour in this debrief thread.",
      `Question:\n${clip(opts.question, CLIP.ask)}`,
    ].join("\n\n"),
    {
      local: {
        customTools: {
          publish_reply: {
            description: "Publish the answer. Call once.",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
            execute: (args) => {
              holder.value = String(args.text);
              return "Reply recorded. Stop.";
            },
          },
        },
      },
    },
  );
  const result = await waitRun(run);
  if (!holder.value) throw new Error(missingTool("publish_reply", result));
  return holder.value;
}

export async function judgeQuestTopic(opts: {
  agent: LocalAgent;
  title: string;
  concepts: Record<string, { name: string }>;
}): Promise<{ ok: true; name: string; existingId?: string } | { ok: false; reason: string }> {
  const holder: {
    value?: { ok: true; name: string; existingId?: string } | { ok: false; reason: string };
  } = {};
  const known = Object.entries(opts.concepts)
    .map(([id, def]) => `- \`${id}\`: ${def.name}`)
    .join("\n");
  const run = await opts.agent.send(
    [
      "Graham wants a side quest. Call publish_quest_topic once. Stop after that.",
      "Accept only a conceptual topic that could live in a CS/math study library: a definition, structure, technique, theorem, or similar idea.",
      "Reject recap / quiz-review / course-synthesis titles — those are lectures, not library nodes.",
      "Reject people, sports, news, companies, places, biographies, and trivia that is not a study concept.",
      "If the title is already a listed concept (same idea, even if the wording differs), ok true and existingId set to that id.",
      "If it is a new but real concept, ok true and name as a short Title Case label.",
      "If you reject, ok false and reason: one short sentence, no lecture.",
      `Title: ${clip(opts.title, 200)}`,
      `Known concepts:\n${known}`,
    ].join("\n\n"),
    {
      local: {
        customTools: {
          publish_quest_topic: {
            description: "Accept or reject the side-quest topic. Call once.",
            inputSchema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                name: { type: "string" },
                existingId: { type: "string" },
                reason: { type: "string" },
              },
              required: ["ok"],
            },
            execute: (args) => {
              const ok = Boolean(args.ok);
              if (!ok) {
                const reason =
                  String(args.reason ?? "").trim() ||
                  "That's not a concept for the library.";
                holder.value = { ok: false, reason: reason.slice(0, 200) };
                return "Rejected. Stop.";
              }
              const existingId = String(args.existingId ?? "").trim();
              const name =
                String(args.name ?? "").trim() ||
                (existingId && opts.concepts[existingId]
                  ? opts.concepts[existingId].name
                  : opts.title.trim());
              holder.value = {
                ok: true,
                name,
                ...(existingId && opts.concepts[existingId]
                  ? { existingId }
                  : {}),
              };
              return "Topic recorded. Stop.";
            },
          },
        },
      },
    },
  );
  const result = await waitRun(run);
  if (!holder.value) throw new Error(missingTool("publish_quest_topic", result));
  return holder.value;
}

export interface CourseScout {
  reply: string;
  offers: OfferedCourse[];
  pickUrl?: string;
}

export async function scoutCourse(opts: {
  agent: LocalAgent;
  topic: string;
  already: { id: string; title: string; sourceUrl: string }[];
  message?: string;
}): Promise<CourseScout> {
  const holder: { value?: CourseScout } = {};
  const have = opts.already
    .map((c) => `- ${c.title} (\`${c.id}\`) ${c.sourceUrl}`)
    .join("\n");
  const run = await opts.agent.send(
    [
      "Graham wants a new course to study. Call publish_course_scout once. Stop after that.",
      "This is a conversation about which freely available video lecture series to add. Not a debrief, not a side quest.",
      "Good fits: MIT OCW, Yale Open Courses, Harvard Stat 110, Caltech Learning from Data, and similar public video series with a lecture listing page.",
      "Prefer a public listing (calendar, lecture list, YouTube course page) over a paywalled LMS. Skip Coursera/edX unless lectures are free to watch without login.",
      "Do not suggest a course already listed below.",
      "offers: 1–3 candidates with http(s) listing URLs and a short why. Empty if you are only asking a clarifying question.",
      "pickUrl: only when Graham has clearly chosen one, or the topic is already a specific series (a URL, Stat 110, Learning from Data, Yale ECON 159, a named OCW course). Do not pick on a vague topic like game theory.",
      `Topic: ${clip(opts.topic, 200)}`,
      have ? `Already in his catalog:\n${have}` : "Catalog: empty.",
      opts.message ? `Graham:\n${clip(opts.message, CLIP.ask)}` : "First turn: propose options, then wait.",
    ].join("\n\n"),
    {
      local: {
        customTools: {
          publish_course_scout: {
            description: "Propose or confirm a public lecture series. Call once.",
            inputSchema: {
              type: "object",
              properties: {
                reply: { type: "string" },
                pickUrl: { type: "string" },
                offers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      url: { type: "string" },
                      why: { type: "string" },
                    },
                    required: ["title", "url", "why"],
                  },
                },
              },
              required: ["reply"],
            },
            execute: (args) => {
              holder.value = asCourseScout(args);
              return "Scout recorded. Stop.";
            },
          },
        },
      },
    },
  );
  const result = await waitRun(run);
  if (!holder.value) throw new Error(missingTool("publish_course_scout", result));
  return holder.value;
}

function asCourseScout(args: Record<string, unknown>): CourseScout {
  const reply = String(args.reply ?? "").trim() || "Which series do you want?";
  const offers: OfferedCourse[] = [];
  const raw = args.offers;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const title = String(row.title ?? "").trim();
      const url = String(row.url ?? "").trim();
      const why = String(row.why ?? "").trim();
      if (!title || !/^https?:\/\//i.test(url) || !why) continue;
      offers.push({
        title: title.slice(0, 120),
        url,
        why: why.slice(0, 280),
      });
      if (offers.length >= 3) break;
    }
  }
  const pickUrl = String(args.pickUrl ?? "").trim();
  return {
    reply: reply.slice(0, 8_000),
    offers,
    ...(pickUrl && /^https?:\/\//i.test(pickUrl) ? { pickUrl } : {}),
  };
}

export interface QuestPlan {
  explanation: string;
  links: { label: string; url: string }[];
  teachbackPrompt?: string;
  wantQuiz: boolean;
}

export async function openQuestPlan(opts: {
  agent: LocalAgent;
  primed: AgentPriming;
  ctx: ContextSlice;
  title: string;
}): Promise<QuestPlan> {
  const holder: { value?: QuestPlan } = {};
  const run = await opts.agent.send(
    [
      contextBlock({ primed: opts.primed, ctx: opts.ctx }),
      "Open a side quest. Call publish_quest_plan once. This is an office-hours detour, not a lecture and not a problem set.",
      "Explain the idea: what it is, when you reach for it, which definition is easy to get backwards. Concepts, not calculations.",
      "Do not start with a title or a 'side quest' heading — the pane already names the quest. Do not say that it does not skip the lecture map.",
      "links: 0–3 http(s) pages that actually help (Wikipedia, OCW, 3blue1brown, a standard reference). Never paste copyrighted notes.",
      "teachbackPrompt: one sentence he must restate in his own words.",
      "wantQuiz: always true. A short conceptual multiple-choice check (no arithmetic).",
      `Quest: ${opts.title}`,
    ].join("\n\n"),
    {
      local: {
        customTools: {
          publish_quest_plan: {
            description: "Publish the side-quest opening. Call once.",
            inputSchema: {
              type: "object",
              properties: {
                explanation: { type: "string" },
                links: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      url: { type: "string" },
                    },
                    required: ["label", "url"],
                  },
                },
                teachbackPrompt: { type: "string" },
                wantQuiz: { type: "boolean" },
              },
              required: ["explanation", "wantQuiz"],
            },
            execute: (args) => {
              holder.value = {
                explanation: String(args.explanation),
                links: asLinks(args.links),
                teachbackPrompt: String(args.teachbackPrompt ?? "").trim() || undefined,
                wantQuiz: true,
              };
              return "Quest plan recorded. Stop.";
            },
          },
        },
      },
    },
  );
  const result = await waitRun(run);
  if (!holder.value) throw new Error(missingTool("publish_quest_plan", result));
  return holder.value;
}

export async function draftConceptTeaching(opts: {
  agent: LocalAgent;
  primed: AgentPriming;
  ctx: ContextSlice;
  id: string;
  name: string;
  parentName?: string;
  related?: { id: string; name: string }[];
  sources?: { id: string; title: string; instructors: string; sourceUrl: string }[];
  lectures?: { courseTitle: string; n: number; title: string }[];
  onOutline?: (beats: string[]) => void;
}): Promise<{
  explanation: string;
  links: { label: string; url: string }[];
  relatedIds: string[];
}> {
  const holder: {
    value?: {
      explanation: string;
      links: { label: string; url: string }[];
      relatedIds: string[];
    };
  } = {};
  const related = opts.related ?? [];
  const allowed = new Set(related.map((row) => row.id));
  const relatedBlock = related.length
    ? [
        "When another concept on this list is the right jump, write it as `[Name](concept:id)` in the prose, using that exact id.",
        "Do not write a See also section — the host appends one from relatedIds and the catalog graph.",
        "relatedIds: 0–6 ids from that list.",
        related.map((row) => `- \`${row.id}\`: ${row.name}`).join("\n"),
      ].join("\n")
    : "";
  const sources = opts.sources ?? [];
  const sourceBlock = sources.length
    ? [
        "Graham met this idea in these courses. If you mention a course or give a course link, it must be one of these. Never default to a different course he happens to have open.",
        sources
          .map((c) => `- ${c.title} (${c.instructors}) ${c.sourceUrl}`)
          .join("\n"),
      ].join("\n")
    : "Graham has not tagged this concept to a lecture. Do not name a course.";
  const lectures = opts.lectures ?? [];
  const lectureBlock = lectures.length
    ? [
        "He has debriefed these tagged lectures. One note for the idea, not a recap of each hour. Later lectures may add vocabulary, a theorem, or a working example — fold those in.",
        lectures
          .map((lec) => `- ${lec.courseTitle} L${lec.n}: ${lec.title}`)
          .join("\n"),
      ].join("\n")
    : "";
  const run = await opts.agent.send(
    [
      contextBlock({ primed: opts.primed, ctx: opts.ctx }),
      "Write a permanent teaching note for one concept in his library. Graham will reread this file instead of asking you to explain it again.",
      "Call publish_concept_outline first with 4–6 short spoken asides for what you're about to write — casual status ticks, not the headings you will use in the note. A few words each, no numbering. Vary them with the idea; do not reuse the same three ticks every concept. Start each beat with a capital, then ordinary sentence case. Then call publish_concept_teaching once with prose that follows those beats.",
      "This is not a side quest. Do not write 'side quest', 'in this side quest', or treat the topic as a detour.",
      "Write for him, not for yourself. Cover what the idea is, when he should reach for it, and one mix-up that actually bites — but invent headings that belong to this concept. Do not recycle a house template (Mix-up worth watching, When you'd actually use this, When to reach for it). Do not write a heading about inverted definitions. Do not write '(fix once, then move on)' or similar asides.",
      "Do not start with a title — the pane already names the concept. Do not dump copyrighted notes.",
      "Do not write Vocabulary, Theorems, or Examples sections — the host appends those from his summaries.",
      "links: 0–3 http(s) pages that actually help. Empty is fine. Do not use http for in-app concept jumps. Do not link a course that is not in the sources list.",
      opts.parentName ? `Sits under: ${opts.parentName}` : "",
      sourceBlock,
      lectureBlock,
      relatedBlock,
      `Concept \`${opts.id}\`: ${opts.name}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    {
      local: {
        customTools: {
          publish_concept_outline: {
            description:
              "Publish casual status ticks for the teaching note. Call once, before publish_concept_teaching.",
            inputSchema: {
              type: "object",
              properties: {
                beats: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["beats"],
            },
            execute: (args) => {
              const beats = asOutline(args.beats);
              if (beats.length) opts.onOutline?.(beats);
              return "Outline recorded. Write the teaching next.";
            },
          },
          publish_concept_teaching: {
            description: "Publish the stored teaching. Call once.",
            inputSchema: {
              type: "object",
              properties: {
                explanation: { type: "string" },
                relatedIds: {
                  type: "array",
                  items: { type: "string" },
                },
                links: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      url: { type: "string" },
                    },
                    required: ["label", "url"],
                  },
                },
              },
              required: ["explanation"],
            },
            execute: (args) => {
              holder.value = {
                explanation: String(args.explanation),
                links: asLinks(args.links),
                relatedIds: asIds(args.relatedIds, allowed),
              };
              return "Teaching recorded. Stop.";
            },
          },
        },
      },
    },
  );
  const result = await waitRun(run);
  if (!holder.value) {
    throw new Error(missingTool("publish_concept_teaching", result));
  }
  return holder.value;
}

export async function runQuestTurn(opts: {
  agent: LocalAgent;
  primed: AgentPriming;
  ctx: ContextSlice;
  title: string;
  notes: string;
  message: string;
}): Promise<string> {
  const holder: { value?: string } = {};
  const run = await opts.agent.send(
    [
      contextBlock({ primed: opts.primed, ctx: opts.ctx }),
      "This is a side quest. It does not replace the lecture map.",
      "Call publish_reply once. Keep teaching the idea; add a link if it helps. No calculation drills.",
      `Quest: ${opts.title}`,
      opts.notes ? `Notes on file:\n${clip(opts.notes, CLIP.questNotes)}` : "",
      `Graham:\n${clip(opts.message, CLIP.ask)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    {
      local: {
        customTools: {
          publish_reply: {
            description: "Publish the side-quest turn. Call once.",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
            execute: (args) => {
              holder.value = String(args.text);
              return "Reply recorded. Stop.";
            },
          },
        },
      },
    },
  );
  const result = await waitRun(run);
  if (!holder.value) throw new Error(missingTool("publish_reply", result));
  return holder.value;
}

export async function rewriteLearnerNotes(opts: {
  agent: LocalAgent;
  priorProfile: string;
  evidence: string;
}): Promise<{ profile: string }> {
  const holder: { profile?: string } = {};
  const run = await opts.agent.send(
    [
      "Rewrite Graham's private profile.md after this debrief. Knowledge.md is already updated by the host — do not rewrite it.",
      "profile.md is how he studies (cross-course craft). Merge; do not log lectures. Call publish_profile once.",
      `Prior profile.md:\n${clip(opts.priorProfile, CLIP.rewriteProfile)}`,
      `This session:\n${clip(opts.evidence, CLIP.rewriteEvidence)}`,
    ].join("\n\n"),
    {
      local: {
        customTools: {
          publish_profile: {
            description: "Publish replacement profile markdown.",
            inputSchema: {
              type: "object",
              properties: { profile: { type: "string" } },
              required: ["profile"],
            },
            execute: (args) => {
              holder.profile = String(args.profile);
              return "Profile recorded. Stop.";
            },
          },
        },
      },
    },
  );
  const result = await waitRun(run);
  if (!holder.profile) throw new Error(missingTool("publish_profile", result));
  return { profile: holder.profile };
}

function asQuizItems(
  value: unknown,
  requested: { id: string; name: string }[],
): QuizItem[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map(requested.map((c) => [c.id, c]));
  const out: QuizItem[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const o = row as {
      conceptId?: unknown;
      prompt?: unknown;
      choices?: unknown;
      correctId?: unknown;
      noteHint?: unknown;
      why?: unknown;
    };
    const conceptId = String(o.conceptId ?? "").trim();
    if (!conceptId || !byId.has(conceptId)) continue;
    if (out.some((item) => item.conceptId === conceptId)) continue;
    const choices = asChoices(o.choices);
    const correctId = String(o.correctId ?? "");
    out.push({
      conceptId,
      prompt: String(o.prompt ?? "").trim(),
      choices,
      correctId: choices.some((c) => c.id === correctId)
        ? correctId
        : choices[0]?.id ?? "a",
      noteHint: o.noteHint ? String(o.noteHint) : undefined,
      why: String(o.why ?? ""),
      index: out.length + 1,
      total: requested.length,
    });
  }
  return out.map((item, i) => ({ ...item, index: i + 1, total: out.length }));
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => String(row ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function asIds(value: unknown, allowed: Set<string>): string[] {
  return [...new Set(asStrings(value).filter((id) => allowed.has(id)))].slice(
    0,
    6,
  );
}

function asChoices(value: unknown): { id: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row, i) => {
      if (!row || typeof row !== "object") return undefined;
      const o = row as { id?: unknown; text?: unknown };
      const text = String(o.text ?? "").trim();
      if (!text) return undefined;
      return { id: String(o.id ?? String.fromCharCode(97 + i)), text };
    })
    .filter((c): c is { id: string; text: string } => Boolean(c))
    .slice(0, 6);
}

function asLinks(value: unknown): { label: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return undefined;
      const o = row as { label?: unknown; url?: unknown };
      const label = String(o.label ?? "").trim();
      const url = String(o.url ?? "").trim();
      if (!label || !/^https?:\/\//i.test(url)) return undefined;
      return { label, url };
    })
    .filter((l): l is { label: string; url: string } => Boolean(l))
    .slice(0, 3);
}

function asVocab(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const rows: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const pair = parseVocabPair(item);
      if (pair) rows.push(formatVocabPair(pair.term, pair.gloss));
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as { term?: unknown; gloss?: unknown };
    const term = String(o.term ?? "").trim();
    const gloss = String(o.gloss ?? "").trim();
    if (!term || !gloss) continue;
    rows.push(formatVocabPair(term, gloss));
  }
  return rows.slice(0, 8);
}

function asTheorems(value: unknown): ConceptTheorem[] {
  if (!Array.isArray(value)) return [];
  const rows: ConceptTheorem[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const parsed = parseTheoremBullet(item);
      if (parsed) rows.push(parsed);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as { claim?: unknown; proof?: unknown };
    const claim = String(o.claim ?? "").trim();
    const proof = String(o.proof ?? "").trim();
    if (!claim) continue;
    const parsed = parseTheoremBullet(
      proof ? `${claim} Proof: ${proof}` : claim,
    );
    if (parsed) rows.push(parsed);
  }
  return rows.slice(0, 4);
}

function asQuests(value: unknown): OfferedQuest[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return undefined;
      const o = row as { title?: unknown; why?: unknown };
      const title = String(o.title ?? "").trim();
      const why = String(o.why ?? "").trim();
      if (!title) return undefined;
      return { title, why };
    })
    .filter((q): q is OfferedQuest => Boolean(q))
    .slice(0, 2);
}

function asUpdates(value: unknown): KnowledgeEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return undefined;
      const o = row as {
        id?: unknown;
        status?: unknown;
        note?: unknown;
        example?: unknown;
        vocab?: unknown;
        theorems?: unknown;
      };
      const id = String(o.id ?? "").trim();
      const status = String(o.status ?? "");
      if (!id) return undefined;
      const st = status === "known" ? "known" : "shaky";
      const example = String(o.example ?? "").trim();
      const vocab = asVocab(o.vocab);
      const theorems = asTheorems(o.theorems);
      return {
        id,
        status: st,
        note: String(o.note ?? "").trim(),
        ...(example ? { example } : {}),
        ...(vocab.length ? { vocab } : {}),
        ...(theorems.length ? { theorems } : {}),
      };
    })
    .filter((e): e is KnowledgeEntry => Boolean(e));
}

function validKind(kind: string): TeachbackResult["kind"] {
  if (
    kind === "adequate" ||
    kind === "thin" ||
    kind === "question_before" ||
    kind === "question_after"
  ) {
    return kind;
  }
  return "thin";
}

function missingTool(name: string, result: RunResult): string {
  const text =
    typeof result.result === "string" ? result.result.trim().slice(0, 400) : "";
  return text
    ? `Agent finished without ${name}. Last text: ${text}`
    : `Agent finished without ${name}.`;
}

async function waitRun(
  run: Awaited<ReturnType<LocalAgent["send"]>>,
): Promise<RunResult> {
  try {
    const result = await run.wait();
    if (result.status === "error") {
      throw new Error(
        `Agent run failed (${run.id}): ${result.error?.message ?? "error"}`,
      );
    }
    return result;
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(
        `Cursor agent did not start: ${err.message} (retryable=${err.isRetryable})`,
      );
    }
    throw err;
  }
}
