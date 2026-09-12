import { useEffect, useRef, useState } from "react";
import { Octicon } from "../components/Octicon";
import { StudyView, type StudyActions } from "../components/StudyView";
import { AUTH_MISSING, AUTH_OK, FIX_CATALOG, SCENARIOS } from "./fixtures";

const noop: StudyActions = {
  onSend: () => undefined,
  onAction: () => undefined,
  onInterrupt: () => undefined,
  onCourse: () => undefined,
  onLecture: () => undefined,
  onStart: () => undefined,
  onQuest: () => undefined,
  onNewQuest: () => undefined,
  onInitCourse: () => undefined,
  onPickQuiz: () => undefined,
  onConcept: () => undefined,
};

export function DesignMode() {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const scenario = SCENARIOS[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (typing) return;
      if (e.key === "]") setIndex((i) => (i + 1) % SCENARIOS.length);
      else if (e.key === "[")
        setIndex((i) => (i - 1 + SCENARIOS.length) % SCENARIOS.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <>
      <StudyView
        key={scenario.id}
        auth={scenario.id === "no-key" ? AUTH_MISSING : AUTH_OK}
        session={scenario.session}
        catalog={scenario.catalog ?? FIX_CATALOG}
        error={scenario.error ?? null}
        busy={Boolean(scenario.busy)}
        courseId="algorithms-6006"
        lectureN={4}
        actions={noop}
      />
      <div className="design-dock" ref={panel}>
        {open && (
          <div className="design-panel" role="dialog" aria-label="Design states">
            <ul className="design-list">
              {SCENARIOS.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={i === index ? "design-item current" : "design-item"}
                    aria-current={i === index}
                    onClick={() => {
                      setIndex(i);
                      setOpen(false);
                    }}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
            <p className="design-hint">
              <kbd>[</kbd> <kbd>]</kbd> to step · fixtures only, controls inert
            </p>
          </div>
        )}
        <button
          type="button"
          className="design-fab"
          aria-expanded={open}
          aria-label={
            open ? "Close design states" : `Design states — ${scenario.label}`
          }
          title={scenario.label}
          onClick={() => setOpen((v) => !v)}
        >
          <Octicon name={open ? "x" : "plus"} size={20} />
        </button>
      </div>
    </>
  );
}
