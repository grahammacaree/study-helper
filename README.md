# Study helper

A local companion for self-directed maths. Not an exam coach, not a homework police, not a grader. Graham watches a lecture, writes a summary, and this app debriefs the ideas — chill, encouraging, and unwilling to let a backwards definition slide.

Sibling of the [code-review walkthrough](https://github.com/grahammacaree/code-review-helper): same stack (Vite + Express + `@cursor/sdk`), host-owned sessions, one agent per session, file memory. Look and layout follow the personal site (cream, rose rule, Palatino / Lato) and a Cursor-like three pane: **courses | lecture or chat | concepts**.

Catalogs are **titles, official URLs, and short concept tags** — not OCW PDFs.

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

- UI: [http://127.0.0.1:5180](http://127.0.0.1:5180)
- API: [http://127.0.0.1:8790](http://127.0.0.1:8790)

Ports are offset from the review helper (5173/8787) so both can run.

`npm run design` opens fixture UI states with no key. `npm run design:check` renders them headlessly.

## What you do

1. Pick a course in the left nav. The next incomplete lecture is the only one you can debrief; earlier ones show a check.
2. **Debrief** — paste the summary you wrote. The model checks conceptual mistakes (reduction direction, proven vs conjectured, hardness vs completeness, …), may note a structural gap. Corrections are optional to say back. **Finish anytime.** Leave shaky if you want the file to remember the wobble. If you want a detour, say so in the summary or hit **Side quest**.
3. **Quiz** — not a free-standing button. About one in five debriefs **starts** a five-question mix (three from that lecture, two from colder concepts, including older courses). That mix is part of finishing the debrief: no skip, no quit until the set is done. On a **finished** course, **Review** is optional: five from that course’s concepts, no repeats; skip is allowed. Items are conceptual (definitions, direction of implication, how you would attack a problem) — never a calculation. The host picks the mix; the model writes the set in one call. Grading is local.
4. **Side quest** — lives under **Now** in the left nav (start one there, or from a debrief). Its own chat: an explanation with a couple of links if they help, then an optional teach-back and a short conceptual quiz. It does not skip the lecture map.

Chat accepts `$...$` and `$$...$$` (KaTeX) in both directions.

You will skip homework questions. That is fine.

## Adding a course

Paste an OCW (or similar) course URL in the left nav. The host fetches the public page, writes `courses/<id>/` plus an `index.json` row, and invalidates the catalog cache. Concept tags start empty; fill them in when you care.

Optional, **gitignored**: if `PERSONAL_SITE_ROOT` is set and `local/personal-site.ts` exists, init may append a stub card to that site’s `studies.config.json`. That file is not in this repo. It must not copy Drive ids, notebook uuids, or other private fields.

## What it remembers

Long-term memory is files, not chat history. A new session starts a **new** Cursor agent and reads disk.

**Committed** under `courses/` — curriculum maps, safe to share.

**Gitignored** under `data/`:

| Path | Role |
| --- | --- |
| `data/learner/profile.md` | How you study (craft). Agent-maintained. |
| `data/learner/knowledge.md` | Known / shaky / unseen by concept id (one-line notes) |
| `data/learner/concepts/<id>.md` | Stored teaching for a concept (written once; no regenerate) |
| `data/learner/progress.json` | Per lecture: incomplete / complete |
| `data/learner/lectures/<course>/<n>.md` | Your summary + correction log |
| `data/learner/side-quests.md` | Open / parked / done |
| `data/learner/quiz-log.json` | Scores for spaced mix |
| `data/learner/decay.json` | Direct touches and neighbour echoes (freshness). No notes. |
| `data/sessions/` | Resume the UI. **The next agent run does not send this transcript.** |

Catalog `latest` / `complete` seed progress on load and will not downgrade a complete lecture. Only the next incomplete lecture can be debriefed.

[docs/token-efficiency.md](docs/token-efficiency.md) has measured prompt sizes.

## Data and security

Personal local software, not a hosted product.

**On this machine.** `CURSOR_API_KEY` lives in `.env` (gitignored). Learner state lives under `data/` (gitignored). None of that is encrypted at rest.

**Off this machine.** Debrief text, quiz answers, and slices of the learner files go through the **Cursor API** and bill to your key. Multiple-choice grading is local (the pick does not need a model turn). Session JSON under `data/sessions/` includes pasted summaries. Do not commit `data/` or `.env`. The server does not print summaries to logs.

**The local HTTP API.** UI and API bind to `127.0.0.1`. There is no login. Do not expose 5180/8790 to the network.

**Copyright.** `courses/` must not grow into dumped lecture notes. The concept library is names, parents, and lecture links — no invented examples.

The right-hand **Library** tab is the concept map. A node appears only if a **complete** lecture links it, plus ancestors so the tree can stand. Incomplete lectures stay hidden. Examples appear only after a debrief copies them from a pasted summary. A finished side quest writes `data/learner/concepts/<id>.md` from the notes already on disk. Clicking any unlocked concept opens that file in the centre pane (Ask, optional Quiz). If the file is missing, one model turn writes it, then later visits reread disk.

Each unlocked concept **decays**. Direct study (a debrief or a quiz on that id) is a full touch. Seeing a catalog neighbour — Chebyshev while proving the LLN, next to Hoeffding from Learning from Data — is an **echo**: it is noted on the older concept and slows the fade, but it is not a restudy. Dates for lectures you took before this app are seeded from Done vs Now timing, and the UI says so.

Delete `data/` and `.env` for a clean slate.

## Files

| Path | Role |
| --- | --- |
| `courses/` | Lecture maps + `concepts.json` |
| `templates.md` | Output shapes |
| `server/` | Host (catalog, learner files, sessions, agent) |
| `server/quizPick.ts` | Deterministic quiz mix — the model does not choose the queue |
| `local/` | Gitignored optional site bridge |
| `web/` | Three-pane UI |
| `web/src/design/` | Design mode fixtures + headless check |
| `docs/token-efficiency.md` | What each prompt sends |

## What it is not

- Not a Remarkable/OCR pipeline
- Not a hosted tutor
- Not a replacement for working the problem sets
- Not an exam or certification coach
