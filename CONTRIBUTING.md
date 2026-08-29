# Contributing to Microcosm

Contributions are welcome. This project has a few unusual rules, and they exist
because breaking them silently corrupts a body of measured results that took a
long time to earn. Please read this section before touching `src/core.js`.

## The short version

```bash
npm install          # devDependencies (esbuild, for the syntax check)
npm run build        # src/ -> dist/microcosm.jsx
npm test             # build + syntax + conformance. Run this before every push.
```

`npm test` must pass, and `npm run conform` must print **no NOTE**, before a
change is ready.

## Layout

```
src/sim/          the simulation — deterministic, under the RNG contract
src/observatory/  the instruments — pure observers, zero PRNG draws
src/ui-*          the render layer — disposable, rewritten per platform
tools/            build.py, which assembles src/ into dist/
dist/             generated and committed on purpose, verified by CI
harness/          conformance, ecology and gate scripts
docs/             design record, calibration histories, porting.md
```

Never edit anything in `dist/` by hand. It is generated; CI fails the build if
it does not match `src/`. If you are porting the simulation to another language,
read `docs/porting.md` first.

## The rules that matter

**1. `src/sim/` is under an RNG-order contract.** Every organism's random draws
happen in a fixed order. Adding, removing or reordering a draw anywhere
reachable from `step()` shifts the entire random stream and invalidates every
recorded result in `docs/`. If you need new randomness, use the pre-draw pattern
already in the file. There is a banner comment at the top of `src/sim/step.js`;
read it before changing anything there.

`src/observatory/` is different: it makes **zero** PRNG draws and mutates no
dynamic state. That is enforced, not merely intended — instrumentation changes
must come out bit-identical. Keep it that way.

**2. The core is pure and deterministic.** No DOM, no React, no `Date.now()`, no
`Math.random()`, no I/O. Time is measured in simulation ticks. This is what makes
the world reproducible from a seed and what allows a native port to be checked
against it. (UI-side randomness, e.g. picking a fresh seed on reset, is fine.)

**3. Conformance is a ritual, not a formality.** After any change under `src/`:

```bash
npm run conform
```

It fingerprints two seeds at t=3,000 and compares against a stored baseline. It
also stores a sha256 of the built `dist/core.js`, letting it tell three cases apart:

| Hash | Fingerprint | Meaning |
| --- | --- | --- |
| same | same | nothing changed |
| **differs** | same | behaviour-neutral edit — a comment, a refactor, instrumentation |
| **differs** | **differs** | a behaviour change |

Instrumentation and observability changes **must** be bit-identical. If you
change behaviour deliberately, say so in the PR, re-run the ecology harness
(`npm run tune`), and only then re-capture:

```bash
npm run conform:capture
```

**Re-capturing on a changed fingerprint launders a behaviour change into the
baseline. Never do it to make a warning go away.** Fingerprint identity is the
behavioural claim; the hash only binds it to the file that produced it. A pull
request is not complete while `conform.js` prints a NOTE.

## The longer checks

```bash
npm run tune      # 8 seeds x 18,000 ticks; ecology acceptance (~3 min)
npm run gate      # the K6 experiment: can the Observatory narrate a collapse?
npm run corridor  # every locus pinned at both rails, all combinations, 8 seeds
npm run yoshida   # the controlled evolution experiment (npm run yoshida:capture after a declared change)
npm run gate5     # the Phase 5 gate: does the Observatory narrate the evolution?
```

All of them build on `harness/lib.js`; add new measurements there rather than
copying loops between scripts, and give any new estimator a case in
`harness/selftest.js` — that file runs inside `npm test`.

**Heredity changes.** A locus expression may only scale a rate or a probability,
never a stock, and must reduce to exactly the bare trait at `g0` (that identity is
what keeps the silent genome bit-identical). After any change to a locus:
`npm run conform` must show the *silent* fingerprints identical and only the
*evolving* ones changed; recapture both `conform` and `yoshida` baselines with the
declared reason; then `tune`, `corridor` and `gate5`.

Both are known to fail on the current tree — see **Status** in the README for
the measured numbers and why. If you are working on ecology, they are the
authority on whether you improved things; please quote before/after output in
the PR rather than describing it.

## Style

- Functional names first, science as the subtitle: *"Recycling speed — mineral
  turnover"*, not *"Mineral turnover rate"*.
- Amber (`#F2B24A`) means the player's hand and nothing else. Every other colour
  belongs to the world.
- The instrument does not overclaim. A before/after window cannot prove
  causation, so impact wording is **"since"**, never **"because"**. Warnings are
  calibrated against measured reference bands, not against intuition.
- Prefer measuring to theorising. Nearly every indicator in this app started as
  a confident theory that lost an argument with the data; the histories are in
  `docs/observatory-design.md`.

## Licensing

Code contributions are accepted under **GPL-3.0-or-later**, documentation under
**CC BY-SA 4.0**. By opening a pull request you agree to license your work on
those terms.
