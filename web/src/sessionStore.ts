export const PENDING_SESSION_ID = "pending";

const SESSION_KEY = "study-helper.session-id";
const COURSE_KEY = "study-helper.course-id";

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
