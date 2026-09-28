import React from "react";
import { renderToString } from "react-dom/server";
import { StudyView, type StudyActions } from "../components/StudyView";
import { insertTex, rankSymbols } from "../components/SymbolPicker";
import { seedConceptOutline } from "../conceptOutline";
import { GeneratingOutline } from "../components/GeneratingOutline";
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
      if (/concept-node[^>]*>Algorithms course synthesis</.test(html)) {
        fail(s.id, "a recap lecture should not unlock a library node");
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
    if (!html.includes("decision tree")) {
      fail(s.id, "generating pane should show one outline beat");
    }
    if (!html.includes("katex")) {
      fail(s.id, "generating beats should render TeX");
    }
    if (html.includes("$\\Omega")) {
      fail(s.id, "generating beats should not leak raw TeX");
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

  if (s.id === "quest-gen") {
    if (!html.includes("Side Quest: Separation Of Variables")) {
      fail(s.id, "generating quest pane should take the title immediately");
    }
    if (!html.includes("Getting the idea on the table")) {
      fail(s.id, "generating quest should show an outline beat");
    }
    if (!html.includes("Opening the quest")) {
      fail(s.id, "the pane should say the quest is opening");
    }
    if (!html.includes("Working")) {
      fail(s.id, "composer should say Working while the quest opens");
    }
  }

  if (s.id === "quest-quiz-gen") {
    if (html.includes("Opening the quest")) {
      fail(s.id, "quiz write should not say the quest is opening");
    }
    if (html.includes("Getting the idea on the table")) {
      fail(s.id, "quiz write should not reuse the opening outline");
    }
    if (!html.includes("Writing a question")) {
      fail(s.id, "composer should say it is writing a question");
    }
    if (!html.includes("the idea")) {
      fail(s.id, "the teach-back verdict should stay on screen");
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

  if (s.id === "busy") {
    if (!html.includes("Reading what you wrote")) {
      fail(s.id, "debrief processing should show a host tick");
    }
    if (html.includes("Watching for inverted implications")) {
      fail(s.id, "debrief processing should show one tick, not the whole list");
    }
  }

  if (s.id === "debrief-wait") {
    const quit = html.indexOf(">Quit<");
    const send = html.indexOf(">Send<");
    const summary = html.indexOf(">Summary<");
    if (quit < 0) fail(s.id, "summary composer should offer Quit");
    if (send < 0 || quit < send) {
      fail(s.id, "Quit should sit on the composer send row");
    }
    if (summary >= 0 && quit < summary) {
      fail(s.id, "Quit should sit under the Summary/Ask tabs");
    }
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
const olLoose = proseHtml(
  "1. First item, still going.\n\n2. Second item.\n\nNot a fourth item.",
);
const olIndented = proseHtml(
  "**What is easy to get backwards:**\n\n  1. First.\n\n  2. Second.\n\nNot a fourth item.",
);
if ((olIndented.match(/<ol/g) ?? []).length !== 1) {
  fail("prose", "indented numbered items should still be one list");
}
if ((olLoose.match(/<ol/g) ?? []).length !== 1) {
  fail("prose", "blank lines should not restart a numbered list");
}
if ((olLoose.match(/<li/g) ?? []).length !== 2) {
  fail("prose", "a numbered list should keep consecutive items");
}
if (!olLoose.includes("Not a fourth item")) {
  fail("prose", "text after a list should not be swallowed");
}
const starMath = proseHtml("Any constant $y = y^*$ stays an equilibrium.");
if (starMath.includes("<em")) fail("prose", "stars inside $...$ are TeX, not italics");
if (!starMath.includes("katex")) fail("prose", "$y^*$ should render as TeX");
const escapedStar = proseHtml("Any constant $y = y^\\*$ with $g(y^\\*) = 0$.");
if (escapedStar.includes("\\*")) {
  fail("prose", "escaped stars inside math should render as a true asterisk");
}
const wiki = proseHtml("[Hashing](concept:hashing)");
if (!wiki.includes("#concept/hashing")) fail("prose", "concept: links should be in-app anchors");
if (!wiki.includes("Hashing")) fail("prose", "concept: link label missing");
const wikiUrl = proseHtml(
  "[Wikipedia — Separable differential equation](https://en.wikipedia.org/wiki/Separable_differential_equation)",
);
if (!wikiUrl.includes("https://en.wikipedia.org/wiki/Separable_differential_equation")) {
  fail("prose", "underscores in Wikipedia URLs must not become TeX");
}
if (wikiUrl.includes("$Separable")) {
  fail("prose", "Wikipedia href must not wrap path segments in dollars");
}
const paren = proseHtml("see \\(x^2\\) here");
if (!paren.includes("katex")) fail("prose", "\\(...\\) should render as TeX");
const bare = proseHtml("T=Z^{2} on top");
if (!bare.includes("katex")) fail("prose", "bare Z^{2} should render as TeX");
const split = proseHtml("$a =\nb$");
if (!split.includes("katex")) fail("prose", "math split across lines should still render");
const genTex = renderToString(
  <GeneratingOutline beats={["why $\\Omega(n \\log n)$ sticks"]} />,
);
if (!genTex.includes("katex")) fail("prose", "generating beats should render TeX");
const lemmaHtml = proseHtml(
  "**Standard proof** from mathlib `ProbabilityTheory.strong_law_ae`.",
);
if (lemmaHtml.includes("katex") && lemmaHtml.includes("strong_")) {
  fail("prose", "lemma underscores in backticks must not become TeX");
}
if (!lemmaHtml.includes("ProbabilityTheory.strong_law_ae")) {
  fail("prose", "lemma name should remain readable");
}
const thmHtml = proseHtml(
  "**Asserted.** Through a point $(x_0,y_0)$ the solution is unique.\n\n**Proved.** Explicit Euler steps along the field.\n\nMoves: One forward tangent step.",
);
if (thmHtml.includes("<strong>Asserted") || thmHtml.includes("<strong>Proved")) {
  fail("prose", "theorem status should not lead as bold");
}
if ((thmHtml.match(/theorem-block/g) ?? []).length !== 2) {
  fail("prose", "each tagged theorem should be its own block");
}
if (thmHtml.includes("theorem-status") || /<(p|span)[^>]*>\s*(asserted|proved)\s*<\/(p|span)>/i.test(thmHtml)) {
  fail("prose", "asserted/proved should not print as visible labels");
}
if (!thmHtml.includes("theorem-sheet")) {
  fail("prose", "consecutive theorems should share one sheet");
}
if (!thmHtml.includes("unique") || !thmHtml.includes("Explicit Euler")) {
  fail("prose", "the claims should lead the theorem blocks");
}
if (thmHtml.includes("Moves:")) {
  fail("prose", "Moves: should not stay as a lead-in");
}
if (!thmHtml.includes("theorem-moves") || !thmHtml.includes("tangent")) {
  fail("prose", "named moves should sit under the claim, quieter");
}
if ((thmHtml.match(/theorem-moves/g) ?? []).length !== 1) {
  fail("prose", "an asserted claim should have no moves crib");
}
if (thmHtml.indexOf("unique") > thmHtml.indexOf("Explicit Euler")) {
  fail("prose", "theorems should keep source order");
}
const stackedHtml = proseHtml(
  "$$\n\\begin{gathered}a\\end{gathered}\\begin{gathered}b\\end{gathered}\n$$",
);
if ((stackedHtml.match(/tex-block/g) ?? []).length < 2) {
  fail("prose", "adjacent gathered steps should render as separate displays");
}
if (!stackedHtml.includes("fleqn")) {
  fail("prose", "display proof steps should flush left");
}
const rowHtml = proseHtml("$$\\begin{gathered}a\\\\b\\end{gathered}$$");
if ((rowHtml.match(/tex-block/g) ?? []).length < 2) {
  fail("prose", "gathered \\\\ rows should render as separate displays");
}
const proofHtml = proseHtml(
  [
    "1.",
    "$$",
    "a=b",
    "$$",
    "*by Chebyshev's inequality*",
    "*by simplification*",
    "2.",
    "$$",
    "b=c",
    "$$",
    "∎",
  ].join("\n"),
);
if (!proofHtml.includes("proof-n")) fail("prose", "proof steps should number on the math baseline");
if ((proofHtml.match(/proof-crib/g) ?? []).length !== 1) {
  fail("prose", "several tricks on one step should fold into one crib");
}
if (!proofHtml.includes("Chebyshev") || !proofHtml.includes("noting")) {
  fail("prose", "the folded crib should name the inequality and the constants");
}
if (!proofHtml.includes("proof-qed")) fail("prose", "a proved write-up should end with a QED mark on the last line");
report("prose", "inline", "Bold keeps math; stray ** dropped");

if (failures) {
  throw new Error(`${failures} design state(s) broken`);
}
console.log(`\nall ${SCENARIOS.length} states ok`);
