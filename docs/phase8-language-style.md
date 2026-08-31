# Player language — the style guide

v1.1 · 2026-08-31 · Enforced: `harness/prose.js` runs inside `npm test` and rejects
any level text over the §4 budgets, the banned list, or the §5 term ladder. The v1.0
rewrite queue (§9) is done — all shipped text passes. Governs every word a player reads: level text (briefing, prediction,
goal, verdict, reflections), HUD lines, Observatory narrations, cards, and future UI
copy. Written after levels 1–5 shipped; §9 audits those texts against these rules and
queues the fixes. The Data pages and harness output are instruments, not prose — they
keep their functional labels.

## 1. Who we are writing for

One reader, held in mind for every sentence: **a curious adult on a phone**. They liked
biology at school and remember fragments — food chains, "survival of the fittest",
photosynthesis is about light. They have not read a science text in years. They are
playing in a spare quarter hour, maybe on a train, with half their attention. They did
not come to study; they came to poke a pond and see what happens.

What follows from this, before any rule: the pond does the teaching, and the words only
point. If a sentence is doing the work the world should do, cut the sentence, not the
world (the intrinsic-integration rule from phase8-ladder-design.md §1).

## 2. What the research says (and the rule each finding becomes)

1. **Conversational beats formal** (Mayer's personalization principle: people learn
   better from "you" and "we" than from lecture voice). → *Talk to the player. "You
   carry ten doses" — never "the player is provided with".*
2. **Every extra word costs learning** (Mayer's coherence principle: extraneous words
   and decorations reduce learning, even interesting ones). → *No ornament. A
   beautiful phrase that adds no meaning is a bug, not a feature. One metaphor per
   text, at most.*
3. **Plain language, ~grade 8** (the standing recommendation for lay science
   summaries; short direct sentences; explain a term before or as you use it, never
   after). → *Hard budgets in §4. A term the reader might not know never appears bare
   in body text.*
4. **Name after experience** (guided-inquiry practice, and Beck's vocabulary tiers:
   everyday words carry the reasoning; the technical term is a label attached to a
   phenomenon already understood). → *First the thing happens in plain words. Then,
   once, its science name — as a label, in the debrief or the subtitle. From the next
   level on, the name may be used plainly. One new science name per level, maximum.
   This is the §5 term ladder — "increase complexity only as needed", made mechanical.*
5. **Microcopy carries half-attention players** (game UX writing: goal-first, snappy,
   minimal mental load; a player who cannot tell what to do in seconds leaves). →
   *HUD and buttons are not prose. Labels ≤ 3 words, goals ≤ 8, no verbs on meters.*

Sources: [personalization & coherence (Mayer)](https://waterbearlearning.com/mayers-principles-multimedia-learning/) ·
[plain-language grade-8 guidance](https://www.jrheum.org/content/plain-language-summaries) ·
[plain language is for everyone (NN/g)](https://www.nngroup.com/articles/plain-language-experts/) ·
[translating jargon for lay audiences](https://ecorrector.com/how-to-translate-scientific-jargon-for-a-lay-audience-effective-science-communication/) ·
[game microcopy craft](https://uxwritinghub.com/microcopy-video-games/)

## 3. Voice

**A friend at the pond's edge, pointing.** Warm, concrete, a little amazed, and honest
to the bone. Not a teacher, not a mascot, not a poet.

- The pond and its creatures are the actors. Verbs of behavior are welcome and vivid:
  the bloom *drinks*, the mat *starves*, the pack *hunts*, the mud *keeps* what falls
  into it. Verbs of intent are forbidden: nothing *wants*, *tries*, *knows*, or does
  anything *in order to* (see §7 — this line is what keeps the evolution levels honest).
- Address the player as "you". Their actions are theirs: "you poured", "your grazer".
- Short sentences carry surprise better than long ones. The measured twist IS the
  drama; it needs no dressing.
- Humor: dry and rare. Never at the player's expense, especially in fail text.

## 4. Hard budgets (checked, not felt)

| surface | budget | shape |
|---|---|---|
| title | 2–4 words | an everyday image, no science |
| science subtitle | ≤ 5 words | the ONLY home for textbook names |
| question | 1 sentence, ≤ 14 words | ends in ? |
| prediction prompt | ≤ 12 words | plain words only |
| prediction chips | ≤ 9 words each | plain words only, parallel in form |
| briefing | ≤ 3 sentences, ≤ 50 words | situation → your tools → nothing else (the goal line sits below it) |
| goalText | ≤ 8 words | includes the number the HUD shows |
| meters | 1–2 word labels | things, not verbs |
| narration events | 1 clause + 1 number | already the Observatory's fixed style |
| failNow / timeoutWhy | ≤ 2 sentences, ≤ 30 words | what happened, then which direction the fix lies — never scold |
| prediction reflect | ≤ 2 sentences, ≤ 28 words | speaks to the bet: "You bet on X. The pond said…" |
| debrief | ≤ 5 sentences, ≤ 75 words | what you did → what the pond did → the name, once → one look ahead |

Readability targets for every body text (briefing, debriefs, reflects, fails):
**no sentence over 20 words, Flesch–Kincaid grade ≤ 8 (checked on texts of 25+
words).** `harness/prose.js` enforces the word budgets, the sentence cap, the FK
ceiling, the banned list, and the term ladder — inside `npm test`, so no level ships
prose the budgets reject. The sentence *counts* in the table are shape guidance, not
enforced: the L5 rewrite (§9) showed that eight tiny sentences can beat five long
ones for this reader, and the caps that matter are per-sentence length and total
words.

## 5. The term ladder

The rule: a science name enters the game exactly once, AFTER its phenomenon, as a
label — "scientists call this ___". Before that moment the everyday phrase does all
the work. After it, the name may be reused plainly. One new name per level.

| level | the everyday phrasing that carries the level | the one name it may introduce |
|---|---|---|
| L1 | light is the pond's only income; growth flattens when the mat shades itself | **carrying capacity** |
| L2 | the scarcest ingredient sets the ceiling | *(none — "Liebig's law" stays in the subtitle)* |
| L3 | everything that dies takes its mineral into the mud; someone must eat the dead | **decomposers** |
| L4 | the bloom's enemy is the meadow's friend | **keystone** |
| L5 | richness needs an eater, not an input; structure, not soup | *(none — "top-down/bottom-up" stays in the subtitle)* |
| L6 | the pond can only feed so many hunters; each meal loses most of its energy on the way up | **food chain** (the pyramid image in plain words) |
| L7 | life doesn't appear where conditions are right — it has to GET there | **colonization** |
| L8 | warm bodies burn faster than they can eat | *(none — "Q10" never appears anywhere)* |
| L9 | tough LINES out-breed fast-growing lines; no single creature changed | **natural selection** (+ "trait" as a working word) |
| L10 | each patch answers its own pressure | **adaptation** (local) |
| L11 | a shelter is only shelter if no hunter is locked inside | **refuge** |
| L12 | the answer had to be in the flock before the crisis | **variation** (as evolution's fuel) |

Words that are always allowed (the player's own world): mat, bloom, meadow, plankton,
grazer, hunter, pack, the dead, the mud, mineral, light, water, pond, species, seed
(verb), pour, starve, eat, drink, spread, settle, crash, recover.

Words that never appear in body text (subtitle or nowhere): biomass, nutrient(s),
abiotic/biotic, trophic, equilibrium, destabilize, population dynamics, organism(s)
("creatures", "living things", or the species name), ecosystem ("the pond"), density,
paradigm, mechanism, parameters, Q10, stochastic, allele/locus/genotype ("line",
"family", "trait" — see §7), any author name (Paine, Liebig, Huffaker: subtitle or
docs, never the player's screen).

## 6. Per-surface craft notes

- **Briefing**: it is read once, standing at the door. Situation in one sentence,
  tools in one, stop. The temptation to pre-teach here is the enemy — the prediction
  step and the pond itself do that work.
- **Prediction chips**: each chip must be a bet a reasonable person could place, in
  words the player would say out loud. Never make the wrong answers sound dumb — the
  whole method dies if the player can smell the "right" chip (the L2 chips are the
  current best example; keep that standard).
- **Fail text teaches best** (productive-failure research): it is read with full
  attention and mild sting. Two jobs only — name what the pond did, point the
  direction. "Only pressure on the bloom opens space below it" is a pointer;
  "you should have seeded Cilio at t=4000" is a walkthrough, never that.
- **Debrief**: the one place allowed a chin-up sentence at the end (a look ahead or a
  quiet wow). If the level introduced its science name, it lands here, attached to
  what just happened, not defined in the abstract.
- **Numbers**: use a number only if the player can see it on screen (a meter, the
  M bar, a count). Measured margins, seed IDs, tick counts of our calibration belong
  in docs, never in player text. "under 70" is fine when the meter showed it.

## 7. The evolution levels — wording that will not lie

L9–L12 walk the field's most documented misconception minefield (teleology,
Lamarckism, "the species decides"). Fixed grammar for all evolution text:

- Selection acts on **lines/families**, never on a creature: "tough lines out-breed
  the fast-growing ones" — never "Drifta toughens up", never "learns", never "adapts
  to survive" (adapts *to* implies purpose; "the flock shifts cool-ward" doesn't).
- No foresight, no goals: never "evolves armor **to** resist grazing"; write "armored
  lines survive the grazing; the rest don't. The next generation has more armor."
- Chance stays visible: "more variation means more lottery tickets, not a guarantee"
  (L12's honest core — the measured 0/8 · 1/8 · 2/8).
- Cost stays visible: every gain names its price in the same breath ("tougher grows
  slower" — the measured trade-offs).

## 8. Honesty rules, restated for prose (project rule 6 applies to players too)

- Player-attributed effects say "since", never "because", unless a same-seed A/B has
  actually run (the F6 machinery will earn "because"; nothing else does).
- Never claim what was not measured. If a level's lesson has a known limit (the
  refuge does NOT reliably calm the swings — 7.W), the debrief stays silent about the
  unclaimed part rather than rounding it up.
- Fail text never blames the player's skill; it reports the pond. The pond is allowed
  to be brutal; the narrator is not.

## 9. Audit of shipped text (measured 2026-08-31) and the fix queue

Script: scratch `prose-audit.js` pattern (words/sentence, max sentence, FK grade over
LEVELS text fields) — to be promoted into the repo alongside the L6 increment so the
gate can run it. Current state, violations in bold:

| text | words | w/sent | max sent | FK | verdict vs §4 |
|---|---|---|---|---|---|
| L1 briefing/debriefs | 35–60 | 12–14 | **21** | 7–9 | trim two long sentences |
| L1 reflect | 53 | **17.7** | **23** | **12.0** | rewrite (worst text in the game) |
| L2 debrief pass | 74 | **18.5** | **28** | 9.0 | split sentences |
| L3 debrief pass | 77 | **19.3** | **35** | 9.5 | split; drop the K6 aside ("an experiment called K6" → cut or one short sentence) |
| L4 debrief pass | 71 | **17.8** | **35** | 7.3 | split; **"(Paine's classic result…)" moves out of body** |
| L4 reflect | 58 | 14.5 | **28** | 7.4 | split the pours reflection |
| L5 debrief pass | 80 | **20.0** | **24** | **10.6** | rewrite; "top-down structure / bottom-up pouring" → subtitle only; one metaphor, not three |
| L5 briefing, fails, timeouts (all levels) | 15–46 | 8–15 | ≤20 | 4–8 | pass |

Worked example of the standard (L5 debrief pass, rewritten to §4/§5):

> *Before (80 words, grade 10.6):* "The grazer restructured the pond, and the pond got
> richer — the meadow near-doubled while the bloom fell to a quarter and held. Grazing
> turned standing plankton into flowing matter: eaten, excreted, recycled, and taken
> up again by the mat the bloom used to shade and starve. Top-down structure set the
> ceiling that bottom-up pouring never touched — this pond was never hungry, it was
> unfinished. And note what the crash was: not a catastrophe, but the system finding
> its richer arrangement."
>
> *After (58 words, grade ~5):* "You added an eater, and the whole pond got richer.
> The meadow nearly doubled. The bloom fell to a quarter — and held. Here is why:
> grazing keeps mineral moving. Eaten, returned to the water, taken up again. All
> your pouring couldn't do that. This pond was never hungry. It was unfinished."

**Done (2026-08-31, Phase 8.5)**: the promoted gate (`harness/prose.js`, in
`npm test`) initially convicted **32 violations** across levels 1–5 — more than this
manual audit found, which is the point of promoting it. All texts rewritten to
§4/§5; the gate now passes clean, and the level verdicts were re-proven unchanged
(the honesty gate is text-independent by construction). Notable casualties: "Paine",
"Liebig", "equilibrium", "population", and "uptake outraces" are gone from player
text; the K6 aside left L3's debrief; the L5 worked rewrite above shipped verbatim
(minus one merged sentence).

## 10. The ten-second checklist for any new player text

1. Read it aloud. Does it sound like a friend at the pond's edge?
2. Any sentence over 20 words? Split it.
3. Any word from the banned list, or a science name the ladder hasn't reached? Replace or move to the subtitle.
4. Does it claim anything the harness didn't measure? Cut it.
5. Any intent verbs on creatures or evolution? Rewrite per §7.
6. Could the pond show this instead of the text saying it? Then let it.
