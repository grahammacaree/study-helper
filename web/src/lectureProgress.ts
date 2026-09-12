import type { LectureStatus } from "./types";

export function normalizeLectureStatus(raw: unknown): LectureStatus {
  if (raw === "complete" || raw === "debriefed" || raw === "shaky") {
    return "complete";
  }
  return "incomplete";
}

export function nextIncompleteLectureN(
  lectures: { n: number; status: LectureStatus }[],
): number | null {
  const ordered = lectures.slice().sort((a, b) => a.n - b.n);
  return ordered.find((lec) => lec.status !== "complete")?.n ?? null;
}
