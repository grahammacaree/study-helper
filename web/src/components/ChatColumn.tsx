import {
  isQuestDisclaimer,
  questPaneTitle,
  stripQuestChrome,
} from "../questChrome";
import { PENDING_SESSION_ID } from "../sessionStore";
import type { AuthStatus, ChatMessage, SessionSnapshot } from "../types";
import { CommandBox, questHeaderActions, type ChipAction } from "./CommandBox";
import { useCyclingBeat } from "./GeneratingOutline";
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
  onPickCourse,
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
  onPickCourse?: (url: string) => void;
  onConcept?: (id: string) => void;
}) {
  const statusError = error || session?.error;
  const working = busy || session?.busy;
  const sessionReady = Boolean(
    session && session.id !== PENDING_SESSION_ID,
  );
  const title = session
    ? session.kind === "quiz"
      ? session.quizMode === "review" || session.quizMode === "course_end"
        ? "Review"
        : "Quiz"
      : session.kind === "quest"
        ? questPaneTitle(session.questTitle ?? "")
        : session.kind === "concept"
          ? session.questTitle || "Concept"
          : session.kind === "find"
            ? session.questTitle || "New course"
            : "Debrief"
    : "Study";
  const sub =
    session?.kind === "quest" ||
    session?.kind === "concept" ||
    session?.kind === "find"
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
  const viewMessages = messagesForConcept(session, messages, working);
  const pinnedMessages = pinConceptTeaching(session, viewMessages);
  const outline =
    working && session?.kind === "concept"
      ? session.generatingOutline
      : undefined;
  const beat = useCyclingBeat(outline, Boolean(outline?.length));
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
                  disabled={working || !sessionReady || chip.disabled}
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
        messages={pinnedMessages}
        idle={!session}
        generatingOutline={outline}
        generatingBeat={beat}
        resetScrollKey={
          session?.kind === "concept" ? session.conceptId : undefined
        }
        quiz={session?.phase === "quiz_item" ? session.quiz : undefined}
        offeredCourses={
          session?.kind === "find" && session.phase === "find"
            ? session.offeredCourses
            : undefined
        }
        onPickQuiz={
          session?.phase === "quiz_item" && !working ? onPickQuiz : undefined
        }
        onPickCourse={
          session?.kind === "find" && session.phase === "find" && !working
            ? onPickCourse
            : undefined
        }
        onConcept={onConcept}
      />
      <CommandBox
        session={session}
        disabled={busy || Boolean(session?.busy)}
        ready={sessionReady}
        onSend={onSend}
        onAction={onAction}
        onInterrupt={onInterrupt}
      />
    </section>
  );
}

function conceptQuizHidesNotes(
  session: SessionSnapshot | null,
  working: boolean,
): boolean {
  if (session?.kind !== "concept") return false;
  if (session.phase === "quiz_item" || session.phase === "quiz_wrap") {
    return true;
  }
  return session.quizMode === "concept" && working;
}

function messagesForConcept(
  session: SessionSnapshot | null,
  messages: ChatMessage[],
  working: boolean,
): ChatMessage[] {
  if (session?.kind !== "concept") return messages;
  const cut = messages.findIndex(
    (msg) =>
      msg.kind === "quiz" ||
      (msg.kind === "status" &&
        (/That’s the check/.test(msg.text) ||
          /short conceptual check/.test(msg.text))),
  );
  if (conceptQuizHidesNotes(session, working)) {
    return cut >= 0 ? messages.slice(cut) : [];
  }
  if (session.phase === "concept") {
    return cut >= 0 ? messages.slice(0, cut) : messages;
  }
  return messages;
}

function pinConceptTeaching(
  session: SessionSnapshot | null,
  messages: ChatMessage[],
): ChatMessage[] {
  if (session?.kind !== "concept" || session.phase !== "concept") {
    return messages;
  }
  const conceptId = session.conceptId;
  if (!conceptId) return messages;
  return messages.map((msg, i) =>
    i === 0 && msg.kind === "text" && msg.role === "assistant"
      ? { ...msg, id: `concept-teaching:${conceptId}` }
      : msg,
  );
}
