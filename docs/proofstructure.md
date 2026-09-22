# Proof write-up structure

How laws, theorems, and proofs are determined and displayed. Keep them rigorous and readable without spending a Cursor turn on layout that TypeSafe or the host can do.

A large part of that layout is **TypeSafe**, and specifically **Jev** (TypeSafe’s System One model). Jev does not write the teaching note. It returns small typed judgments and probabilities that the host combines: noul for independent yes/no, choice when exactly one label should win. Cursor still crystallises the page and translates Lean. Jev is the cheap common-sense layer in front of those turns — skip a quest agent on trivia, refuse a mathlib hit that is the wrong theorem, label which tricks a proof line actually uses. Fail-open: missing key, `TYPESAFE=0`, a 4s timeout, or a flat answer uses the old Cursor path. The key is server-side only; do not commit it.

---

## Asserted vs proved

A named theorem (or law) is **asserted** or **proved**.

**Asserted** — you named the result, not a proof. The block is:

1. Why it matters here (a pointer is enough, e.g. `use this when averages should track the mean` — not motivation theatre).
2. The **claim** (below).

That is all. No proof section.

**Proved** — you named interesting steps (a lemma, an identity, a reduction). That is the gate, not the write-up. The block is:

1. Why it matters here (same pointer rule).
2. The final result (the claim).
3. A **proof** section whose **numbered lines default to mathlib** when LeanSearch has an honest hit for that claim (below).

Never invent steps you skipped. A shrug (`obvious`, `uniqueness`, `by definition`) is not a proof — stay asserted.

---

## Claim

The claim is what we **store**, **merge** across lectures, **send to LeanSearch**, and **show as the result**. Mixing two claims is how WLLN gets an Etemadi Standard.

**Display.** The theorem’s **name** is the heading (Weak law of large numbers, Strong law of large numbers, Central limit theorem). Directly under it is the **claim**: a short English sentence of what the result actually asserts (who the $X_i$ are, the mode of convergence, what they converge to), then one display equation. That block is the statement, not a leftover named-move label. Do not put `You named: …` on the claim. Do not leave the reader with only `i.i.d., finite variance` and a symbol. Do not print `From mathlib ProbabilityTheory.…` on the teaching page (the lemma can live on the knowledge row for search).

**Readable.** Spell out the assertion. The weak law is that the average of a large number of independent random observations converges in probability to the expected population value when the observations are i.i.d. with finite variance — not merely $\bar X_n \xrightarrow{\mathrm{P}} \mu$. Keep the display as the compact form of that sentence. Do not invent a mode the summary did not name.

**Proof hypotheses stay in the sentence.** If the proof was Chebyshev, finite variance belongs in that claim, even if a stronger theorem exists without it. That is what LeanSearch and the merge key should see.

**Vague name.** “The LLN” with no weak/strong is not two blocks and not a guessed version. Prompt for which statement you meant (same idea as a correction gate).

TypeSafe may still alias a later restatement onto the stored claim when it is the same theorem.

---

## One node, two results

**Split into two theorem blocks when** there are two separate proofs, or the debrief explicitly mentioned both versions (WLLN and SLLN on `lln`).

**Keep one block otherwise.**

Independently citable named results still must not share a *concept id* (`lln` vs `clt`). This rule is only about theorem *blocks* on one page.

---

## Proof section (proved only)

A proof is, in this order:

1. **Numbered line-by-line TeX** — one main equality (or implication) per number. A simplification (σ² and ε constants, the bound → 0) may fold into the previous number if the commentary makes that obvious. Step numbers sit on the **math baseline** (so `\stackrel{d}` does not lift `8.`).
2. **Commentary** — interleaved **directly under** the relevant line, lined up with the TeX (not hanging off the list number). TypeSafe / Jev may attach **more than one** trick on the same line: independent noul per label, not an exclusive choice (Chebyshev *and* “σ and ε are constants”). Fold them into **one** italic crib: `by Chebyshev's inequality and noting $\sigma$ and $\varepsilon$ as constants`. Omit `none` and bare algebra. Your named interesting steps hang here too, not as a second proof. Do not bake cribs into `\text{by …}` inside the TeX.
3. **QED** — a $\square$ on the last display, on the math baseline (`\quad\square` in that TeX), not a sibling line or a lone unicode tombstone. Then the prose.
4. **Prose** — terse general explanation after the tombstone, not instead of the lines. Paraphrase the library argument in ordinary language (a six-month reread). Do not leave mathlib identifiers, tactic names, or backtick lemma paths in the note.

Host TeX rules:

- One display per numbered step; split `gathered` rows rather than one giant line.
- No two environments in one `$$`.
- Formulae in displays — no English paragraphs in `\text{}`.
- No `\[ \]`, no raw Lean identifiers in TeX.
- Left-aligned; no inner horizontal scroll.

On the teaching page, **Theorems** is a section heading, the theorem name is the next size down, **Proof** is body-sized. That hierarchy is host CSS, not a model turn.

---

## Where the lines come from

**Default: mathlib.** You will usually only name interesting steps, not write the argument. Numbered TeX is the LeanSearch hit when TypeSafe agrees it is the same theorem as the claim.

- Honest hit → those lines are the proof. Named steps become commentary (or “you proved it via …”).
- No honest hit (WLLN / Chebyshev today) → numbered TeX from the steps you named, as far as that goes. Do not invent the rest.
- Hit is a **different argument** (Kolmogorov sketch vs Etemadi Lean) → do not attach that Lean. Use your named steps as the lines.

Do not stack two full write-ups on the page.

---

## What Jev decides (so Cursor does not have to)

One POST to TypeSafe System One (`jev-latest`) per gate, host-owned combine, fail-open.

| Gate | Primitive | Host does if peaked |
| --- | --- | --- |
| Mathlib hit vs claim | choice among hits + `none` | Skip the translation turn, or take that hit |
| Quest title | noul (is this a study idea?) + choice (already in the library?) | Reject trivia, alias a known node, or skip `publish_quest_topic` |
| Teach-back | noul (adequate restatement, not a question) | Skip the teach-back agent |
| Quiz item | noul calc / tests-this-concept / keyed | Drop the item; fail-open if the bank would empty |
| Debrief correction | noul (spelling noise vs sign/arithmetic slip vs conceptual) | Drop one-off spelling typos; keep maths slips on the card; skip the shaky gate and store **known** if every kept correction is a slip |
| Restated theorem | choice onto a stored claim | Merge keys so WLLN does not mint a second block |
| Proof-line cribs | **noul per named trick**, per step | Fold surviving labels into one `by … and …` line |

Exclusive choice on cribs was the wrong shape: Chebyshev and “noting σ and ε as constants” can both be true. Independent noul is the TypeSafe-shaped fix. Thank you TypeSafe, thank you Jev.
