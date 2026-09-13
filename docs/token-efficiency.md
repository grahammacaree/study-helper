# Token efficiency

How to keep a critic cheap enough to run **every lecture**. What the app is *for* — friction, restatements that earn library nodes, choosing a public series — is [why.md](why.md).

A study session is a handful of prompts on **one agent and one conversation**. The next session must **not** replay this chat: it reads `data/learner/` files. That is the main saving, not a smaller model.

Figures below are **measured** from assembled prompt strings (`npm run check:measure`), or **inferred** from those counts at ~4 chars/token.

## The rule

Standing context (profile excerpt, course blurb, concept tags, knowledge *slice*) is sent once per session. Later turns get a one-line reminder. After `REPRIME_AFTER_CARDS` (6) the slice is sent again so it does not drift out of weight.

The host, not the model, picks the quiz queue (`server/quizPick.ts`): after a debrief, three lecture-related ids and two cold hits; after the last lecture, five from that course weighted by structural importance plus coldness; on a finished course retake, the same five-from-course pick. Items are conceptual (no calculations). The whole set is written in **one** `publish_quiz_set` call. Grading a choice is local — no model turn. A new side quest from the nav is **one** `publish_quest_topic` (reject people and trivia; skip the call if the title already matches a library concept), then **one** `publish_quest_plan` if it is a new concept. A new course from a topic is **one** `publish_course_scout` per chat turn (skip the model if the field is already a listing URL or a catalog title); picking a series is a host fetch, not another prompt. Opening a concept with no file yet uses **one** `publish_concept_teaching` (and a small `publish_concept_outline` in that same turn). The host seeds the outline immediately so the pane can cycle beats without a second request; the file is then reread.

`tools: ["mcp"]` only (so custom tools work). No read/grep/shell. The host already passed the slice; the model must not walk the repo.

## What a first debrief prompt contains

Measured with the committed empty profile, the 6.006 course blurb, lecture 4 tags, an empty knowledge slice, current debrief instructions, and an 800-character dummy summary (`npm run check:measure`):

- Standing context: **1,351 characters (~340 tokens, inferred at 4 chars/token)** — measured
- Full first debrief: **2,899 characters (~725 tokens, inferred)** — measured with that dummy summary
- Follow-up reminder: **83 characters** — measured. A second turn omits the standing block (**1,351 characters saved**, measured).

## What we do not send

- Prior session transcripts (`data/sessions/` is UI resume only)
- Other courses’ lecture lists
- Concept ids outside this lecture plus quiz-queue ids and one hop of `seeAlso`
- Full `knowledge.md` when a slice will do
- Full concept teaching files except the clipped slice for ids in play
- Invented examples (examples only if the written summary has one)
- Decay echo history (`data/learner/decay.json` is host-only)
- The lecture summary on the background profile rewrite (structured evidence only)
- A knowledge.md rewrite — the host already applied `knowledgeUpdates`
- Symbol-picker order — local, from titles/ids already on the session plus picks this session, not notes and not a model turn

The concept library is built from lecture titles on disk. Mapping already-debriefed lectures does not take a model turn.

## Background rewrite

After **debrief** only, a profile tidy runs on the same agent queue. Quiz sessions skip it (quiz-log + knowledge rows are host-written). Closing the agent waits on that write.

## If you are adding a prompt

1. Ask what this agent has already been told this session.
2. Take the knowledge *slice* for the ids in play, not the whole file.
3. Prefer one tool call over a turn per item.
4. Measure the assembled string before and after. A percentage without a measurement is a guess.
