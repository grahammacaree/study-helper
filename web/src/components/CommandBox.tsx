import { useRef, useState } from "react";
import { QUEST_DONE_HINT, questCanMarkDone } from "../questReady";
import type { Phase, SessionSnapshot } from "../types";
import { insertTex, SymbolPicker } from "./SymbolPicker";

export type ChipAction =
  | "skip"
  | "next"
  | "finish"
  | "quit"
  | "reset"
  | "acceptQuest"
  | "doneQuest"
  | "conceptQuiz";

export function CommandBox({
  session,
  disabled,
  ready = true,
  onSend,
  onAction,
  onInterrupt,
}: {
  session: SessionSnapshot | null;
  disabled: boolean;
  ready?: boolean;
  onSend: (text: string, mode: "ask" | "teachback") => void;
  onAction: (action: ChipAction) => void;
  onInterrupt: () => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"ask" | "teachback">("teachback");
  const field = useRef<HTMLTextAreaElement>(null);
  const phase = session?.phase;
  const textMode = canSubmitText(phase);
  const canSend = textMode && text.trim().length > 0;
  const chips = chipsFor(session);
  const availableModes = modesFor(session);
  const activeMode = availableModes.some((m) => m.id === mode)
    ? mode
    : (availableModes[0]?.id ?? "ask");
  const prompt = textMode ? promptFor(session, activeMode) : undefined;
  const showBar = !disabled && chips.length > 0;
  const showForm = textMode && !disabled;
  const blocked = disabled || !ready;

  return (
    <div className="command-box">
      {disabled && (
        <div className="work-row" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>
            {session?.generatingOutline?.length
              ? "Working"
              : session?.workingOn || "Working…"}
          </span>
          <button type="button" className="secondary" onClick={onInterrupt}>
            Interrupt
          </button>
        </div>
      )}
      {!disabled && showBar && (
        <div className="command-bar">
          <div className="chips" role="group" aria-label="Study actions">
            {chips.map((chip) => (
              <button
                key={chip.action}
                type="button"
                className={chip.primary ? undefined : "secondary"}
                disabled={blocked}
                onClick={() => onAction(chip.action)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {showForm && (
        <>
          {(prompt || availableModes.length > 1) && (
            <div className="compose-head">
              {prompt ? (
                <label className="compose-prompt" htmlFor="command">
                  {prompt}
                </label>
              ) : null}
              {availableModes.length > 1 && (
                <div
                  className="command-mode"
                  role="tablist"
                  aria-label="Message type"
                >
                  {availableModes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      id={`mode-${m.id}`}
                      aria-controls="command-panel"
                      aria-selected={activeMode === m.id}
                      className={activeMode === m.id ? "tab current" : "tab"}
                      onClick={() => setMode(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div
            className="compose-panel"
            role="tabpanel"
            id="command-panel"
            aria-labelledby={`mode-${activeMode}`}
          >
            <textarea
              id="command"
              ref={field}
              aria-label={prompt ? undefined : "Message"}
              rows={3}
              value={text}
              disabled={blocked}
              placeholder="TeX welcome: $P \\subsetneq EXP$ or $$...$$"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend && !blocked) {
                    onSend(text, activeMode);
                    setText("");
                  }
                }
              }}
            />
            <div className="row">
              <button
                type="button"
                disabled={blocked || !canSend}
                onClick={() => {
                  onSend(text, activeMode);
                  setText("");
                }}
              >
                Send
              </button>
              <SymbolPicker
                disabled={blocked}
                onPick={(tex) => {
                  const el = field.current;
                  const start = el?.selectionStart ?? text.length;
                  const end = el?.selectionEnd ?? text.length;
                  const { next, cursor } = insertTex(text, start, end, tex);
                  setText(next);
                  requestAnimationFrame(() => {
                    el?.focus();
                    el?.setSelectionRange(cursor, cursor);
                  });
                }}
              />
              <span className="muted compose-hint">
                Shift+Enter for a newline. Maths render as{" "}
                <a
                  href="https://katex.org/docs/supported.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  TeX
                </a>
                .
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function modesFor(
  session: SessionSnapshot | null,
): { id: "teachback" | "ask"; label: string }[] {
  if (session?.phase === "quiz_item") {
    return [{ id: "ask", label: "Ask" }];
  }
  if (session?.kind === "concept" || session?.kind === "find") {
    return [{ id: "ask", label: "Ask" }];
  }
  const summary = session?.phase === "awaiting_summary";
  return [
    { id: "teachback", label: summary ? "Summary" : "Teach-back" },
    { id: "ask", label: "Ask" },
  ];
}

function canSubmitText(phase: Phase | undefined): boolean {
  return (
    phase === "awaiting_summary" ||
    phase === "debrief" ||
    phase === "correction_gate" ||
    phase === "quiz_item" ||
    phase === "quest" ||
    phase === "quest_gate" ||
    phase === "concept" ||
    phase === "find"
  );
}

function promptFor(
  session: SessionSnapshot | null,
  mode: "ask" | "teachback",
): string | undefined {
  if (mode === "ask") return undefined;
  if (session?.phase === "awaiting_summary") {
    return "Paste the summary you wrote after the lecture";
  }
  if (session?.phase === "correction_gate") {
    return "Optional: say the corrected idea in your own words";
  }
  if (session?.phase === "quest") {
    return undefined;
  }
  if (session?.phase === "quest_gate") {
    return "In your own words";
  }
  return "Anything to add?";
}

function chipsFor(
  session: SessionSnapshot | null,
): { action: ChipAction; label: string; primary?: boolean }[] {
  if (!session) return [];
  switch (session.phase) {
    case "debrief":
      return [
        { action: "finish", label: "Finish", primary: true },
        { action: "acceptQuest", label: "Side quest" },
        { action: "quit", label: "Quit" },
      ];
    case "correction_gate":
      return [
        { action: "finish", label: "Finish", primary: true },
        ...(session.teachback?.kind === "question_after"
          ? [{ action: "next" as const, label: "Continue" }]
          : []),
        { action: "skip", label: "Leave shaky" },
        { action: "acceptQuest", label: "Side quest" },
        { action: "quit", label: "Quit" },
      ];
    case "quiz_item":
      return session.quizMode === "after_debrief" ||
        session.quizMode === "course_end" ||
        session.quizMode === "quest" ||
        session.quizMode === "concept"
        ? []
        : [
            { action: "skip", label: "Skip this" },
            ...(session.kind === "quest"
              ? []
              : [{ action: "quit" as const, label: "Quit" }]),
          ];
    case "quiz_wrap":
      return session.kind === "quest" || session.kind === "concept"
        ? [{ action: "finish", label: "Finish", primary: true }]
        : session.quizMode === "after_debrief" || session.quizMode === "course_end"
        ? [{ action: "finish", label: "Finish", primary: true }]
        : [
            { action: "finish", label: "Finish", primary: true },
            { action: "quit", label: "Quit" },
          ];
    case "concept":
      return [];
    case "find":
      return [];
    case "quest":
      return [];
    case "quest_gate":
      return [
        ...(session.teachback?.kind === "question_after"
          ? [{ action: "next" as const, label: "Continue" }]
          : []),
      ];
    case "awaiting_summary":
      return [{ action: "quit", label: "Quit" }];
    case "done":
      return [{ action: "reset", label: "New session", primary: true }];
    default:
      return [];
  }
}

export function questHeaderActions(
  session: SessionSnapshot | null,
): {
  action: ChipAction;
  label: string;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}[] {
  if (!session) return [];
  if (session.kind === "concept") {
    if (session.phase !== "concept" || !session.offersConceptQuiz) return [];
    return [{ action: "conceptQuiz", label: "Quiz", primary: true }];
  }
  if (session.kind === "find") {
    if (session.phase === "done") return [];
    return [{ action: "quit", label: "Quit" }];
  }
  if (session.kind !== "quest") return [];
  if (session.phase === "done") return [];
  const ready = questCanMarkDone(session);
  return [
    {
      action: "doneQuest",
      label: "Done",
      primary: true,
      disabled: !ready,
      title: ready ? undefined : QUEST_DONE_HINT,
    },
    { action: "quit", label: "Quit" },
  ];
}
