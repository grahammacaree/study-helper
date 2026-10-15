export const PENDING_SESSION_ID = "pending";

const SESSION_KEY = "study-helper.session-id";
const COURSE_KEY = "study-helper.course-id";
const COMPOSE_PREFIX = "study-helper.compose.";

export function loadSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function rememberSession(id: string): void {
  localStorage.setItem(SESSION_KEY, id);
}

export function forgetSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function loadCourseId(): string | null {
  try {
    return localStorage.getItem(COURSE_KEY);
  } catch {
    return null;
  }
}

export function rememberCourse(id: string): void {
  localStorage.setItem(COURSE_KEY, id);
}

/** Survive tab discard / remount — drafts are per session id. */
export function loadComposeDraft(sessionId: string): string | null {
  if (!sessionId || sessionId === PENDING_SESSION_ID) return null;
  try {
    return sessionStorage.getItem(COMPOSE_PREFIX + sessionId);
  } catch {
    return null;
  }
}

export function rememberComposeDraft(sessionId: string, text: string): void {
  if (!sessionId || sessionId === PENDING_SESSION_ID) return;
  try {
    if (text.trim()) sessionStorage.setItem(COMPOSE_PREFIX + sessionId, text);
    else sessionStorage.removeItem(COMPOSE_PREFIX + sessionId);
  } catch {
    /* private mode / quota */
  }
}

export function forgetComposeDraft(sessionId: string): void {
  if (!sessionId || sessionId === PENDING_SESSION_ID) return;
  try {
    sessionStorage.removeItem(COMPOSE_PREFIX + sessionId);
  } catch {
    /* */
  }
}
