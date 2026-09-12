# Study helper

A local companion for self-directed maths. Not an exam coach, not homework police, not a grader. You pick courses, watch a lecture, write a summary, and this app debriefs the ideas — chill, encouraging, and unwilling to let a backwards definition slide. Those ideas land in a concept library you can reopen later (Ask, and Quiz on non-roots). Side quests are detours off the lecture map.

It is personal software on your machine. The public GitHub copy is the app, not your curriculum or notes.

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

1. **Courses** — current courses, completed courses, and (only if any exist) active side quests. At the bottom, Course / Side quest tabs to initialise a course URL or start a quest by title.
2. **Centre** — the lecture map for the selected course, or a chat (debrief, quiz/review, concept, or side quest).
3. **Concept library** — unlocked concepts as a tree. Hide it with the chevron.

`$...$` and `$$...$$` render as KaTeX in both directions. Skipping problem sets is fine.

## What you do

### Lecture map

Pick a current course. Only the next incomplete lecture is open: **Debrief** starts a session for that one. Earlier lectures show a check. If a completed lecture is tagged with several concepts, those names list under it and open the concept pane. If it is 1:1 with a concept of the same name, the lecture title itself is that link.

Unstarted courses can sit in `courses/index.json` with `"track": "later"` so they stay off Current and Completed until you mean to study them.

### Debrief

Paste the summary you wrote. The model checks conceptual mistakes (reduction direction, proven vs conjectured, hardness vs completeness, …) and may note a structural gap. Saying the correction back is optional; **Leave shaky** stores the wobble. **Finish** anytime before a closing quiz. **Side quest** starts a detour from this debrief (or say you want one in the summary).

About one in five debriefs then starts a **five-question mix** (three from that lecture, two colder, including older courses). That mix is part of finishing: no skip, no quit until it is done. Items are conceptual — definitions, direction of implication, how you would attack a problem — never a calculation. The host picks the queue; the model writes the set in one call; grading the pick is local.

### Review

On a **finished** course (`complete` in the catalog), **Review** is optional: five unique concepts from that course, coldest first. Skip is allowed.

### Concept library

A node appears if a **complete** lecture tags it, plus ancestors so the tree can stand, plus concepts from **done** side quests. Incomplete lectures stay hidden. Fresh concepts get a slight emphasis; opening a concept does not count as restudy. **Ask** or starting a concept **Quiz** does.

Click a concept for stored teaching in the centre pane (Ask only). Non-root concepts offer **Quiz**. The first quiz is generated and saved next to the teaching file; **Quiz** again reuses that set and does not regenerate. Teaching stays on screen during the check. If there is no teaching file yet, one model turn writes it; later visits reread disk. Host-owned “see also” links jump to other concepts.

### Side quests

Start one from the nav tabs or from a debrief. Its own chat: an explanation (a couple of links if they help), then teach-back **and** a short conceptual quiz before **Done** will enable. **Quit** drops that quest from the file. A finished quest can land in the concept library from the notes already on disk. The **Active side quests** heading is omitted when nothing is open.

## Adding a course

Paste an OCW (or similar) **https** course URL. The host fetches the public page and writes `courses/<id>/` plus an `index.json` row. Concept tags start empty; fill them in when you care. A missing `courses/` folder is an empty catalog, not a crash.

Optional, **gitignored**: if `PERSONAL_SITE_ROOT` is set and `local/personal-site.ts` exists, init may append a stub card to that site’s `studies.config.json`. That file is not in this repo. It must not copy Drive ids, notebook uuids, or other private fields.

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

[docs/token-efficiency.md](docs/token-efficiency.md) has measured prompt sizes (`npm run check:measure`).

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
| `docs/token-efficiency.md` | What each prompt sends |
| `templates.md` | Sketch of debrief/quiz shapes; live instructions live in `server/agent.ts` |

## What it is not

- Not a Remarkable/OCR pipeline
- Not a hosted tutor
- Not a replacement for working the problem sets
- Not an exam or certification coach
