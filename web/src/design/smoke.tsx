import React from "react";
import { renderToString } from "react-dom/server";
import { StudyView, type StudyActions } from "../components/StudyView";
import { insertTex, rankSymbols } from "../components/SymbolPicker";
import { seedConceptOutline } from "../conceptOutline";
import { AUTH_MISSING, AUTH_OK, FIX_CATALOG, SCENARIOS } from "./fixtures";
import { Prose } from "../prose";

const actions: StudyActions = {
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
  onPickCourse: () => undefined,
  onConcept: () => undefined,
};

let failures = 0;

function fail(id: string, why: string): void {
  failures += 1;
  console.log(`FAIL ${id}: ${why}`);
}

function report(id: string, what: string, note: string): void {
  console.log(`ok   ${id.padEnd(16)} ${what}`);
  console.log(`     ${note}`);
}

for (const s of SCENARIOS) {
  let html = "";
  try {
    html = renderToString(
      <StudyView
        auth={s.id === "no-key" ? AUTH_MISSING : AUTH_OK}
        session={s.session}
        catalog={s.catalog ?? FIX_CATALOG}
        error={s.error ?? null}
        busy={Boolean(s.busy)}
        courseId="algorithms-6006"
        lectureN={4}
        actions={actions}
      />,
    );
  } catch (err) {
    fail(s.id, err instanceof Error ? err.message : String(err));
    continue;
  }

  if (/undefined|\[object Object\]/.test(html)) {
    fail(s.id, "rendered a placeholder value into the page");
  }

  if (html.includes('id="tab-library"') || html.includes('id="tab-outline"') || html.includes('id="tab-summary"')) {
    fail(s.id, "concept pane should not have library tabs");
  }
  if (html.includes("None open.")) {
    fail(s.id, "empty side quests should not show None open");
  }
  if (html.includes(">Hide<")) {
    fail(s.id, "Hide should be a chevron, not a text button");
  }
  if (!html.includes("Hide concept library")) {
    fail(s.id, "concept pane needs a hide control");
  }
  if (!html.includes("Concept library")) {
    fail(s.id, "pane should be titled Concept library");
  }
  if (html.includes(">Initialise<") || html.includes(">Start<")) {
    fail(s.id, "add form should use an arrow, not Initialise/Start");
  }
  if (!html.includes(">New<")) {
    fail(s.id, "add form needs a New heading");
  }
  if (!html.includes("Add course")) {
    fail(s.id, "add form needs an add-course control");
  }
  if (html.includes("OCW course URL")) {
    fail(s.id, "course add should not assume OCW");
  }
  if (!html.includes('placeholder="Subject"')) {
    fail(s.id, "course add needs a subject placeholder");
  }

  if (!s.session) {
    if (!/aria-label="Course map"/.test(html)) {
      fail(s.id, "home should show the course map");
    }
    if (!html.includes("Algorithms")) {
      fail(s.id, "library should list the concept root");
    }
    if (/concept-node[^>]*>Hashing</.test(html) && s.id !== "home-review") {
      fail(s.id, "incomplete hashing should stay locked");
    }
    if (html.includes("watched") || html.includes("debriefed")) {
      fail(s.id, "lecture list should not spell out old statuses");
    }
    if (html.includes("Watch") || html.includes("Copy URL")) {
      fail(s.id, "Watch and Copy URL should be gone");
    }
    if (html.includes("lecture-open") || html.includes("↗")) {
      fail(s.id, "lecture arrow should be gone");
    }
    if (html.includes("Freshness")) {
      fail(s.id, "concept buttons should not put freshness in the title");
    }
    if (s.id === "home" && !html.includes("class=\"lecture-concept\"")) {
      fail(s.id, "complete lectures should list distinct tagged concepts");
    }
    if (s.id === "home" && !html.includes(">Comparison sorting<")) {
      fail(s.id, "Sets and Sorting should still expose Comparison sorting");
    }
    if (s.id === "home") {
      if (!html.includes('data-lecture-state="complete"')) {
        fail(s.id, "complete lecture should show a check");
      }
      if (!html.includes('data-lecture-state="open"')) {
        fail(s.id, "next incomplete lecture should be selectable");
      }
      if (!html.includes('data-lecture-state="locked"')) {
        fail(s.id, "later lectures should stay locked");
      }
    }
    if (html.includes("New side quest")) {
      fail(s.id, "side quests should not start from the lecture pane");
    }
    const quests = (s.catalog ?? FIX_CATALOG).openQuests ?? [];
    if (quests.length) {
      if (!html.includes("Active side quests")) {
        fail(s.id, "nav should list active side quests under current courses");
      }
    } else if (html.includes("Active side quests") || html.includes("None open.")) {
      fail(s.id, "empty side quests should not take a nav heading");
    }
    if (!html.includes("Current courses")) {
      fail(s.id, "nav should name current courses");
    }
    if (!html.includes('id="tab-add-course"') || !html.includes('id="tab-add-quest"')) {
      fail(s.id, "nav should combine course and side-quest add");
    }
    if (s.id === "home-review") {
      if (!html.includes(">Review<")) fail(s.id, "finished course should offer Review");
      if (html.includes(">Debrief<")) {
        fail(s.id, "finished course should not offer Debrief");
      }
      if (!/concept-node[^>]*>Universal hashing</.test(html)) {
        fail(s.id, "finished quest should appear on the concept map");
      }
    } else {
      if (html.includes(">Review<")) {
        fail(s.id, "in-progress course should not offer Review");
      }
      if (!html.includes(">Debrief<")) {
        fail(s.id, "in-progress course should offer Debrief");
      }
    }
    if (
      s.id !== "home-review" &&
      /concept-node[^>]*>Universal hashing</.test(html)
    ) {
      fail(s.id, "open quest should not sit on the concept map yet");
    }
    if (html.includes("unseen in the knowledge file")) {
      fail(s.id, "library should not show knowledge-file flags");
    }
    if (html.includes('id="tab-library"') || html.includes('id="tab-outline"')) {
      fail(s.id, "concept pane should not have library tabs");
    }
    if (html.includes(">Hide<")) {
      fail(s.id, "Hide should be a chevron, not a text button");
    }
    if (!html.includes("Hide concept library")) {
      fail(s.id, "concept pane needs a hide control");
    }
    if (s.id === "no-key" && !html.includes("CURSOR_API_KEY")) {
      fail(s.id, "missing key warning");
    }
    report(s.id, "home", s.note);
    continue;
  }

  if (s.session.kind === "quiz" && s.session.quiz) {
    if (!html.includes(s.session.quiz.conceptId)) {
      fail(s.id, "quiz concept missing");
    }
  }

  if (s.session.kind === "debrief" && s.session.phase === "correction_gate") {
    if (!html.includes(">Side quest<")) {
      fail(s.id, "debrief should let him start a side quest");
    }
  }

  if (s.session.quizMode === "after_debrief" || s.session.quizMode === "course_end") {
    if (html.includes("Skip this") || html.includes("Not now")) {
      fail(s.id, "closing mix must not be skippable");
    }
  }

  if (html.includes(">Lectures<")) {
    fail(s.id, "Lectures button should not sit on chat");
  }

  if (s.id === "find") {
    if (!html.includes(">Game theory<")) fail(s.id, "find pane should name the topic");
    if (!html.includes("Yale ECON 159")) fail(s.id, "find pane should offer a series to pick");
    if (html.includes(">Teach-back<")) fail(s.id, "find pane should not have Teach-back");
    if (!html.includes(">Quit<")) fail(s.id, "find pane should let him quit");
  }

  if (s.id === "concept") {
    if (!html.includes(">Hashing<")) fail(s.id, "concept pane should name the concept");
    if (!html.includes("From lectures")) {
      fail(s.id, "concept teaching should keep lecture sources");
    }
    if (!html.includes("See also") || !html.includes("#concept/algorithms")) {
      fail(s.id, "concept teaching should link related concepts");
    }
    if (!html.includes(">Quiz<")) fail(s.id, "non-root concept should offer Quiz");
    if (/class="nav-course current"/.test(html)) {
      fail(s.id, "concept pane should not keep a course current in the nav");
    }
    if (html.includes(">Done<") || html.includes(">Quit<")) {
      fail(s.id, "concept pane should not have Done/Quit");
    }
    if (html.includes(">Teach-back<")) {
      fail(s.id, "concept pane should be Ask only");
    }
    if (html.includes("unseen in the knowledge file") || html.includes("No teaching on file")) {
      fail(s.id, "internal concept flags should not show");
    }
  }

  if (s.id === "concept-quiz") {
    if (!html.includes(">Hashing<")) fail(s.id, "quiz pane should keep the concept title");
    if (html.includes("hash family") || html.includes("From lectures")) {
      fail(s.id, "concept teaching should hide during quiz");
    }
    if (!html.includes("How full the table is.")) {
      fail(s.id, "quiz choices should show");
    }
    if (html.includes(">Quiz<")) {
      fail(s.id, "Quiz chip should not sit on the check");
    }
  }

  if (s.id === "concept-gen") {
    if (!html.includes(">Hashing<")) fail(s.id, "generating pane should take the new title");
    const firstBeat = seedConceptOutline("Hashing", "Algorithms")[0];
    if (!html.includes(firstBeat)) {
      fail(s.id, "generating pane should show one outline beat");
    }
    if (html.includes("When you'd actually use this")) {
      fail(s.id, "generating pane should cycle a single line, not list every beat");
    }
    if (!html.includes("Working")) {
      fail(s.id, "composer should say Working, not the beat");
    }
    if (html.includes("hash family")) {
      fail(s.id, "old concept body should not linger");
    }
    if (!html.includes(">Quiz<") || !html.includes("disabled")) {
      fail(s.id, "Quiz should stay visible but disabled while generating");
    }
  }

  if (s.id === "quest") {
    if (!html.includes("Side Quest: Universal Hashing")) {
      fail(s.id, "quest pane title should be Side Quest: Title Case");
    }
    if (html.includes("does not skip the lecture map")) {
      fail(s.id, "quest should not show the lecture-map disclaimer");
    }
    if (html.includes("Universal hashing — side quest")) {
      fail(s.id, "quest should not repeat a secondary title in the bubble");
    }
    if (html.includes("## What universal")) {
      fail(s.id, "quest headings should render as HTML, not raw markdown");
    }
    if (!html.includes("What universal means")) {
      fail(s.id, "quest heading text should still appear");
    }
    if (html.includes("**")) {
      fail(s.id, "quest bubble still has raw ** markup");
    }
    if (html.includes(">Park<")) {
      fail(s.id, "Park should be gone");
    }
    if (!html.includes(">Done<") || !html.includes(">Quit<")) {
      fail(s.id, "quest header should offer Done and Quit");
    }
    if (!html.includes("Teach it back and finish the quiz first")) {
      fail(s.id, "Done should stay disabled until teach-back and quiz");
    }
    if (html.includes("Question — not graded")) {
      fail(s.id, "ask helper copy should be gone");
    }
    if (html.includes("Ask about the idea, or teach it back")) {
      fail(s.id, "quest compose helper copy should be gone");
    }
    if (!html.includes("katex.org")) {
      fail(s.id, "composer should link to TeX docs");
    }
    if (!html.includes(">Symbols<")) {
      fail(s.id, "composer should offer a symbol picker");
    }
    if (html.includes('id="tab-quests"')) {
      fail(s.id, "quests tab should be gone from concepts");
    }
    if (!html.includes("Wikipedia")) {
      fail(s.id, "quest explanation should include a reference link");
    }
  }

  if (s.busy && !html.includes("Interrupt")) {
    fail(s.id, "busy state has no Interrupt");
  }
  if (s.busy && html.includes("status working")) {
    fail(s.id, "Working belongs in the composer row, not the header");
  }

  if (s.session.phase === "done" && !html.includes("New session")) {
    fail(s.id, "done state missing New session");
  }

  report(s.id, s.session.phase, s.note);
}

function proseHtml(text: string): string {
  return renderToString(<Prose text={text} />);
}

const boldMath = proseHtml("The draw of **$h$** is random.");
if (boldMath.includes("**")) fail("prose", "bold around math leaked **");
if (!boldMath.includes("<strong")) fail("prose", "bold around math should wrap strong");

const triple = proseHtml('***"Universal" is not perfect**');
if (triple.includes("**")) fail("prose", "triple asterisks leaked");

const stray = proseHtml("trailing ** unmatched");
if (stray.includes("**")) fail("prose", "unmatched ** should be dropped");

const italic = proseHtml("choose *h* at random");
if (italic.includes("*h*")) fail("prose", "italic asterisks leaked");
if (!italic.includes("<em")) fail("prose", "italic should wrap em");
const inside = insertTex("see $x$", 6, 6, "\\in");
if (inside.next !== "see $x\\in$") fail("prose", "insert inside math should skip extra dollars");
const around = insertTex("see ", 4, 4, "\\in");
if (around.next !== "see $\\in$") fail("prose", "insert outside math should wrap dollars");
const defaultOrder = rankSymbols("", []).map((s) => s.tex);
if (defaultOrder[0] !== "\\in" || defaultOrder.at(-1) !== "\\Theta") {
  fail("prose", "empty hint should keep the default symbol order");
}
const hashing = rankSymbols("Intro to Algorithms Hashing hashing", []);
if (hashing.findIndex((s) => s.tex === "O") > 10) {
  fail("prose", "algorithm hashing should float big O");
}
if (hashing[0].tex !== "\\in") fail("prose", "hashing should keep set membership first");
const recency = rankSymbols("Hashing", ["\\geq"]);
if (recency[0].tex !== "\\geq") fail("prose", "recent symbols should win over hints");
const linear = rankSymbols("Linear algebra linear-algebra", []);
if (linear.findIndex((s) => s.tex === "\\mathbb{R}") > 8) {
  fail("prose", "linear algebra should float the reals");
}
const wiki = proseHtml("[Hashing](concept:hashing)");
if (!wiki.includes("#concept/hashing")) fail("prose", "concept: links should be in-app anchors");
if (!wiki.includes("Hashing")) fail("prose", "concept: link label missing");
const paren = proseHtml("see \\(x^2\\) here");
if (!paren.includes("katex")) fail("prose", "\\(...\\) should render as TeX");
const bare = proseHtml("T=Z^{2} on top");
if (!bare.includes("katex")) fail("prose", "bare Z^{2} should render as TeX");
const split = proseHtml("$a =\nb$");
if (!split.includes("katex")) fail("prose", "math split across lines should still render");
report("prose", "inline", "Bold keeps math; stray ** dropped");

if (failures) {
  throw new Error(`${failures} design state(s) broken`);
}
console.log(`\nall ${SCENARIOS.length} states ok`);
