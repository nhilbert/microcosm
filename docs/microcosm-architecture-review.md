# MICROCOSM — Architecture & Technology Review at Phase 2 Closure

2026-08-28 · Reviewer: the builder, deliberately wearing the adversary's hat. Everything below is written to be falsifiable and to survive being read by the Kotlin engineer who inherits this in six months.

## 1. System inventory

`src/core.js` (~420 lines): the sim core — constants `P`, species table `TRAITS` (6 rows, 2 dormant), tag bitmasks, world state `W` (structure-of-arrays over typed arrays, corpse pool, five scalar fields plus light), the event system (`applyEvent`/`drainEvents`/`queueEvent`), field physics (`diffuseM` incl. detritus leach and scent), spatial hashes (organisms + corpses), and `step()`. No DOM, no React, no imports; loads in Node unmodified. `src/ui.jsx` (~700 lines): the render/UI layer — canvas pipeline (light layer, mineral layer, mat carpet, sprite pass, corpse pass, selection/loupe), gesture system, specimen card, mode switch, undo chips, speed FAB. `build.py`: assembles the single-file artifact; verified byte-preserving at extraction. `tune2.js`: the 8-seed conformance harness with mineral audit and flow meters; `k6.js`, `diag*.js`: experiment and diagnosis scripts. The artifact (61 kB source) is the concatenation, nothing more.

## 2. What the architecture got right — with the evidence

**Species as data.** The claim was that new species are rows, not code. Phase 2 tested it three times: Bacillus, Mycora, Necro entered as trait rows plus exactly two new dispatch verbs (`tumble` movement, `detritivore`/`corpsivore` feeding). The strongest evidence is negative: with the two deferred species' founders removed, the four-species world reproduces the 2.5 baseline **bit-identically** across all 8 seeds — three species' worth of machinery added to the core without perturbing a single PRNG draw of the live world. That property was designed for (short-circuiting trait checks in fixed order) and is now demonstrated, twice (the 2.1 refactor achieved the same against Phase 1).

**The conformance harness as the project's spine.** One canonical core consumed by tuner and artifact ended the duplicate-constants risk and turned every ecological claim into a reproducible run. It caught a false causal story (the "staggered arrival" that was actually encystment), proved the 2.1 refactor exact, and re-baselines cheaply. For the Android port this file pair *is* the specification: translate `core.js`, match `tune2.js` statistically, done.

**Event-sourced interventions.** All seven intervention types flow through one queue applied at tick boundaries, logged with payloads. Undo is event revocation, including the corpse-aware kill/revive pair that reclaims a victim's mineral from its own corpse — the ledger survives even user regret. This is the replay substrate Phase 5 needs and the single API a native UI would target.

**The conservation ledger with flow meters.** Total mineral is invariant by construction across five compartments; the audit never exceeded 0.011 % per 30-minute run, and the meters (uptake, release, egestion, corpse-to-detritus, bacterial mineralization) converted four separate tuning mysteries from speculation into diagnosis. The K6 experiment then used the same instruments as its measurement apparatus — the debugging tools and the scientific claims share one implementation, which is why the claims are cheap to trust.

**Headless-first with verified patching.** The pipeline (paper budget → patch with per-edit match counts → 8-seed run → only then UI) caught three silent no-op patches, one miscounted assert, and produced the two best diagnostic finds of the project: *deterministic extinction timestamps* (uniform death times = a mechanism, not ecology — found Necro's dormancy drain twice) and the *unit test that exonerated the feeding code* and redirected blame to scent transport.

## 3. Debts and weaknesses — ranked by the damage they can do

**D1 — The implicit RNG-order contract (highest risk).** Bit-exact conformance depends on every branch consuming PRNG draws in a fixed order; this contract lives in comments and my head. Any well-meaning edit that reorders a check breaks it silently — the harness will catch the symptom but not name the cause. Remedy before Phase 3: a written contract block at the top of `step()`, plus a fast conformance mode (2 seeds × 3,000 ticks, ~3 s) run after every core edit, not just at increment ends.

**D2 — Trait schema sprawl.** `TRAITS` rows now carry ~25 fields with optional semantics scattered as `||` defaults at use sites (`T.mQm||1`, `T.cyst.scMin||0.03`, `CV.minMass &&`). This is how silent-undefined bugs are born, and it will get worse with six more species. Remedy: a `normalizeTraits()` pass applying explicit defaults at load, and the schema documented in one place. This also becomes the settings screen's data dictionary, so it pays twice.

**D3 — `step()` as a 200-line deity function.** Deliberate (one cache-friendly pass, no per-tick allocation), but the interleaving of metabolism/movement/feeding/reproduction is now the hardest thing in the codebase to modify safely — see D1. I recommend *keeping* it monolithic for performance and paying the readability debt in documentation rather than decomposition; a systems-split would multiply array passes and jeopardize the RNG contract for aesthetics.

**D4 — Module-singleton world state.** `W` is a global; one world per process. Fine for the artifact and the harness (serial reset), but it forecloses in-app side-by-side comparison worlds (a K6 split-screen comparison would want two). Decision needed before Phase 5, not before Phase 3: either accept sequential A/B (cheap, probably sufficient for staged scenarios) or refactor `W` into an instantiable structure (~a day, mechanical).

**D5 — Float32 audit drift trends with economy size.** −0.007 % → −0.011 % per half-hour as flux doubled. Within target, direction noted. The remedy is scoped (mineral stores and field to Float64; ~2× memory on those arrays, negligible); trigger: drift > 0.02 %/30 min in any Phase 3 run.

**D6 — Render budget at its ceiling.** 43–45 fps at 16× with ~3,100 organisms + ~1,250 corpse draws on the reference device. The deferred 2.7 items are now the top of the Phase 3 backlog: corpse aggregation below a zoom threshold (a fourth field layer, machinery exists), bacteria dot-LOD, and the store-bars/limitation-badge card upgrade that makes the chemistry legible to a viewer.

**D7 — GC pressure from `neighbors()` closures.** ~25 k short-lived closures/s at 16×. No observed jank yet; flagged, not fixed. Fix only on profiler evidence.

**D8 — `ui.jsx` monolith.** ~700 lines, one component. Split into canvas-host / sheets / chrome before the Phase 3 charts screen lands, or the file becomes the new deity function.

## 4. Process findings worth keeping (and two worth admitting)

The increment discipline (one change, verified patch, seeded runs) is the reason nine failed tuning iterations on 2.6 cost an afternoon instead of a week: every failure produced a named mechanism — dormancy economics, scent localization, competitive exclusion, colonization R₀ — rather than vibes. The pre-commitment mechanism worked twice at full price: K6 was executed exactly as promised, and the Mycora deadline was enforced by the user when I offered to bend it, which is the system functioning, not failing. Admissions: I twice wrote verification asserts with wrong expected counts (the check itself needs checking — per-edit match counting fixed this); and I once claimed tuner/artifact RNG divergence from memory when the files were identical — the "check the file, not the memory of the file" rule earned its place in this document.

The transferable ecology-engineering lesson of Phase 2, twice paid for: **the hard problems were transport, not stocks or rates** — mineral stranded in the dark until turbulent mixing existed, scent too localized to guide the scavenger. When a closed system starves in one place while rich in another, suspect the plumbing before the metabolism.

## 5. Android migration status

Unblocked and cheaper than at Phase 1 close. The core is a single dependency-free file with a conformance suite; the event queue is the complete write-API; the render layer is explicitly disposable. Route recommendation unchanged (WebView/Capacitor first if time-to-device matters; Kotlin translation of `core.js` + `tune2.js`-statistical-match if native performance is ever the requirement). The one open architectural decision affecting a native app is D4 (world instantiability).

## 6. Phase 3 entry checklist

Pre-work (small, in order): RNG-contract block + fast conformance mode (D1); `normalizeTraits()` (D2); `ui.jsx` split (D8); corpse aggregation + bacteria LOD (D6). Then the Phase 3 ecology: Cilio's diet expansion to Bacillus as the first deliberate re-opening of the apparent-competition channel — added alone, measured alone — followed by the predator pair, and with their kill-flux, the return of Necro and Mycora to the niches this phase proved they need.

Verdict: the architecture held under three species additions, one refactor, two scope cuts, and one adversarial experiment, and every claim above has a run attached to it. Phase 2 is closed honestly: four species shipped, two deferred with named causes, chemistry proven load-bearing.
