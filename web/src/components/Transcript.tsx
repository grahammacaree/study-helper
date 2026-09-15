import { useEffect, useRef } from "react";
import { GeneratingOutline } from "./GeneratingOutline";
import { Prose } from "../prose";
import type { ChatMessage, DebriefCard, OfferedCourse, QuizItem } from "../types";

export function Transcript({
  messages,
  quiz,
  onPickQuiz,
  onPickCourse,
  onConcept,
  idle,
  generatingOutline,
  generatingBeat,
  offeredCourses,
  resetScrollKey,
}: {
  messages: ChatMessage[];
  quiz?: QuizItem;
  onPickQuiz?: (choiceId: string) => void;
  onPickCourse?: (url: string) => void;
  onConcept?: (id: string) => void;
  idle?: boolean;
  generatingOutline?: string[];
  generatingBeat?: string;
  offeredCourses?: OfferedCourse[];
  resetScrollKey?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  const pin = last?.id ?? "";
  const pinRole = last?.role;

  useEffect(() => {
    if (!pin) return;
    const el = host.current;
    if (!el) return;
    if (pinRole === "assistant") {
      const bubble = el.querySelector<HTMLElement>(
        `[data-msg="${CSS.escape(pin)}"]`,
      );
      if (bubble) el.scrollTop = bubble.offsetTop;
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [pin, pinRole]);

  useEffect(() => {
    if (!resetScrollKey) return;
    const el = host.current;
    if (el) el.scrollTop = 0;
  }, [resetScrollKey]);

  return (
    <div ref={host} className="transcript" role="log" aria-live="polite">
      {messages.length === 0 && idle && (
        <article className="bubble assistant" data-kind="status">
          <p>
            Pick a lecture, then debrief after you write a summary, or take a
            short multiple-choice refresh. Memory lives on disk — this chat is
            not the store. TeX is welcome: <code>$...$</code> and{" "}
            <code>$$...$$</code>.
          </p>
        </article>
      )}
      {messages.map((msg) => (
        <article
          key={msg.id}
          data-msg={msg.id}
          className={`bubble ${msg.role}`}
          data-kind={msg.kind}
        >
          {generatingOutline?.length &&
          msg.kind === "status" &&
          /Generating text/.test(msg.text) ? (
            <GeneratingOutline
              current={generatingBeat ?? generatingOutline[0]}
            />
          ) : msg.kind === "debrief" && msg.debrief ? (
            <DebriefBody card={msg.debrief} note={msg.text} />
          ) : msg.kind === "quiz" && msg.quiz ? (
            <QuizBody
              item={msg.quiz}
              live={Boolean(
                quiz &&
                  onPickQuiz &&
                  quiz.conceptId === msg.quiz.conceptId &&
                  quiz.index === msg.quiz.index,
              )}
              onPick={onPickQuiz}
            />
          ) : (
            <Prose text={msg.text} onConcept={onConcept} />
          )}
        </article>
      ))}
      {offeredCourses?.length && onPickCourse ? (
        <article className="bubble assistant" data-kind="text">
          <div className="quiz-choices" role="group" aria-label="Course options">
            {offeredCourses.map((c) => (
              <button
                key={c.url}
                type="button"
                className="quiz-choice"
                onClick={() => onPickCourse(c.url)}
              >
                <strong>{c.title}</strong>
                <span className="muted"> — {c.why}</span>
              </button>
            ))}
          </div>
        </article>
      ) : null}
    </div>
  );
}

function DebriefBody({ card, note }: { card: DebriefCard; note: string }) {
  return (
    <>
      <h2>Debrief</h2>
      <Prose text={note} />
      <h3>Corrections</h3>
      {card.corrections.length ? (
        <ul>
          {card.corrections.map((c) => (
            <li key={c}>
              <Prose text={c} />
            </li>
          ))}
        </ul>
      ) : (
        <p>None.</p>
      )}
      <h3>Worth adding</h3>
      {card.gaps.length ? (
        <ul>
          {card.gaps.map((c) => (
            <li key={c}>
              <Prose text={c} />
            </li>
          ))}
        </ul>
      ) : (
        <p>Nothing structural missing.</p>
      )}
      {card.offeredQuests.length > 0 && (
        <>
          <h3>Side quests (optional)</h3>
          <ul>
            {card.offeredQuests.map((q) => (
              <li key={q.title}>
                <strong>{q.title}</strong> — {q.why}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function QuizBody({
  item,
  live,
  onPick,
}: {
  item: QuizItem;
  live: boolean;
  onPick?: (choiceId: string) => void;
}) {
  return (
    <>
      {item.total > 1 ? (
        <p className="muted">
          {item.index} of {item.total}
        </p>
      ) : null}
      <Prose text={item.prompt} />
      <div className="quiz-choices" role="group" aria-label="Choices">
        {item.choices.map((c) => {
          const picked = item.pickedId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              className={picked ? "quiz-choice picked" : "quiz-choice"}
              disabled={!live}
              onClick={() => onPick?.(c.id)}
            >
              <Prose text={c.text} />
            </button>
          );
        })}
      </div>
      {item.noteHint && item.total > 1 ? (
        <p className="muted">If this is fuzzy: {item.noteHint}</p>
      ) : null}
    </>
  );
}
