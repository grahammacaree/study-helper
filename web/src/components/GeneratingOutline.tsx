import { useEffect, useState } from "react";
import { Prose } from "../prose";

const BEAT_MS = 1100;

/** Host-owned. No extra model turn. */
export const DEBRIEF_BEATS = [
  "Reading what you wrote",
  "Checking the definitions",
  "Watching for inverted implications",
  "Seeing how this sits on the tags",
];

/** Host-owned. Keep in lockstep with `server/conceptOutline.ts`. */
export const QUEST_BEATS = [
  "Getting the idea on the table",
  "When you'd actually use this",
  "The mix-up that usually bites",
];

/** Host-owned. Keep in lockstep with `server/conceptOutline.ts`. */
export const FIND_BEATS = [
  "Looking for a public lecture series",
  "Checking listings you already have",
  "Picking something you can watch",
];

export function useCyclingBeat(
  beats: string[] | undefined,
  enabled: boolean,
): number {
  const [index, setIndex] = useState(0);
  const key = beats?.join("\n") ?? "";

  useEffect(() => {
    setIndex(0);
  }, [key]);

  useEffect(() => {
    if (!enabled || !key) return;
    const list = key.split("\n");
    if (list.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((n) => (n + 1) % list.length);
    }, BEAT_MS);
    return () => window.clearInterval(timer);
  }, [enabled, key]);

  if (!enabled || !beats?.length) return 0;
  return index % beats.length;
}

export function GeneratingOutline({
  beats,
  index = 0,
  label = "Working",
}: {
  beats: string[];
  index?: number;
  label?: string;
}) {
  if (!beats.length) return null;
  const at = Math.min(Math.max(index, 0), beats.length - 1);
  const current = beats[at];

  return (
    <div className="gen-stream" aria-label={label} aria-live="off">
      <div key={current} className="gen-stream-row">
        <Prose text={current} />
      </div>
    </div>
  );
}
