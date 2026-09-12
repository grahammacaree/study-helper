import { useEffect, useRef } from "react";
import { Prose } from "../prose";
import type { ChatMessage, DebriefCard, QuizItem } from "../types";

export function Transcript({
  messages,
  quiz,
  onPickQuiz,
  onConcept,
  idle,
}: {
  messages: ChatMessage[];
  quiz?: QuizItem;
  onPickQuiz?: (choiceId: string) => void;
  onConcept?: (id: string) => void;
  idle?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    if (last.role === "assistant") {
      const bubble = host.current?.querySelector<HTMLElement>(
        `[data-msg="${last.id}"]`,
      );
      if (bubble) {
        bubble.scrollIntoView({ block: "start" });
      }
      return;
    }
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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
          {msg.kind === "debrief" && msg.debrief ? (
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
      <div ref={end} />
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
