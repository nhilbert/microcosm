# Porting Microcosm

Written for the two ports on the roadmap: an Android app, and moving the
simulation into a compiled language behind whatever renders it. This is the
contract a port has to honour, and the protocol for proving it did.

## What the boundary is

`dist/core.js` is the whole simulation and its analytics, assembled from
`src/sim/` and `src/observatory/`. It touches no DOM, no React, no clock and no
I/O. That is what makes it portable and what makes it testable, and it is worth
keeping true: the moment the core reads a wall clock or a global random source,
the harnesses stop being able to say anything.

Everything under `src/ui-*` is the render layer. It is explicitly disposable —
rewrite it per platform without consulting anyone.

## The two halves, and how differently they must be treated

**`src/sim/` must be translated exactly.** Its output is defined bit-for-bit by
the PRNG stream. Any deviation in the *order* of random draws produces a
different world — not a slightly different one, a completely different one after
a few thousand ticks.

**`src/observatory/` may be reimplemented freely.** It makes **zero** PRNG draws
and mutates no dynamic state; it reads the world and describes it. You can
rewrite the detectors in Kotlin idiomatically, move them off the hot path, or
run them on a background thread. Nothing there can change the world. That
separation is the reason the two directories exist.

## The RNG-order contract

The PRNG is `mulberry32`, a 32-bit integer-state generator (`src/sim/params.js`).
It must be reproduced exactly, including the `|0` / `Math.imul` overflow
semantics — in a language with real 32-bit ints this is easier than in
JavaScript, not harder, but the multiply must wrap the same way and the final
division is by `4294967296`.

Every organism draws in a fixed order inside `step()`. The full contract is the
banner comment at the top of `src/sim/step.js`; read it before writing any
equivalent. Two consequences that bite ports specifically:

- **One organism loop, not several.** `step()` is a single pass over all
  organisms, in index order, doing cyst/wake, movement, feeding, hazard and
  reproduction per organism before moving to the next. Splitting that into
  per-system passes — the obvious "clean" decomposition — reorders the draws and
  changes every result. It also multiplies traversals of the arrays. Keep it as
  one loop.
- **Draw unconditionally where the original does.** Where the source draws
  before testing a condition (the pre-draw pattern), the port must draw there
  too, even when the value goes unused. Skipping an unused draw shifts the
  stream for everything after it.

## Data layout

World state `W` (`src/sim/world.js`) is structure-of-arrays over typed arrays,
sized `MAXN = 6000`: parallel `Float32Array`/`Int32Array` columns (`x`, `y`,
`vx`, `en`, `sp`, `mn`, …) indexed by organism slot, plus grid fields (`M`,
`dE`, `dM`, `sc`, `light`) over a `GRID × GRID` torus and a corpse pool with its
own parallel columns.

This maps directly onto `FloatArray`/`IntArray` in Kotlin or flat arrays in
C/Rust, and it should stay that way. It was chosen for cache behaviour and for
allocating nothing per tick. Turning organisms into objects is the one
"refactor" guaranteed to make a port slower than the JavaScript it replaces.

Slots are recycled. An organism is identified by `(index, gen)` — index alone is
not stable, and code that holds a reference across ticks must re-check `gen`.

## Heredity (Phase 5)

`W.g` is one `Float32Array` column: the heritable locus value in [0,1] for any
species whose `TRAITS` row carries a `locus`, else 0. `W.lg` is the lineage
generation (founders 0, child = parent + 1), pure bookkeeping. Expression is
inline in `step()` and must be translated exactly as written, because it is
constructed so that at `g == g0` both expressions collapse to the bare trait:

    escape probability   escape.p + escSlope * (g - g0)
    photosynthesis       kp * (1 + kpSlope * (g0 - g))

That identity is what makes the silent genome bit-identical to the pre-heredity
world, and it depends on `g0 - g0` being exactly zero in floating point — keep
the arithmetic in this form; do not pre-multiply or rearrange.

Inheritance at division: child `g` = parent `g`, plus ONE uniform draw
`(R() - 0.5) * 2 * sigma` clamped to [0,1] — but only when `sigma > 0 &&
P.mutation`. That conditional is part of the RNG contract: with mutation off, no
draw is made, and the stream is identical to a world with no genome at all. A
port must reproduce that short-circuit, including its order relative to the
other draws in the reproduction block.

`P.mutation = false` is the reference configuration for conformance
(`conform.js` fingerprints both). To pin a population at a rail for an
experiment, set `W.g[i]` on the founders after `initWorld()` with mutation off —
do not change `locus.g0`, which is the expression reference, not the initial
value.

Recorder channels 42–48 (locus mean per species) and 49–55 (standard deviation)
are pure reads over `W.g`. The sweep and diversity detectors in
`src/observatory/recorder.js` read those channels plus a share computed
directly from `W.g`; both are observers and may be reimplemented freely.

## The write API

`applyEvent` / `queueEvent` / `drainEvents` (`src/sim/events.js`) are the only
legal way to mutate the world from outside. Events are applied at tick
boundaries and logged, which is what makes interventions undoable and replayable.
A port should expose exactly this and nothing else; a UI that writes into `W`
directly will desynchronise from the event log and break replay.

## Proving a port correct

The harnesses are the specification. In order of strength:

1. **`harness/conform.js`** — the fingerprint. Two seeds, 3,000 ticks, then
   compares populations, summed positions, energy, mineral and the field total.
   A port that reproduces this is bit-exact. Port this check first; it is small
   and it fails loudly and early.
2. **`harness/tune2.js`** — 8 seeds × 18,000 ticks with a mineral audit. A
   bit-exact port matches it exactly. A port that deliberately diverges (a
   different PRNG, parallelism, float ordering) must at minimum match it
   *statistically*: all four core species surviving on all eight seeds, and the
   mineral audit flat to within 0.01%.
3. **`harness/k6gate.js`** — switches the decomposers off and asks whether the
   observatory narrates the resulting collapse. This tests the analytics rather
   than the sim.

Note the current measured state before comparing against it: see **Status** in
the README. `tune2` passes 8/8 on the ecosystem criterion, and the K6 gate does
not currently pass.

## Floating point

The sim is `Float32Array` storage with `Float64` arithmetic — JavaScript numbers
are doubles, and values narrow on store. A port must match that pattern
(compute in double, store in float) to stay bit-exact. `Math.sqrt` and
`Math.atan2` are correctly-rounded or near enough on every platform in practice,
but `Math.sin`/`Math.cos` are not specified precisely in ECMAScript — check
where they appear before assuming bit-exactness across languages.

If bit-exactness is abandoned deliberately, say so loudly in the port's own
documentation and fall back to the statistical criterion above. Silent
divergence is the failure mode that costs weeks.
