# Output templates

Host fills these shapes. Do not add extra sections.

## Concept teaching page (host-owned sections)

The model writes the body. The host later appends:

```markdown
## Vocabulary
- **term**: gloss in his words

## Theorems
### Weak law of large numbers

[claim — named library results only]

#### Proof

[numbered TeX when proved + mathlib hit]

## Examples
- [worked method / unnamed proof — not a cartoon that only names vocab]
```

**Examples** means a computation, reusable model, or unnamed claim/proof from the summary. Lecturer sketches that only introduce vocabulary stay out (or in a gloss).

## Debrief card

```markdown
**Debrief**

[summaryNote: 2–4 sentences, chill, structural]

**Corrections**
- [mistake, or None]

**Worth adding**
- [skipped structural piece that actually matters, or None]

**Side quests**
Only if he explicitly asked for a detour in the summary.

```markdown
- **[title]** — [why]
```

## Quiz item

Friendly multiple choice. No timer. Host grades locally.

```markdown
[n] of [total] · `[conceptId]`

[one question]

- A …
- B …
- C …
- D …

If fuzzy: [where in his notes]
```

## Wrong choice

Stay on the item. Point at notes. Skip is allowed on Review only — not on the after-debrief mix.

```markdown
[why the pick was off]. Peek at [noteHint] if you want a reminder.
```
