import { useEffect, useState } from "react";

const BEAT_MS = 1100;

export function useCyclingBeat(
  beats: string[] | undefined,
  enabled: boolean,
): string | undefined {
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

  if (!enabled || !beats?.length) return undefined;
  return beats[index % beats.length];
}

export function GeneratingOutline({ current }: { current: string }) {
  return (
    <p className="gen-beat" aria-label="Writing the teaching note" aria-live="off">
      <span key={current} className="gen-beat-text">
        {current}
      </span>
    </p>
  );
}
