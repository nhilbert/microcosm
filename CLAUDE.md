# CLAUDE.md — Microcosm

A mobile-first ecosystem sandbox in which artificial organisms live, eat, reproduce, and die inside a conserved-matter world. The purpose is **exploration and play** — build a genuinely complex living system, give the player sensible levers, and report honestly on its status, development, and the impact of interventions. Modeling plus monitoring. The simulation is a Rust core (`rust/microcosm-core`); the product is a native Android app (`android-app/`); the single-file React artifact is the frozen oracle the two were proved against.

## Files

- `src/sim/` — the simulation: `params.js` (PRNG + constants), `species.json` (**the species table — row order is the species index, part of the RNG contract**; inlined by build.py; schema + design notes in docs/species-schema.md), `traits.js` (defaults, loader, locus guardrail, `SPECIES` registry — use it instead of literal species indices), `world.js` (SoA state, spawn/kill), `events.js` (the only legal outside mutation), `fields.js` (diffusion, light, spatial hash), `step.js` (**the RNG-order contract + the tick**), `init.js` (setup + Node exports). Pure, deterministic, UI-free — and since the M4 handover, the FROZEN historical oracle: `rust/microcosm-core` is the living simulation, and this is what it was proved against (rule 11).
- `src/observatory/` — `recorder.js`, `analysis.js`, `impact.js`, `levels.json` + `levels.js` (Phase 8 learning levels: **the table is data, predicates included** — inlined by build.py as `LEVEL_ROWS`, generated into `rust/microcosm-core/src/levels_gen.rs`; `levels.js` is the evaluator plus pure-observer verdicts; setup composes only initWorld scenarios and events). Pure observers: **zero PRNG draws**, no mutation of dynamic state. Free to rewrite in a port; the sim is not.
- `src/header.jsx`, `src/ui-render.js` (palette, sprites, tint, **the whole frame pipeline**: layers, organisms, corpses, affordances — the visual grammar lives here), `src/ui-layout.js`, `src/ui-data.jsx`, `src/ui-reset.jsx`, `src/ui.jsx` (component, gestures, selection, actions, panels), `src/ui-levels.jsx` (the app shell: start screen, experiment HUD, verdicts, session badges — the default export since Phase 8) — UI layers; `tools/build.py` concatenates all into `dist/microcosm.jsx`, the deliverable artifact. Generated and committed; never hand-edit, CI enforces that it matches `src/`.
- `harness/tune2.js` — 8-seed × 18,000-tick ecology harness (seeds 11,22,33,44,55,66,77,88). The acceptance authority. Exits non-zero if any seed aborts.
- `harness/conform.js` — fast conformance check (seeds 11+88, t=3,000 fingerprint). **Hash-bound**: the baseline stores a sha256 of the built `dist/core.js`; a hash mismatch with identical fingerprint = behavior-neutral edit, changed fingerprint = undeclared behavior change. `--capture` recaptures (only with a declared reason).
- `harness/k6gate.js` — Phase 4 gate script (the Observatory must narrate the decomposers-off collapse unprompted; healthy control silent). Exits non-zero if the gate fails.
- `docs/porting.md` — **the core contract** (rewritten at the M4 handover): where the simulation lives now, what must be bit-exact, what may be rewritten, how a change is proved, and what the migration measured. Read it before touching anything the tick reaches.
- `harness/light.js` — Phase 7 L measurement and gate (`--viability`, `--patches [--seed]`, `--gate`); `npm run light`, `npm run light:gate`.
- `harness/lib.js` — shared primitives every harness and experiment builds on (`pops`, `auditM`, `locusStats`, `start`, `pin`, `coreCollapsed`, cycle estimators). `MC_CORE=<path>` points it at another build (historical cores, ports). `harness/selftest.js` checks the estimators on synthetic series — it runs inside `npm test`, and it caught a period estimator that returned a quarter period.
- `harness/fingerprint-frame.js` — the M5.1 frame gate: the visual grammar (sprite bucket table, display list, pixel fields, glow and wall lists) compared bit for bit between `src/ui-render.js` and the Rust frame builder; inside `port:check`. `harness/render-smoke.js` — the painting path driven against a canvas stub (runs, and touches the canvas); in `npm test` and CI. Neither can say the frame *looks* right: no screen exists in CI.
- `harness/levels.js` — the Phase 8 honesty gate (`npm run levels`, in `test:full`): every shipped level must FAIL untouched, PASS on its taught strategy, and FAIL on a plausible wrong lever. A level that cannot clear all three is a demonstration, not a challenge, and does not ship. Takes `MC_CORE`, so it runs on the ported core too (`npm run port:levels`, in `test:port` and CI). `harness/fingerprint-levels.js` covers what the gate cannot: the apparatus gates, pour budget, meters, narration and restart — inside `port:check`.
- `harness/playthrough.js` — the §6-step-6 instrument, promoted (2026-09-01): scripted full-speed level runs through the REAL browser UI (start screen → prediction → gestures → verdict → retry), `npm run play`. Needs a Chromium + playwright-core, so it is a bench instrument outside npm test/CI; run it before a level ships and after UI surgery. Its first run convicted the reset→chips crash no other gate could see. Levels earn scripted paths as they ship (PLAYS table).
- `harness/yoshida-baseline.json` — seed-22 cycle metrics written by `npm run yoshida:capture`; `gate5` reproduces them bit-exactly. Recapture with every declared evolving change, same discipline as the conformance baseline.
- `harness/conform-baseline.json` — the certified fingerprint plus the `coreHash` it is bound to. Never hand-edit; only `npm run conform:capture` writes it.
- `rust/microcosm-core/` — **the Rust port of the core** (sim + observatory), bit-exact to the JS reference: `math/` (self-contained, matched to V8 12.4 — never call `f64::sin` here), `step.rs` (carries the RNG-order banner verbatim), `observatory.rs`, `snapshot.rs` (save/load), `wasm.rs` (the C ABI). `rust/wasm/core.js` presents it as `dist/core.js`, so `MC_CORE=rust/wasm/core.js` points any harness at the ported core. `species_gen.rs` and `levels_gen.rs` are GENERATED from the built JS core by `tools/gen-species-rs.js` / `tools/gen-levels-rs.js` — never hand-edit, CI enforces it. `levels.rs` is the level runtime, gate-proved against the oracle (`npm run port:levels`); `frame.rs` is the **visual grammar** shared by every platform's renderer (M5.1 A.0) — display list, sprite bucket table, per-cell pixel fields, glow and wall lists — proved against `src/ui-render.js` by `harness/fingerprint-frame.js`. Proof commands: `npm run port:check` (world + events + scenario), `npm run port:math` (needs a trace from `dev/xcheck/gen.js`), `npm run port:snapshot`, `npm run port:levels` (the honesty gate on the ported core); `npm run test:port` runs the lot. Plan and measured status: docs/android-port-plan.md; the app is `android-app/`, planned and recorded in docs/android-app-plan.md (A.0–A.6 shipped: frame builder, render thread, gestures, levers with undo and impact cards, Data pages, the experiment ladder, save/load).
- `LICENSE` (GPL-3.0-or-later, code) and `LICENSE-docs` (CC BY-SA 4.0, everything in `docs/`). The GPL notice lives at the top of `src/header.jsx` so the built artifact carries it once; the sim sources deliberately carry no per-file header, to keep the core hash stable.
- `docs/status-log.md` — **the running record**, 41 dated entries from phase 1 to now, verbatim. Moved out of this file on 2026-09-02. Read the entries for whatever system you are about to touch; the Current status section below is only a summary.
- `docs/` — concept, phase plans, architecture review, observatory design, genetics research. Closure records and calibration histories live there; read them before touching related systems.

## Non-negotiable working rules (all earned the hard way)

1. **RNG-order contract** (banner comment atop `src/sim/step.js`): every organism's random draws happen in fixed order; never add, remove, or reorder draws in step()-reachable code without declaring an ecology change plus full re-acceptance. Use the pre-draw pattern for new randomness.
2. **Conformance ritual**: after every core edit, run `npm run conform`. Observer/instrumentation changes must be **bit-identical**. Behavior changes must be declared, re-accepted via tune2, and re-captured. Never trust a green check without the hash note making sense. **A handoff or phase closure is not complete while `conform.js` prints a NOTE** — a stale hash means the baseline no longer certifies the file that actually produces it. Rebind it with a declared reason; recapturing is always a visible, deliberate act, never a way past a warning. Fingerprint identity is the behavioral claim, so recapturing on a *changed* fingerprint would launder a behavior change — the one thing never to do.
3. **Per-edit verification**: patch via exact-string replacement with occurrence-count checks (`count==1`), a fails list, and halt-on-mismatch. Check the file, not the memory of the file — grep anchors before patching.
4. **Instrument before knob**: measure before tuning. Every calibration in this project that started from theory failed against measurement (see the calibration histories in observatory-design.md).
5. **Determinism**: no `Date.now()` / `Math.random()` in core mechanisms; sim-tick timestamps only. UI-side randomness for reset seeds is fine.
6. **Honesty over polish**: impact wording is "since", never "because"; warnings are calibrated against measured reference bands; failures and incidents get recorded, not smoothed over.
7. **Color grammar**: amber (#F2B24A) marks the player's hand, exclusively. Species colors belong to the world. Venator identity: glacier blue [168,214,244].
8. **Naming**: functional first, science as subtitle ("Recycling speed — mineral turnover").
9. **Scope**: one extension, then defer. The deferral list with re-entry conditions is in phase3-plan.md.
10. **Build check**: `npm test` (build + syntax + conformance) after any edit; it is the same gate CI runs. Artifact constraints: single file, React only, **no localStorage**. Scripts live in `package.json` — prefer them over raw invocations so CI and local runs cannot drift.

11. **The handover is done (M4, 2026-08-31): `rust/microcosm-core` IS the simulation.** Ecology changes land in Rust and are certified by `npm run conform:core` (fingerprint + a hash of the Rust sources + native-vs-WASM identity). `src/sim/` and `src/observatory/` are the FROZEN historical oracle — read them, never extend them; an ecology change landed in JS would fork the world from the crate, which is the one thing this migration existed to prevent. The render layer (`src/ui-*`) is still JavaScript and still evolves normally. **The one edit the frozen files legitimately take** is a behaviour-preserving move of a definition into shared data — it removes a second definition rather than creating one, which is what the rule is for. The level-table extraction (2026-08-31) is the precedent; it is allowed only on those terms: conformance bit-identical, the affected gate byte-identical on BOTH cores, and the reason recorded. Anything that changes what the world does still lands in Rust. `npm run port:check` still proves the crate reproduces the frozen oracle and is the strongest check here — but it is EXPECTED to fail at the first declared ecology change in Rust, at which point it retires into the record rather than being "fixed". Node stays pinned to 22 for the oracle: the fingerprints were captured on V8 12.4, and Node >= 23 silently changed `Math.pow`. Full contract: docs/porting.md.

## Working style

Small increments, each confirmed before the next. State contradictions and trade-offs plainly; ask 1–3 questions when a decision is genuinely ambiguous rather than guessing. Take devil's-advocate positions unprompted — an unchallenged design decision in this codebase has usually been wrong.

## Current status

The full running record — 48 entries, phases 1 through 8 — is in
**docs/status-log.md**. Read it when you need the history of a system you are
about to touch; the phase records in `docs/` carry the numbers. What follows is
only where things stand.

**The port is done.** `rust/microcosm-core` is the simulation (rule 11).
`src/sim/` and `src/observatory/` are the frozen oracle; `src/ui-*` is the
render layer and still evolves. `port:check` is expected to retire at the first
declared ecology change in Rust; that has not happened yet.

**The app is the product.** `android-app/` runs the Rust core natively. The
WebView wrapper and the M5.0 diagnostics probe both retired on 2026-09-02, their
jobs done; the host-side `selfcheck` they carried moved into `ci.yml`. The
browser build stays as the renderer's frozen oracle — `frame.rs` is proved
against `src/ui-render.js` by `harness/fingerprint-frame.js`, and it keeps the
clamp seam and the Ghost Ray the app has moved past, deliberately.

**The world.** 5 live species, 11 heritable loci across 4 of them, corridor
CERTIFIED 200/200. Multi-source light and warmth, a temperature field with
thermotaxis, walls with four independent properties. Levers: sun card, mineral
pour, armed feed/kill tools, species seeding, walls, the Evolution panel — all
logged, undoable, impact-carded. Six Data pages including Traits.

**Phase 8's ladder is complete.** L1–L9, L11 and L12 ship; L10 is folded with a
re-entry condition. Levels are calibrated ON the level machinery, never on raw
streams — the gate convicted raw-stream pins twice, and that is now the standing
rule. Experiments save (snapshot v2 carries the level runtime). Player text
obeys `docs/phase8-language-style.md` and, in German,
`docs/phase8-language-style-de.md`; both are enforced by `harness/prose.js` and
`harness/prose-app.js` in `npm test` and in CI. The one exception is the help
page: `help_*` keys run in the **reference register** — the science may be
named, the clause caps still hold (style guide §11 / de §9).

**The help page** (`Help.kt`, reached from the front door) is the app's one
piece of teaching text: a beginner's overview, a drawn diagram of the mineral's
round, and a card per creature putting what it does here beside what its real
model does out there — *Cladophora*, *Chlamydomonas*, *Paramecium*,
*B. subtilis*, *Didinium*, each fact chosen to land on a mechanic the sim
already has. `HelpPageTest` photographs the whole page in both languages.

**Next (owner order)** is unchanged from the log's last entry: playthrough paths
for L8/L11/L12 (wall drawing, feed cadence and σ sliders need gesture
scripting); deferred with re-entry conditions are F3 post-pass twists, F6 A/B
memory and L10's geometry. Also queued: the post-phase Yoshida study, third loci
where a question warrants them, a split detector once a split is observed.
Mycora/Necro re-entry conditions unchanged. Four graphics watch items are open,
none a blocker: device budget read-out, far-zoom mat blockiness, and — from the
light field — Cilio's stacked membrane and the cool lit pool.

**Staged retirement of the JS oracle (decided 2026-09-02, not yet started).**
The oracle is not deletable as it stands: `tools/gen-species-rs.js` reads the
*normalized* `TRAITS` out of `dist/core.js` — deliberately, so `traits.js`'s
defaults, diet fold, loci flattening and `warmGated` derivation land in Rust by
construction — so removing the JS core would leave `species_gen.rs` and
`levels_gen.rs` unregenerable and would delete the browser build with it. The
order is: decide where normalization lives once the oracle is gone, then flip
the harness default core from `dist/core.js` to `rust/wasm/core.js` (note the
trap: `tools/port-check.js` distinguishes the two cores by setting `MC_CORE=""`,
which would silently become Rust-vs-Rust), then tag `oracle/js-final` and delete
only after `port:check` has retired on its own.
