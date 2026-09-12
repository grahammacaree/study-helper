import {
  isQuestDisclaimer,
  questPaneTitle,
  stripQuestChrome,
} from "../questChrome";
import type { AuthStatus, SessionSnapshot } from "../types";
import { CommandBox, questHeaderActions, type ChipAction } from "./CommandBox";
import { Transcript } from "./Transcript";

export function ChatColumn({
  auth,
  session,
  error,
  busy,
  onSend,
  onAction,
  onInterrupt,
  onPickQuiz,
  onConcept,
}: {
  auth: AuthStatus | null;
  session: SessionSnapshot | null;
  error: string | null;
  busy: boolean;
  onSend: (text: string, mode: "ask" | "teachback") => void;
  onAction: (action: ChipAction) => void;
  onInterrupt: () => void;
  onPickQuiz?: (choiceId: string) => void;
  onConcept?: (id: string) => void;
}) {
  const statusError = error || session?.error;
  const working = busy || session?.busy;
  const title = session
    ? session.kind === "quiz"
      ? session.inspect.lecture
        ? "Quiz"
        : "Review"
      : session.kind === "quest"
        ? questPaneTitle(session.questTitle ?? "")
        : session.kind === "concept"
          ? session.questTitle || "Concept"
          : "Debrief"
    : "Study";
  const sub =
    session?.kind === "quest" || session?.kind === "concept"
      ? ""
      : session
        ? [
            session.inspect.courseTitle,
            session.inspect.lecture
              ? `L${session.inspect.lecture.n}`
              : session.questTitle,
          ]
            .filter(Boolean)
            .join(" · ")
        : "Self-directed, not an exam";
  const questTitle = session?.questTitle || "";
  const messages = (session?.messages ?? [])
    .filter((msg) => !(msg.kind === "status" && isQuestDisclaimer(msg.text)))
    .map((msg) =>
      session?.kind === "quest" && msg.kind === "text"
        ? { ...msg, text: stripQuestChrome(msg.text, questTitle) }
        : msg,
    )
    .filter((msg) => msg.kind !== "text" || msg.text.trim());
  const viewMessages =
    session?.kind === "concept" && session.phase === "concept"
      ? (() => {
          const cut = messages.findIndex(
            (msg) =>
              msg.kind === "quiz" ||
              (msg.kind === "status" &&
                (/That’s the check/.test(msg.text) ||
                  /short conceptual check/.test(msg.text))),
          );
          return cut >= 0 ? messages.slice(0, cut) : messages;
        })()
      : messages;
  const headerActions = questHeaderActions(session);

  return (
    <section className="chat-column" aria-label="Study chat">
      <header className="pane-head">
        <div className="head-row">
          <h1>{title}</h1>
          {sub ? <span className="head-sub">{sub}</span> : null}
          {headerActions.length > 0 && (
            <div className="head-actions" role="group" aria-label="Pane actions">
              {headerActions.map((chip) => (
                <button
                  key={chip.action}
                  type="button"
                  className={chip.primary ? undefined : "secondary"}
                  disabled={working || chip.disabled}
                  title={chip.title}
                  onClick={() => onAction(chip.action)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {auth && !auth.hasKey && (
          <p className="status error" role="status">
            No <code>CURSOR_API_KEY</code>. Copy <code>.env.example</code> to{" "}
            <code>.env</code> and paste a key from{" "}
            <a href="https://cursor.com/dashboard/api">
              cursor.com/dashboard/api
            </a>
            .
          </p>
        )}
        {auth?.hasKey && auth.error && (
          <p className="status error" role="status">
            Key present but Cursor rejected it: {auth.error}
          </p>
        )}
        {statusError && (
          <p className="status error" role="alert">
            {statusError}
          </p>
        )}
      </header>
      <Transcript
        messages={viewMessages}
        idle={!session}
        quiz={session?.phase === "quiz_item" ? session.quiz : undefined}
        onPickQuiz={
          session?.phase === "quiz_item" && !working ? onPickQuiz : undefined
        }
        onConcept={onConcept}
      />
      <CommandBox
        session={session}
        disabled={busy || Boolean(session?.busy)}
        onSend={onSend}
        onAction={onAction}
        onInterrupt={onInterrupt}
      />
    </section>
  );
}
