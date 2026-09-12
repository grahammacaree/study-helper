import { useEffect, useRef, useState } from "react";
import { api, createSession, getAuth, getCatalog, getSession, initCourse } from "./api";
import type { ChipAction } from "./components/CommandBox";
import { StudyView } from "./components/StudyView";
import {
  forgetSession,
  loadCourseId,
  loadSessionId,
  rememberCourse,
  rememberSession,
} from "./sessionStore";
import { nextIncompleteLectureN } from "./lectureProgress";
import type {
  AuthStatus,
  CatalogPayload,
  InspectPayload,
  SessionSnapshot,
} from "./types";

const PENDING_SESSION_ID = "pending";

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
          setCourseId(snap.courseId);
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
    }, 1500);
    return () => window.clearInterval(timer);
  }, [busy, session?.id, session?.busy]);

  useEffect(() => {
    if (session || !catalog || !courseId) return;
    const course = catalog.courses.find((c) => c.id === courseId);
    if (!course) return;
    setLectureN(nextIncompleteLectureN(course.lectures));
  }, [catalog, courseId, session]);

  async function run(
    fn: (signal: AbortSignal) => Promise<SessionSnapshot>,
  ): Promise<SessionSnapshot | undefined> {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    try {
      const snap = await fn(ac.signal);
      rememberSession(snap.id);
      setSession(snap);
      void getCatalog().then(setCatalog).catch(() => undefined);
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
        setBusy(false);
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
      const dropQuest = session.kind === "quest";
      void run((signal) => api.quit(id, signal)).then((snap) => {
        if (!dropQuest || !snap) return;
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
    else if (action === "conceptQuiz")
      void run((signal) => api.conceptQuiz(id, signal));
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
        onInitCourse: (url) => {
          setInitBusy(true);
          setError(null);
          void initCourse(url)
            .then((result) => {
              setCatalog(result.catalog);
              setCourseId(result.course.id);
              rememberCourse(result.course.id);
            })
            .catch((err: unknown) =>
              setError(err instanceof Error ? err.message : String(err)),
            )
            .finally(() => setInitBusy(false));
        },
        onPickQuiz: (choiceId) => {
          if (!session) return;
          void run((signal) => api.quizChoice(session.id, choiceId, signal));
        },
        onConcept: (conceptId) => {
          const cid = courseId ?? catalog?.courses[0]?.id;
          if (!cid || !catalog?.concepts[conceptId]) return;
          const prevId = session?.id;
          if (prevId && prevId !== PENDING_SESSION_ID) {
            void api.cancel(prevId).catch(() => undefined);
          }
          setSession(
            pendingConceptSession({
              catalog,
              courseId: cid,
              conceptId,
              inspect: session?.inspect,
            }),
          );
          void run((signal) =>
            createSession({ kind: "concept", courseId: cid, conceptId }, signal),
          );
        },
      }}
    />
  );
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
  inspect?: InspectPayload;
}): SessionSnapshot {
  const def = opts.catalog.concepts[opts.conceptId];
  const stored = opts.catalog.conceptTeachings?.[opts.conceptId]?.trim();
  return {
    id: PENDING_SESSION_ID,
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
            id: "cached",
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
  };
}
