import { useEffect, useRef, useState } from "react";
import { api, createSession, getAuth, getCatalog, getSession, initCourse } from "./api";
import type { ChipAction } from "./components/CommandBox";
import { StudyView } from "./components/StudyView";
import {
  PENDING_SESSION_ID,
  forgetSession,
  loadCourseId,
  loadSessionId,
  rememberCourse,
  rememberSession,
} from "./sessionStore";
import { looksLikeCourseUrl, matchExistingCourse } from "./courseUrl";
import { nextIncompleteLectureN } from "./lectureProgress";
import { relatedNamesFor, seedConceptOutline } from "./conceptOutline";
import type {
  AuthStatus,
  CatalogPayload,
  InspectPayload,
  SessionSnapshot,
} from "./types";

export function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [courseId, setCourseId] = useState<string | null>(() => loadCourseId());
  const [lectureN, setLectureN] = useState<number | null>(null);
  const [initBusy, setInitBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getAuth()
      .then(setAuth)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    getCatalog()
      .then((c) => {
        setCatalog(c);
        setCourseId((id) => id ?? c.courses[0]?.id ?? null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  useEffect(() => {
    const id = loadSessionId();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
        try {
          const snap = await getSession(id);
          if (cancelled) return;
          rememberSession(snap.id);
          setSession(snap);
          if (snap.courseId) setCourseId(snap.courseId);
          setLectureN(snap.lectureN ?? null);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      forgetSession();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.id || session.id === PENDING_SESSION_ID) return;
    if (!busy && !session.busy) return;
    const id = session.id;
    const timer = window.setInterval(() => {
      void api
        .get(id, { lite: true })
        .then(setSession)
        .catch(() => undefined);
    }, session.generatingOutline?.length ? 500 : 1500);
    return () => window.clearInterval(timer);
  }, [busy, session?.id, session?.busy, Boolean(session?.generatingOutline?.length)]);

  useEffect(() => {
    if (session || !catalog || !courseId) return;
    const course = catalog.courses.find((c) => c.id === courseId);
    if (!course) return;
    setLectureN(nextIncompleteLectureN(course.lectures));
  }, [catalog, courseId, session]);

  async function run(
    fn: (signal: AbortSignal) => Promise<SessionSnapshot>,
    opts?: { quiet?: boolean },
  ): Promise<SessionSnapshot | undefined> {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    if (!opts?.quiet) setBusy(true);
    setError(null);
    try {
      const snap = await fn(ac.signal);
      rememberSession(snap.id);
      setSession(snap);
      if (snap.courseId) {
        setCourseId(snap.courseId);
        rememberCourse(snap.courseId);
      }
      if (!opts?.quiet) {
        void getCatalog().then(setCatalog).catch(() => undefined);
      }
      return snap;
    } catch (err) {
      if (ac.signal.aborted) {
        setError(null);
        return undefined;
      }
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null;
        if (!opts?.quiet) setBusy(false);
      }
    }
  }

  function onInterrupt() {
    abortRef.current?.abort();
    if (session && session.id !== PENDING_SESSION_ID) {
      void api.cancel(session.id).then(setSession).catch(() => undefined);
    }
    setBusy(false);
  }

  function onAction(action: ChipAction) {
    if (action === "reset") {
      forgetSession();
      setSession(null);
      setError(null);
      void getCatalog().then(setCatalog).catch(() => undefined);
      return;
    }
    if (!session) return;
    const id = session.id;
    if (action === "quit") {
      const drop =
        session.kind === "quest" || session.kind === "find";
      void run((signal) => api.quit(id, signal)).then((snap) => {
        if (!drop || !snap) return;
        forgetSession();
        setSession(null);
      });
    }
    else if (action === "skip") void run((signal) => api.skip(id, signal));
    else if (action === "next") void run((signal) => api.next(id, signal));
    else if (action === "finish") void run((signal) => api.finish(id, signal));
    else if (action === "acceptQuest") {
      const title = window.prompt(
        "Side quest?",
        session.offeredQuests[0]?.title ?? "",
      );
      if (!title?.trim()) return;
      void run((signal) => api.acceptQuest(id, title.trim(), signal));
    }
    else if (action === "doneQuest")
      void run((signal) => api.questStatus(id, "done", signal));
    else if (action === "conceptQuiz") {
      setSession((s) =>
        s?.kind === "concept"
          ? { ...s, quizMode: "concept", workingOn: "Opening quiz…" }
          : s,
      );
      void run((signal) => api.conceptQuiz(id, signal));
    }
  }

  const working = busy || Boolean(session?.busy);

  return (
    <StudyView
      auth={auth}
      session={session}
      catalog={catalog}
      error={error}
      busy={working}
      courseId={courseId}
      lectureN={lectureN}
      initBusy={initBusy}
      actions={{
        onSend: (text, mode) => {
          if (!session) return;
          void run((signal) =>
            mode === "ask"
              ? api.ask(session.id, text, signal)
              : api.teachback(session.id, text, signal),
          );
        },
        onAction,
        onInterrupt,
        onCourse: (id) => {
          rememberCourse(id);
          setCourseId(id);
          if (session) {
            forgetSession();
            setSession(null);
          }
        },
        onLecture: (n) => setLectureN(n),
        onStart: (kind) => {
          const cid = courseId ?? catalog?.courses[0]?.id;
          if (!cid) return;
          if (kind === "quiz") {
            void run((signal) =>
              createSession({ kind: "quiz", courseId: cid }, signal),
            );
            return;
          }
          const course = catalog?.courses.find((c) => c.id === cid);
          const n =
            course ? nextIncompleteLectureN(course.lectures) : lectureN;
          if (n == null) return;
          void run((signal) =>
            createSession({ kind, courseId: cid, lectureN: n }, signal),
          );
        },
        onQuest: (questId) => {
          const cid = courseId ?? catalog?.courses[0]?.id;
          if (!cid) return;
          void run((signal) =>
            createSession({ kind: "quest", courseId: cid, questId }, signal),
          );
        },
        onNewQuest: (title) => {
          const cid = courseId ?? catalog?.courses[0]?.id;
          if (!cid) return;
          void run((signal) =>
            createSession(
              {
                kind: "quest",
                courseId: cid,
                lectureN: lectureN ?? undefined,
                questTitle: title,
              },
              signal,
            ),
          );
        },
        onInitCourse: (text) => {
          const topic = text.trim();
          if (!topic) return;
          const hit = catalog
            ? matchExistingCourse(catalog.courses, topic)
            : undefined;
          if (hit) {
            setError(null);
            rememberCourse(hit.id);
            setCourseId(hit.id);
            if (session) {
              forgetSession();
              setSession(null);
            }
            return;
          }
          if (looksLikeCourseUrl(topic)) {
            setInitBusy(true);
            setError(null);
            void initCourse(topic)
              .then((result) => {
                setCatalog(result.catalog);
                setCourseId(result.course.id);
                rememberCourse(result.course.id);
              })
              .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : String(err)),
              )
              .finally(() => setInitBusy(false));
            return;
          }
          setSession(
            pendingFindSession({
              catalog,
              topic,
              inspect: session?.inspect,
            }),
          );
          void run((signal) =>
            createSession({ kind: "find", questTitle: topic }, signal),
          ).then((snap) => {
            if (snap) return;
            setSession((cur) =>
              cur?.id === PENDING_SESSION_ID ? null : cur,
            );
          });
        },
        onPickQuiz: (choiceId) => {
          if (!session) return;
          void run((signal) => api.quizChoice(session.id, choiceId, signal));
        },
        onPickCourse: (url) => {
          if (!session || session.kind !== "find") return;
          void run((signal) => api.pickCourse(session.id, url, signal));
        },
        onConcept: (conceptId) => {
          const cid = courseId ?? catalog?.courses[0]?.id;
          if (!cid || !catalog?.concepts[conceptId]) return;
          if (
            session?.kind === "concept" &&
            session.conceptId === conceptId &&
            session.phase === "concept" &&
            session.id !== PENDING_SESSION_ID
          ) {
            return;
          }
          const stored = Boolean(
            catalog.conceptTeachings?.[conceptId]?.trim(),
          );
          const reuseId =
            session?.kind === "concept" &&
            session.id &&
            session.id !== PENDING_SESSION_ID
              ? session.id
              : undefined;
          const prevId = session?.id;
          if (!reuseId && prevId && prevId !== PENDING_SESSION_ID) {
            void api.cancel(prevId).catch(() => undefined);
          }
          setSession(
            pendingConceptSession({
              catalog,
              courseId: cid,
              conceptId,
              sessionId: reuseId,
              inspect: session?.inspect,
            }),
          );
          void run(
            (signal) =>
              reuseId
                ? api.openConcept(reuseId, conceptId, signal)
                : createSession(
                    { kind: "concept", courseId: cid, conceptId },
                    signal,
                  ),
            { quiet: stored },
          );
        },
      }}
    />
  );
}

function pendingFindSession(opts: {
  catalog: CatalogPayload | null;
  topic: string;
  inspect?: InspectPayload;
}): SessionSnapshot {
  return {
    id: PENDING_SESSION_ID,
    kind: "find",
    phase: "find",
    courseId: "",
    questTitle: opts.topic,
    quizQueue: [],
    coveredConcepts: [],
    inspect: opts.inspect ?? {
      courseId: "",
      courseTitle: opts.topic,
      courseBlurb: "",
      knowledgeSlice: "",
      lectureSummary: "",
      sideQuests: opts.catalog?.openQuests ?? [],
    },
    messages: [
      {
        id: "finding",
        role: "assistant",
        kind: "status",
        text: "Looking for lecture series…",
        at: Date.now(),
      },
    ],
    offeredQuests: [],
    offeredCourses: [],
    busy: true,
    workingOn: "Looking for lecture series…",
  };
}

function inspectFallback(
  catalog: CatalogPayload,
  courseId: string,
  prior?: InspectPayload,
): InspectPayload {
  if (prior?.courseId === courseId) return prior;
  const course = catalog.courses.find((c) => c.id === courseId);
  return {
    courseId,
    courseTitle: course?.title ?? "",
    courseBlurb: course?.blurb ?? "",
    knowledgeSlice: "",
    lectureSummary: "",
    sideQuests: catalog.openQuests ?? [],
  };
}

function pendingConceptSession(opts: {
  catalog: CatalogPayload;
  courseId: string;
  conceptId: string;
  sessionId?: string;
  inspect?: InspectPayload;
}): SessionSnapshot {
  const def = opts.catalog.concepts[opts.conceptId];
  const stored = opts.catalog.conceptTeachings?.[opts.conceptId]?.trim();
  return {
    id: opts.sessionId ?? PENDING_SESSION_ID,
    kind: "concept",
    phase: "concept",
    courseId: opts.courseId,
    conceptId: opts.conceptId,
    questTitle: def?.name ?? opts.conceptId,
    offersConceptQuiz: Boolean(def?.parentId),
    quizQueue: [],
    coveredConcepts: [],
    inspect: inspectFallback(opts.catalog, opts.courseId, opts.inspect),
    messages: stored
      ? [
          {
            id: `concept-teaching:${opts.conceptId}`,
            role: "assistant",
            kind: "text",
            text: stored,
            at: Date.now(),
          },
        ]
      : [
          {
            id: "generating",
            role: "assistant",
            kind: "status",
            text: "Generating text…",
            at: Date.now(),
          },
        ],
    offeredQuests: [],
    busy: !stored,
    workingOn: stored ? undefined : "Generating text…",
    generatingOutline: stored
      ? undefined
      : seedConceptOutline(
          def?.name ?? opts.conceptId,
          def?.parentId
            ? opts.catalog.concepts[def.parentId]?.name
            : undefined,
          relatedNamesFor(opts.catalog.concepts, opts.conceptId),
        ),
  };
}
