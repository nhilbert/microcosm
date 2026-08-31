# Microcosm

A pond you can hold in your hand. Microcosm is a mobile-first sandbox in which
artificial organisms photosynthesise, graze, hunt, starve, reproduce and rot
inside a world where matter is strictly conserved — every mineral atom is
somewhere, and the app can tell you where.

It is a toy, not a model of anything real. The point is to poke a complicated
living system and find out what happens.

## What's in the world

Seven species are defined; five are alive in the shipped world. Four of them
carry a heritable trait and evolve — Solara's light adaptation, Drifta's defense
against grazing, Cilio's pursuit of it, and Bacillus's rate-versus-yield
metabolism — and you can set the mutation rate, the shape of each trade-off and
the prices yourself, as interventions the Observatory then reports on:

| Species | Role |
| --- | --- |
| **Solara** | benthic mat, sessile, photosynthetic |
| **Drifta** | plankton, drifts and follows the light |
| **Cilio** | grazer, steers by smell, flees and raises an alarm |
| **Bacillus** | decomposer, tumbles up detritus gradients |
| **Venator** | apex predator, hunts in packs, founds colonies |
| *Mycora, Necro* | defined but not seeded in the current world |

Underneath them: a 64×64 resource grid on a torus, a single movable sun,
turbulent mineral mixing, an energy/protein/mineral/structure chemistry,
corpses that decay into detritus, and a scent field that doubles as the
organisms' only means of navigation.

## The instruments

Half the app is the **Observatory** — the diagnostic bench that made the
ecosystem tractable to build, turned into a screen you can read. It watches the
world as a pure observer and narrates it: population and chemistry charts,
metabolic flow meters, health indicators calibrated against measured reference
bands, and an event feed that reports what changed after you touched something.

The house rule is that the instrument never overclaims. Impact cards say
*"since"*, never *"because"* — a before/after window cannot prove causation, and
the app says so rather than pretending otherwise. Warnings are calibrated
against measurement rather than intuition; several plausible-sounding indicators
were built, tested against archived collapses, and thrown away for failing.

## Levers

Drag the sun. Dim or brighten it. Pour minerals. Feed or kill an individual.
Seed a species. Every intervention is an event: logged, undoable, replay-safe,
and visible in the ledger — the mineral bar grows an amber tick showing exactly
how much matter your hand added. Amber is reserved for the player's hand
throughout the UI; every other colour belongs to the world.

## Running it

`dist/microcosm.jsx` is the deliverable: one file, React only, no localStorage,
sized for a phone screen. Drop it into any React host, or paste it into a Claude
artifact. It is committed, so you can grab it without building anything.

To run it locally in a browser:

```bash
npm install
npm start       # -> http://127.0.0.1:5173
```

That serves the app itself, filling the browser window. Edit anything in `src/`
and the page rebuilds and reloads itself. For phone-sized testing, use your
browser's device emulation (F12 → device toolbar) — the app takes its size from
the viewport, so that is all it needs.

To build the artifact from the layers in `src/`:

```bash
npm run build   # src/ -> dist/microcosm.jsx
npm test        # build + syntax check + conformance
```

Nothing in `dev/` ships. It exists so a browser has something to load; the
artifact is unaffected by it.

To run it **on an Android phone**: the Releases page carries a rolling
**Microcosm APK (latest)** (tag `apk-latest`), rebuilt by CI from the current
artifact on every relevant push. Download `microcosm.apk` on the phone and
install it. The wrapper in `android/` is a dependency-free WebView shell —
the sim still runs as JS; `docs/android-wrapper.md` has the details and the
decisions (offline, no permissions, no localStorage, committed identity-only
keystore).

A second, separate APK — **Microcosm native probe** (tag `probe-latest`, built
from `android-native/`) — runs the *Rust* core natively through JNI and prints
what it measures: whether the certified world reproduces bit-for-bit on ARM64,
whether the math matches V8's own results, whether a saved world resumes
identically, and how fast the core ticks on that device. It is a diagnostics
screen, not the game, and it installs alongside the sandbox app without touching
it. Background: `docs/android-port-plan.md` §8.

## The harnesses

The simulation core is pure, deterministic and framework-free — no DOM, no
React, no `Date.now()`, no unseeded randomness. That is what makes it testable,
and the tests are the interesting part of this repo:

```bash
npm run conform   # fast: 2 seeds x 3,000 ticks, fingerprints world state
npm run tune      # acceptance: 8 seeds x 18,000 ticks with a mineral audit
npm run gate      # the gate: can the Observatory narrate a collapse unaided?
```

`harness/conform.js` is hash-bound. It stores a sha256 of `core.js` alongside the
expected world fingerprint, so it can tell three cases apart: nothing changed,
the file changed but behaviour did not, and behaviour changed without anyone
declaring it. Instrumentation must be provably bit-identical; ecology changes
must be declared and re-accepted through `tune2.js`.

`harness/k6gate.js` runs the experiment the whole project is built around: switch the
decomposers off and the world does not crash — it slowly strangles, as minerals
lock away in matter nothing can recycle. The gate passes only if the Observatory
sees it coming and says so without being asked.

## Repo layout

```
src/sim/            the simulation — pure, deterministic, translated exactly by a port
  params.js           PRNG, tunable constants, body tags
  traits.js           species-as-data: the TRAITS table
  world.js            world state W (structure-of-arrays), spawn/kill
  events.js           interventions: the only legal outside mutation
  fields.js           mineral diffusion, light, spatial hash, neighbours
  step.js             the RNG-order contract and the tick
  init.js             world setup, Node exports
src/observatory/    the instruments — zero PRNG draws, free to reimplement
  recorder.js         ring buffer + event detectors
  analysis.js         reference bands, strain, indicators
  impact.js           before/after intervention analysis
src/ui-*            the render layer — explicitly disposable, rewritten per platform
tools/build.py      assembles the layers into dist/
dist/microcosm.jsx  the artifact — generated, committed, checked by CI
dist/core.js        the sim exported for Node — what the harnesses drive
harness/            conform.js, tune2.js, k6gate.js and the certified baseline
docs/               concept, phase plans, design notes, porting.md
CONTRIBUTING.md     the rules that keep the recorded results meaningful
CLAUDE.md           working rules and current status
```

The layers have no module system — they are concatenated into one scope, which
is why `tools/build.py` fixes their order and why none of them import anything.
The file boundaries are for humans; the runtime sees one program.

Never edit `dist/microcosm.jsx` by hand — it is generated from `src/`, and CI
fails the build if the two disagree.

`docs/` is the honest record: what was designed, what was tried, and what was
measured and abandoned. The calibration histories in `observatory-design.md` are
the most useful thing in there — nearly every indicator in this app started as a
confident theory that lost an argument with the data.

## Status

Phases 1–5 are closed. A Kotlin port is the eventual target — `src/sim/` plus
the harnesses are its conformance spec (`docs/porting.md`).

Measured on this tree, 2026-08-29:

- **`conform.js` — PASS**, bit-identical on both fingerprints: the *silent*
  genome (the Phase 4 reference world) and the *evolving* world that ships.
- **`tune2.js` — 8 of 8 seeds pass** the acceptance criterion. Venator, the apex
  predator, holds on five seeds and is lost on three (11, 66, 88) between
  t=5,100 and t=7,200 — but every world runs the full 18,000 ticks with all four
  core species alive and the mineral audit flat to within 0.009%. Losing the
  apex restructures the world; it does not break it.
- **`k6gate.js` — PASS**, all five criteria, on the reference world: strain
  warning 712 s before the grazer's death, extinctions in ecological order,
  control silent (2/78 flags). Under evolution the grazer survives the same
  experiment — a Phase 5 finding the gate reports for information.
- **`gate5.js` — the Observatory narrates the evolution unprompted**: a sweep
  event on 8/8 evolving seeds, each grounded in the locus-mean channel; the
  silent control emits nothing and its variance channel reads exactly 0.
- **`corridor.js` — CERTIFIED**: both loci may evolve anywhere in [0,1]; all
  four rail corners pass the ecosystem criterion on 8/8 seeds.

**On the acceptance criterion.** Venator was originally certified to establish on
all eight seeds. After an undeclared RNG drift in Phase 4 (recorded in
[CLAUDE.md](CLAUDE.md)) it establishes on five. Rather than tune the world until
an old number came back, the criterion was amended to what the harness can
honestly assert: *the ecosystem* must survive, and the apex is reported rather
than required. Its establishment is stochastic, which is a fair description of
apex predators; the species-seeding tool is how a player puts one back.

That amendment was tested, not assumed — the three apex-loss seeds had never
been run past the moment the predator died, so it was entirely possible they
would collapse later. They don't.

**An unplanned finding.** The three apex-loss worlds separate cleanly from the
five apex-holding ones at t=18,000: Solara 1,669–1,736 versus 1,347–1,624, and
Drifta 332–361 versus 456–1,116. The ranges do not overlap in either direction.
That looks like a trophic cascade — remove the top predator and the producer
community reorganises. Eight seeds and one time point is not proof of a
mechanism, so it is recorded as an observation worth testing properly, not as a
result.

**The integrity incident, resolved.** The handoff called the RNG drift
unrecoverable. The source held the answer: the Phase 5 locus had been switched on
live inside the certified world. Silence it and the Phase 4 record reproduces to
the second. The baseline now certifies both worlds explicitly.

**What evolution actually did.** Drifta carries one heritable locus — defense
against grazing, priced in growth. Under grazing it is selected all the way to
the defended rail (mean 0.50 → 0.93 in 36k ticks), the Observatory narrates the
sweep as it happens, and the grazer's cycle becomes tighter and more regular.
The textbook prediction came out half right: evolution *lengthens* the
grazer–prey cycle (3,340 → 4,100–5,300 ticks), but the lag collapses toward zero
rather than toward antiphase, and no cryptic regime appears. The first version
of that measurement said otherwise — its period estimator returned quarter
periods, a self-test caught it, and the records were re-measured on the
historical builds and corrected rather than footnoted. Prices are now set by
measured surfaces (a balanced polymorphism ships), Cilio evolves its pursuit,
Solara its light adaptation, and the loci carry a curvature term because linear
trade-offs turned out to be knife-edges. All of it is in `docs/phase5-record.md`
and `docs/genetics-scaling.md`, numbers included.

## License

Code is **GPL-3.0-or-later** — see [LICENSE](LICENSE). Use it, study it, fork it,
publish your fork; derivatives stay under the same terms, so improvements to the
world stay available to everyone who wants to play with it.

Everything in `docs/` is **CC BY-SA 4.0** — see [LICENSE-docs](LICENSE-docs). The
design writing is meant to be quoted, translated and argued with; credit it and
share adaptations alike.
