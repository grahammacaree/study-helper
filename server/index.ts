import express from "express";
import { authStatus } from "./agent.js";
import { cursorApiKey, serverPort } from "./env.js";
import {
  acceptQuest,
  answerQuizChoice,
  cancelWork,
  catalogPayload,
  finishQuest,
  finishSession,
  getSession,
  nextAfterQuestion,
  quitSession,
  restoreSessions,
  skipItem,
  startConceptQuiz,
  startSession,
  submitAsk,
  submitTeachback,
} from "./session.js";
import { initCourseFromUrl } from "./initCourse.js";
import type { SessionKind } from "./types.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

function sessionId(req: express.Request): string {
  const id = req.params.id;
  if (typeof id !== "string") throw new Error("Missing session id.");
  return id;
}

app.get("/api/auth", async (_req, res) => {
  const status = await authStatus();
  res.json({
    ...status,
    hasKey: Boolean(cursorApiKey()),
  });
});

app.get("/api/catalog", async (_req, res) => {
  try {
    res.json(await catalogPayload());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/courses", async (req, res) => {
  try {
    const url = String((req.body as { url?: unknown }).url ?? "");
    const result = await initCourseFromUrl(url);
    const catalog = await catalogPayload();
    res.json({ ...result, catalog });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/sessions", async (req, res) => {
  try {
    const { kind, courseId, lectureN, questTitle, questId, conceptId } = req.body as {
      kind?: SessionKind;
      courseId?: string;
      lectureN?: number;
      questTitle?: string;
      questId?: string;
      conceptId?: string;
    };
    if (!kind || !courseId) {
      res.status(400).json({ error: "kind and courseId are required." });
      return;
    }
    const session = await startSession({
      kind,
      courseId,
      lectureN,
      questTitle,
      questId,
      conceptId,
    });
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/sessions/:id", (req, res) => {
  try {
    res.json(getSession(sessionId(req), req.query.lite === "1"));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

function postHandler(
  fn: (id: string, body: Record<string, unknown>) => Promise<unknown>,
) {
  return async (req: express.Request, res: express.Response) => {
    try {
      res.json(await fn(sessionId(req), (req.body ?? {}) as Record<string, unknown>));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}

app.post(
  "/api/sessions/:id/ask",
  postHandler((id, body) => submitAsk(id, String(body.text ?? ""))),
);
app.post(
  "/api/sessions/:id/teachback",
  postHandler((id, body) => submitTeachback(id, String(body.text ?? ""))),
);
app.post("/api/sessions/:id/skip", postHandler((id) => skipItem(id)));
app.post(
  "/api/sessions/:id/quiz-choice",
  postHandler((id, body) => answerQuizChoice(id, String(body.choiceId ?? ""))),
);
app.post("/api/sessions/:id/next", postHandler((id) => nextAfterQuestion(id)));
app.post("/api/sessions/:id/finish", postHandler((id) => finishSession(id)));
app.post("/api/sessions/:id/quit", postHandler((id) => quitSession(id)));
app.post("/api/sessions/:id/cancel", postHandler((id) => cancelWork(id)));
app.post(
  "/api/sessions/:id/accept-quest",
  postHandler((id, body) =>
    acceptQuest(id, typeof body.title === "string" ? body.title : undefined),
  ),
);
app.post(
  "/api/sessions/:id/concept-quiz",
  postHandler((id) => startConceptQuiz(id)),
);
app.post(
  "/api/sessions/:id/quest-status",
  postHandler((id, body) => {
    const status = body.status === "parked" ? "parked" : "done";
    return finishQuest(id, status);
  }),
);

void restoreSessions().then(() => {
  app.listen(serverPort(), "127.0.0.1", () => {
    console.log(`Study helper API on http://127.0.0.1:${serverPort()}`);
  });
});
