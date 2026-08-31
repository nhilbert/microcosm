# Phase 8.1 — The ladder in detail: levels 4–12

v1.0 · 2026-08-31 · Design document, pre-implementation. Written while the performance
work runs in parallel; implementation starts when it returns. Premises were probed on
the post-movement-genome core (the merged main of 2026-08-31; levels gate 9/9 reproduced
on it first). Every number below marked *probed* was measured on that core; everything
marked *calibrate* is an implementation-time measurement under the §6 protocol. Nothing
ships without clearing the honesty gate (harness/levels.js): fail untouched, pass on the
taught strategy, fail on a plausible wrong lever.

## 1. What the research says a level must be

Five results from the learning-games and science-education literature, each translated
into a build rule for this project. (Sources at the end of this section.)

1. **Intrinsic integration** (Habgood & Ainsworth): learning content must live inside
   the core mechanic, not in text wrapped around it. Children learned more from the
   intrinsically integrated version of the same game and chose it seven times more
   often in free play. *Build rule: the sim does the teaching; briefings stay ≤3
   sentences; the debrief may only name what the player already did and saw. If a
   level's concept can be stated without playing it, the level is not done.*
2. **Implicit scaffolding** (PhET): guide without feeling guided — through what the
   interface offers, withholds, and makes easy, not through instructions; fast feedback
   loops; multiple linked representations of one concept. *Build rule: the apparatus
   gate IS the pedagogy — what a level removes teaches as much as what it grants
   (L2's pinned lever is the existing proof). Every level from 4 up should need at
   least two representations to solve: the world plus a Data page, the specimen card,
   or a Traits band.*
3. **Predict–observe–explain and productive failure**: committing to a prediction
   before running, and failing before instruction, measurably improve conceptual
   understanding and transfer versus direct instruction. *Build rule: add a prediction
   step (framework F1) and write every fail-debrief as the level's second teacher —
   failing a level with the wrong lever should teach nearly as much as passing it.
   Retry stays one tap.*
4. **Misconception-driven design**: the documented misconceptions in ecology and
   evolution education are stable and specific — dead things just disappear; more
   resources always mean more growth; predators only harm the ecosystem; nature holds
   a static balance; individuals adapt because they need to (teleology/Lamarck).
   *Build rule: every level names its target misconception in this document, and its
   pass/fail structure must make the misconception the losing bet, not just say so.*
5. **Kishōtenketsu pacing** (Nintendo's four-step level grammar: introduce, develop,
   twist, conclude): a mechanic is taught in safety, developed, then re-presented in a
   context that breaks the learned expectation. *Build rule: across the ladder each
   level reuses the previous levels' levers plus one new element; within the ladder,
   the twists are the world's own measured surprises (the gardener starves, the
   refuge inverts, the rescue arrives too late). Post-pass twist runs (framework F3)
   carry the "ten" without blocking progression.*

Supporting evidence that this genre of tool works where text fails: EcoMUVE's
classroom studies show the largest gains exactly on delayed and distant causation
(decomposition, photosynthesis/respiration coupling, effects over distance) and on
data-practice self-efficacy — the two things Microcosm's Observatory-first design
already privileges. Keep the long-fuse levels; they are the medium's home ground.

Sources: [Habgood & Ainsworth 2011](https://tca2.education.illinois.edu/docs/librariesprovider23/default-document-library/j-of-the-learning-sc-2011-habgood.pdf?sfvrsn=c838d23d_2) ·
[Learning by Doing: intrinsic integration directs attention (CHI PLAY 2022)](https://dl.acm.org/doi/abs/10.1145/3549503) ·
[PhET implicit scaffolding](https://arxiv.org/pdf/1306.6544) ·
[PhET sims as implicit support for guided inquiry](https://pubs.rsc.org/en/content/articlelanding/2013/rp/c3rp20157k) ·
[Productive failure in simulation learning](https://pubmed.ncbi.nlm.nih.gov/33773221/) ·
[DIY productive failure, undergraduate biology](https://www.nature.com/articles/s41539-019-0040-6) ·
[Understanding Natural Selection: essential concepts and common misconceptions](https://evolution-outreach.biomedcentral.com/articles/10.1007/s12052-009-0128-1) ·
[Berkeley: misconceptions about evolution](https://evolution.berkeley.edu/teach-evolution/misconceptions-about-evolution/) ·
[Food-web misconceptions (teacher guide)](https://www.generationgenius.com/wp-content/uploads/2018/02/Food-Webs-Teacher-Guide-GG.pdf) ·
[Nintendo's kishōtenketsu level design](https://mcvuk.com/business-news/publishing/video-nintendos-level-design-secrets-in-four-steps/) ·
[EcoMUVE case study](https://ecolearn.gse.harvard.edu/projects/ecomuve)

## 2. The project's own gate learnings as level material (owner request, 2026-08-31)

Every gate and battery this project has run left a measured finding. This table is the
inventory of which finding each level spends. The pattern worth naming: **the best
level twists are the findings that surprised us** — a first design that died against
measurement makes a player-facing twist precisely because the intuition it broke is
the player's intuition too.

| gate / battery | learning | spent in |
|---|---|---|
| K6 (P2, the crown) | no decomposers → slow mineral strangulation; the Observatory narrates it unprompted | L3 (shipped) |
| Transport (P2) | mixing feeds the core; edge-poured mineral arrives late | L2 (shipped), L4 wrong-lever |
| P3 apex designs | five failed founding designs; a pack founds or nothing does; apex is reported, never required | L6 |
| P4 calibration deaths | every first-theory detector died; bands must be measured | §6 protocol itself |
| 5.x heredity + prices | unpriced traits sweep to the rail 8/8; measured prices give balance; "defense costs growth" | L9 |
| Yoshida (5.2/5.7) | evolution *lengthens* the cycle; antiphase not reproduced; sweeps can erase the cycle | L9 debrief, post-phase study hook |
| 6.x corridor + panel | mutation on/off, σ, curvature, prices as legal levers — the evolution apparatus exists | L9, L12 apparatus |
| 7.L light gate | moving/shrinking the home sun collapses the core 5/8; an added sun is inert until seeded; grazers do not cross dark water | L7 (both the task and its trap), L10 |
| 7.L/7.M patch selection | loci separate between patches only where their *pressure* differs (defense via predation; light locus structural) | L10 |
| 7.H heat gates | uniform warmth loses the apex first (upkeep Q10 2.5 vs attack 1.8 — budgets bind, tolerance never does); warm-core pile-up; hot sun +8 is a lethal trap via the drifter's set-point | L8, L12 |
| 7.W walls battery | sealed split strangles the dark side; mesh refuge works 7/8 — and inverts into a feedlot when a grazer is boxed in at founding | L11 (the feedlot IS the twist) |
| MV.0 trap detector | "concentrating where the budget is negative" fires ahead of collapse 8/8 (Drifta) | L8/L12 HUD narration |
| MV.1 flagship | trap escape is threshold-like in mutation supply: σ 0.03 → 0/8 (the sweep arrives ~1,000 ticks late), 0.09 → 1/8, 0.12 → 2/8; the surviving swarm completes the sweep after the grazer is lost | **L12, the capstone** |
| MV.3 pricing saga | an unpriced advantage invades 7/8 (the free lunch demonstrated in-world); kb 0.1 cancels it | L9 debrief (why trade-offs exist) |
| MV-C C2 | mutual invasibility of movers/stayers — protected polymorphism | future locus-level material, not in this ladder |
| MV.4 | the warm-seeking grazer idles outside the cold apex's range: +10 heater loses the apex 8/8 | L8 twist |
| Corridor fuzz incident | the instrument is only as honest as its calibration fights | the honesty gate stays mandatory for every level |

## 3. Premise probes (run 2026-08-31, merged core, silent worlds)

- **P4 — producers compete.** Rich water: Solara and Drifta coexist by default (D ~1,590,
  S climbing to ~600 by t=12k; ~330 standing cysts) — *"engineer coexistence" is dead as
  a challenge; the honesty gate would fail its null.* Poor water (M0 0.5): Drifta's
  uptake advantage (mUp 0.6 vs 0.22) suppresses the mat to S 84–130 vs D ~1,030 at 20k —
  asymmetric competitive suppression, stable, no exclusion. A dark spell (lever 0.4 for
  2,000 ticks) is a disturbance-recovery story, not a competition lever: D crashes
  1,484→62 (mostly deaths, only ~34 cysts) and rebounds within 3,000 ticks.
- **P4c — keystone rescue.** Seeding one Cilio pack into the poor two-producer world at
  t=4,000 lifts the mat S 21→322–426 within 4,000 ticks while D crashes to 50–138 —
  and then **the gardener starves**: Cilio dies out by ~t=11k in this poor world and
  the bloom returns (D ~750 by 20k). Transient keystone rescue, 2/2 seeds.
- **P5 — the grazer in the rich world.** Core-minus-Cilio: one pack at t=3,000
  establishes 2/2 (C ~100–130 through 16k) and restructures everything (D 1,440→~350,
  S ↑1,570, B ↑950). Boom–crash visible but modest; establishment looks *forgiving* —
  the level's fail mode must be found in dose/timing at calibration (see L5 risks).
- **P6 — founding the apex.** Full-core-minus-Venator, packs seeded t=4,000:
  one pack establishes 3/3 seeds (V 8–22 at 16k, strongly oscillating; seed 101 peaks
  32 then falls to 8). **Two packs on seed 101: extinct by t=12k** — the doubled pack
  crushes the local prey base and starves whole; on seeds 202/303 two packs do fine
  (V 47/20). Overstocking is a real, seed-selectable failure.

## 4. Framework increments (build these once, before or with L4)

- **F1 — Prediction step (POE).** The level card gains 2–4 hypothesis chips; the player
  commits before the world runs. Stored on LVL (data only); the debrief opens by
  contrasting the committed prediction with what the recorder actually shows. The
  prediction never changes the verdict — the challenge stays behavioral; commitment,
  not grading, is what the literature rewards. Data shape: `predict: {prompt,
  options[], answer}` per level, `LVL.predicted`.
- **F2 — In-level narration.** Levels list the sysEvent types their HUD surfaces
  (e.g. L8 surfaces `heatStarve`/`heatPile`; L9 surfaces `sweep`/`diverse`). The
  detectors already fire; this is a filter and a display row, zero new observation.
- **F3 — Post-pass twist runs.** After a pass, an optional "run it again, changed"
  button starts a scripted variant with its own one-line verdict (no badge stakes).
  The kishōtenketsu "ten" without blocking progression.
- **F4 — Timeline scripts.** A level may fire events at fixed ticks (`script: [{t,
  event}]`) — the warm year arriving, a dark spell. Implemented as a separate
  `levelScript()` driven from the same call sites as levelCheck but kept OUT of it:
  levelCheck stays a pure observer; levelScript composes queueEvent like levelStart.
  The harness drives both, so scripted levels stay verdict-identical headless.
- **F5 — Region goals.** Goal predicates over a region (near sun k, inside a rect):
  pure position reads for L7/L10/L11. Small helper beside lvlSample.
- **F6 — A/B memory (deferred until L6 wants it).** Retain a compact summary series of
  the previous run in LVL so a twist run can show "with the pack vs without, same
  seed" — the honest same-seed A/B from the open trophic-cascade finding, as gameplay.

## 5. The levels

Format per level: the numbers marked *probed* come from §3; *calibrate* items follow
the §6 protocol at implementation time. Wording discipline: debriefs about the
player's own interventions say "since", never "because" (rule 6), except where a
same-seed A/B (F6) has actually run.

### L4 · The Gardener — competition and the keystone consumer
- **Science subtitle**: Competitive exclusion · keystone predation (Paine).
- **Question**: The water is poor and the bloom owns it. Can the meadow be saved?
- **Misconception targeted**: predators/grazers only harm the things below them.
- **World**: Solara 20 + Drifta 120, M0 0.5, full sun (probed: mat pinned at S≈21–48
  early, D≈750+). Seed: 101 (strong suppression, clean rescue).
- **Prediction (F1)**: "Pour minerals — the mat catches up" / "Seed a grazer — the mat
  recovers" / "Nothing helps — the quick always win".
- **Apparatus**: pours (budget ~8, *calibrate*), seeding open (the choice IS the
  experiment), no sources/walls/evolution.
- **Goal**: Solara ≥ 250 sustained (probed: rescue reaches 322–426) with Drifta ≥ 150
  alive (no scorched-earth pass), by t≈12,000. **Fail**: timeout; hard-fail if either
  producer hits zero.
- **Harness cases**: null → FAIL (probed: S ~67–121 at 12k); Cilio pack at t≈4,000 →
  PASS; wrong lever: the pour budget spent on the mat → expected FAIL (*calibrate*:
  the bloom's uptake advantage should capture the pours — if measurement shows pours
  DO rescue the mat, the level redesigns exactly as L2 did; record either way).
- **Twist (F3)**: keep watching — the gardener starves in the poor water and the bloom
  returns (probed 2/2). Debrief: a keystone consumer is a job, and jobs need wages.
- **Risks**: the pour wrong-lever is unmeasured; Cilio-seeding dose may matter (1 vs 2
  packs — *calibrate*).

### L5 · Boom and Bust — consumer–resource cycles and the myth of balance
- **Science subtitle**: Consumer–resource cycles · disturbance and stability.
- **Question**: Nothing is attacking the pond — so why do the numbers keep swinging?
- **Misconception targeted**: a healthy ecosystem holds still; a crashing population
  means something is broken and needs rescue.
- **World**: full core minus Cilio (S 120, D 500, B 60), rich water. The player seeds
  the grazer and lives with the consequences. Seed: *calibrate* (probed 101/202 both
  work).
- **Prediction (F1)**: "The grazer will eat the plankton to zero" / "They will settle
  into a steady state" / "They will cycle — boom and bust, indefinitely".
- **Apparatus**: seeding open, pours allowed, no sources/walls/evolution. Data mode's
  Populations page is the second representation — the goal is readable only there.
- **Goal**: Cilio established (≥ 20, the DET_ESTAB threshold) AND Drifta alive through
  two full swings (operationally: D falls below X then recovers above Y twice —
  thresholds *calibrate* from the probed trajectory D 1,961→269→438→…), horizon
  ≈16,000. **Fail**: either species extinct, or timeout without the second recovery.
- **Harness cases**: null (never seed) → FAIL (no grazer); seed one pack ≈t=3,000 →
  PASS (probed 2/2); wrong lever: *calibrate the knife* — candidates, in order of
  probing: (a) seed 3+ packs at once (overstock → D crash → C starves), (b) seed at
  t≈500 before the producer base (probed pattern from L3's poor-detritus lesson),
  (c) "rescue" the first Drifta crash with panic pours (may amplify the swing —
  see twist). If none fails honestly, the level narrows its pass window instead.
- **Twist (F3, contingent)**: the paradox of enrichment — dump the pour budget into a
  cycling world and watch the amplitude (Rosenzweig 1971 predicts destabilization).
  **UNMEASURED in this sim** — a calibration experiment, and an honest one: if
  enrichment does NOT destabilize here, the twist is cut and the null result recorded
  (the Yoshida-non-reproduction precedent).
- **Risks**: establishment probed as forgiving — the challenge may need the wrong-lever
  cases to carry it; cycle-boundary detection needs care (reuse lib.js estimators for
  calibration, but the in-level check stays a simple threshold crossing).

### L6 · A Head Full of Hunters — the apex, the pyramid, and restraint
- **Science subtitle**: Trophic pyramid · why top predators are few.
- **Question**: The pond is rich. How many hunters can it actually carry?
- **Misconception targeted**: more predators = a stronger predator population; big
  fierce animals are limited by courage, not by energy.
- **World**: full core minus Venator (S 120, D 500, C 12, B 60), rich. Seed: **101**
  (probed: one pack establishes, V 8–32 oscillating; two packs go extinct by t=12k).
- **Prediction (F1)**: "Two packs are twice as safe" / "One pack is all the pond can
  feed" / "No pack can survive here at all".
- **Apparatus**: seeding open, feed/kill allowed (feeding a starving hunter is a
  legitimate, logged act of husbandry — and insufficient by itself), pours allowed.
- **Goal**: P3's own criterion, playered: Venator established AND showing natural
  turnover (alive ≥ some floor across a long window, with at least one recorded birth
  — *calibrate* from the probe's V 8–32 swing so the oscillation's trough does not
  fail an honestly-held pack), horizon ≈16,000. **Fail**: pack extinct, or never
  established by deadline.
- **Harness cases**: null → FAIL; one pack at t≈4,000 → PASS (probed); wrong lever:
  two packs at once → FAIL on seed 101 (probed extinct at t=12k). This is the rare
  level where the wrong lever is *more of the right thing* — the deepest form of the
  lesson.
- **Twist (F6, deferred if F6 slips)**: the same seed without any pack — the honest
  same-seed A/B behind the open trophic-cascade finding, run as gameplay and worded
  as a comparison, finally earning "because".
- **Risks**: V's natural oscillation (32→8 on the pass run) makes floor-thresholds
  dangerous — the pass window must be measured generously; the two-pack collapse is
  seed-specific (202/303 survive it) so the level must pin seed 101 and the harness
  must guard that exact behavior against future core changes.

### L7 · The Second Sun — colonization and the empty niche
- **Science subtitle**: Dispersal limitation · colonization.
- **Question**: A new sun rose over dark water. Why does nothing live there?
- **Misconception targeted**: life appears wherever conditions are right ("build it
  and they will come").
- **World**: shipped-like core around the home sun; the level's timeline (F4) raises a
  second sun far across dark water at t≈2,000. Measured foundation (7.L): an added
  sun is inert until seeded — no long-range dispersal.
- **Prediction (F1)**: "Life will drift over and colonize it" / "It stays empty until
  something is carried there" / "The new sun will drain the old one".
- **Apparatus**: seeding open, pours allowed, source *selection* allowed but only the
  new sun's controls (the home sun stays locked — 7.L: moving/shrinking it collapses
  the core 5/8; the lock is itself the lesson, stated in the debrief).
- **Goal (F5 region)**: a functioning outpost at sun 2 — Solara ≥ N₂ and Drifta ≥ N₃
  within radius R of it, sustained (numbers *calibrate*; 7.L's seeded-patch records
  say which founding works). **Fail**: timeout with the patch still empty; hard-fail
  if the home core collapses.
- **Harness cases**: null → FAIL (7.L: inert 8/8); seed mat+drifter packs at the new
  sun → PASS; wrong lever: pour mineral under the new sun without seeding → FAIL
  (mineral is not a propagule). A fourth case guards the lock: unlockable home-sun
  edits must not exist in the apparatus.
- **Risks**: two-sun worlds double some field costs — coordinate with the performance
  work (this is the first level whose world is structurally heavier than the shipped
  one); dark-water distance must be chosen so drift genuinely never crosses
  (*calibrate* against the movement-genome core — restlessness changed dispersal).

### L8 · The Warm Year — energy budgets in a warming pond
- **Science subtitle**: Thermal performance · Q10 economics.
- **Question**: The water warms. Nobody is boiled — so why does the top die first?
- **Misconception targeted**: heat kills by exceeding tolerance; warming hurts
  everything equally, starting at the bottom.
- **World**: full core; the timeline (F4) begins a press — warmth rising to ≈+5
  over ~2,000 ticks (via a scripted broad warm source or tempAmb-equivalent event —
  the legal event route is a *calibrate/implementation* decision with the sim
  untouched). Measured foundation (7.H): the press loses the apex FIRST (upkeep Q10
  2.5 vs attack 1.8 — the mismatch, not the maximum), decomposer second, detritus
  piles in warm cells; MV.0's trap detector and heatStarve narrate ahead of the loss.
- **Prediction (F1)**: "The smallest cook first" / "The biggest hunger fails first" /
  "Everything declines together".
- **Apparatus**: cooling is the lever set — source warmth sliders including a COLD
  source (a < 0, already legal in events), source placement; seeding; pours.
  F2 narration on: heatStarve, heatPile, heatTrap.
- **Goal**: the apex alive at horizon with the press absorbed (plus no pile-up event
  active — *calibrate*). **Fail**: apex extinct (the measured default under the
  press), or timeout.
- **Harness cases**: null → FAIL (7.H: apex lost under the press); strategy →
  *calibrate — the honest open question of this level*: candidate rescues to
  measure: (a) a cold source making a refuge the apex's prey shares, (b) reducing
  the press source, (c) feeding the pack through the squeeze. **The cold-refuge
  rescue is unmeasured**; if none of (a–c) rescues, the level inverts honestly into
  a triage level ("save what can be saved" — mat and plankton goals) and the apex
  loss becomes its narrated twist. Wrong lever: pours (mineral does not pay thermal
  upkeep) → expected FAIL, *calibrate*.
- **Twist (F3)**: MV.4's finding — at a +10 heater the warm-seeking grazer idles
  outside the cold apex's range: the apex starves NOT from its own budget but from
  its prey's preferences. Spatial mismatch as a second, subtler mechanism.
- **Risks**: the largest unmeasured surface in the ladder (flagged deliberately —
  this level is designed to be *decided by* its calibration experiments, either
  outcome shippable).

### L9 · The Sorting — variation, selection, and the price of armor
- **Science subtitle**: Natural selection · heritable variation · trade-offs.
- **Question**: Graze the water harder — what changes, the plankton or the plankton*s*?
- **Misconception targeted**: individuals adapt because they need to (teleology /
  Lamarck); evolution improves everything at once and for free.
- **World**: full core, **mutation ON** (the first level to run the evolving world),
  Drifta's defense locus the subject. Baseline: the 5.7-balanced world (defense
  ~0.39–0.60 at 18k, diversifying narrated).
- **Prediction (F1)**: "Each Drifta will toughen up under attack" / "Tough *lines*
  will out-reproduce the fast-growing ones" / "Nothing heritable will change".
- **Apparatus**: seeding (extra Cilio packs = the selection pressure), the Evolution
  panel in its simplest form (mutation toggle visible but ON and required — turning
  it off is the wrong lever), Traits page as the second representation. F2 narration:
  sweep / diverse / uniform for Drifta plane 0.
- **Goal**: the Observatory's own sweep criteria, playered: Drifta defense mean −
  g0 ≥ 0.10 with a ≥60% tough-side majority, sustained (the detector's calibrated
  thresholds, read from channels 42/49) under a player-raised grazing pressure,
  horizon ≈14,000–18,000 (*calibrate* — 5.x sweeps arrive t≈8–12k under natural
  pressure; added packs should accelerate; measure how much).
- **Harness cases**: null (no added pressure) → FAIL within horizon (the balanced
  world diversifies but does not sweep — 5.7's own record); strategy (add grazer
  packs, sustain them) → PASS; wrong lever: mutation OFF then pressure → FAIL
  (selection with no heritable variation sorts nothing — the deepest single lesson
  available in this world, and it comes from the player's own hand on the one
  switch). Also *calibrate*: feed/kill husbandry on individual Drifta must NOT pass
  (individuals are not the unit — if hand-feeding tough individuals could fake a
  sweep the level is broken; it cannot move W.g, so this should hold by
  construction, but the harness says so explicitly).
- **Debrief**: variation was there BEFORE the pressure (the sd channel's history is
  on the Traits page); selection sorted lines, no organism changed; and the sweep
  spent the variation it fed on (5.1's "uniform" event) — armor was bought with
  growth (the kpSlope price), which is why the unpressured world keeps both.
- **Risks**: duration (a sweep is a long experiment — at 16× a 14k-tick level is
  ~90s of wall clock plus watching; the performance work directly buys this level
  comfort); stream sensitivity of sweep timing (pin the seed, calibrate margins
  wide).

### L10 · The Two Ponds — one species, two answers
- **Science subtitle**: Local adaptation · gene flow and its barriers.
- **Question**: The same species lives under both suns. Why is it becoming two?
- **Misconception targeted**: a species has one right answer; evolution converges on
  "the best" form everywhere.
- **World**: twin-sun layout (7.L's seeded twin), mutation ON, dark water between —
  measured foundation: the grazer does not cross dark water, so defense pressure
  differs by patch and Drifta's locus separates (7.L: spread 0.10–0.18; MV.1 heater
  analogue: 6/8 with adapt 7/8).
- **Prediction (F1)**: "Both patches will settle on the same value" / "Each patch
  answers its own pressure" / "The patches will drift apart randomly".
- **Apparatus**: seeding (the player builds the asymmetry: grazers into ONE patch),
  sources locked after founding; Traits page patch marks as the second
  representation. F2: adapt events.
- **Goal**: the adapt detector's own criterion (patch spread ≥ 0.10 sustained, both
  patches ≥ 20) for Drifta's defense locus. **Fail**: timeout; also fail if the
  player homogenizes (seeds grazers everywhere — pressure equal, spread dies): that
  IS the gene-flow/equal-pressure lesson, named in the fail debrief.
- **Harness cases**: null → FAIL (no asymmetric pressure); asymmetric grazing → PASS
  (*calibrate* founding + timing from light.js --patches machinery); wrong lever:
  symmetric grazing → FAIL. 
- **Risks**: adapt was measured stream-sensitive at threshold (light gate 4/8 on one
  build) — the level's seed must be picked for robust separation and the margin
  documented; twin-sun performance cost as L7.
- **Note**: L10 completes the arc L9 begins (selection, then selection differing in
  space); if the ladder needs trimming, L10 folds its content into an L9 twist run.

### L11 · The Refuge — walls, hideouts, and the feedlot
- **Science subtitle**: Spatial refuges (Huffaker) · edge effects.
- **Question**: Can architecture save the hunted?
- **Misconception targeted**: a shelter is always shelter; protection is a property of
  the wall, not of who is inside with you.
- **World**: full core under heavy grazing pressure (extra Cilio founding —
  *calibrate*), walls granted. Measured foundation (7.W): a mesh hideout lifts the
  refuge floor 7/8 and excludes grazers 5/8 — and on seeds where a grazer is boxed
  IN at founding, the refuge inverts into a feedlot. Cycle damping was inconsistent
  at the measured refuge size — **the level must not claim stabilization**, only
  refuge (rule 6).
- **Prediction (F1)**: "A mesh pen will protect the plankton" / "The pen only works if
  no grazer is inside" / "Walls change nothing the water doesn't already decide".
- **Apparatus**: the wall tool (mesh presets forward), seeding, pours. F5 region goal
  on the penned area.
- **Goal**: a standing refuge — penned Drifta ≥ N sustained while outside grazing
  continues (region count via F5), horizon *calibrate*. **Fail**: timeout, refuge
  never holds; the FEEDLOT (grazer inside, penned prey crashing) fails fast with its
  own named debrief — the measured twist as the level's centerpiece.
- **Harness cases**: null → FAIL; scripted mesh pen on clean water → PASS (7.W hideout
  runs supply the geometry); wrong lever: the same pen drawn around a grazer → FAIL
  as feedlot (7.W: 3 seeds showed it; pick one for the level). Walls are drawn by
  drag-vector events, so the harness scripts exact wallAdd payloads.
- **Risks**: drawing precision on mobile (the pen must be forgiving — snap-assist or a
  pre-marked pen site are *implementation* options); region-goal clarity in the HUD.

### L12 · Outrun the Sun — evolution against the clock (capstone)
- **Science subtitle**: Evolutionary rescue · mutation supply (MV.1's flagship, played).
- **Question**: The sun is turning lethal. Evolution knows the answer — can it arrive
  in time?
- **Misconception targeted**: evolution rescues whatever needs rescuing; adaptation is
  guaranteed, fast, and free (teleology's last stand).
- **World**: full core, mutation ON; the timeline (F4) turns the sun hot (+8) at
  t≈3,000 — the measured lethal trap (core lost 8/8 at shipped σ; the cool-ward
  sweep arrives ~1,000 ticks *after* the grazer is lost; the surviving swarm
  completes the argument posthumously). Seed: one of the σ-0.12 escapers from MV.1's
  sweep (*calibrate: re-run move.js --escape on the current core and pin an escaping
  seed*).
- **Prediction (F1)**: "The plankton will evolve away from the heat in time" / "The
  world dies before the answer spreads" / "It depends on how fast mutation feeds
  variation".
- **Apparatus**: the Evolution panel's mutation-rate slider for Drifta's
  warmth-preference locus (σ up to 0.12 — the legal bound), F2 narration: heatTrap,
  sweep, extinctions. Nothing else — no cooling, no walls: this level is about the
  second-order lever alone.
- **Goal**: the core survives the hot sun to horizon with the cool-ward sweep
  narrated. **Fail**: core collapses — which is the *certain* outcome at shipped σ
  and the *likely* outcome even played well on most seeds; the level pins a seed
  where raised σ demonstrably escapes so the taught strategy CAN win, and the
  debrief carries the honest ensemble numbers (0/8 · 1/8 · 2/8 across σ) so the pass
  is understood as a lottery ticket bought with variation, not a guarantee.
- **Harness cases**: null (σ shipped) → FAIL (MV.1: 0/8); strategy (σ raised at the
  press's start) → PASS on the pinned seed; wrong lever: raising σ AFTER the trap
  detector fires late in the collapse → FAIL (rescue needs standing variation before
  the crisis — the level's sharpest point: by the time you can see the problem in
  the bodies, the answer had to already be in the genes).
- **Risks**: seed-pinned escape must be re-verified whenever the core changes (add
  the case to the levels gate so drift is caught); long horizon; emotional design —
  this level is *meant* to be lost once (productive failure by construction), so the
  first-fail debrief must be the best-written text in the game.

## 6. Calibration protocol (per level, at implementation)

The L1–L3 recipe, now standard: (1) premise probe on ≥3 candidate seeds; (2) null /
strategy / wrong-lever runs, headless; (3) pin THE seed — a level is one world, and
seed-specific behavior (L6's two-pack collapse, L12's escape) is legitimate exactly
because the harness guards it forever; (4) set thresholds with measured margins
(target between the failing and passing trajectories, nearer the fail); (5) write the
harness cases BEFORE the UI strings; (6) a full-speed UI playthrough (the Playwright
lever-drag pattern from increment 1). A level that cannot find an honest wrong-lever
fail is redesigned or narrowed, never shipped soft — both L2 and L3 already went
through one such redesign each; expect the same rate here (L4's pours, L5's knife,
L8's rescue are the pre-declared candidates).

## 7. Ship order and cut lines (recommendation to the owner)

Build F1–F5 once, then: **L4 → L5 → L6** (arc B: the web assembles, all premises
probed), **L9** (first evolution level; no new world machinery), **L12** (capstone —
it reuses L9's apparatus plus F4 and pays off the whole ladder; shipping it early
after L9 is deliberate: it is the game's best story), then **L7 → L11 → L8 → L10**.
Cut lines if scope presses: L10 folds into an L9 twist; L8 ships in its triage form
if no rescue calibrates; F6 defers with L6's twist. Levels ship one at a time through
the gate, as before (rule 9).

## 8. Performance-work touchpoints

- Long levels (L9, L12: 14–18k ticks) are the main beneficiaries — if the frame
  budget rises, consider a 32× speed step gated to level worlds (*owner decision*).
- L7/L10 (two suns) and L11 (walls + extra grazers) are the structurally heavier
  worlds; re-run their premise probes if the perf work declares ANY behavior change
  (conformance discipline should make this moot, but the levels gate re-runs on every
  merge anyway — it is in test:full).
- The levels gate grows one case set per shipped level; at L12 it will hold ~36
  cases ≈ a few minutes of Node time — acceptable in test:full, keep out of the fast
  npm test.
