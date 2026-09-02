# Microcosm vs. Cell Lab — a comparison, and what it is worth

v1.0 · 2026-09-02 · Written on request. Comparison document, no code changes.

---

## 0. What this document can and cannot claim

**I have not played Cell Lab.** Everything about it below comes from web search
snippets and store/wiki summaries; the two primary sources (`cell-lab.fandom.com`,
the Play listing, `en.namu.wiki`) are blocked by this container's egress proxy, so
they were read only through search-result summaries. The sources contradict each
other on details that matter for a fair comparison:

| Claim | Source A | Source B |
|---|---|---|
| Cell types | 16 (store text) | 18 (wiki) |
| Modes per genome | 20 (store text) | 40 (wiki) |
| Parameters per mode | 22+ (store text) | 24 (wiki) |
| Challenges | 45 (store text) | 57 (namu) |
| Play rating | 3.7 | 4.2 |
| Price | free / no extra costs | listed as paid elsewhere |

The spread is almost certainly **version drift** — the app shipped v74 in 2016 and
v103 in late 2025, so the store text one aggregator cached and the wiki another
scraped describe different games. Treat every Cell Lab number here as
order-of-magnitude, not as measured. Where a comparison depends on a number I could
not verify, it is marked *[unverified]*.

The Microcosm numbers are from this repository at this commit.

---

## 1. What Cell Lab is

A single-developer (Petter Säterskog) Android/iOS artificial-life app, first
released ~2013 and still updated (v103, Nov 2025). Structure:

- **The player designs an organism.** A genome is a set of *modes* (20–40
  *[unverified]*); each mode names a cell type (phagocyte, flagellocyte, photocyte,
  devorocyte, lipocyte, keratinocyte, buoyocyte, …, 16–18 total *[unverified]*) and
  ~22–24 parameters, notably how the cell divides: split angle, mass ratio, and
  which mode each daughter takes. Multicellular bodies therefore emerge from a
  recursive division program, not from a body plan the player draws.
- **Challenges are engineering puzzles.** 45–57 of them: here is an environment,
  design a genome that survives it. Solving one unlocks further cell types /
  genes — a classic parts-unlock ladder.
- **The experiment/sandbox mode** exposes ~27 environment parameters (food density,
  light, radiation, viscosity, salinity, gravity …), accepts the player's genomes,
  and can seed random genomes. **Radiation is the mutation knob**: crank it and
  watch drift and selection act on the population.
- Renders ~1,000 cells with soft-body-ish adhesion physics.
- Documented as hard: it has two community wikis and a reputation for requiring
  the manual.

## 2. What Microcosm is (for contrast, in the same terms)

- **The player does not design an organism.** Species are a fixed table of 7 rows
  (5 live), and their genomes are the *world's*, not the player's: 11 heritable
  loci across 4 species, mutating every reproduction, priced by measured trade-off
  slopes.
- **The player designs the environment**: sun position/intensity/spread and
  additional light and heat sources, mineral pours, walls with four physical
  properties, feed/kill, species seeding, and — behind a gate — the mutation
  machinery itself (σ per locus, curvature, price slopes, presets).
- **11 levels**, each built around a named ecological misconception, each proved by
  a gate to fail untouched, pass on the taught strategy, and fail on a plausible
  wrong lever.
- **An Observatory**: 141 recorder channels, calibrated detectors, measured
  reference bands, and impact cards that say "since", never "because".
- Scale: up to 6,000 organisms on a 64×64 field grid in a 1024-unit torus,
  ticking at ~2,500 ticks/s on a Fairphone 5 (250× real-time; the UI caps at 16×).
- A bit-exact deterministic core (Rust, hash-certified, native == wasm), so any run
  is reproducible from `(seed, config, event log)`.

---

## 3. The one structural difference everything else follows from

**H1 — The locus of control is inverted.**

> Cell Lab: the player authors the *organism* and accepts the world.
> Microcosm: the player authors the *world* and accepts the organisms.

This is not a feature difference, it is a different game. Consequences:

- **Cell Lab's fantasy is engineering** ("I built a thing that lives"); its failure
  mode is a puzzle you have not solved yet. **Microcosm's fantasy is stewardship**
  ("I understand what I did to this pond"); its failure mode is a collapse you
  caused.
- **Cell Lab's evolution is optional decoration; ours is the mechanism.** Despite
  the subtitle *Evolution Sandbox*, the challenge ladder — the bulk of the content —
  is solved by *intelligent design*: the player is the selecting agent, thinking.
  Mutation lives in a side mode behind a radiation slider. In Microcosm, mutation is
  on by default in the certified world, and the level ladder's top end (L9, L12)
  makes standing genetic variation the lever that decides the run.
- **Cell Lab has a morphology axis we do not have at all** (adhesion, division
  programs, multicellularity, body shape). **We have a biogeochemistry axis they do
  not have**: conserved matter, corpses → detritus → decomposer → mineral →
  producer, with an audit that must stay flat. Their world is a nutrient *supply*;
  ours is a nutrient *cycle*. That is the K6 lesson, and it is the thing this
  project has that essentially nothing else in the genre does.

---

## 4. Axis by axis

| Axis | Cell Lab | Microcosm | Who is ahead |
|---|---|---|---|
| Player's creative surface | Huge: genome editor, ~20–40 modes × ~24 params *[unverified]* | Narrow: world levers, no organism authoring | **Cell Lab, decisively** |
| Emergent morphology | Multicellular bodies from division programs | None; organisms are points with a size | **Cell Lab** |
| Evolution as mechanism | Present, opt-in, uninstrumented | Default-on, 11 loci, priced, measured, narrated | **Microcosm** |
| Nutrient cycling / conservation | Food as supply *[unverified: no closed loop found]* | Closed loop + flat audit as regression test | **Microcosm** |
| Environment editing | ~27 parameters *[unverified]* | Sources (light+heat), walls, pours, seeding, evolution panel | Comparable; theirs is broader, ours is *spatial* |
| Analytics / feedback | Minimal (counts, energy) | 141 channels, detectors, reference bands, impact cards | **Microcosm, by a wide margin** |
| Teaching structure | Parts-unlock puzzle ladder, 45–57 challenges | 11 misconception-driven levels, predict → play → debrief | Ours is better-designed; theirs is 4–5× larger |
| Onboarding / language | Hard by reputation; two community wikis exist | Prose gate (FK ≤ 8, word budgets, term ladder), EN + DE | **Microcosm** |
| Scale | ~1,000 cells with physics | 6,000 organisms + fields, 250× real-time on-device | **Microcosm** (different physics, so not like-for-like) |
| Determinism / reproducibility | Not claimed | Bit-exact, hash-certified, two cores agree | **Microcosm** (invisible to players) |
| Sharing / community | Genome strings, wikis, YouTube coverage, ~50k reviews | None. No sharing, no players | **Cell Lab, decisively** |
| Longevity after the ladder | Infinite design space | Sandbox with no goals | **Cell Lab** |

---

## 5. Devil's advocate: three uncomfortable readings

**A. Their evolution is *felt*; ours is *narrated*.**
MV.2 measured it and recorded it honestly: at standing σ the per-organism phenotype
is illegible — the population story is real, but it is carried by the Observatory,
not by the bodies on screen. A Cell Lab player watches a creature *they built* fail,
which is a stronger epistemic event than reading a ribbon chart that says a mean
moved from 0.50 to 0.62. Our visual grammar (tint / ring / roundness) is the attempt
to close this, and it is thin: three channels for eleven loci, and one of them
(warmth preference) deliberately has no body channel at all.
*Falsifiable:* put the app in front of someone who has never seen it and ask, after
L9, "what changed in the animals?" If the answer needs the Traits page, the grammar
has not done its job.

**B. Their instrument-free design has 50,000 reviews; our instrument has none.**
The honest reading is not "instrumentation is unwanted" — it is that *we have never
tested whether a player wants it*, and Cell Lab is evidence that a genre audience
will tolerate an app with almost no analytics and a hostile learning curve. Most of
our Observatory exists because it keeps **us** honest: it is the author's laboratory
that shipped as a player feature. That is not automatically a mistake (it is exactly
the intrinsic-integration ideal when L3 narrates the strangulation), but it is
unexamined, and the Data pages are where the phone-sized attention budget goes to
die.
*Counter:* the levels ARE the test, and they are the strongest part of the product.
The comparison should not lead to "add a genome editor" — it should lead to "the
Data pages must earn their place inside a level, or shrink."

**C. We have no "make" verb, and no way to hand anything to another person.**
This is the clearest gap the comparison exposes, and it is not about organisms.
Cell Lab's longevity comes from the player producing an *artifact* (a genome) that
outlives the session and can be shown to someone. Microcosm produces runs. Our
architecture already makes a shareable artifact nearly free — P5 says a run is fully
determined by `(seed, config, event log)`, and we ship binary snapshots — but nothing
in the UI treats "the pond I made" as a thing you keep or send. The natural
Microcosm equivalent of a genome string is a **world**: seed + sources + walls +
seeding + evolution settings, as a short code.
*Honest cost:* a shared world is bound to a core hash. The fingerprint discipline
that makes sharing possible also makes it version-fragile — a declared ecology change
invalidates every code in circulation unless the format carries a core version and
the app refuses (or flags) a mismatch. That is a real design problem, not a sprint.

---

## 6. Contradictions worth marking

1. **CLAUDE.md's stated purpose is "exploration and play", but every gate in the
   repo optimizes for honesty and reproducibility.** There is no play gate. The one
   instrument that touches play (`harness/playthrough.js`) checks that the UI does
   not crash, not that anything is enjoyable. The only play test in this project is
   the owner picking up the phone — which has caught more real defects than CI, and
   is n=1.
2. **P6 says "legible at a glance, deep on tap"; MV.2 measured the genome as
   illegible at a glance.** Both statements stand in the record. The tension is
   unresolved, not hidden.
3. **The comparison flatters us on every axis we chose to build and damns us on
   every axis we chose not to.** That is what a comparison against a
   differently-scoped app always does, and it is the main reason not to over-read
   this document. Cell Lab is not a competitor whose feature list we are behind on;
   it is a different answer to a different question. The useful output is not a
   feature gap list — it is §5's three readings.

---

## 7. If anything is to be done with this

Cheapest first, each with what would falsify it:

1. **Nothing.** Defensible. The ladder is shipped, the app is the product, and the
   next owner-facing question is round-4 play, not a competitive response.
2. **A "keep this pond" verb** (§5C): name a world, save it, list saved worlds,
   later a share code. Small, architecture-native, and it converts the sandbox's
   post-ladder emptiness into a reason to return. *Falsified if* the owner's own
   play sessions never produce a world worth keeping.
3. **A legibility pass on the genome** (§5A): make one locus visible in motion or
   body at standing σ, not at the rails. *Falsified if* a naive player after L9 can
   already name what changed without opening Data.

Explicitly **not** recommended: an organism/genome editor. It would invert the
project's premise (P1's species-as-data, the frozen species table, the RNG-order
contract, and every calibration that rests on a fixed world), and it is the one
thing Cell Lab does better than we could with ten times the effort.

## 8. Open questions for the owner

1. Is the comparison being asked as **positioning** (what is this app, next to the
   things that already exist?) or as **a feature audit** (what are we missing?)
   The answer changes which of §7's three options is the right one.
2. Does the post-ladder sandbox need a purpose at all, or is Microcosm finished
   when the twelve levels are played once?
3. Do you accept §5A's reading — that our evolution is currently *narrated* rather
   than *seen* — or does the Traits page count as seeing it?

---

*Sources (search-summary level only; primary pages were egress-blocked):*
Play/store aggregator descriptions of `com.saterskog.cell_lab`, the Cell Lab
Fandom and cell-lab.net wikis, and a namu.wiki summary, all retrieved 2026-09-02.
