# Why this app

Self-directed maths with a critic, not a tutor that does the work. You watch a public lecture series, write what you understood, and only then does a model get to talk. What survives is a **concept library on disk** — names you have actually met — not a chat you would have to re-read.

The public GitHub tree is the machine. Curriculum and notes stay on this computer.

[How to run it](../README.md). [How little each prompt sends](token-efficiency.md).

## Motivation

A capable model after a lecture is too easy. You can paste a vague impression and get a fluent essay that *sounds* like hashing. Next week the essay is gone, the definition is still backwards, and you have practised reading, not retrieving.

The other ready-made tools miss a different piece. Anki is retrieval without a course spine. OCW is a spine without a companion that remembers what you inverted. A notes app is a pile.

This app is for the gap: **one lecture at a time**, **your words first**, **a durable graph of ideas** you can open later as a library — consultation, not a pop quiz on click.

It is not an exam coach, not homework police, and not a replacement for working problems if you want that craft. Skipping problem sets is fine. Letting a reduction run the wrong way is not.

## AI-assisted learning

The model is allowed to **check**, **quiz**, and **crystallise**. It is not allowed to **be the study**. Host-owned files and queues exist so that a new session does not replay yesterday’s chat and so the model cannot invent the curriculum.

### Friction is the feature

You watch. You write a summary. **Then** debrief. The composer will not draft the lecture for you. That delay is the generation effect: producing the idea, not recognising a paragraph about it.

A side quest is a concept, or it is refused. A person, a news story, trivia — it does not enter the library by chatting it into existence.

Concept **Quiz** hides the teaching. Opening Hashing is still Hashing (that is what a library is for). The check is a different verb: retrieve, then the notes come back.

The mix after some debriefs is not skippable. Cold nodes from older courses sit next to today’s lecture so the graph does not rot in silence.

### Restate to earn a place in the library

A library node is not a gift from the model. You **meet** an idea in a lecture or a quest, and you **pay for it in restatements**.

| You do | What that restatement is | What you earn |
| --- | --- | --- |
| Write a lecture summary, then debrief | First pass in your own words. Optional second pass if a definition was backwards | The lecture completes. Tagged concepts **unlock** in the tree (plus ancestors so the tree can stand) |
| Teach a side quest back, then finish its conceptual quiz | Mandatory Feynman-ish restatement, then a short closed check | **Done** enables. Quest notes on disk can become a library concept |
| Open a concept and take **Quiz** | Recognition without the sheet | Restudy. The node was already yours |

The teaching file you see on open is a **crystallisation** written once (host-owned, not regenerated). It is not a substitute for the summary you wrote, and it is not a dump of the lecture. You earned the *node* by debriefing or finishing a quest. The prose is a stable page to Ask against, not the proof that you understand it.

Examples on a knowledge row exist only if your written summary had one. The model must not invent a cute story so the file looks full.

### What the model must not do

- Write the library from a topic you have not studied
- Upsell side quests you did not ask for
- Grade an exam or nag about skipped psets
- Choose the quiz queue (the host does, from tags, structure, and decay)
- Walk the repo or scrape copyrighted notes into `courses/`

## Selecting a new course

The nav is a **topic or a listing URL**, not an OCW paste box.

A name already in the catalog just selects that course. A public `https` listing (OCW course home, Harvard Stat 110’s YouTube page, Caltech Learning from Data, Yale Open, a playlist page) is fetched immediately: the host writes a lecture map from the public HTML. Concept tags start empty until you care.

Anything else — `game theory` — opens a centre-pane conversation about **freely available video lecture series**. The bar:

- Video lectures you can actually watch without a login wall (Coursera/edX stay out unless the videos are free in the open)
- A **public listing** the host can turn into numbered lectures: an OCW calendar, a YouTube course page, a telecourse table. One marketing landing page is a weak map
- Not already in your catalog
- A series, not a person and not a news event

You talk until one listing is clearly the one (Yale ECON 159 is the usual first stop for game theory; MIT OCW if you want the same ecosystem as 6.006). Then the host fetches. Unstarted courses can sit in `index.json` as `"track": "later"` so they stay off Current until you mean them.

The point of the conversation is **fit**, not completeness of the internet. Depth vs breadth, notes-heavy vs video-first, maths vs economics flavour — you choose; the model proposes; the files only change when you pick.

## Files, not chats

Long-term memory is `data/learner/` and `courses/`. A new Cursor agent reads those. Session JSON is only so the UI can resume. Token discipline ([token-efficiency.md](token-efficiency.md)) is how this stays cheap enough to run **every lecture** instead of becoming a weekend chatbot.
