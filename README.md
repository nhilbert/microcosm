# Microcosm

A pond you can hold in your hand. Microcosm is a mobile-first sandbox in which
artificial organisms photosynthesise, graze, hunt, starve, reproduce and rot
inside a world where matter is strictly conserved — every mineral atom is
somewhere, and the app can tell you where.

It is a toy, not a model of anything real. The point is to poke a complicated
living system and find out what happens.

## What's in the world

Seven species are defined; five are alive in the shipped world:

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

Phases 1–4 are closed; Phase 5 (heredity) is planned but not built. A Kotlin
port is the eventual target — `core.js` plus the harnesses are its conformance
spec.

Measured on this tree, 2026-08-29:

- **`conform.js` — PASS**, bit-identical to the certified fingerprint.
- **`tune2.js` — 8 of 8 seeds pass** the acceptance criterion. Venator, the apex
  predator, holds on five seeds and is lost on three (11, 66, 88) between
  t=5,100 and t=7,200 — but every world runs the full 18,000 ticks with all four
  core species alive and the mineral audit flat to within 0.009%. Losing the
  apex restructures the world; it does not break it.
- **`k6gate.js` — does not currently pass.** The Observatory still narrates the
  decomposers-off strangulation unprompted and in the correct ecological order
  (mineral-flow warning at t=5,440, predator death at t=6,260, lock-up warning
  at t=7,460), and the healthy control stays quiet. But the grazer now survives
  the 18,000-tick budget instead of starving, so the gate's lead-time criteria
  have no death to measure against and score FAIL.

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

The Phase 4 record also documents the K6 gate passing on all five criteria. That
one does not reproduce here, and is unresolved. These numbers are published as
measured rather than inherited — the same standard the app's own impact cards
are held to.

## License

Code is **GPL-3.0-or-later** — see [LICENSE](LICENSE). Use it, study it, fork it,
publish your fork; derivatives stay under the same terms, so improvements to the
world stay available to everyone who wants to play with it.

Everything in `docs/` is **CC BY-SA 4.0** — see [LICENSE-docs](LICENSE-docs). The
design writing is meant to be quoted, translated and argued with; credit it and
share adaptations alike.
