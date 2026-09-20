# Token efficiency

How to keep a critic cheap enough to run **every lecture**. What the app is *for* — friction, how a concept grows, restatements that earn library nodes, choosing a public series — is [why.md](why.md).

A study session is a handful of prompts on **one agent and one conversation**. The next session must **not** replay this chat: it reads `data/learner/` files. That is the main saving, not a smaller model.

Figures below are **measured** from assembled prompt strings (`npm run check:measure`), or **inferred** from those counts at ~4 chars/token.

## The rule

Standing context (profile excerpt, course blurb, concept tags, knowledge *slice*) is sent once per session. Later turns get a one-line reminder. After `REPRIME_AFTER_CARDS` (6) the slice is sent again so it does not drift out of weight.

The host, not the model, picks the quiz queue (`server/quizPick.ts`): after a debrief, three lecture-related ids and two cold hits; after the last lecture, five from that course weighted by structural importance plus coldness; on a finished course retake, the same five-from-course pick. Items are conceptual (no calculations). The whole set is written in **one** `publish_quiz_set` call. Grading a choice is local — no model turn. A new side quest from the nav is **one** `publish_quest_topic` (reject people and trivia; skip the call if the title already matches a library concept, or if TypeSafe already rejects / aliases / accepts it), then **one** `publish_quest_plan` if it is a new concept. A new course from a topic is **one** `publish_course_scout` per chat turn (skip the model if the field is already a listing URL or a catalog title); picking a series is a host fetch, not another prompt. Opening a concept with no file yet uses **one** `publish_concept_teaching` (and a small `publish_concept_outline` in that same turn). The host seeds the outline immediately so the pane can cycle beats without a second request; the file is then reread. A later lecture tagged to the same concept does **not** start another teaching prompt: `publish_debrief` may include `vocab` / `theorems` / `example` from the summary, and the host folds those into host-owned sections on the existing file. Theorem `proof` is optional; the host infers asserted vs proved and can attach a later proof to the same claim on another knowledge row without a second model turn. An easy mathlib hit adds **one** `publish_standard_proof` turn (Lean snippet + claim, no standing slice, no lecture summary). That write-up is stored; later debriefs do not repeat it. TypeSafe / Jev (when `TYPESAFE_API_KEY` is set) can skip that turn if none of the search hits is the same theorem, skip `publish_quest_topic` and `publish_teachback` when the verdict is peaked, after `publish_quiz_set` drop items that are calculations, test a different concept, or have the wrong keyed answer, and label proof-line cribs with one noul per named trick (one POST for the step set). Fail-open if nothing remains or Jev is flat. Missing key, `TYPESAFE=0`, timeout, or a flat answer uses the old Cursor path. Those TypeSafe calls are one POST each, not a Cursor agent.

`tools: ["mcp"]` only (so custom tools work). No read/grep/shell. The host already passed the slice; the model must not walk the repo.

## What a first debrief prompt contains

Measured with the committed empty profile, the 6.006 course blurb, lecture 4 tags, an empty knowledge slice, current debrief instructions, and an 800-character dummy summary (`npm run check:measure`):

- Standing context: **1,403 characters (~351 tokens, inferred at 4 chars/token)** — measured
- Full first debrief: **4,105 characters (~1,026 tokens, inferred)** — measured with that dummy summary
- Follow-up reminder: **83 characters** — measured. A second turn omits the standing block (**1,403 characters saved**, measured).
- Standard-proof turn, worst case (`CLIP.lean` = 8,000 dummy Lean chars): **9,196 characters (~2,299 tokens, inferred)** — measured. A real declaration is usually shorter; this turn is skipped when the teaching file already has display TeX.

## What we do not send

- Prior session transcripts (`data/sessions/` is UI resume only)
- Other courses’ lecture lists
- Concept ids outside this lecture plus quiz-queue ids and one hop of `seeAlso`
- Full `knowledge.md` when a slice will do
- Full concept teaching files except the clipped slice for ids in play
- Invented examples, and cartoon diagrams used only to name vocabulary (an example must carry a method or theorem from the written summary)
- The lecture summary to LeanSearch — if a proved claim is easy to find, the host POSTs only that claim (not the summary) to `leansearch.net`, then GETs the matching mathlib `.lean` from GitHub by the hit’s module path (validated `Mathlib/...` segments). A follow-up turn translates that Lean into TeX; it sees the claim, the informal docstring, and the Lean snippet, not the lecture summary. `MATHLIB_SEARCH=0` skips the search and the extra turn. TypeSafe / Jev can refuse a wrong hit before that extra turn; overlap matching remains the fallback when TypeSafe is off or unsure
- Decay echo history (`data/learner/decay.json` is host-only)
- The lecture summary on the background profile rewrite (structured evidence only)
- A knowledge.md rewrite — the host already applied `knowledgeUpdates` (and folded vocab / theorems / examples into teaching files when those fields are present)
- Symbol-picker order — local, from titles/ids already on the session plus picks this session, not notes and not a model turn

The concept library is built from tags on **content** lectures on disk (recap / quiz-review / course-synthesis slots do not count). Mapping already-debriefed lectures does not take a model turn.

## Background rewrite

After **debrief** only, a profile tidy runs on the same agent queue. Quiz sessions skip it (quiz-log + knowledge rows are host-written). Closing the agent waits on that write.

## If you are adding a prompt

1. Ask what this agent has already been told this session.
2. Take the knowledge *slice* for the ids in play, not the whole file.
3. Prefer one tool call over a turn per item.
4. Measure the assembled string before and after. A percentage without a measurement is a guess.
