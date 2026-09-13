import type { AuthStatus, CatalogPayload, SessionSnapshot } from "./types";

async function parse<T>(res: Response): Promise<T> {
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error(
      res.ok
        ? "Study helper API returned an empty response."
        : `Study helper API error (${res.status}).`,
    );
  }
  let body: T & { error?: string };
  try {
    body = JSON.parse(raw) as T & { error?: string };
  } catch {
    throw new Error("Study helper API returned invalid JSON.");
  }
  if (!res.ok) {
    throw new Error(body.error || res.statusText);
  }
  return body;
}

async function call<T>(
  input: string,
  init?: RequestInit,
  parseAs: (res: Response) => Promise<T> = (res) => parse<T>(res),
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error(
      "Cannot reach the study helper API. Start it with `npm run dev`.",
    );
  }
  return parseAs(res);
}

export function getAuth(): Promise<AuthStatus> {
  return call<AuthStatus>("/api/auth");
}

export function getCatalog(): Promise<CatalogPayload> {
  return call<CatalogPayload>("/api/catalog");
}

export function initCourse(url: string): Promise<{
  course: { id: string; title: string };
  lectureCount: number;
  siteUpdated: boolean;
  catalog: CatalogPayload;
}> {
  return call("/api/courses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

export function createSession(
  input: {
    kind: "debrief" | "quiz" | "quest" | "concept" | "find";
    courseId?: string;
    lectureN?: number;
    questTitle?: string;
    questId?: string;
    conceptId?: string;
  },
  signal?: AbortSignal,
): Promise<SessionSnapshot> {
  return call<SessionSnapshot>("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
}

export function getSession(
  id: string,
  opts?: { lite?: boolean; signal?: AbortSignal },
): Promise<SessionSnapshot> {
  const q = opts?.lite ? "?lite=1" : "";
  return call<SessionSnapshot>(`/api/sessions/${id}${q}`, {
    signal: opts?.signal,
  });
}

function post(
  id: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<SessionSnapshot> {
  return call<SessionSnapshot>(`/api/sessions/${id}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
    signal,
  });
}

export const api = {
  get: getSession,
  ask: (id: string, text: string, signal?: AbortSignal) =>
    post(id, "ask", { text }, signal),
  teachback: (id: string, text: string, signal?: AbortSignal) =>
    post(id, "teachback", { text }, signal),
  skip: (id: string, signal?: AbortSignal) => post(id, "skip", undefined, signal),
  quizChoice: (id: string, choiceId: string, signal?: AbortSignal) =>
    post(id, "quiz-choice", { choiceId }, signal),
  next: (id: string, signal?: AbortSignal) => post(id, "next", undefined, signal),
  finish: (id: string, signal?: AbortSignal) =>
    post(id, "finish", undefined, signal),
  quit: (id: string, signal?: AbortSignal) => post(id, "quit", undefined, signal),
  cancel: (id: string) => post(id, "cancel"),
  acceptQuest: (id: string, title?: string, signal?: AbortSignal) =>
    post(id, "accept-quest", title ? { title } : {}, signal),
  questStatus: (id: string, status: "parked" | "done", signal?: AbortSignal) =>
    post(id, "quest-status", { status }, signal),
  conceptQuiz: (id: string, signal?: AbortSignal) =>
    post(id, "concept-quiz", undefined, signal),
  openConcept: (id: string, conceptId: string, signal?: AbortSignal) =>
    post(id, "open-concept", { conceptId }, signal),
  pickCourse: (id: string, url: string, signal?: AbortSignal) =>
    post(id, "pick-course", { url }, signal),
};
