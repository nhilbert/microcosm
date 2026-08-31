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
