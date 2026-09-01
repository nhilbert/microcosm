# Phase 8 — Learning levels: the pond as a curriculum

Owner request (2026-08-31): a gamification system of learning levels — real biology
concepts, increasing difficulty, each level an experiment with a challenge rather than
a demonstration, starting from a single organism and growing toward the full web.

Owner decisions taken at kickoff:
- **Entry**: a start screen. On load the player chooses the Sandbox (the open pond,
  unchanged) or an experiment.
- **Progression**: all levels open from the start, completion badges per session.
  The artifact rule forbids localStorage, so progress lives only in the session;
  persistence is the Android wrapper's job when it lands.
- **Scope of increment 1**: the framework plus the single-producer arc (levels 1–3),
  each fully calibrated. Everything else is planned here and deferred (rule 9).

## 1. The design rule: a level is an experiment

Every level has the same anatomy:

| part | meaning |
|---|---|
| question | what a curious player would actually ask ("why does nothing grow in a dim pond?") |
| world | a scenario founding: which species, how many, starting mineral, starting sun |
| apparatus | the levers this experiment offers — everything else is gated off |
| goal | a measurable pass condition over recorder samples, sustained, with a deadline |
| fail | a real way to lose: timeout with a stated reason, or a hard fail (producers extinct) |
| debrief | the biology concept, named honestly, in both the pass and the fail voice |

**The honesty gate** (`harness/levels.js`, `npm run levels`, part of `test:full`):
for every shipped level, on the level's own seed and clock,
1. the *null player* (no action) must FAIL — otherwise it is a demonstration;
2. the *taught strategy* must PASS;
3. a *plausible wrong lever* must FAIL — the challenge must discriminate, not just delay.

Any level that cannot clear all three does not ship. Both redesigns below came from
this gate, not from taste.

## 2. Framework contract

- **Scenario founding** (`initWorld(seed, sc)`, src/sim/init.js): `sc.found` overrides
  per-species founding counts (0 skips the whole block — zero draws, contract rule 2 at
  world scale), `sc.M0` the starting dissolved mineral. **Draw-free when absent** (the
  walls pattern, banner rule 6): with `sc` undefined every count is the shipped literal
  and the RNG stream is bit-identical — conformance confirmed identical on all four
  fingerprints; the hash was rebound for this declared behavior-neutral extension.
- **The table is data, predicates included** (`src/observatory/levels.json`, since the
  Rust port, 2026-08-31). A condition is a metric (`pop(sp)`, `lockShare`, `free`), an
  operator and a right-hand side; `pass` is their conjunction, `failNow` an ordered list
  of condition-lists with the message each fires, `latch` the one stateful case in the
  ladder (L6's "the pack is gone" only after a pack existed), `meter` the HUD's rows.
  This is not tidiness: `pass`/`failNow`/`meter` used to be closures, and a closure
  cannot cross into the Rust core — shipping them as closures would have meant writing
  every level's predicates twice, in a way that fails silently, since a mistranslated
  threshold still yields a plausible verdict. The extraction was proved behaviour-
  preserving (conformance bit-identical, all 21 gate cases at the same ticks), and the
  gate now runs on both cores with byte-identical output. Two side effects: the level
  text reaches the crate as JSON for a future app shell, and `harness/prose.js` can
  finally check the `failNow` verdicts, which were review-only before.
- **Level state** (`src/observatory/levels.js`): definitions are data; `levelCheck()` is
  a pure observer (zero draws, zero mutation) that walks the recorder ring one sample at
  a time — verdicts are counted in samples, so UI speed and the headless harness agree
  exactly. `levelStart()` composes only legal entry points: the scenario and
  `applyEvent` (a level's sun setting is an ordinary logged lightMul event). Levels run
  with `P.mutation=false` (the certified silent world); the sandbox restores the
  shipped settings.
- **App shell** (`src/ui-levels.jsx`): start screen, objective HUD, verdict card,
  session badges. The world component consults `levelAllows()`/`levelPourOk()` at its
  existing action sites; during a level the reset control re-runs the experiment
  (same seed, same scenario). Navigation stays neutral-colored — amber remains
  reserved for the player's hand on the world.
- A level world is *its own world*, like a moved sun: no conformance claim attaches
  to it. The certified world is untouched.

## 3. Increment 1 — the single-producer arc (shipped)

All numbers below are measured (Node, dist/core.js, mutation off). Populations are
Solara counts at the stated tick.

### Level 1 · First Light — photosynthesis, carrying capacity
World: 20 Solara founders, seed 101, sun lever at ×0.5. Goal: 400 held, by t=8000.

| run | t=2000 | t=4000 | t=8000 | verdict |
|---|---|---|---|---|
| null (stay dim) | 14 | 21 | 55 | FAIL |
| lever ×1.2 at t=0 | 916 | 1245 | 1462 | (reference) |
| lever ×1.2 at t=2000 | 14 | 894 | 1451 | PASS at ~t=3000 |
| wrong: 10 mineral pours, still dim | 14 | 21 | 55 | FAIL |

Seeds 202/303 under the dim sun go extinct by t=4000; seed 101 lingers under 60 —
chosen deliberately so the first level's fail state is a stall the player can still
rescue, not a fait accompli. The wrong-lever case is the Liebig contrast run backward:
mineral cannot buy growth when light is the binding limit.

### Level 2 · The Hungry Water — Liebig's law of the minimum
World: 20 Solara founders, seed 202, **M0 0.4, sun lever pinned at ×1.6 from t=0**.
Goal: 600 on a budget of ten pours, by t=9000.

**Overturned first design** (recorded per rule 6): the draft used M0 0.5 with the lever
at ×1.0 and target 440 — and the honesty gate's wrong-lever run *passed* it: pushing
the lever to ×1.6 with no pours reached 561. At that mineral level the world is still
partly light-limited, so "more light won't help" would have been a lie. The shipped
design starts the lever at its ceiling: the claim is then both visible (the slider has
nothing left to give) and true.

M0 sweep at lever ×1.0 (seed 101, t=8000): M0 2.2→1227, 1.0→695, 0.6→436, 0.4→327 —
population tracks mineral, the Liebig backbone of the level.

At lever ×1.6, M0 0.4, seed 202 (10 pours of 40, t=600..3300):

| run | t=4000 | t=8000 | verdict |
|---|---|---|---|
| null | 419 | 480 | FAIL |
| pours on the mat | 569 | 659 | PASS at ~t=5700 |
| wrong: pours at the dark shore | 444 | 551 | FAIL |

The near/far split is the Phase 2 transport lesson in reverse: mixing does move
edge-poured mineral inward eventually (far pours beat null), but too slowly to make
the deadline — placement is the challenge.

### Level 3 · Everything Flows — decomposition, the mineral cycle (K6 as a level)
World: the same founding as level 1 (20 Solara, seed 101) under the full sun, M0
shipped. Goal by t=14000, all sustained: locked share < 20%, Bacillus ≥ 80, Solara ≥ 1000.

**Overturned first design**: a poor-water producer world (Solara+Drifta, M0 1.2). It
failed both ways — the strangulation was too slow to bite inside a level, and seeded
Bacillus *starved on the thin detritus* (24 → 0 within 2000 ticks): a mineral-starved
world leaves energy-poor dead. The rescue must happen in a rich world, which the
level-1 world already is: its own success locks 40%+ of all mineral into dead matter
by t=8000. Level 3 is level 1 continued — the collapse hiding inside the triumph.

Seed 101, two Bacillus packs (24) unless stated:

| run | lock t=6000 | lock t=10000 | lock t=14000 | Bacillus | verdict |
|---|---|---|---|---|---|
| null | 33% | 38% | 40% | 0 | FAIL (free mineral 3105→1487) |
| seed Bacillus t=6000 | 33% | 14% | 14% | 564–682 | PASS at ~t=7700 |
| seed one pack (12) t=6000 | 33% | 13% | 13% | 629–699 | PASS |
| seed one pack t=1000 | 12% | 13% | 13% | 733 | PASS at ~t=3700 |

The rescue is deliberately robust to timing and dose — the challenge is *knowing which
guild closes the loop*, not clicking precisely. The species picker is fully open here;
grazers and hunters only move matter between bodies, so wrong seedings fail honestly
(a hard fail fires if the producers are wiped out). Pours are unbudgeted: pouring
cannot fake the pass because Bacillus establishment is part of the goal.

### Level 4 · The Gardener — competition and the keystone consumer (shipped 2026-08-31)

First level of the ladder implementation (phase8-ladder-design.md), shipped together
with framework increments **F1 (prediction step — commit-then-contrast, never graded;
retrofitted to levels 1–3)** and **F2 (in-level Observatory narration — a per-level
sysEvent filter in the HUD)**. F3–F6 stay deferred to the levels that need them.

World: Solara 20 + Drifta 120, M0 0.5, seed 101 (the probed asymmetric-suppression
world). Goal: Solara ≥ 250 sustained by t=12,000; hard-fail if either producer hits
zero. Apparatus: 8 pours, seeding open. Calibrated on the perf core:

| run | S t=8000 | S t=12000 | D trough | verdict |
|---|---|---|---|---|
| null | 53 | 67 | — | FAIL |
| 8 pours on the mat | 48 | 64 (D 1094 > null's 1031) | — | FAIL — **the pours feed the bloom** |
| Cilio pack t=2000 | 332 | 313 | 55 | PASS ~t=6800 |
| Cilio pack t=4000 | 322 | 387 | 17 | PASS ~t=7400 |
| Cilio pack t=7000 | 58 | 388 | 24 | PASS ~t=10300 |
| 3 packs t=4000 | 304 | 305 | 55 | PASS (overdose forgiven — the *choice* of lever is the lesson) |

Design notes from calibration: the planned Drifta co-floor (≥20 in the pass
predicate) was dropped — the honest rescue itself drives D to 17 at the trough;
extinction stays the only Drifta fail. The twist needs no machinery: the gardener's
starvation and the bloom's return happen inside the same run and are narrated by the
existing extinction/crash events through F2. Harness: 4 cases (null, t=4000,
late-t=7000, mat-pours), gate 13/13 ALL PASS.

### Level 5 · The Richer Pond — top-down structure vs bottom-up inputs (shipped 2026-08-31)

**Two designs died against measurement before this one** (the §6 protocol working as
intended; both recorded here per rule 6):

1. *"Boom and Bust" (cycles) — overturned.* The apexless core does not cycle: after a
   seeded grazer's founding crash (D 1,961→~280) the world **settles** into a narrow
   grazed band (D 277–415 for 14,000+ ticks, 3/3 seeds). The consumer–resource-cycles
   lesson honestly belongs to the full world (tune2's D swings, the Yoshida records)
   and migrates to L6's orbit. Also measured on the way: **the paradox of enrichment
   does not reproduce** — 30 pours (1,200 M) and even 75 pours (3,000 M, a third of
   the world's stock) into the grazed world leave it stable and thriving (C 121–147,
   S 1,971). The pre-declared twist is cut; the null stands recorded, the
   Yoshida-non-reproduction precedent.
2. *Prey-base floor (dose restraint) — overturned.* At 100-tick sampling the Drifta
   trough tracks **timing more than dose**: one pack at t=400 bottoms at 63 and at
   t=9,000 at 45, while three packs at t=3,000 bottom at 51 (one pack at t=3,000: 121).
   A floor would fail reasonable timings and pass the "overstock" it meant to punish —
   muddled lesson, rejected.

**Shipped design** — the measurement that survived: in the rich apexless world,
*inputs cannot buy richness but structure can*. Seed 202, full core minus Cilio
(S 120, D 500, B 60), unlimited pours, seeding open. Goal: Solara ≥ 1,250 AND Cilio
≥ 20 sustained, by t=17,000; hard-fail on producer or plankton extinction.

| run | S @16k | C @16k | verdict |
|---|---|---|---|
| null | ~900 | 0 | FAIL |
| 30 pours, no grazer | 897 (D 1,851 — the bloom drank it) | 0 | FAIL |
| one pack t=3,000 | 1,660 | 105 | PASS ~t=9,800 |
| three packs t=3,000 | 1,606 | 110 | PASS (dose forgiven — structure, not dose, is this level's lesson) |
| one pack t=6,000 / t=9,000 | 1,378 / 1,435 | 29 / 24 | pass-capable, uncertified (late-seed margins thin) |
| one pack + 75 pours | 1,971 | 121 | "both" also works; the necessary half was the grazer |

Misconception targeted: "more resources always mean more growth" — the pond was never
hungry, it was unfinished. Harness: 4 cases, gate 17/17 ALL PASS. Prediction chips
map to pour/structure/both with reflections carrying the measured numbers.

### Level 6 · A Head Full of Hunters — the energy pyramid (shipped 2026-08-31)

World: full core minus Venator (S 120, D 500, C 12, B 60), seed 101, rich. Goal:
Venator ≥ 4 held for 7,000 ticks (sustain 350 samples), deadline 15,000; hard-fail
when a once-present pack hits zero (the first stateful predicate — `LVL.mem`, still
sample-driven and deterministic). Text is the first written under the enforced
style gate.

Calibration (V per 100 ticks, seed 101, 18k horizon):

| run | longest V≥4 stretch | Vmax | outcome | verdict |
|---|---|---|---|---|
| null | 0 | 0 | no hunter | FAIL (timeout) |
| one pack t=2,000 | 15,300 | 40 | alive at 18k (V 21) | PASS ~t=9,700 |
| one pack t=4,000 | 12,000 | 34 | **extinct at t=18,000** | PASS ~t=11,700 — then the late death |
| one pack t=6,000 | 11,300 | 34 | alive at 18k (V 22) | pass-capable |
| two packs t=4,000 | **5,400** | 9 | extinct t=11,300 | FAIL — never holds long enough |
| two packs t=6,000 | 12,100 | 35 | alive at 18k (V 24) | uncertified; overstock is timing-specific |

Two honest notes carried into the wording: the overstock collapse is *pinned* (two
packs released together at t=4,000, the harness case), not universal — the reflect
says packs released "into the same water" strip it together; and the t=4,000 single
pack dies AFTER its pass (the known late-apex-loss character of this world), which
makes the debrief's closing line — "always one bad season from gone" — literally
true on the level's own seed for a player who keeps watching. The sustain margin
between the doomed double (5,400) and the pass bar (7,000) is 1,600 ticks. Gate
21/21 ALL PASS.

### Level 7 · The Second Sun — dispersal limitation and colonization (shipped 2026-09-01)

Built on owner request ahead of the recorded L9-first ship order (phase8-ladder-design.md §7).
World: settled core minus Venator (S 120, D 500, C 12, B 60), seed 101, rich water. The
level's timeline — **F4, built for this level** — raises a second sun at (0,0), toroidally
opposite the home sun (i 1.0, σ 210, the sourceAdd defaults), at t=2,000. Goal — **F5, also
new**: Solara ≥ 100 AND Drifta ≥ 150 within radius 200 of source 1, sustained 10 samples,
deadline 12,000. Apparatus: pours unlimited, seeding open, sources `"added"` (new tri-state:
the founded sky is locked, the risen sun and player additions are editable). Term ladder word:
colonization, introduced in the pass debrief.

The framework that ships with it, in both cores and gate-proved byte-identical:

- `levelScript()` — the level's per-tick hook, called before every `step()` by every driver
  (harness `drive()`, the browser's tick loop, the app's render loop). It fires script events
  before the step that produces their tick (the harness's own action convention) and captures
  the region census one tick before each recorder sample lands, into a level-owned ring
  (`LVL.rg`, REC.N rows). `levelCheck` consumes samples only up to the census watermark, so
  no caller cadence can move a verdict. Idempotent within a tick.
- `{ m: "near", sp, src, r }` — region predicates and meter rows; squared toroidal distance
  only (`*`, `+`), so the ported core computes it bit-identically.
- `levelAllowsSource(k)` — the per-source lock, wired into every grip, drag, slider, layout
  and remove path in the browser and the app (the app publishes `homeSunLocked` per frame for
  UI-thread gating and hides the layout row).

Calibration (S@2/D@2 = counts within 200 of the new sun; seeds 101/202/303 probed, 101
pinned — slowest natural creep: S@2 = 2 at t=12k vs 89 on seed 303):

| run | S@2 | D@2 | verdict |
|---|---|---|---|
| null | 2 @ 12k (creep only from ~12k; 105 by 15k) | 0 through 16k | FAIL (timeout) |
| seed mat+plankton t=3,000 | 249–381 early, 191 @ 12k | 423 rising to ~1,000 | PASS ~t=3,760 |
| seed both late, t=9,000 | 109–142 | 190 → 413 | PASS ~t=10,060 (the window is generous) |
| ten pours at sun 2, no seeding | 1 @ 12k | 0 | FAIL |
| Drifta alone t=3,000 | **0 through 16k** | 1,300+ | FAIL — the bloom locks the mat out |
| Solara alone t=3,000 | 534–731 | 0 forever | fail-capable (not pinned as a case) |

Two measured findings carried into the wording: the mat's slow creep DOES cross dark water
eventually — from ~t=12k on the pinned seed — so "an added sun is inert until seeded" (7.L)
is a statement about its measurement window; the deadline sits before the creep, and the
Drifta goal is creep-proof and pour-proof on its own. And a Drifta-only outpost suppresses
the mat's arrival entirely (its bloom takes the light and mineral first) — the L4 competition
lesson returning as this level's second wrong lever. Known edge, accepted and recorded: the
goal region tracks source *index* 1, so a sun the player adds before t=2,000 becomes the
goal's anchor; the harness pins the scripted path, and an editable outpost sun keeping its
goal wherever the player moves it is the intended reading.

The §6 full-speed UI playthrough ran headless (Playwright over the dev server, 420×900):
the null path start-screen → prediction → sunrise → HUD meters → timeout verdict, then Try
again → pan to the risen sun → long-press seeding of both species → pass debrief, t≈3,500.
**It convicted a latent browser bug on its first run**: `reset()` set `ui.chips` to `[]`,
which is truthy, so the chips overlay dereferenced `.opts` and crashed the React tree — every
in-level Try again and sandbox reset in the browser artifact had this. Fixed (`chips: null`),
core untouched, playthrough green on the rerun. The instrument finding outranks the level.

Gate 30/30 ALL PASS (25 verdict cases + 4 apparatus-lock guards + L7's five), byte-identical
on the ported core (`port:levels`); `port:check`'s level fingerprint extended to 2,200 ticks
so it covers the sunrise, the census and the lock flip on both cores. Conform and
conform:core rebound (declared: the level table row plus the F4/F5 machinery; all four
fingerprints bit-identical, native == wasm). Boot gate: the scripted sun rises through the
REAL render loop and the founded sun refuses the grip through the real gesture pipeline
(`theScriptedSunRisesAndTheFoundedSkyStaysLocked`). German overlay complete; prose gates
EN+DE green.

### Level 9 · The Sorting — natural selection (shipped 2026-09-01; the planned design
### was overturned by measurement and rebuilt around the price lever)

The ladder spec's design — added grazer packs drive Drifta's tough sweep — **died in
calibration, twice over**, and the deaths are the level's real foundation:

1. **Added packs sweep the WRONG way, unreliably.** On seed 101, two packs at t=2,000
   drove a *faster-growing* sweep (mean 0.31, lo-share 75–77% by 17k) — crash-grazing
   rewards r-strategists, not armor; the 5.7 price (kpSlope 0.5) makes toughness too
   expensive for boom–bust water. And the timing is a one-stream lottery: the pinned
   stream passed at 16.2k, while three player-realistic seeding variants (positions
   ±30, timing +100/+300) all failed to complete ANY sweep by 18k; one wandered
   hi-side to 24k. Three packs at once peaked at 67%/0.404 and decayed.
2. **The null sorts itself.** Left alone, seed 101's own late grazer boom (after the
   t≈17k Drifta crash) drives the same fast-line sweep from ~t=22k — so no deadline
   extension could rescue the pack design without the null passing it.

The rebuilt level uses the lever the 5.x record said is robust: **the armor price**.
The Evolution panel's kp slider (a shipped 6.x surface with its measured balance mark
at 0.5) is the taught move — pull it well under balance and the tough line sweeps
under the pond's own grazing. Measured (pass = mean ≥ 0.60 AND hi-share ≥ 0.60,
sustained 10 samples):

**A second instrument lesson, recorded before the numbers**: the first calibration
round ran raw probes (mutation set after founding) — a DIFFERENT stream family than
the level machinery (which sets it before). The gate convicted two wrong-lever pins
that had held on raw streams and failed on level streams. Every number below is from
the level machinery; that is now the calibration rule for evolving levels.

| run (level machinery, seed 101, to 20k) | trajectory (mean / hi-share) | verdict at 0.60·60%·sustain 10, deadline 18k |
|---|---|---|
| null (full price) | 0.51 / 42% at 20k, never near | FAIL (timeout) — robust |
| kp 0.20 at t=1,000 | monotone: 0.60/59 @10k → 0.80/99 @20k | PASS ~t=10,280 |
| kp 0.20 at t=3,000 | 0.587/66 @12k → 0.80/98 @20k | PASS ~t=12,760 |
| mutation OFF + kp 0.20 | pinned 0.48–0.51, shares 0% for 18k | FAIL — nothing varies, nothing wins |
| two grazer packs, price untouched | slow tough climb, 0.73/85 @18k | passed ~14.9k — NOT a wrong lever (see below) |
| hand-feed the 10 toughest every 200 ticks | 0.92/100 by 18k, the strongest run | passed ~6.3k — artificial selection, working as selection does |

**A third instrument lesson, found while the batch's final gate ran**: `initWorld`
restored only sigma and curve, NOT the price slopes — so L9's kp case leaked cheap
armor into every later case of a same-process gate run, and into the browser's own
resets (a price-slider edit survived sandbox reset and level entry since Phase 6).
Fixed in both cores (full locus restore; conformance bit-identical, baselines
rebound). Fallout contained: the pack/husbandry TRAJECTORIES in the table above ran
after the kp case and carried the leak; their VERDICTS stand — the earlier gate run
with the original case order (no kp case before them) measured the same passes
(packs @14,920, husbandry @6,300) on clean worlds. All L8/L11/L12 numbers were
probed in fresh processes and are clean.

The two overturned pins, recorded as findings rather than smoothed over:
**extra grazing is stream-chaotic, not wrong** — on raw streams it swept FAST
(crash-grazing pays r-strategists) or nowhere; on the level stream it drifts TOUGH
and passes late; no criterion separates it robustly from the taught lever, so it is
*unpinned* and the record keeps both faces. And **husbandry is not a fake**: feeding
the toughest is differential reproduction by the player's hand — Darwin's pigeons —
and it produces the cleanest sweep in the table. The ladder spec's worry ("it cannot
move W.g") missed that selection never moves genes, it moves *counts*. Both stand as
legitimate alternative pressures a player may discover; the shipped harness pins what
is provable: null, the two price runs, and mutation-off — the spec's own deepest
lesson, flat to the fourth sample for 18,000 ticks.

Margins: pass at 10.3–12.8k against deadline 18,000; the null needs +0.09 mean and
+18 points of share it never approaches. Machinery built for it (both cores,
gate-proved): `world.mutation` (the first evolving-world level), the `{m:"ch",c}`
raw-channel metric (locus mean at 42+sp) and the `{m:"share",sp,plane,side}` census
(the sweep detector's own ±0.05 definition, captured on the levelScript clock).
Term ladder: natural selection. The kp slider's player-facing name is the panel's
own terse "kp · balance 0.5" (a pre-existing 6.x surface); the briefing points at
it by name. **Owner review flag**: the taught lever is a world-price knob rather
than an ecological act — sanctioned as a shipped Evolution-panel surface, but a
deliberate design pivot from the ladder spec, decided by measurement in-session.

### Level 8 · The Warm Year — energy budgets, and the dose of help (shipped 2026-09-01;
### press AND rescue redesigned by measurement)

The spec's world died twice on the current core. The press order flipped: a warm sun
ramped to +5 (script: five sourceSet steps, t=3,000..4,600) bills the APEX first
(V lost ~6.2k in the null) while the grazers hold (C ≥ 11 throughout) — 7.H's
"apex first" stands, but its mechanism now runs through MV.4's warm-seeking grazer
world, and the flat +5 step of the L12 sweep is survivable where the ramp is not.
And **the cold-refuge rescue is dead**: a far cold pocket alone still loses the apex
(@7,280), and — the calibration's real find — **every grazer death in the table
traces to the FED apex, not to the heat**. The null keeps its grazers; feeding the
hunters hard (every 300 ticks, frac 0.3) keeps V alive and eats C to zero (@6,420);
cold+hard-feeding merely delays it (@10,020); restocking under hard feeding fails
too (@12,700). The instrument lesson from L9 held here — the first rescue table was
measured on raw streams at an accidental +6 (a probe bug: the ramp loop overran by
one step) and its "full rescue" did not survive the level machinery.

What threads the needle, on the level machinery (seed 11 pinned): **feed the
hunters LIGHTLY** — every 900 ticks at frac 0.2 — and both layers hold (min V 7,
min C 8 through 16k; PASS @10,780 at the shipped thresholds V ≥ 4 ∧ C ≥ 5,
hot-latched on channel 59 ≥ 2, sustained 350). The level's lesson moved one step
deeper than the spec's: warming bills the top first, and the dose of help decides
whether help reaches it — hard feeding turns the pack into teeth against the
squeezed middle (L6's overstocking lesson, at the husbandry scale).

| run (level machinery, seed 11) | outcome | verdict |
|---|---|---|
| null | V starves @6,160; C holds ≥11 | FAIL |
| feed lightly (900/0.2) | both hold: min V 7, min C 8 | PASS @10,780 |
| feed hard (300/0.3) | V held, C eaten to 0 @6,420 | FAIL |
| cold pocket alone | V starves @7,280 | FAIL — the spec's rescue, measured dead |
| 20 pours | V starves @6,160 | FAIL — mineral pays no heat bill |

Cold sources, restocking packs, a heat-shadow wall (lt 1/ht 0 — a lovely mechanic,
kept for later) and gentler ramps were all measured and none beats the dose lesson;
tables in the session record. Apparatus keeps sources "added" so the cold pocket
remains a discoverable honest failure. No term-ladder word (Q10 never appears).

### Level 11 · The Refuge — spatial refuges and the feedlot (shipped 2026-09-01)

World: full core with doubled grazers (C0 24), seed 44, silent. The timeline builds a
three-sided fine-mesh pen (the 7.W hideout box, 352..480 × 544..672, lt/ht 0.9 fl 0.7
pass Sol|Dri|Bac) at t=600 — the marked site that answers the ladder's mobile-drawing
risk. The player closes the fourth side with the wall tool; the goal is a fixed-point
census (the new `at` metric): penned Drifta ≥ 40 AND penned Cilio == 0, sustained 150
samples (3,000 ticks), deadline 14,000.

The premise probes rewrote the level's story before it was built: with C0 24, the box
almost always holds grazers (8–13 at any closing tick), and a pen closed around them
is not a transient accident but a **permanent, self-sustaining feedlot** (4/4 seeds:
penned C holds ~10 for 13,000 ticks while Drifta drips in through the mesh and is
eaten — a lobster trap). The taught move is therefore the shepherd's: CLEAR the pen
with the erase tool, then close. Cleared-and-closed, the mesh is airtight (penned C
exactly 0 to 16k, 4/4) and the refuge floods (penned D 50–125, world floors up
279–425 vs 179–318 open).

An instrument incident, caught and removed: the first row carried a "refuge emptied"
latch+failNow guard, and a single founding-era sample (D≥40 ∧ C==0 at t≈1,380)
latched it spuriously on every run — the guard failed all twelve probe runs before
the pen existed. It guarded nothing measured, so it was removed rather than patched;
the sustain-150 pass carries the robustness alone. Machinery-probe results after the
fix, seeds 11/44/88 all: null timeout FAIL; clear+close@3,000 PASS @~6,0k;
clear+close@8,000 PASS @8.6–11.0k; close-without-clearing FAIL (timeout) — the only
fully seed-robust level of the batch. Term ladder: refuge (and its German Zuflucht,
confirmed).

### Level 12 · Outrun the Sun — evolutionary rescue (shipped 2026-09-01; the flagship
### re-measured and re-pinned on the current core)

MV.1's flagship numbers are stale on this core: at the +8 hot sun it is now CILIO
that dies (~800 ticks after the press — MV.4's warm-seeking set-point walks the
grazer into the oven while Drifta thrives at 1,200+), Drifta's σ is a null lever, and
no rescue exists at +8 (0/8 at σ 0.12; collapse outruns any selection). The press
had to be re-calibrated: +5 is survivable unaided (4/4), **+6 is the level** — null
loses the core 4/4 (~5.0–5.9k, always the grazer), and raising CILIO's
warmth-preference σ to 0.12 before the press rescues 3/4 seeds.

Pinned seed 11 (level machinery): null FAIL @5,620; σ→0.12 at t=500 / 1,500 / 2,500
ALL PASS (12,940 / 9,980 / 12,320 — timing-robust across the whole pre-press
window); σ at t=4,300 — after the heatTrap detector has spoken (~3,820–4,040) —
FAIL @7,120. The capstone's sentence survives intact one trophic level up: by the
time the trouble is visible in the bodies, the answer had to be in the genes.
Verdict machinery: hot-latch on the Drifta felt-warmth channel (59) ≥ 2, pass =
latched ∧ C ≥ 20 sustained 350 samples, deadline 15,000. The debrief's lottery
wording carries the honest ensemble (3/4 at t=500 across seeds; other timings fail
on other seeds). Term ladder: Variation (DE); EN introduces "evolutionary rescue"
as a phrase, no ladder entry.

### Level 10 · The Two Ponds — FOLDED at calibration (2026-09-01)

Asymmetric grazing no longer separates the patches on the movement-genome core
(spread transient ≤0.15, never sustained; symmetric grazing spikes as high — MV.2's
restlessness makes gene flow beat patch selection at the twin-sun geometry). Folded
into a future L9 twist per the ladder's own §7 cut line; finding and re-entry
condition recorded in phase8-ladder-design.md under L10. The `spawnPack` script
event built for its colonisation kit stays in the schema for the twist run.

## 4. The deferred ladder (arcs B–D)

> **Superseded in detail (2026-08-31): docs/phase8-ladder-design.md** — the researched
> design principles, the gate-learnings inventory, premise probes on the
> post-movement core, framework increments F1–F6, and full specs for levels 4–12
> live there. The sketch below stands as the original scope record.

Each future level ships one at a time, through the same gate, with its numbers added
here first. Concepts are anchored to findings this project has already measured.

| # | working title | world | concept | measured hook |
|---|---|---|---|---|
| 4 | Two Strategies | + Drifta | competition, r/K strategies, dormancy | producers share light+mineral; Drifta cysts |
| 5 | The Grazer | + Cilio | consumer–resource cycles | the Yoshida-pair cycle machinery (5.2) |
| 6 | The Apex | full web − Venator | apex predators, the pyramid | pack founding is knife-edged (P3: five failed designs) |
| 7 | The Second Sun | two suns | dispersal limitation, colonization | an added sun is inert until seeded (7.L) |
| 8 | The Warm Year | heat source | thermal performance, Q10 economics | upkeep outruns the bite (7.H starving pack) |
| 9 | Selection | mutation on | heritable variation + selection | the sweep/diversifying detectors (5.x) |
| 10 | The Refuge | walls | refuges, local adaptation | mesh hideout + the feedlot failure mode (7.W) |

Entry criteria before any of these ships: the honesty gate extended to its cases; a
fail state that is ecological, not merely a timer; debrief wording that survives the
"since, never because" rule when it points at the player's own actions.

## 5. Deferrals and open questions

- Progress persistence: blocked on the Android wrapper (no localStorage in the
  artifact). The session badge map is deliberately trivial to serialize when a host
  can hold it.
- Level-scoped Observatory narration (e.g. the K6 flow warning surfacing inside level
  3's HUD): the detectors already fire — deferred until a level needs the text, to
  keep increment 1 small.
- Difficulty tiers / par times: no measurement yet of how human players actually pace
  these; instrument before knob applies to game design too.
- The movement-genome feature is landing on its own branch; levels 4+ must re-run
  their calibrations after it merges — founding scenarios themselves are draw-free,
  but every measured table in §3 is a claim about the current certified core.
