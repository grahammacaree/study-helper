import type { LectureStatus } from "./types.js";

export function normalizeLectureStatus(raw: unknown): LectureStatus {
  if (raw === "complete" || raw === "debriefed" || raw === "shaky") {
    return "complete";
  }
  return "incomplete";
}

export function lectureIsComplete(raw: unknown): boolean {
  return normalizeLectureStatus(raw) === "complete";
}

export function nextIncompleteLectureN(
  lectures: { n: number; status: LectureStatus }[],
): number | null {
  const ordered = lectures.slice().sort((a, b) => a.n - b.n);
  return ordered.find((lec) => lec.status !== "complete")?.n ?? null;
}

export function lecturesAllComplete(
  lectures: { n: number }[],
  progress: Record<string, unknown> | undefined,
): boolean {
  if (!lectures.length) return false;
  return lectures.every((lec) => lectureIsComplete(progress?.[String(lec.n)]));
}
