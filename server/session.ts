import { randomUUID } from "node:crypto";
import {
  type AgentPriming,
  advancePriming,
  answerAsk,
  createStudyAgent,
  gradeTeachback,
  judgeQuestTopic,
  newPriming,
  rewriteLearnerNotes,
  runDebrief,
  runQuestTurn,
  openQuestPlan,
  writeQuizSet,
  draftConceptTeaching,
  scoutCourse,
  type ContextSlice,
} from "./agent.js";
import {
  courseOf,
  expandConceptIds,
  lectureOf,
  loadCatalog,
  relatedConcepts,
  type Catalog,
} from "./catalog.js";
import { isReviewLectureTitle, isStudyConcept } from "./conceptShape.js";
import { seedConceptOutline } from "./conceptOutline.js";
import {
  initCourseFromUrl,
  looksLikeCourseUrl,
  matchExistingCourse,
} from "./initCourse.js";
import {
  addQuest,
  formatConceptTeaching,
  knowledgeSlice,
  loadLearner,
  readConceptTeachings,
  readLectureSummary,
  recordQuiz,
  removeQuest,
  saveLearner,
  setLectureStatus,
  teachingSlice,
  teachingsForIds,
  upsertKnowledge,
  writeConceptTeaching,
  writeLectureSummary,
  readConceptQuiz,
  writeConceptQuiz,
  type LearnerState,
} from "./learner.js";
import { applyDecayHints, decayViews, echoNeighbors, touchConcepts } from "./decay.js";
import {
  nextIncompleteLectureN,
  normalizeLectureStatus,
} from "./lectureProgress.js";
import { lecturesForConcept, coursesForConcept, unlockedConceptIds } from "./library.js";
import { conceptsFromDoneQuests, matchExistingConcept, slugConceptId } from "./questConcept.js";
import {
  hitConceptIds,
  pickCourseReview,
  pickDebriefMix,
  relatedToLecture,
  shouldOfferDebriefQuiz,
  importanceForCourse,
} from "./quizPick.js";
import { readAllSessions, writeSession } from "./store.js";
import type {
  CatalogPayload,
  ChatMessage,
  InspectPayload,
  LectureStatus,
  OfferedCourse,
  OfferedQuest,
  Phase,
  QuizItem,
  SessionKind,
  SessionSnapshot,
  SideQuest,
} from "./types.js";

type LocalAgent = Awaited<ReturnType<typeof createStudyAgent>>;

interface Session {
  id: string;
  kind: SessionKind;
  phase: Phase;
  courseId: string;
  lectureN?: number;
  questId?: string;
  questTitle?: string;
  conceptId?: string;
  offersConceptQuiz?: boolean;
  debrief?: SessionSnapshot["debrief"];
  quiz?: QuizItem;
  quizQueue: string[];
  quizBank: QuizItem[];
  quizMode?: "after_debrief" | "review" | "course_end" | "quest" | "concept";
  wantQuestQuiz?: boolean;
  questTeachbackOk?: boolean;
  questQuizOk?: boolean;
  coveredConcepts: string[];
  pendingCorrection?: string;
  teachback?: SessionSnapshot["teachback"];
  inspect: InspectPayload;
  messages: ChatMessage[];
  offeredQuests: OfferedQuest[];
  offeredCourses: OfferedCourse[];
  generatingOutline?: string[];
  busy: boolean;
  workingOn?: string;
  error?: string;
  agent?: LocalAgent;
  primed: AgentPriming;
  agentQueue?: Promise<void>;
  cancel?: AbortController;
  rewrite?: Promise<void>;
}

const sessions = new Map<string, Session>();

export async function catalogPayload(): Promise<CatalogPayload> {
  const [catalog, learner] = await Promise.all([loadCatalog(), loadLearner()]);
  const hinted = applyProgressHints(learner.progress, catalog);
  const decayed = applyDecayHints({
    catalog,
    progress: hinted.progress,
    decay: learner.decay,
  });
  if (hinted.changed || decayed.changed) {
    learner.progress = hinted.progress;
    learner.decay = decayed.decay;
    await saveLearner(learner);
  }
  const quested = conceptsFromDoneQuests(catalog, learner.sideQuests);
  if (quested.missingIds.length) {
    for (const { quest, id } of quested.missingIds) quest.conceptId = id;
    await saveLearner(learner);
  }
  const conceptTeachings = await readConceptTeachings();
  for (const quest of learner.sideQuests) {
    if (quest.status !== "done" || !quest.conceptId || !quest.notes.trim()) continue;
    if (conceptTeachings[quest.conceptId]) continue;
    await writeConceptTeaching(quest.conceptId, quest.notes, quest.title);
    conceptTeachings[quest.conceptId] = formatConceptTeaching(
      quest.title,
      quest.notes,
    );
  }
  return {
    courses: catalog.courses.map((c) => ({
      ...c,
      blurb: catalog.blurbs[c.id] ?? "",
      lectures: (catalog.lectures[c.id] ?? []).map((lec) => ({
        ...lec,
        status: normalizeLectureStatus(learner.progress[c.id]?.[String(lec.n)]),
      })),
    })),
    concepts: quested.concepts,
    knowledge: learner.knowledge,
    decay: decayViews(learner.decay, Date.now()),
    openQuests: learner.sideQuests.filter(
      (q) => q.status === "open" || q.status === "parked",
    ),
    questConceptIds: quested.questConceptIds,
    conceptTeachings,
  };
}

async function touchStudiedConcept(s: Session, id: string): Promise<void> {
  const catalog = await loadCatalog();
  const learner = await loadLearner();
  const quested = conceptsFromDoneQuests(catalog, learner.sideQuests);
  if (!quested.concepts[id]) return;
  rememberTouch(learner, { ...catalog, concepts: quested.concepts }, [id], {
    courseId: s.courseId,
    lectureN: s.lectureN,
  });
  await saveLearner(learner);
}

function dropQuizThread(s: Session): void {
  const cut = s.messages.findIndex((m) => m.kind === "quiz");
  if (cut >= 0) s.messages = s.messages.slice(0, cut);
  s.quiz = undefined;
}

function rememberTouch(
  learner: LearnerState,
  catalog: Catalog,
  ids: string[],
  meta: { courseId?: string; lectureN?: number },
  at = Date.now(),
): void {
  const hinted = applyProgressHints(learner.progress, catalog);
  const unlocked = unlockedConceptIds(catalog, hinted.progress, ids);
  learner.decay = touchConcepts(learner.decay, ids, at, meta);
  learner.decay = echoNeighbors({
    decay: learner.decay,
    concepts: catalog.concepts,
    touched: ids,
    at,
    allowed: unlocked,
    courseId: meta.courseId,
    lectureN: meta.lectureN,
  });
}

function applyProgressHints(
  progress: LearnerState["progress"],
  catalog: Catalog,
): { progress: LearnerState["progress"]; changed: boolean } {
  let changed = false;
  const next: LearnerState["progress"] = { ...progress };
  for (const course of catalog.courses) {
    const lectures = catalog.lectures[course.id] ?? [];
    const row = { ...(next[course.id] ?? {}) };
    for (const lec of lectures) {
      const key = String(lec.n);
      const stored = row[key] != null ? normalizeLectureStatus(row[key]) : undefined;
      if (row[key] != null && stored && row[key] !== stored) {
        row[key] = stored;
        changed = true;
      }
      if (stored === "complete") continue;
      let hinted: LectureStatus | undefined;
      if (course.complete) hinted = "complete";
      else if (course.latest != null && lec.n < course.latest) hinted = "complete";
      if (!hinted || stored === hinted) continue;
      row[key] = hinted;
      changed = true;
    }
    next[course.id] = row;
  }
  return { progress: next, changed };
}

export async function restoreSessions(): Promise<void> {
  for (const raw of await readAllSessions()) {
    const s = hydrate(raw);
    if (s) sessions.set(s.id, s);
  }
}

export function getSession(id: string, _lite?: boolean): SessionSnapshot {
  return snapshot(get(id));
}

/** Local match, else one agent turn. Rejects people/trivia; never writes the library. */
async function resolveNewQuestTitle(
  title: string,
  concepts: Catalog["concepts"],
): Promise<
  { kind: "concept"; conceptId: string } | { kind: "quest"; title: string }
> {
  const hit = matchExistingConcept(concepts, title);
  if (hit) {
    if (!isStudyConcept(hit.name, hit.id)) {
      throw new Error("That's a recap, not a concept for the library.");
    }
    return { kind: "concept", conceptId: hit.id };
  }
  if (!isStudyConcept(title, slugConceptId(title))) {
    throw new Error("That's a recap, not a concept for the library.");
  }
  const questAgent = await createStudyAgent();
  try {
    const verdict = await judgeQuestTopic({
      agent: questAgent,
      title,
      concepts,
    });
    if (!verdict.ok) throw new Error(verdict.reason);
    if (verdict.existingId && concepts[verdict.existingId]) {
      return { kind: "concept", conceptId: verdict.existingId };
    }
    return { kind: "quest", title: verdict.name.trim() || title.trim() };
  } finally {
    try {
      await questAgent.close();
    } catch {
      /* already closed */
    }
  }
}

export async function startSession(input: {
  kind: SessionKind;
  courseId?: string;
  lectureN?: number;
  questTitle?: string;
  questId?: string;
  conceptId?: string;
}): Promise<SessionSnapshot> {
  const catalog = await loadCatalog();
  const learner = await loadLearner();
  if (input.kind === "find") {
    const topic = input.questTitle?.trim();
    if (!topic) throw new Error("Say a topic or paste a course URL.");
    const hit = matchExistingCourse(catalog.courses, topic);
    if (hit) {
      throw new Error(`${hit.title} is already in the catalog.`);
    }
  } else {
    if (!input.courseId) throw new Error("courseId is required.");
    const courseId = input.courseId;
    const course = courseOf(catalog, courseId);
    if (input.kind === "debrief") {
      if (input.lectureN == null) {
        throw new Error("lectureN is required for debrief.");
      }
      lectureOf(catalog, courseId, input.lectureN);
    } else if (input.kind === "quiz") {
      const hinted = applyProgressHints(learner.progress, catalog);
      const lectures = (catalog.lectures[courseId] ?? []).map((lec) => ({
        n: lec.n,
        status: normalizeLectureStatus(
          hinted.progress[courseId]?.[String(lec.n)],
        ),
      }));
      const next = nextIncompleteLectureN(lectures);
      if (next != null && !course.complete) {
        throw new Error("Review is only on a finished course.");
      }
    } else if (input.kind === "concept") {
      if (!input.conceptId) throw new Error("conceptId is required.");
    } else if (input.kind !== "quest") {
      throw new Error("Unknown session kind.");
    }

    if (input.kind === "debrief") {
      const hinted = applyProgressHints(learner.progress, catalog);
      const lectures = (catalog.lectures[courseId] ?? []).map((lec) => ({
        n: lec.n,
        status: normalizeLectureStatus(
          hinted.progress[courseId]?.[String(lec.n)],
        ),
      }));
      const next = nextIncompleteLectureN(lectures);
      if (next !== input.lectureN) {
        throw new Error(
          next == null
            ? "This course is already complete."
            : `Finish lecture ${next} before later ones.`,
        );
      }
    }
  }
  let questTitle = input.questTitle?.trim();
  if (input.kind === "quest" && questTitle && !input.questId) {
    const resolved = await resolveNewQuestTitle(questTitle, catalog.concepts);
    if (resolved.kind === "concept") {
      return startSession({
        kind: "concept",
        courseId: input.courseId,
        conceptId: resolved.conceptId,
      });
    }
    questTitle = resolved.title;
  }

  const inspect = await buildInspect(catalog, learner, {
    ...input,
    courseId: input.courseId ?? "",
    questTitle,
  });
  const id = randomUUID();
  const s: Session = {
    id,
    kind: input.kind,
    phase: phaseForStart(input.kind),
    courseId: input.courseId ?? "",
    lectureN: input.lectureN,
    questTitle: questTitle ?? input.questTitle,
    questId: input.questId,
    conceptId: input.conceptId,
    quizQueue: [],
    quizBank: [],
    quizMode: input.kind === "quiz" ? "review" : undefined,
    coveredConcepts: [],
    inspect,
    messages: [],
    offeredQuests: [],
    offeredCourses: [],
    busy: false,
    primed: newPriming(),
  };

  if (input.kind === "debrief") {
    const lec = lectureOf(catalog, input.courseId as string, input.lectureN as number);
    push(s, {
      role: "assistant",
      kind: "status",
      text: `Lecture ${lec.n}: ${lec.title}. Write a summary of the lecture. I will check the ideas.`,
    });
  } else if (input.kind === "quest") {
    const title = questTitle;
    if (!title && !input.questId) {
      throw new Error("Side quest needs a title or an existing quest id.");
    }
    if (input.questId) {
      const existing = learner.sideQuests.find((q) => q.id === input.questId);
      if (!existing) throw new Error("Unknown side quest.");
      s.questId = existing.id;
      s.questTitle = existing.title;
    } else if (title) {
      const next = addQuest(learner.sideQuests, {
        title,
        source: "user",
        courseId: input.courseId,
        lectureN: input.lectureN,
      });
      learner.sideQuests = next;
      const created = next[next.length - 1];
      s.questId = created.id;
      s.questTitle = created.title;
      await saveLearner(learner);
    }
    s.inspect = await buildInspect(catalog, learner, {
      ...input,
      courseId: input.courseId ?? "",
      questTitle: s.questTitle,
    });
  }

  sessions.set(id, s);
  await persist(s);

  if (input.kind === "quiz") {
    return startQuizQueue(s);
  }
  if (input.kind === "quest") {
    return startQuestFlow(s);
  }
  if (input.kind === "concept") {
    return startConceptFlow(s);
  }
  if (input.kind === "find") {
    return startFindFlow(s);
  }
  return snapshot(s);
}

export async function submitTeachback(
  id: string,
  text: string,
): Promise<SessionSnapshot> {
  const s = get(id);
  return withBusy(s, async () => {
    push(s, { role: "user", kind: "text", text });
    if (s.kind === "debrief" && s.phase === "awaiting_summary") {
      await debriefSummary(s, text);
      return;
    }
    if (s.kind === "debrief" && s.phase === "correction_gate") {
      await gradeCorrection(s, text);
      return;
    }
    if (s.kind === "quest" && s.phase === "quest_gate") {
      await gradeQuestGate(s, text);
      return;
    }
    if (s.kind === "quest" && s.phase === "quest") {
      if (!s.questTeachbackOk) {
        s.pendingCorrection = s.pendingCorrection || QUEST_TEACHBACK;
        await gradeQuestGate(s, text);
        return;
      }
      await questTurn(s, text);
      return;
    }
    throw new Error("Teach-back is not open in this phase.");
  }, workingLabel(s));
}

export async function submitAsk(
  id: string,
  text: string,
): Promise<SessionSnapshot> {
  const s = get(id);
  return withBusy(s, async () => {
    push(s, { role: "user", kind: "text", text });
    if (s.kind === "find" && s.phase === "find") {
      await findTurn(s, text);
      return;
    }
    const ctx = await contextOf(s);
    const reply = await withAgent(s, (agent) =>
      answerAsk({ agent, primed: s.primed, ctx, question: text }),
    );
    advancePriming(s.primed);
    push(s, { role: "assistant", kind: "text", text: reply });
    if (s.kind === "concept" && s.conceptId) {
      await touchStudiedConcept(s, s.conceptId);
    }
  }, "Answering…");
}

export async function skipItem(id: string): Promise<SessionSnapshot> {
  const s = get(id);
  return withBusy(s, async () => {
    if (s.kind === "debrief" && s.phase === "correction_gate") {
      await finishDebrief(s, "shaky");
      return;
    }
    if (s.kind === "quest" && s.phase === "quest_gate") {
      await continueAfterQuestGate(s);
      return;
    }
    if (s.phase === "quiz_item" && s.quiz) {
      if (
        s.quizMode === "after_debrief" ||
        s.quizMode === "course_end" ||
        s.quizMode === "quest" ||
        s.quizMode === "concept"
      ) {
        throw new Error(
          s.quizMode === "after_debrief" || s.quizMode === "course_end"
            ? "This mix is part of finishing — pick an answer."
            : "Get this one right to continue.",
        );
      }
      const learner = await loadLearner();
      learner.quizLog = recordQuiz(learner.quizLog, s.quiz.conceptId, false);
      await saveLearner(learner);
      s.coveredConcepts.push(s.quiz.conceptId);
      push(s, {
        role: "assistant",
        kind: "status",
        text: `Skipped \`${s.quiz.conceptId}\`.`,
      });
      await nextQuiz(s);
      return;
    }
    throw new Error("Nothing to skip.");
  }, "Skipping…");
}

export async function nextAfterQuestion(id: string): Promise<SessionSnapshot> {
  const s = get(id);
  return withBusy(s, async () => {
    if (s.teachback?.kind !== "question_after") {
      throw new Error("Next is only after a side question.");
    }
    s.teachback = undefined;
    if (s.kind === "quiz") await nextQuiz(s);
    else if (s.kind === "quest") {
      s.questTeachbackOk = true;
      await continueAfterQuestGate(s);
    } else if (s.kind === "debrief") await finishDebrief(s, "debriefed");
  }, "Next…");
}

export async function acceptQuest(
  id: string,
  title?: string,
): Promise<SessionSnapshot> {
  const s = get(id);
  const raw = title ?? s.offeredQuests[0]?.title;
  if (!raw) throw new Error("No side quest to accept.");
  const offered = s.offeredQuests.some((q) => q.title === raw.trim());
  let pick = raw.trim();
  if (!offered) {
    const catalog = await loadCatalog();
    const resolved = await resolveNewQuestTitle(pick, catalog.concepts);
    if (resolved.kind === "concept") {
      s.phase = "done";
      await persist(s);
      return startSession({
        kind: "concept",
        courseId: s.courseId,
        conceptId: resolved.conceptId,
      });
    }
    pick = resolved.title;
  }
  const learner = await loadLearner();
  learner.sideQuests = addQuest(learner.sideQuests, {
    title: pick,
    source: "user",
    courseId: s.courseId,
    lectureN: s.lectureN,
    notes: s.offeredQuests.find((q) => q.title === pick)?.why ?? "",
  });
  await saveLearner(learner);
  const created = learner.sideQuests[learner.sideQuests.length - 1];
  s.phase = "done";
  await persist(s);
  return startSession({
    kind: "quest",
    courseId: s.courseId,
    lectureN: s.lectureN,
    questId: created.id,
    questTitle: created.title,
  });
}

export async function pickCourse(
  id: string,
  url: string,
): Promise<SessionSnapshot> {
  const s = get(id);
  if (s.kind !== "find" || s.phase !== "find") {
    throw new Error("No course pick in progress.");
  }
  return withBusy(s, () => commitPickedCourse(s, url), "Adding the course…");
}

export async function finishQuest(
  id: string,
  status: "parked" | "done",
): Promise<SessionSnapshot> {
  const s = get(id);
  const learner = await loadLearner();
  if (status === "done" && !(s.questTeachbackOk && s.questQuizOk)) {
    throw new Error("Teach it back and finish the quiz first.");
  }
  if (status === "done" && s.questId) {
    const catalog = await loadCatalog();
    const next = learner.sideQuests.map((q) =>
      q.id === s.questId ? { ...q, status: "done" as const } : q,
    );
    const quested = conceptsFromDoneQuests(catalog, next);
    for (const { quest, id: conceptId } of quested.missingIds) {
      quest.conceptId = conceptId;
    }
    const done = next.find((q) => q.id === s.questId);
    learner.sideQuests = next;
    if (done?.conceptId) {
      const has = learner.knowledge.some((k) => k.id === done.conceptId);
      if (!has) {
        learner.knowledge = upsertKnowledge(learner.knowledge, [
          { id: done.conceptId, status: "known", note: "Side quest." },
        ]);
      }
      rememberTouch(
        learner,
        { ...catalog, concepts: quested.concepts },
        [done.conceptId],
        { courseId: s.courseId, lectureN: s.lectureN },
      );
      if (done.notes.trim()) {
        await writeConceptTeaching(done.conceptId, done.notes, done.title);
      }
    }
    await saveLearner(learner);
    const parent = done
      ? quested.concepts[done.conceptId ?? ""]?.parentId
      : undefined;
    const parentName = parent ? quested.concepts[parent]?.name : undefined;
    s.phase = "done";
    push(s, {
      role: "assistant",
      kind: "status",
      text: parentName
        ? `Side quest marked done. Added to the concept map under ${parentName}.`
        : "Side quest marked done. Added to the concept map.",
    });
    await persist(s);
    await closeAgent(s);
    return snapshot(s);
  }
  learner.sideQuests = learner.sideQuests.map((q) =>
    q.id === s.questId ? { ...q, status } : q,
  );
  await saveLearner(learner);
  s.phase = "done";
  push(s, {
    role: "assistant",
    kind: "status",
    text: "Side quest parked.",
  });
  await persist(s);
  await closeAgent(s);
  return snapshot(s);
}

export async function answerQuizChoice(
  id: string,
  choiceId: string,
): Promise<SessionSnapshot> {
  const s = get(id);
  return withBusy(s, async () => {
    if (s.phase !== "quiz_item" || !s.quiz) {
      throw new Error("No quiz item to answer.");
    }
    const item = s.quiz;
    const pick = item.choices.find((c) => c.id === choiceId);
    if (!pick) throw new Error("Unknown choice.");
    item.pickedId = choiceId;
    const ok = choiceId === item.correctId;
    const learner = await loadLearner();
    learner.quizLog = recordQuiz(learner.quizLog, item.conceptId, ok);
    const catalog = await loadCatalog();
    if (catalog.concepts[item.conceptId]) {
      rememberTouch(learner, catalog, [item.conceptId], {
        courseId: s.courseId,
        lectureN: s.lectureN,
      });
    }
    if (s.quizMode !== "concept") {
      push(s, { role: "user", kind: "text", text: pick.text });
    }
    const hint = item.noteHint
      ? ` Peek at ${item.noteHint} if you want a reminder.`
      : "";
    if (!ok) {
      await saveLearner(learner);
      push(s, {
        role: "assistant",
        kind: "status",
        text:
          s.quizMode === "after_debrief" ||
          s.quizMode === "quest" ||
          s.quizMode === "concept"
            ? `${item.why || "Not that one."}${hint} Stay with it.`
            : `${item.why || "Not that one."}${hint} Stay with it, or skip.`,
      });
      s.quiz = { ...item };
      return;
    }
    if (catalog.concepts[item.conceptId]) {
      const note =
        learner.knowledge.find((k) => k.id === item.conceptId)?.note ||
        "Held up in a friendly quiz.";
      learner.knowledge = upsertKnowledge(learner.knowledge, [
        { id: item.conceptId, status: "known", note },
      ]);
    }
    await saveLearner(learner);
    s.coveredConcepts.push(item.conceptId);
    push(s, {
      role: "assistant",
      kind: "status",
      text: item.why || "Yes.",
    });
    s.inspect = await refreshInspect(s);
    await nextQuiz(s);
  }, "Checking…");
}

export async function finishSession(id: string): Promise<SessionSnapshot> {
  const s = get(id);
  return withBusy(s, async () => {
    if (
      s.kind === "debrief" &&
      (s.phase === "debrief" || s.phase === "correction_gate")
    ) {
      await finishDebrief(s, "debriefed");
      return;
    }
    if (s.phase === "quiz_wrap") {
      if (s.kind === "concept") {
        dropQuizThread(s);
        s.phase = "concept";
        s.quiz = undefined;
        s.quizMode = undefined;
        await persist(s);
        return;
      }
      if (s.kind === "quest") {
        s.phase = "quest";
        s.quiz = undefined;
        push(s, {
          role: "assistant",
          kind: "status",
          text: "That’s the check. You can mark the quest done, or keep asking.",
        });
        await persist(s);
        return;
      }
      s.phase = "done";
      push(s, {
        role: "assistant",
        kind: "status",
        text: "Quiz saved to the knowledge files. Next session will read those, not this chat.",
      });
      await persist(s);
      await closeAgent(s);
      return;
    }
    s.phase = "done";
    await persist(s);
    await closeAgent(s);
  }, "Finishing…");
}

export async function quitSession(id: string): Promise<SessionSnapshot> {
  const s = get(id);
  if (
    (s.quizMode === "after_debrief" || s.quizMode === "course_end") &&
    (s.phase === "quiz_item" || s.phase === "quiz_wrap")
  ) {
    throw new Error("Finish the mix to close the debrief.");
  }
  if (s.kind === "find") {
    s.phase = "done";
    s.offeredCourses = [];
    push(s, {
      role: "assistant",
      kind: "status",
      text: "Left without adding a course.",
    });
    await persist(s);
    await closeAgent(s);
    return snapshot(s);
  }
  if (s.kind === "quest" && s.questId) {
    const learner = await loadLearner();
    learner.sideQuests = removeQuest(learner.sideQuests, s.questId);
    await saveLearner(learner);
    s.phase = "done";
    push(s, {
      role: "assistant",
      kind: "status",
      text: "Side quest removed.",
    });
    await persist(s);
    await closeAgent(s);
    return snapshot(s);
  }
  s.phase = "done";
  push(s, { role: "assistant", kind: "status", text: "Session ended." });
  await persist(s);
  await closeAgent(s);
  return snapshot(s);
}

export async function cancelWork(id: string): Promise<SessionSnapshot> {
  const s = get(id);
  s.cancel?.abort();
  s.busy = false;
  s.workingOn = undefined;
  s.generatingOutline = undefined;
  return snapshot(s);
}

async function startQuizQueue(s: Session): Promise<SessionSnapshot> {
  return withBusy(s, () => writeAndEmitQuiz(s), "Writing quiz…");
}

async function startFindFlow(s: Session): Promise<SessionSnapshot> {
  return withBusy(s, () => findTurn(s), "Looking for lecture series…");
}

async function findTurn(s: Session, message?: string): Promise<void> {
  const topic = s.questTitle?.trim();
  if (!topic) throw new Error("Say a topic or paste a course URL.");
  if (message && looksLikeCourseUrl(message)) {
    await commitPickedCourse(s, message.trim());
    return;
  }
  const catalog = await loadCatalog();
  const already = catalog.courses.map((c) => ({
    id: c.id,
    title: c.title,
    sourceUrl: c.sourceUrl,
  }));
  const scout = await withAgent(s, (agent) =>
    scoutCourse({
      agent,
      topic,
      already,
      message,
    }),
  );
  s.offeredCourses = scout.offers;
  push(s, { role: "assistant", kind: "text", text: scout.reply });
  if (scout.pickUrl) {
    await commitPickedCourse(s, scout.pickUrl);
  }
}

async function commitPickedCourse(s: Session, rawUrl: string): Promise<void> {
  const result = await initCourseFromUrl(rawUrl);
  s.courseId = result.course.id;
  s.offeredCourses = [];
  s.phase = "done";
  const n = result.lectureCount;
  push(s, {
    role: "assistant",
    kind: "status",
    text:
      n <= 1
        ? `Added ${result.course.title}. The public page only yielded one lecture row — say if you have a better listing URL.`
        : `Added ${result.course.title} · ${n} lectures. Concept tags start empty.`,
  });
  await closeAgent(s);
}

async function startQuestFlow(s: Session): Promise<SessionSnapshot> {
  return withBusy(s, () => openQuest(s), "Opening the quest…");
}

export async function switchConcept(
  id: string,
  conceptId: string,
): Promise<SessionSnapshot> {
  const s = get(id);
  if (s.kind !== "concept") {
    throw new Error("Only a concept session can open another concept.");
  }
  if (!conceptId.trim()) throw new Error("conceptId is required.");
  if (s.busy) {
    s.cancel?.abort();
    s.busy = false;
    s.workingOn = undefined;
    s.cancel = undefined;
  }
  s.conceptId = conceptId;
  s.phase = "concept";
  s.quiz = undefined;
  s.quizQueue = [];
  s.quizBank = [];
  s.quizMode = undefined;
  return startConceptFlow(s);
}

async function startConceptFlow(s: Session): Promise<SessionSnapshot> {
  const catalog = await loadCatalog();
  const learner = await loadLearner();
  const quested = conceptsFromDoneQuests(catalog, learner.sideQuests);
  const id = s.conceptId;
  if (!id) throw new Error("conceptId is required.");
  const def = quested.concepts[id];
  if (!def) throw new Error("Unknown concept.");
  s.questTitle = def.name;
  s.offersConceptQuiz = Boolean(def.parentId);
  const related = relatedConcepts(quested.concepts, id);
  const stored = (await teachingsForIds([id]))[id]?.trim();
  if (stored) {
    s.generatingOutline = undefined;
    await openConcept(s);
    return snapshot(s);
  }
  s.generatingOutline = seedConceptOutline(
    def.name,
    def.parentId ? quested.concepts[def.parentId]?.name : undefined,
    related.map((row) => row.name),
  );
  s.messages = [];
  push(s, {
    role: "assistant",
    kind: "status",
    text: "Generating text…",
  });
  const work = withBusy(s, () => openConcept(s), "Generating text…");
  void work.catch(() => undefined);
  return snapshot(s);
}

export async function startConceptQuiz(id: string): Promise<SessionSnapshot> {
  const s = get(id);
  if (s.kind !== "concept" || !s.conceptId) {
    throw new Error("Quiz is only on a concept.");
  }
  return withBusy(s, () => startStoredConceptQuiz(s), "Opening quiz…");
}

function teachingWithLectures(
  text: string,
  lectures: { courseTitle: string; n: number; title: string }[],
): string {
  const body = text
    .replace(/\n*## From lectures\n(?:- .+\n?)*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (lectures.length === 0 || lectures.length > 2) return body;
  const list = lectures
    .map((lec) => `- ${lec.courseTitle} L${lec.n}: ${lec.title}`)
    .join("\n");
  return `${body}\n\n## From lectures\n${list}`;
}

function tidyTeachingVoice(text: string): string {
  return text
    .replace(/[ \t]*\((?:fix|correct) once,? then move on\)\.?/gi, "")
    .replace(/^#{2,4}\s*Definitions people invert.*$/gim, "")
    .replace(/^\*\*Definitions people invert[^*]*\*\*\s*$/gim, "")
    .replace(/^\*\*Easy to invert[^*]*\*\*\s*$/gim, "")
    .replace(/\bin this side quest\b/gi, "here")
    .replace(/\bthis side quest\b/gi, "this topic")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function courseIdForHref(catalog: Catalog, href: string): string | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  const hrefNorm = href.replace(/\/$/, "");
  for (const course of catalog.courses) {
    let home: URL;
    try {
      home = new URL(course.sourceUrl);
    } catch {
      continue;
    }
    const homeNorm = course.sourceUrl.replace(/\/$/, "");
    if (hrefNorm === homeNorm || hrefNorm.startsWith(`${homeNorm}/`)) {
      return course.id;
    }
    if (
      url.hostname === home.hostname &&
      home.pathname !== "/" &&
      url.pathname.startsWith(home.pathname.replace(/\/$/, ""))
    ) {
      return course.id;
    }
    for (const lec of catalog.lectures[course.id] ?? []) {
      const lecUrl = lec.url.replace(/\/$/, "");
      if (hrefNorm === lecUrl || hrefNorm.startsWith(`${lecUrl}/`)) {
        return course.id;
      }
    }
  }
  return undefined;
}

function dropForeignCourseLinks(
  text: string,
  catalog: Catalog,
  allowedCourseIds: Set<string>,
): string {
  return text
    .replace(/^- \[[^\]]+\]\((https?:\/\/[^)]+)\)[ \t]*$/gm, (line, href: string) => {
      const courseId = courseIdForHref(catalog, href);
      if (courseId && !allowedCourseIds.has(courseId)) return "";
      return line;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripModelSeeAlso(text: string): string {
  const out: string[] = [];
  let skipHeadingList = false;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (/^#{2,4}\s+See also\b/i.test(trimmed)) {
      skipHeadingList = true;
      continue;
    }
    if (skipHeadingList) {
      if (!trimmed || /^\s*[-*•]\s+/.test(line)) continue;
      skipHeadingList = false;
    }
    if (/^\*{0,2}See also\b/i.test(trimmed)) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function teachingWithSeeAlso(
  text: string,
  related: { id: string; name: string }[],
): string {
  const body = stripModelSeeAlso(text);
  if (!related.length) return body;
  const list = related
    .map((row) => `- [${row.name}](concept:${row.id})`)
    .join("\n");
  return `${body}\n\n## See also\n${list}`;
}

async function openConcept(s: Session): Promise<void> {
  const catalog = await loadCatalog();
  const learner = await loadLearner();
  const hinted = applyProgressHints(learner.progress, catalog);
  const quested = conceptsFromDoneQuests(catalog, learner.sideQuests);
  const id = s.conceptId;
  if (!id) throw new Error("conceptId is required.");
  const def = quested.concepts[id];
  if (!def) throw new Error("Unknown concept.");
  s.questTitle = def.name;
  s.offersConceptQuiz = Boolean(def.parentId);
  const related = relatedConcepts(quested.concepts, id);
  const sources = coursesForConcept(catalog, id);
  const allowedCourses = new Set(sources.map((c) => c.id));
  const stored = (await teachingsForIds([id]))[id];
  let body = stored?.trim() ?? "";
  if (!body) {
    const ctx = await contextOf(s);
    const plan = await withAgent(s, (agent) =>
      draftConceptTeaching({
        agent,
        primed: s.primed,
        ctx,
        id,
        name: def.name,
        parentName: def.parentId
          ? quested.concepts[def.parentId]?.name
          : undefined,
        related,
        sources,
        onOutline: (beats) => {
          s.generatingOutline = beats;
        },
      }),
    );
    advancePriming(s.primed);
    const allowed = new Set(related.map((row) => row.id));
    const extra = plan.relatedIds
      .filter((cid) => quested.concepts[cid] && cid !== id)
      .map((cid) => ({ id: cid, name: quested.concepts[cid].name }));
    const see = [
      ...related,
      ...extra.filter((row) => !allowed.has(row.id)),
    ];
    const links = plan.links
      .filter((l) => {
        const courseId = courseIdForHref(catalog, l.url);
        return !courseId || allowedCourses.has(courseId);
      })
      .map((l) => `- [${l.label}](${l.url})`)
      .join("\n");
    body = links
      ? `${plan.explanation.trim()}\n\n${links}`
      : plan.explanation.trim();
    body = teachingWithSeeAlso(body, see);
  } else {
    body = teachingWithSeeAlso(body, related);
  }
  const cleaned = dropForeignCourseLinks(
    tidyTeachingVoice(body),
    catalog,
    allowedCourses,
  );
  if (cleaned !== (stored?.trim() ?? "")) {
    await writeConceptTeaching(id, cleaned, def.name);
  }
  body = cleaned;
  const lectures = lecturesForConcept(catalog, hinted.progress, id);
  s.generatingOutline = undefined;
  s.messages = [];
  push(s, {
    role: "assistant",
    kind: "text",
    text: teachingWithLectures(body, lectures),
  });
  s.phase = "concept";
  s.inspect = await refreshInspect(s);
  await persist(s);
}

async function startStoredConceptQuiz(s: Session): Promise<void> {
  if (!s.conceptId) throw new Error("conceptId is required.");
  dropQuizThread(s);
  s.quizMode = "concept";
  s.quizQueue = [s.conceptId];
  s.coveredConcepts = [];
  const disk = await readConceptQuiz(s.conceptId);
  const stored = s.quizBank.length ? s.quizBank : disk;
  if (stored.length) {
    s.quizBank = freshConceptQuizBank(stored);
    if (!disk.length) await writeConceptQuiz(s.conceptId, s.quizBank);
    const catalog = await loadCatalog();
    const learner = await loadLearner();
    const quested = conceptsFromDoneQuests(catalog, learner.sideQuests);
    rememberTouch(
      learner,
      { ...catalog, concepts: quested.concepts },
      [s.conceptId],
      { courseId: s.courseId, lectureN: s.lectureN },
    );
    await saveLearner(learner);
    await emitQuizItem(s);
    return;
  }
  const catalog = await loadCatalog();
  const learner = await loadLearner();
  const quested = conceptsFromDoneQuests(catalog, learner.sideQuests);
  const name = quested.concepts[s.conceptId]?.name ?? s.conceptId;
  const ctx = await contextOf(s);
  const bank = await withAgent(s, (agent) =>
    writeQuizSet({
      agent,
      primed: s.primed,
      ctx,
      concepts: [{ id: s.conceptId as string, name }],
    }),
  );
  advancePriming(s.primed);
  s.quizBank = freshConceptQuizBank(bank);
  await writeConceptQuiz(s.conceptId, s.quizBank);
  rememberTouch(learner, { ...catalog, concepts: quested.concepts }, [s.conceptId], {
    courseId: s.courseId,
    lectureN: s.lectureN,
  });
  await saveLearner(learner);
  await emitQuizItem(s);
}

function freshConceptQuizBank(items: QuizItem[]): QuizItem[] {
  return items.map((item, i) => ({
    ...item,
    pickedId: undefined,
    index: i + 1,
    total: items.length,
  }));
}

const QUEST_TEACHBACK = "Restate the idea in your own words.";

async function openQuest(s: Session): Promise<void> {
  const learner = await loadLearner();
  const quest = learner.sideQuests.find((q) => q.id === s.questId);
  const prior = quest?.notes?.trim() ?? "";
  if (prior) {
    push(s, { role: "assistant", kind: "text", text: prior });
    await resumeQuestChecks(s);
    return;
  }
  const ctx = await contextOf(s);
  const plan = await withAgent(s, (agent) =>
    openQuestPlan({
      agent,
      primed: s.primed,
      ctx,
      title: s.questTitle || "Side quest",
    }),
  );
  advancePriming(s.primed);
  const links = plan.links
    .map((l) => `- [${l.label}](${l.url})`)
    .join("\n");
  const body = links
    ? `${plan.explanation.trim()}\n\n${links}`
    : plan.explanation.trim();
  if (quest) {
    quest.notes = body;
    await saveLearner(learner);
  }
  push(s, { role: "assistant", kind: "text", text: body });
  s.wantQuestQuiz = true;
  s.pendingCorrection = plan.teachbackPrompt || QUEST_TEACHBACK;
  s.phase = "quest_gate";
  push(s, {
    role: "assistant",
    kind: "status",
    text: `Teach it back:\n- ${s.pendingCorrection}`,
  });
  s.inspect = await refreshInspect(s);
  await persist(s);
}

async function resumeQuestChecks(s: Session): Promise<void> {
  if (!s.questTeachbackOk) {
    s.pendingCorrection = s.pendingCorrection || QUEST_TEACHBACK;
    s.phase = "quest_gate";
    push(s, {
      role: "assistant",
      kind: "status",
      text: `Teach it back:\n- ${s.pendingCorrection}`,
    });
    s.inspect = await refreshInspect(s);
    await persist(s);
    return;
  }
  await continueAfterQuestGate(s);
}

async function continueAfterQuestGate(s: Session): Promise<void> {
  s.pendingCorrection = undefined;
  s.teachback = undefined;
  if (s.questQuizOk) {
    s.phase = "quest";
    await persist(s);
    return;
  }
  if (!s.quizBank.length) {
    await writeQuestQuiz(s);
    return;
  }
  await emitQuizItem(s);
}

async function writeQuestQuiz(s: Session): Promise<void> {
  s.quizMode = "quest";
  const id = s.questId ? `quest:${s.questId}` : "quest";
  s.quizQueue = [id];
  s.coveredConcepts = [];
  const ctx = await contextOf(s);
  s.quizBank = await withAgent(s, (agent) =>
    writeQuizSet({
      agent,
      primed: s.primed,
      ctx,
      concepts: [{ id, name: s.questTitle || "Side quest" }],
    }),
  );
  advancePriming(s.primed);
  await emitQuizItem(s);
}

async function gradeQuestGate(s: Session, text: string): Promise<void> {
  const ctx = await contextOf(s);
  const result = await withAgent(s, (agent) =>
    gradeTeachback({
      agent,
      primed: s.primed,
      ctx,
      prompt: s.pendingCorrection || "Restate the idea.",
      answer: text,
    }),
  );
  advancePriming(s.primed);
  s.teachback = result;
  push(s, { role: "assistant", kind: "teachback", text: result.message });
  if (result.kind === "question_before" || result.kind === "thin") {
    await persist(s);
    return;
  }
  if (result.kind === "question_after") {
    await persist(s);
    return;
  }
  if (!result.adequate) {
    await persist(s);
    return;
  }
  s.questTeachbackOk = true;
  await continueAfterQuestGate(s);
}

async function writeAndEmitQuiz(s: Session): Promise<void> {
    const catalog = await loadCatalog();
    const learner = await loadLearner();
    const hinted = applyProgressHints(learner.progress, catalog);
    const decayed = applyDecayHints({
      catalog,
      progress: hinted.progress,
      decay: learner.decay,
    });
    const views = decayViews(decayed.decay, Date.now());
    const freshness: Record<string, number> = {};
    for (const [id, view] of Object.entries(views)) {
      freshness[id] = view.freshness;
    }
    const hits = hitConceptIds(catalog, hinted.progress);
    const hitSet = new Set(hits);
    const mode = s.quizMode ?? (s.lectureN == null ? "review" : "after_debrief");
    s.quizMode = mode;
    if (mode === "review" || mode === "course_end") {
      const courseHits = hitConceptIds(catalog, hinted.progress, s.courseId);
      s.quizQueue = pickCourseReview(
        courseHits,
        freshness,
        importanceForCourse(catalog, s.courseId, courseHits),
      );
    } else {
      const lecture = lectureOf(catalog, s.courseId, s.lectureN as number);
      const related = relatedToLecture(catalog, lecture.conceptIds, hitSet);
      const cold = hits
        .slice()
        .sort(
          (a, b) =>
            (freshness[a] ?? 0) - (freshness[b] ?? 0) || a.localeCompare(b),
        );
      s.quizQueue = pickDebriefMix({ related, decayed: cold });
    }
    if (!s.quizQueue.length) {
      throw new Error("No concepts to quiz yet.");
    }
    s.coveredConcepts = [];
    const ctx = await contextOf(s);
    s.quizBank = await withAgent(s, (agent) =>
      writeQuizSet({
        agent,
        primed: s.primed,
        ctx,
        concepts: s.quizQueue.map((id) => ({
          id,
          name: catalog.concepts[id]?.name ?? id,
        })),
      }),
    );
    advancePriming(s.primed);
    s.kind = "quiz";
    s.phase = "quiz_item";
    push(s, {
      role: "assistant",
      kind: "status",
      text:
        mode === "course_end"
          ? `Course review: ${s.quizBank.length} concept${s.quizBank.length === 1 ? "" : "s"} from this course, weighted toward the ones that do more work here. Multiple choice, no timer.`
          : mode === "review"
          ? `Review: ${s.quizBank.length} concept${s.quizBank.length === 1 ? "" : "s"} from this course. Multiple choice, no timer.`
          : `Five questions: three from this lecture, two from things going cold. Multiple choice, no timer.`,
    });
    await emitQuizItem(s);
}

async function emitQuizItem(s: Session): Promise<void> {
  const remaining = s.quizBank.filter(
    (item) => !s.coveredConcepts.includes(item.conceptId),
  );
  if (!remaining.length) {
    s.quiz = undefined;
    if (s.kind === "concept") {
      dropQuizThread(s);
      s.phase = "concept";
      s.quiz = undefined;
      s.quizMode = undefined;
      await persist(s);
      return;
    }
    s.phase = "quiz_wrap";
    if (s.kind === "quest") s.questQuizOk = true;
    push(s, {
      role: "assistant",
      kind: "status",
      text:
        s.kind === "quest"
          ? "That’s the check. Finish to return to the quest — Done is available."
          : "That’s the set. Finish to write scores into the files.",
    });
    await persist(s);
    return;
  }
  const item = remaining[0];
  s.quiz = item;
  s.phase = "quiz_item";
  s.teachback = undefined;
  push(s, {
    role: "assistant",
    kind: "quiz",
    text: item.prompt,
    quiz: item,
  });
  await persist(s);
}

async function nextQuiz(s: Session): Promise<void> {
  await emitQuizItem(s);
}

async function debriefSummary(s: Session, summary: string): Promise<void> {
  const ctx = await contextOf(s);
  const { card, updates } = await withAgent(s, (agent) =>
    runDebrief({ agent, primed: s.primed, ctx, summary }),
  );
  advancePriming(s.primed);
  s.debrief = card;
  s.offeredQuests = card.offeredQuests;
  const learner = await loadLearner();
  learner.knowledge = upsertKnowledge(learner.knowledge, updates);
  await writeLectureSummary({
    courseId: s.courseId,
    n: s.lectureN as number,
    summary,
    corrections: card.corrections,
  });
  await saveLearner(learner);
  s.inspect = await refreshInspect(s);
  push(s, {
    role: "assistant",
    kind: "debrief",
    text: card.summaryNote,
    debrief: card,
  });
  if (card.corrections.length) {
    s.phase = "correction_gate";
    s.pendingCorrection = card.corrections[0];
    push(s, {
      role: "assistant",
      kind: "status",
      text: `Worth locking down (optional — Finish anytime, or leave it shaky):\n- ${card.corrections[0]}`,
    });
  } else {
    s.phase = "debrief";
  }
  await persist(s);
  await queueRewrite(
    s,
    `Debrief ${s.courseId} #${s.lectureN}. Updates: ${updates.map((u) => `${u.id}=${u.status}`).join(", ")}`,
  );
}

async function gradeCorrection(s: Session, text: string): Promise<void> {
  const ctx = await contextOf(s);
  const result = await withAgent(s, (agent) =>
    gradeTeachback({
      agent,
      primed: s.primed,
      ctx,
      prompt: s.pendingCorrection || "Restate the correction.",
      answer: text,
    }),
  );
  advancePriming(s.primed);
  s.teachback = result;
  push(s, { role: "assistant", kind: "teachback", text: result.message });
  if (result.kind === "question_before" || result.kind === "thin") {
    await persist(s);
    return;
  }
  if (result.kind === "question_after") {
    await persist(s);
    return;
  }
  await finishDebrief(s, "debriefed");
}

async function questTurn(s: Session, text: string): Promise<void> {
  const learner = await loadLearner();
  const quest = learner.sideQuests.find((q) => q.id === s.questId);
  const ctx = await contextOf(s);
  const reply = await withAgent(s, (agent) =>
    runQuestTurn({
      agent,
      primed: s.primed,
      ctx,
      title: s.questTitle || "Side quest",
      notes: quest?.notes ?? "",
      message: text,
    }),
  );
  advancePriming(s.primed);
  if (quest) {
    quest.notes = quest.notes
      ? `${quest.notes.trim()}\n\n${reply}`
      : reply;
    await saveLearner(learner);
  }
  push(s, { role: "assistant", kind: "text", text: reply });
  s.inspect = await refreshInspect(s);
  await persist(s);
}

async function finishDebrief(
  s: Session,
  status: "debriefed" | "shaky",
): Promise<void> {
  const catalog = await loadCatalog();
  const learner = await loadLearner();
  learner.progress = setLectureStatus(
    learner.progress,
    s.courseId,
    s.lectureN as number,
    "complete",
  );
  const lecture = lectureOf(catalog, s.courseId, s.lectureN as number);
  const touchIds = isReviewLectureTitle(lecture.title)
    ? []
    : lecture.conceptIds.filter((id) =>
        isStudyConcept(catalog.concepts[id]?.name ?? id, id),
      );
  rememberTouch(learner, catalog, touchIds, {
    courseId: s.courseId,
    lectureN: s.lectureN,
  });
  await saveLearner(learner);
  s.teachback = undefined;
  const stored =
    status === "shaky"
      ? "Stored as shaky. Next session will read the files, not this chat."
      : "Stored as debriefed. Next session will read the files, not this chat.";
  push(s, { role: "assistant", kind: "status", text: stored });
  s.inspect = await refreshInspect(s);
  const lectures = (catalog.lectures[s.courseId] ?? []).map((lec) => ({
    n: lec.n,
    status: normalizeLectureStatus(learner.progress[s.courseId]?.[String(lec.n)]),
  }));
  const remaining = nextIncompleteLectureN(lectures);
  if (remaining == null) {
    const courseHits = hitConceptIds(catalog, learner.progress, s.courseId);
    if (courseHits.length) {
      s.quizMode = "course_end";
      push(s, {
        role: "assistant",
        kind: "status",
        text: "Last lecture in the course. Five questions to close it: weighted toward the concepts that do more work here.",
      });
      await persist(s);
      await writeAndEmitQuiz(s);
      return;
    }
  }
  if (shouldOfferDebriefQuiz()) {
    s.quizMode = "after_debrief";
    push(s, {
      role: "assistant",
      kind: "status",
      text: "Five questions to close the debrief: three from this lecture, two from things going cold. Concepts, not calculations.",
    });
    await persist(s);
    await writeAndEmitQuiz(s);
    return;
  }
  s.phase = "done";
  await persist(s);
  await closeAgent(s);
}

async function queueRewrite(s: Session, evidence: string): Promise<void> {
  const job = (s.rewrite ?? Promise.resolve())
    .catch(() => undefined)
    .then(() =>
      withAgent(s, async (agent) => {
        const learner = await loadLearner();
        const next = await rewriteLearnerNotes({
          agent,
          priorProfile: learner.profile,
          evidence,
        });
        learner.profile = next.profile;
        await saveLearner(learner);
        s.inspect = await refreshInspect(s);
        await persist(s);
      }),
    )
    .catch(() => undefined);
  s.rewrite = job;
}

async function closeAgent(s: Session): Promise<void> {
  if (s.rewrite) {
    await s.rewrite.catch(() => undefined);
  }
  if (s.agent) {
    try {
      await s.agent.close();
    } catch {
      /* already closed */
    }
    s.agent = undefined;
  }
}

async function contextOf(s: Session): Promise<ContextSlice> {
  const catalog = await loadCatalog();
  const learner = await loadLearner();
  const lecture =
    s.kind !== "find" && s.courseId && s.lectureN != null
      ? lectureOf(catalog, s.courseId, s.lectureN)
      : undefined;
  const quested = conceptsFromDoneQuests(catalog, learner.sideQuests);
  const conceptSources =
    s.kind === "concept" && s.conceptId
      ? coursesForConcept(catalog, s.conceptId)
      : [];
  const ids =
    s.kind === "concept" && s.conceptId
      ? [s.conceptId]
      : expandConceptIds(
          { ...catalog, concepts: quested.concepts },
          [
            ...(lecture?.conceptIds ?? []),
            ...s.quizQueue,
            ...(s.conceptId ? [s.conceptId] : []),
          ],
        );
  const teachings = teachingSlice(await teachingsForIds(ids), ids);
  const sourceBlock = conceptSources.length
    ? [
        "Only cite a course if it is listed here.",
        ...conceptSources.map(
          (c) => `${c.title} — ${c.instructors}\n${c.sourceUrl}`,
        ),
      ].join("\n\n")
    : s.kind === "concept"
      ? "No course in Graham's library tags this concept. Do not name a course."
      : s.kind === "find"
        ? ""
        : catalog.blurbs[s.courseId] ?? "";
  return {
    profile: learner.profile,
    courseBlurb: sourceBlock,
    lectureTitle:
      s.kind === "concept"
        ? undefined
        : lecture
          ? `${lecture.n}. ${lecture.title}`
          : s.questTitle
            ? `Side quest: ${s.questTitle}`
            : undefined,
    concepts: ids
      .map((id) => `${id}: ${quested.concepts[id]?.name ?? id}`)
      .join("\n"),
    knowledgeSlice: knowledgeSlice(learner.knowledge, ids),
    teachings,
    task: s.kind === "concept" ? "concept" : undefined,
  };
}

async function refreshInspect(s: Session): Promise<InspectPayload> {
  const catalog = await loadCatalog();
  const learner = await loadLearner();
  return buildInspect(catalog, learner, {
    kind: s.kind,
    courseId: s.courseId,
    lectureN: s.lectureN,
    questTitle: s.questTitle,
  });
}

async function buildInspect(
  catalog: Catalog,
  learner: LearnerState,
  input: {
    kind: SessionKind;
    courseId: string;
    lectureN?: number;
    questTitle?: string;
  },
): Promise<InspectPayload> {
  if (input.kind === "find" || !input.courseId) {
    return {
      courseId: "",
      courseTitle: input.questTitle?.trim() || "New course",
      courseBlurb: "",
      knowledgeSlice: "",
      lectureSummary: "",
      sideQuests: learner.sideQuests.filter(
        (q) => q.status === "open" || q.status === "parked",
      ),
    };
  }
  const course = courseOf(catalog, input.courseId);
  const lecture =
    input.lectureN != null
      ? lectureOf(catalog, input.courseId, input.lectureN)
      : undefined;
  const ids = expandConceptIds(catalog, lecture?.conceptIds ?? []);
  const summary =
    lecture != null
      ? await readLectureSummary(input.courseId, lecture.n)
      : "";
  return {
    courseId: course.id,
    courseTitle: course.title,
    lecture,
    courseBlurb: catalog.blurbs[course.id] ?? "",
    knowledgeSlice: knowledgeSlice(learner.knowledge, ids),
    lectureSummary: summary,
    sideQuests: learner.sideQuests.filter(
      (q) => q.status === "open" || q.status === "parked",
    ),
  };
}

function phaseForStart(kind: SessionKind): Phase {
  if (kind === "debrief") return "awaiting_summary";
  if (kind === "quiz") return "quiz_item";
  if (kind === "concept") return "concept";
  if (kind === "find") return "find";
  return "quest";
}

function workingLabel(s: Session): string {
  if (s.kind === "debrief") return "Reading summary…";
  if (s.kind === "quiz") return "Writing a question…";
  if (s.kind === "quest") return "Opening the quest…";
  if (s.kind === "concept") return "Generating text…";
  if (s.kind === "find") return "Looking for lecture series…";
  return "Working…";
}

function push(
  s: Session,
  msg: Omit<ChatMessage, "id" | "at">,
): void {
  s.messages.push({
    ...msg,
    id: randomUUID(),
    at: Date.now(),
  });
}

function get(id: string): Session {
  const s = sessions.get(id);
  if (!s) throw new Error("Unknown session.");
  return s;
}

async function withBusy(
  s: Session,
  fn: () => Promise<void>,
  label = "Working…",
): Promise<SessionSnapshot> {
  if (s.busy) throw new Error("Session is already working.");
  s.busy = true;
  s.error = undefined;
  s.workingOn = label;
  s.cancel = new AbortController();
  try {
    await fn();
  } catch (err) {
    const aborted = s.cancel.signal.aborted;
    const message = aborted
      ? "Interrupted."
      : err instanceof Error
        ? err.message
        : String(err);
    s.error = aborted ? undefined : message;
    if (message) {
      push(s, { role: "assistant", kind: "status", text: message });
    }
  } finally {
    s.busy = false;
    s.workingOn = undefined;
    s.generatingOutline = undefined;
    s.cancel = undefined;
    await persist(s);
  }
  return snapshot(s);
}

async function withAgent<T>(
  s: Session,
  fn: (agent: LocalAgent) => Promise<T>,
): Promise<T> {
  const mine = (s.agentQueue ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => sendOnAgent(s, fn));
  s.agentQueue = mine.then(
    () => undefined,
    () => undefined,
  );
  return mine;
}

async function sendOnAgent<T>(
  s: Session,
  fn: (agent: LocalAgent) => Promise<T>,
): Promise<T> {
  if (!s.agent) {
    s.agent = await createStudyAgent();
    s.primed = newPriming();
  }
  try {
    return await fn(s.agent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/authentication error/i.test(msg)) throw err;
    try {
      await s.agent.close();
    } catch {
      /* replace anyway */
    }
    s.agent = await createStudyAgent();
    s.primed = newPriming();
    return fn(s.agent);
  }
}

function snapshot(s: Session): SessionSnapshot {
  return {
    id: s.id,
    kind: s.kind,
    phase: s.phase,
    courseId: s.courseId,
    lectureN: s.lectureN,
    questTitle: s.questTitle,
    questId: s.questId,
    conceptId: s.conceptId,
    offersConceptQuiz: s.offersConceptQuiz,
    debrief: s.debrief,
    quiz: s.quiz ? { ...s.quiz, choices: s.quiz.choices.map((c) => ({ ...c })) } : undefined,
    quizQueue: s.quizQueue.slice(),
    quizMode: s.quizMode,
    coveredConcepts: s.coveredConcepts.slice(),
    pendingCorrection: s.pendingCorrection,
    wantQuestQuiz: s.wantQuestQuiz,
    questTeachbackOk: s.questTeachbackOk,
    questQuizOk: s.questQuizOk,
    teachback: s.teachback,
    inspect: s.inspect,
    messages: s.messages.map((msg) => ({ ...msg })),
    offeredQuests: s.offeredQuests.slice(),
    offeredCourses: s.offeredCourses.slice(),
    generatingOutline: s.generatingOutline?.slice(),
    busy: s.busy,
    workingOn: s.workingOn,
    error: s.error,
  };
}

function persistable(s: Session): unknown {
  const { agent, primed, agentQueue, cancel, rewrite, generatingOutline, ...rest } =
    s;
  void agent;
  void primed;
  void agentQueue;
  void cancel;
  void rewrite;
  void generatingOutline;
  return rest;
}

async function persist(s: Session): Promise<void> {
  await writeSession(s.id, persistable(s));
}

function hydrate(raw: unknown): Session | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Partial<Session>;
  if (typeof o.id !== "string" || typeof o.courseId !== "string") {
    return undefined;
  }
  if (!o.inspect || !Array.isArray(o.messages)) return undefined;
  return {
    id: o.id,
    kind:
      o.kind === "quiz" ||
      o.kind === "quest" ||
      o.kind === "concept" ||
      o.kind === "find"
        ? o.kind
        : "debrief",
    phase: (o.phase as Phase) || "done",
    courseId: o.courseId,
    lectureN: o.lectureN,
    questId: o.questId,
    questTitle: o.questTitle,
    conceptId: o.conceptId,
    offersConceptQuiz: o.offersConceptQuiz,
    debrief: o.debrief,
    quiz: o.quiz,
    quizQueue: o.quizQueue ?? [],
    quizBank: o.quizBank ?? [],
    quizMode: o.quizMode,
    coveredConcepts: o.coveredConcepts ?? [],
    pendingCorrection: o.pendingCorrection,
    wantQuestQuiz: o.wantQuestQuiz,
    questTeachbackOk: o.questTeachbackOk,
    questQuizOk: o.questQuizOk,
    teachback: o.teachback,
    inspect: o.inspect,
    messages: o.messages,
    offeredQuests: o.offeredQuests ?? [],
    offeredCourses: o.offeredCourses ?? [],
    busy: false,
    workingOn: undefined,
    error: o.error,
    primed: newPriming(),
  };
}

export type { SideQuest };
