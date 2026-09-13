# Study helper

A local companion for self-directed maths. Not an exam coach, not homework police, not a grader. You pick a public lecture series, watch, **write a summary**, and only then does a model debrief the ideas — chill, encouraging, and unwilling to let a backwards definition slide. Nodes you have actually met land in a concept library (open to read; Quiz hides the notes). Side quests are conceptual detours you teach back before they can join that library.

It is personal software on your machine. The public GitHub copy is the app, not your curriculum or notes.

**Why it exists** — friction, restatements that earn library nodes, how a new course is chosen: [docs/why.md](docs/why.md). Prompt sizes: [docs/token-efficiency.md](docs/token-efficiency.md).

Sibling of the [code-review walkthrough](https://github.com/grahammacaree/code-review-helper): Vite + Express + `@cursor/sdk`, host-owned sessions, one Cursor agent per session, file memory.

## Requirements

- Node.js 20+ and npm
- a [Cursor API key](https://cursor.com/dashboard/api)
- macOS or Linux

```bash
cp .env.example .env
```

Put the key in `.env` as `CURSOR_API_KEY`. Optional: `CURSOR_MODEL` (default `composer-2.5`), `PORT` (default `8790`).

```bash
npm install
npm run dev
```

- UI: [http://127.0.0.1:5180](http://127.0.0.1:5180) (Vite takes the next free port if 5180 is busy)
- API: [http://127.0.0.1:8790](http://127.0.0.1:8790)

Both bind to `127.0.0.1`. Ports are offset from the review helper (5173/8787) so both can run.

`npm run design` opens fixture UI states with no key. `npm run design:check` renders them headlessly. `npm run check` also typechecks and runs catalog/quiz/decay checks; those catalog checks expect a local `courses/` tree.

## Layout

Three panes:

1. **Courses** — current courses, completed courses, and (only if any exist) active side quests. At the bottom, Course / Side quest tabs: a topic (or a listing URL) starts a new course, or a quest title starts a quest.
2. **Centre** — the lecture map for the selected course, or a chat (debrief, quiz/review, concept, side quest, or picking a new course).
3. **Concept library** — unlocked concepts as a tree. Hide it with the chevron.

`$...$` and `$$...$$` render as KaTeX in both directions, as do `\(...\)`, `\[...\]`, and bare bits like `Z^{2}`. Skipping problem sets is fine.

## What you do

### Adding a course

Type a topic (`game theory`) or paste a public listing **https** URL in the left nav. A URL (or a name already in the catalog) is enough. A topic opens a centre-pane chat about freely available video lecture series — MIT OCW calendars, Yale Open Courses, Harvard Stat 110, Caltech Learning from Data, and similar public listings. Pick one; the host fetches that page and writes `courses/<id>/` plus an `index.json` row. Concept tags start empty; fill them in when you care. A missing `courses/` folder is an empty catalog, not a crash. The bar for what counts as a series is in [docs/why.md](docs/why.md#selecting-a-new-course).

Unstarted courses can sit in `courses/index.json` with `"track": "later"` so they stay off Current and Completed until you mean to study them.

### Lecture map

Pick a course. Only the next incomplete lecture is open: **Debrief** starts a session for that one. Earlier lectures show a check. If a completed lecture is tagged with several concepts, those names list under it and open the concept pane. If it is 1:1 with a concept of the same name, the lecture title itself is that link.

### Debrief

Write a summary of the lecture in the compose field. Drag the bar on its top edge to grow it for a long write-up. **Symbols** inserts TeX at the caret; the grid is the full set, ordered by this lecture/course/concept and by what you picked this session (not by a model call, and not from your notes). The model checks conceptual mistakes (reduction direction, proven vs conjectured, hardness vs completeness, …) and may note a structural gap. Saying the correction back is optional; **Leave shaky** stores the wobble. **Finish** anytime before a closing quiz. **Side quest** starts a detour from this debrief (or say you want one in the summary).

About one in five **non-final** debriefs then starts a **five-question mix** (three from that lecture, two colder, including older courses). That mix is part of finishing: no skip, no quit until it is done. Items are conceptual — definitions, direction of implication, how you would attack a problem — never a calculation. The host picks the queue; the model writes the set in one call; grading the pick is local.

Finishing the **last** lecture always starts a five-question **course review**, also no skip. The host weights toward concepts that do more work in that course (tagged on more lectures, parents of other tagged concepts, seeAlso links), with coldness as a tie-breaker — not a random leaf.

### Review

On a finished course (every lecture complete), **Review** is an optional retake of that same five-concept pick. Skip is allowed on a retake.

### Concept library

A node appears if a **complete** lecture tags it, plus ancestors so the tree can stand, plus concepts from **done** side quests. Incomplete lectures stay hidden. Fresh concepts get a slight emphasis; opening a concept does not count as restudy. **Ask** or starting a concept **Quiz** does.

Click a concept for stored teaching in the centre pane (Ask only). Non-root concepts offer **Quiz**. The first quiz is generated and saved next to the teaching file; **Quiz** again reuses that set and does not regenerate. Teaching is hidden during the check. If there is no teaching file yet, one model turn writes it; later visits reread disk. Host-owned “see also” links jump to other concepts.

### Side quests

Start one from the nav tabs or from a debrief. Its own chat: an explanation (a couple of links if they help), then teach-back **and** a short conceptual quiz before **Done** will enable. **Quit** drops that quest from the file. A finished quest can land in the concept library from the notes already on disk. The **Active side quests** heading is omitted when nothing is open.

## What it remembers

Long-term memory is files, not chat history. A new session starts a **new** Cursor agent and reads disk. Session JSON is only so the UI can resume; the next agent run does not send that transcript.

**Gitignored** — local only, not the public tree:

| Path | Role |
| --- | --- |
| `courses/` | Lecture maps, blurbs, `concepts.json` |
| `courses/index.json` | Course list: `currently` / `previously` / `later`, `latest`, `complete` |
| `.env` | `CURSOR_API_KEY` (and optional model, port, site root) |
| `data/learner/profile.md` | How you study (craft). Agent-maintained after a debrief. |
| `data/learner/knowledge.md` | Known / shaky / unseen by concept id |
| `data/learner/concepts/<id>.md` | Stored teaching (written once; no regenerate) |
| `data/learner/concepts/<id>.quiz.json` | Stored concept quiz, if you have taken one |
| `data/learner/progress.json` | Per lecture: incomplete / complete |
| `data/learner/lectures/<course>/<n>.md` | Your summary + correction log |
| `data/learner/side-quests.md` | Open / parked / done |
| `data/learner/quiz-log.json` | Scores for spaced mix |
| `data/learner/decay.json` | Direct touches and neighbour echoes (freshness). No notes. |
| `data/sessions/` | UI resume |
| `local/` | Optional personal-site bridge |

`latest` / `complete` seed progress on load and will not downgrade a complete lecture. Neighbour **echoes** (seeing Chebyshev next to Hoeffding) slow decay; they are not a restudy.

[docs/why.md](docs/why.md) is the intent. [docs/token-efficiency.md](docs/token-efficiency.md) has measured prompt sizes (`npm run check:measure`).

## Data and security

Personal local software, not a hosted product.

**On this machine.** Key, learner files, and course maps are gitignored and unencrypted at rest.

**Off this machine.** Debrief text, quiz *generation* (not the letter you pick), Ask/teach-back, and slices of learner files go through the **Cursor API** and bill to your key. Do not commit `.env`, `data/`, or `courses/`. The server does not print summaries to logs.

**The local HTTP API.** No login. Do not expose 5180/8790 (or whichever Vite port) to the network.

**Copyright.** `courses/` must not grow into dumped lecture notes. The concept graph is names, parents, and lecture links. Examples on a knowledge row exist only if a pasted summary had one — the model must not invent them.

Delete `data/`, `courses/`, and `.env` for a clean slate.

## Repo

| Path | Role |
| --- | --- |
| `server/` | Host: catalog, learner files, sessions, agent |
| `server/quizPick.ts` | Deterministic quiz mix — the model does not choose the queue |
| `web/` | Three-pane UI |
| `web/src/design/` | Design-mode fixtures + headless check |
| `checks/` | Catalog / quiz / decay / quests / token-size scripts |
| `docs/why.md` | Motivation, friction, earning the library, picking a course |
| `docs/token-efficiency.md` | What each prompt sends |
| `templates.md` | Sketch of debrief/quiz shapes; live instructions live in `server/agent.ts` |

## What it is not

- Not a Remarkable/OCR pipeline
- Not a hosted tutor
- Not a replacement for working the problem sets
- Not an exam or certification coach
