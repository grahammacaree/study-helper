# Why this app

Self-directed maths with a critic, not a tutor that does the work. You watch a public lecture series, write what you understood, and only then does a model get to talk. What survives is a **concept library on disk** — names you have actually met — not a chat you would have to re-read.

The public GitHub tree is the machine. Curriculum and notes stay on this computer.

[How to run it](../README.md). [How a concept grows](#how-a-concept-grows). [How little each prompt sends](token-efficiency.md).

## Motivation

A capable model after a lecture is too easy. You can paste a vague impression and get a fluent essay that *sounds* like hashing. Next week the essay is gone, the definition is still backwards, and you have practised reading, not retrieving.

The other ready-made tools miss a different piece. Anki is retrieval without a course spine. OCW is a spine without a companion that remembers what you inverted. A notes app is a pile.

This app is for the gap: **one lecture at a time**, **your words first**, **a durable graph of ideas** you can open later as a library — consultation, not a pop quiz on click.

It is not an exam coach, not homework police, and not a replacement for working problems if you want that craft. Skipping problem sets is fine. Letting a reduction run the wrong way is not.

## AI-assisted learning

The model is allowed to **check**, **quiz**, and **crystallise**. It is not allowed to **be the study**. Host-owned files and queues exist so that a new session does not replay yesterday’s chat and so the model cannot invent the curriculum. **TypeSafe / Jev** sits in front of several of those Cursor turns: a small judgment (noul or choice) instead of an essay, fail-open if Jev is unsure. Details: [proofstructure.md](proofstructure.md#what-jev-decides-so-cursor-does-not-have-to).

### Friction is the feature

You watch. You write a summary. **Then** debrief. The composer will not draft the lecture for you. That delay is the generation effect: producing the idea, not recognising a paragraph about it.

A side quest is a concept, or it is refused. A person, a news story, trivia — it does not enter the library by chatting it into existence. A recap lecture (quiz review, course synthesis, “the course so far”) is not a node either: you meet a **definition, structure, technique, or theorem**, not the calendar slot.

Concept **Quiz** hides the teaching. Opening Hashing is still Hashing (that is what a library is for). The check is a different verb: retrieve, then the notes come back.

The mix after some debriefs is not skippable. Cold nodes from older courses sit next to today’s lecture so the graph does not rot in silence.

### Restate to earn a place in the library

A library node is not a gift from the model. You **meet** an idea in a lecture or a quest, and you **pay for it in restatements**.

| You do | What that restatement is | What you earn |
| --- | --- | --- |
| Write a lecture summary, then debrief | First pass in your own words. Optional second pass if a definition was backwards | The lecture completes. Tagged concepts **unlock** in the tree (plus ancestors so the tree can stand) |
| Teach a side quest back, then finish its conceptual quiz | Mandatory Feynman-ish restatement, then a short closed check | **Done** enables. Quest notes on disk can become a library concept |
| Open a concept and take **Quiz** | Recognition without the sheet | Restudy. The node was already yours |

You earned the *node* by debriefing or finishing a quest. The teaching page is a stable thing to Ask against, not the proof that you understand it.

### How a concept grows

One concept id is one node, even when several courses tag it. `markov-chains` from Stat 110 and from another series is the same library page, not a child per lecture.

**Grain.** Same lecture is not the same node. Split independently citable named results (LLN vs CLT, Markov vs Chebyshev, BFS vs DFS) even when the calendar pairs them — each can carry its own theorem pass, and swapping them is the mix-up. Combine faces of one object (PMF and CDF), duals of one operator (Adam’s law and Eve’s law), or a family bucket whose children are the named members (`limit-theorems` → `lln`, `clt`; `inequalities` → Markov, Chebyshev). Never name a leaf after a lecture title that is a comma-list of famous results. Host check: `fusedCitableResults` in `server/conceptShape.ts`.

1. **Meet it.** A content lecture you complete names it, or a done side quest becomes it. Recap / quiz-review / “the course so far” slots do not unlock anything.
2. **Unlock.** It appears in the tree (plus ancestors so the tree can stand). Opening it is consultation, not restudy.
3. **Crystallise.** The first open writes `data/learner/concepts/<id>.md` in one model turn. Later visits reread that file. The body is not rewritten as a whole; reopening must not resurrect a stale example or theorem from the knowledge index.
4. **Enrich from later summaries.** The same `publish_debrief` call may carry `vocab`, `theorems`, and `example` taken from *this* write-up. The host folds those into host-owned sections on the existing page — no second teaching prompt, and nothing the model invented.

| Pass | Lands only if | What the host stores |
| --- | --- | --- |
| Vocabulary | You characterised the term, not merely named it | `**term**: gloss` in your words. A bare word is dropped. |
| Theorems | You stated the claim | **Asserted** if you only named the result. **Proved** if you named the interesting steps (the lemma, the identity, the reduction) — not a full TeX slog, and not a shrug. The page’s numbered proof **defaults to mathlib** when the hit matches that claim; your named steps are commentary. No honest hit → only the steps you named. A later summary that names those moves for the same claim upgrades it. **TypeSafe / Jev** can alias a restated claim onto the stored wording, refuse a wrong mathlib hit, and label each proof line with independent cribs (Chebyshev *and* constants, not an exclusive pick). Spec: [proofstructure.md](proofstructure.md). |
| Examples | The case does work: a computation, a reusable model, or a special case that proves a claim | At most one working example per pass. Lecturer cartoons that only name vocabulary stay out (they belong in a gloss if anywhere). A real theorem outranks an extra example. |

`knowledge.md` is the index (known / shaky, note, those passes). The teaching file is the page you read. Both stay on this computer.

### What the model must not do

- Write the library from a topic you have not studied
- Invent a glossary, a proof, or a cute example so the teaching file looks full
- Fill in proof steps he skipped
- Upsell side quests you did not ask for
- Grade an exam or nag about skipped psets
- Choose the quiz queue (the host does, from tags, structure, and decay)
- Walk the repo or scrape copyrighted notes into `courses/`

## Selecting a new course

The nav is a **topic or a listing URL**, not an OCW paste box.

A name or listing URL already in the catalog opens that course. If it was parked as `"track": "later"`, it moves onto Current. A new public `https` listing (OCW course home, Harvard Stat 110’s YouTube page, Caltech Learning from Data, Yale Open, a playlist page) is fetched immediately: the host writes a lecture map from the public HTML. Concept tags start empty until you care.

Anything else — `game theory` — opens a centre-pane conversation about **freely available video lecture series**. The bar:

- Video lectures you can actually watch without a login wall (Coursera/edX stay out unless the videos are free in the open)
- A **public listing** the host can turn into numbered lectures: an OCW calendar, a YouTube course page, a telecourse table. One marketing landing page is a weak map
- Not already in your catalog
- A series, not a person and not a news event

You talk until one listing is clearly the one (Yale ECON 159 is the usual first stop for game theory; MIT OCW if you want the same ecosystem as 6.006). Then the host fetches. Unstarted courses can sit in `index.json` as `"track": "later"` so they stay off Current until you mean them.

The point of the conversation is **fit**, not completeness of the internet. Depth vs breadth, notes-heavy vs video-first, maths vs economics flavour — you choose; the model proposes; the files only change when you pick.

## Files, not chats

Long-term memory is `data/learner/` and `courses/`. A new Cursor agent reads those. Session JSON is only so the UI can resume. Token discipline ([token-efficiency.md](token-efficiency.md)) is how this stays cheap enough to run **every lecture** instead of becoming a weekend chatbot. Closing a course is host work: `index.json` moves to `previously`, and an optional `local/personal-site.ts` hook can flip the matching row on your site — title, href, and status only. A proved claim may be POSTed (claim only) to LeanSearch; the lecture summary stays on this computer.
