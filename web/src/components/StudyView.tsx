import { useState } from "react";
import type { AuthStatus, CatalogPayload, SessionSnapshot } from "../types";
import { ChatColumn } from "./ChatColumn";
import type { ChipAction } from "./CommandBox";
import {
  ConceptsPane,
  CourseMap,
  CourseNav,
} from "./InspectPane";

export interface StudyActions {
  onSend: (text: string, mode: "ask" | "teachback") => void;
  onAction: (action: ChipAction) => void;
  onInterrupt: () => void;
  onCourse: (id: string) => void;
  onLecture: (n: number) => void;
  onStart: (kind: "debrief" | "quiz") => void;
  onQuest: (questId: string) => void;
  onNewQuest: (title: string) => void;
  onInitCourse: (url: string) => void;
  onPickQuiz: (choiceId: string) => void;
  onConcept: (id: string) => void;
}

export function StudyView({
  auth,
  session,
  catalog,
  error,
  busy,
  courseId,
  lectureN,
  initBusy,
  actions,
}: {
  auth: AuthStatus | null;
  session: SessionSnapshot | null;
  catalog: CatalogPayload | null;
  error: string | null;
  busy: boolean;
  courseId: string | null;
  lectureN: number | null;
  initBusy?: boolean;
  actions: StudyActions;
}) {
  const [conceptsOpen, setConceptsOpen] = useState(true);
  const course =
    catalog?.courses.find((c) => c.id === (session?.courseId ?? courseId)) ??
    catalog?.courses[0];

  const shownCourseId =
    !session || session.kind === "debrief" || session.kind === "quiz"
      ? (session?.courseId ?? courseId ?? catalog?.courses[0]?.id ?? null)
      : null;

  return (
    <div className={conceptsOpen ? "app" : "app concepts-collapsed"}>
      <CourseNav
        courses={catalog?.courses ?? []}
        courseId={shownCourseId}
        onCourse={actions.onCourse}
        onInit={actions.onInitCourse}
        initBusy={initBusy}
        auth={auth}
        sideQuests={catalog?.openQuests ?? []}
        questId={session?.kind === "quest" ? session.questId : undefined}
        onQuest={actions.onQuest}
        onNewQuest={actions.onNewQuest}
      />
      {session ? (
        <ChatColumn
          auth={auth}
          session={session}
          error={error}
          busy={busy}
          onSend={actions.onSend}
          onAction={actions.onAction}
          onInterrupt={actions.onInterrupt}
          onPickQuiz={actions.onPickQuiz}
          onConcept={actions.onConcept}
        />
      ) : (
        <CourseMap
          courses={catalog?.courses ?? []}
          courseId={courseId}
          lectureN={lectureN}
          concepts={catalog?.concepts}
          onLecture={actions.onLecture}
          onStart={actions.onStart}
          onConcept={actions.onConcept}
        />
      )}
      <ConceptsPane
        inspect={session?.inspect ?? null}
        catalog={catalog}
        course={course}
        lectureN={session?.lectureN ?? lectureN}
        collapsed={!conceptsOpen}
        onToggle={() => setConceptsOpen((v) => !v)}
        activeConceptId={session?.kind === "concept" ? session.conceptId : null}
        onConcept={actions.onConcept}
      />
    </div>
  );
}
