# Contributing to Microcosm

Contributions are welcome. This project has a few unusual rules, and they exist
because breaking them silently corrupts a body of measured results that took a
long time to earn. Please read this page before touching anything the tick
reaches, and `CLAUDE.md` for the full set of working rules.

## The short version

```bash
npm install          # devDependencies (esbuild, for the syntax check)
npm run build        # src/ -> dist/microcosm.jsx and dist/core.js
npm test             # build + syntax + estimator self-test + conformance + prose gates + render smoke
npm run test:port    # the crate: wasm build, core conformance, port:check, snapshot, K6, levels, starts
```

`npm test` and `npm run test:port` must pass before a change is ready. Both
refuse a stale baseline (see rule 3), so a green run means what it says.

## Where things live

```
rust/microcosm-core/  THE SIMULATION — the Rust crate the app runs (CLAUDE.md rule 11)
rust/microcosm-android/  the JNI glue the app loads
android-app/          the product: the native Android app (Kotlin)
src/sim/              the FROZEN JavaScript oracle the crate was proved against — read, never extend
src/observatory/      its observers — frozen for the same reason
src/ui-*              the browser render layer, still JavaScript, still evolving; the renderer's oracle
tools/                build.py (src/ -> dist/), the generators (species/level tables -> Rust), port-check
dist/                 generated and committed on purpose; CI fails if it does not match src/
harness/              conformance, ecology acceptance, gates and instruments
docs/                 the design record, every calibration history, porting.md
```

Never edit `dist/`, `rust/microcosm-core/src/species_gen.rs`,
`rust/microcosm-core/src/levels_gen.rs` or `rust/wasm/species-normalized.json`
by hand: all four are generated, and CI checks them against their sources.

## The rules that matter

**1. Ecology changes land in Rust, never in `src/sim/`.** Since the M4 handover
(2026-08-31) the crate is the simulation. An ecology change landed in the
JavaScript would fork the world from the crate, which is the one thing the
migration existed to prevent. The frozen files take exactly one kind of edit:
a behaviour-preserving move of a definition into shared data, proved
bit-identical on both cores (the level-table extraction is the precedent).

**2. The RNG-order contract.** Every organism's random draws happen in a fixed
order (the banner atop `rust/microcosm-core/src/step.rs`, carried verbatim
from `src/sim/step.js`). Adding, removing or reordering a draw anywhere the
tick reaches shifts the entire random stream and invalidates every recorded
result in `docs/`. New randomness uses the pre-draw pattern already in the
file. Observers (`observatory.rs`, `impact.rs`, `levels.rs`, `frame.rs`) make
**zero** draws and mutate no dynamic state; that is enforced, not intended.

**3. Conformance is a ritual, not a formality.** Two baselines certify two
things:

- `npm run conform` fingerprints the frozen oracle (`dist/core.js`) and binds
  the fingerprint to a sha256 of that file.
- `npm run conform:core` fingerprints the crate, natively and as WASM (the two
  must agree), and binds the fingerprint to a hash of the Rust sources.

Each tells three cases apart:

| Hash | Fingerprint | Meaning |
| --- | --- | --- |
| same | same | nothing changed |
| **differs** | same | behaviour-neutral edit — a comment, a refactor, a guard, instrumentation |
| **differs** | **differs** | a behaviour change |

A stale hash with identical fingerprints is a `NOTE` and **exit code 3**: the
edit was neutral, and the baseline has to be rebound to say so —
`npm run conform:core:capture` (or `conform:capture` for the oracle, which
should never need it again) with the reason in the commit message. That is
the only legitimate recapture. **Recapturing on a changed fingerprint launders
a behaviour change into the baseline. Never do it to make a warning go away.**

A deliberate behaviour change is declared in the PR, re-accepted through the
ecology harness, and only then recaptured. At that point `npm run port:check`
(the crate reproduces the oracle) is expected to fail for the first time and
retires into the record (`docs/porting.md` §7); it is not "fixed".

**4. Instrument before knob.** Every calibration in this project that started
from theory lost an argument with the data. Measure first; the histories are
in `docs/observatory-design.md`.

**5. Determinism.** No `Date.now()`, no `Math.random()`, no platform math in
the crate (`math/` is vendored and matched to V8; `f64::sin` and friends are
forbidden there). Node stays pinned to 22 for the oracle: newer engines
changed `Math.pow`, and `conform.js` refuses to run on them.

## The longer checks

All of them drive the crate through `rust/wasm/core.js` (the acceptance
authority since 2026-09-05); to re-measure the frozen oracle call the harness
directly with `MC_CORE` unset.

```bash
npm run tune       # 8 seeds x 18,000 ticks; the four core species persist and the mineral audit holds ±0.05 %
npm run gate       # K6: the Observatory narrates the decomposers-off collapse unprompted
npm run gate5      # the Observatory narrates the evolution (recaptured cycle metrics: npm run yoshida:capture)
npm run corridor   # every locus at both rails, evolution as the fuzzer; the audit is gated here too
npm run levels     # every level FAILS untouched, PASSES on its lesson, FAILS on a wrong lever — all three rows per level
npm run light:gate # local adaptation narrated on >= 5/8 seeded-twin seeds, the control silent
npm run starts     # every sandbox start world, 8 seeds x 18,000 ticks, to its own criterion
npm run test:full  # npm test plus tune, gate, gate5, corridor and levels
```

New measurements go into `harness/lib.js` rather than copied loops, and any
new estimator gets a case in `harness/selftest.js`, which runs inside
`npm test`. Please quote before/after harness output in the PR rather than
describing it.

**Heredity changes.** A locus expression may only scale a rate or a probability
or shift a bounded reference, never a stock, and must reduce to exactly the
bare trait at `g0` (that identity keeps the silent genome bit-identical). After
any change to a locus: `conform:core` must show the *silent* fingerprints
identical and only the *evolving* ones changed; recapture the core and
`yoshida` baselines with the declared reason; then `tune`, `corridor` and
`gate5`.

## The app

`android-app/` compiles with an Android SDK and `gradle`; the workflow
`.github/workflows/android-app.yml` is its compiler of record and builds every
`claude/**` branch. `gradle -p android-app testReleaseUnitTest` runs the boot,
layout, page and German gates against a host build of the JNI crate
(`cargo build --release --manifest-path rust/microcosm-android/Cargo.toml`).
Player text obeys `docs/phase8-language-style.md` (and `-de.md` in German);
`harness/prose-app.js` enforces both inside `npm test`.

## Style

- Functional names first, science as the subtitle: *"Recycling speed — mineral
  turnover"*, not *"Mineral turnover rate"*.
- Amber (`#F2B24A`) means the player's hand and nothing else. Every other colour
  belongs to the world; a species' identity colour is the middle bucket of its
  dials (`Species.colour` in the app), never a rail.
- The instrument does not overclaim. A before/after window cannot prove
  causation, so impact wording is **"since"**, never **"because"**. Warnings are
  calibrated against measured reference bands, not against intuition.
- Failures and incidents are recorded in `docs/status-log.md`, not smoothed
  over.

## Licensing

Code contributions are accepted under **GPL-3.0-or-later**, documentation under
**CC BY-SA 4.0**. By opening a pull request you agree to license your work on
those terms.
