import { useEffect, useState } from "react";
import {
  ancestorIds,
  libraryForest,
  unlockedConceptIds,
  type LibraryNode,
} from "../library";
import { decayClass } from "../decayView";
import { nextIncompleteLectureN } from "../lectureProgress";
import { Octicon } from "./Octicon";
import type {
  AuthStatus,
  CatalogCourse,
  CatalogPayload,
  ConceptDef,
  InspectPayload,
  SideQuest,
} from "../types";

export function ConceptsPane({
  inspect,
  catalog,
  course,
  lectureN,
  collapsed,
  onToggle,
  activeConceptId,
  onConcept,
}: {
  inspect: InspectPayload | null;
  catalog?: CatalogPayload | null;
  course?: CatalogCourse;
  lectureN?: number | null;
  collapsed: boolean;
  onToggle: () => void;
  activeConceptId?: string | null;
  onConcept?: (id: string) => void;
}) {
  const lecture =
    inspect?.lecture ??
    course?.lectures.find((l) => l.n === lectureN) ??
    undefined;
  const concepts = catalog?.concepts ?? {};
  const courses = catalog?.courses ?? (course ? [course] : []);
  const unlocked = unlockedConceptIds(
    courses,
    concepts,
    catalog?.questConceptIds ?? [],
  );
  const forest = libraryForest(concepts, unlocked);
  const lectureUnlocked = (lecture?.conceptIds ?? []).filter((id) =>
    unlocked.has(id),
  );
  const selected =
    activeConceptId && unlocked.has(activeConceptId)
      ? activeConceptId
      : lectureUnlocked[0];
  const [openIds, setOpenIds] = useState(() => new Set(revealIds(concepts, selected)));

  useEffect(() => {
    setOpenIds((prior) => {
      const next = new Set(prior);
      for (const id of revealIds(concepts, selected)) next.add(id);
      return next;
    });
  }, [selected, catalog]);

  if (collapsed) {
    return (
      <aside className="concepts-column collapsed" aria-label="Concept library">
        <button
          type="button"
          className="concepts-toggle"
          onClick={onToggle}
          aria-expanded="false"
        >
          Concept library
        </button>
      </aside>
    );
  }

  return (
    <aside className="concepts-column" aria-label="Concept library">
      <div className="file-inspect">
        <div className="file-inspect-head">
          <div className="head-row">
            <h2>Concept library</h2>
            <button
              type="button"
              className="pane-close"
              onClick={onToggle}
              aria-expanded="true"
              aria-label="Hide concept library"
            >
              <Octicon name="chevron-right" />
            </button>
          </div>
        </div>
        <div className="file-inspect-body inspect-prose">
          {forest.length ? (
            <ul className="concept-tree">
              {forest.map((node) => (
                <ConceptBranch
                  key={node.id}
                  node={node}
                  selected={selected}
                  openIds={openIds}
                  decay={catalog?.decay}
                  onSelect={(id) => onConcept?.(id)}
                  onToggle={(id) => {
                    setOpenIds((prior) => {
                      const next = new Set(prior);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="muted">
              Incomplete lectures stay off the map until you debrief them.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

function revealIds(
  concepts: Parameters<typeof ancestorIds>[0],
  selected?: string,
): string[] {
  const ids = ancestorIds(concepts, selected);
  if (selected) ids.push(selected);
  return ids;
}

function ConceptBranch({
  node,
  selected,
  openIds,
  decay,
  onSelect,
  onToggle,
}: {
  node: LibraryNode;
  selected?: string;
  openIds: Set<string>;
  decay?: Record<string, { freshness: number }>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const freshness = decay?.[node.id]?.freshness;
  const decayCls = decayClass(freshness);
  const hasKids = node.children.length > 0;
  const expanded = hasKids && openIds.has(node.id);
  return (
    <li>
      <div className={hasKids ? "concept-row" : "concept-row leaf"}>
        {hasKids ? (
          <button
            type="button"
            className="concept-twist"
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={() => onToggle(node.id)}
          >
            <Octicon name="chevron-right" size={12} />
          </button>
        ) : (
          <span className="concept-twist-spacer" aria-hidden="true" />
        )}
        <button
          type="button"
          className={
            [
              "concept-node",
              node.id === selected ? "current" : "",
              decayCls,
            ]
              .filter(Boolean)
              .join(" ")
          }
          aria-current={node.id === selected ? "true" : undefined}
          onClick={() => onSelect(node.id)}
        >
          {node.name}
        </button>
      </div>
      {expanded && (
        <ul>
          {node.children.map((child) => (
            <ConceptBranch
              key={child.id}
              node={child}
              selected={selected}
              openIds={openIds}
              decay={decay}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CourseNav({
  courses,
  courseId,
  onCourse,
  onInit,
  initBusy,
  busy,
  error,
  auth,
  sideQuests = [],
  questId,
  onQuest,
  onNewQuest,
}: {
  courses: CatalogCourse[];
  courseId: string | null;
  onCourse: (id: string) => void;
  onInit: (url: string) => void;
  initBusy?: boolean;
  busy?: boolean;
  error?: string | null;
  auth?: AuthStatus | null;
  sideQuests?: SideQuest[];
  questId?: string;
  onQuest?: (questId: string) => void;
  onNewQuest?: (title: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [questTitle, setQuestTitle] = useState("");
  const [adding, setAdding] = useState<"course" | "quest">("course");
  const current = courses.filter((c) => (c.track ?? "currently") === "currently");
  const previous = courses.filter((c) => c.track === "previously");

  function group(title: string, list: CatalogCourse[]) {
    if (!list.length) return null;
    return (
      <>
        <h2>{title}</h2>
        <ul className="nav-courses">
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === courseId ? "nav-course current" : "nav-course"}
                onClick={() => onCourse(c.id)}
              >
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <nav className="nav-column" aria-label="Courses">
      <div className="nav-brand">Study Helper</div>
      {auth && !auth.hasKey && (
        <p className="status error" role="status">
          No <code>CURSOR_API_KEY</code> in <code>.env</code>.
        </p>
      )}
      {group("Current courses", current)}
      {sideQuests.length ? (
        <>
          <h2>Active side quests</h2>
          <ul className="nav-courses">
            {sideQuests.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  className={
                    [
                      "nav-course",
                      q.id === questId ? "current" : "",
                      q.status === "parked" ? "parked" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                  onClick={() => onQuest?.(q.id)}
                >
                  {q.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {group("Completed courses", previous)}
      <form
        className="add-item"
        onSubmit={(e) => {
          e.preventDefault();
          if (adding === "quest") {
            if (!questTitle.trim()) return;
            onNewQuest?.(questTitle.trim());
            return;
          }
          if (!url.trim()) return;
          onInit(url.trim());
        }}
      >
        <h2>New</h2>
        <div className="add-item-head">
          <div className="add-item-mode" role="tablist" aria-label="What to add">
            <button
              type="button"
              role="tab"
              id="tab-add-course"
              aria-controls="add-item-panel"
              aria-selected={adding === "course"}
              className={adding === "course" ? "tab current" : "tab"}
              onClick={() => setAdding("course")}
            >
              Course
            </button>
            <button
              type="button"
              role="tab"
              id="tab-add-quest"
              aria-controls="add-item-panel"
              aria-selected={adding === "quest"}
              className={adding === "quest" ? "tab current" : "tab"}
              onClick={() => setAdding("quest")}
            >
              Side quest
            </button>
          </div>
        </div>
        <div
          className="add-item-panel"
          role="tabpanel"
          id="add-item-panel"
          aria-labelledby={
            adding === "quest" ? "tab-add-quest" : "tab-add-course"
          }
        >
          <div className="add-item-field">
            {adding === "quest" ? (
              <input
                id="add-item-field"
                value={questTitle}
                placeholder="Taylor series"
                aria-label="Quest title"
                disabled={busy}
                onChange={(e) => setQuestTitle(e.target.value)}
              />
            ) : (
              <input
                id="add-item-field"
                value={url}
                placeholder="Game theory"
                aria-label="Course topic or URL"
                disabled={initBusy || busy}
                onChange={(e) => setUrl(e.target.value)}
              />
            )}
            <button
              type="submit"
              className="add-item-go"
              disabled={
                busy ||
                (adding === "quest"
                  ? !questTitle.trim()
                  : initBusy || !url.trim())
              }
              aria-label={adding === "quest" ? "Add side quest" : "Add course"}
            >
              <Octicon name="chevron-right" />
            </button>
          </div>
          {error ? (
            <p className="status error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </nav>
  );
}

function namesAlign(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return n(a) === n(b);
}

export function CourseMap({
  courses,
  courseId,
  lectureN,
  concepts = {},
  onLecture,
  onStart,
  onConcept,
}: {
  courses: CatalogCourse[];
  courseId: string | null;
  lectureN: number | null;
  concepts?: Record<string, ConceptDef>;
  onLecture: (n: number) => void;
  onStart: (kind: "debrief" | "quiz") => void;
  onConcept?: (id: string) => void;
}) {
  const course = courses.find((c) => c.id === courseId) ?? courses[0];
  const nextN = course ? nextIncompleteLectureN(course.lectures) : null;

  return (
    <section className="main-column" aria-label="Course map">
      <header className="pane-head">
        <div className="head-row">
          <h1 className="course-title">{course?.title ?? "Courses"}</h1>
          {course ? (
            <p className="course-byline">{course.instructors}</p>
          ) : null}
          {course && nextN != null ? (
            <div className="head-actions" role="group" aria-label="Course actions">
              <button type="button" onClick={() => onStart("debrief")}>
                Debrief
              </button>
            </div>
          ) : null}
          {course && nextN == null && course.lectures.length > 0 ? (
            <div className="head-actions" role="group" aria-label="Course actions">
              <button type="button" onClick={() => onStart("quiz")}>
                Review
              </button>
            </div>
          ) : null}
        </div>
      </header>
      {course && (
        <div className="file-inspect-body">
          <ol className="lecture-list">
            {course.lectures.map((lec) => {
              const complete = lec.status === "complete";
              const open = lec.n === nextN;
              const state = complete ? "complete" : open ? "open" : "locked";
              const tagged = lec.conceptIds
                .map((id) =>
                  concepts[id] ? { id, name: concepts[id].name } : null,
                )
                .filter((row): row is { id: string; name: string } =>
                  Boolean(row),
                );
              const solo =
                complete &&
                tagged.length === 1 &&
                namesAlign(lec.title, tagged[0].name)
                  ? tagged[0]
                  : null;
              const listed = complete && !solo ? tagged : [];
              const rowClass = [
                "lecture-row",
                lectureN === lec.n ? "current" : "",
                complete ? "complete" : "",
                !complete && !open ? "locked" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const body = (
                <>
                  <span className="lecture-mark" aria-hidden="true">
                    {complete ? <Octicon name="check" size={14} /> : null}
                  </span>
                  <span className="lecture-n">{lec.n}</span>
                  <span className="lecture-title">{lec.title}</span>
                </>
              );
              return (
                <li key={lec.n} className="lecture-item">
                  {open ? (
                    <button
                      type="button"
                      className={rowClass}
                      data-lecture-state={state}
                      aria-current={lectureN === lec.n ? "true" : undefined}
                      onClick={() => onLecture(lec.n)}
                    >
                      {body}
                    </button>
                  ) : solo ? (
                    <button
                      type="button"
                      className={rowClass}
                      data-lecture-state={state}
                      onClick={() => onConcept?.(solo.id)}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={rowClass} data-lecture-state={state}>
                      {body}
                      <span className="visually-hidden">
                        {complete
                          ? "complete"
                          : `locked until lecture ${nextN} is complete`}
                      </span>
                    </div>
                  )}
                  {listed.length > 0 ? (
                    <ul className="lecture-concepts">
                      {listed.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className="lecture-concept"
                            onClick={() => onConcept?.(row.id)}
                          >
                            {row.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
