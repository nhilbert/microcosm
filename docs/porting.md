# The core: what it is, where it lives, and how a change is proved

**Handover, 2026-08-31.** `rust/microcosm-core` is now the simulation. The JavaScript core is
frozen as the historical oracle. Behaviour changes land in Rust, and are re-accepted by the same
harnesses that always judged them.

This document was the contract a port had to honour. The port happened; it is now the contract the
*core* has to honour, plus the record of how the migration was proved.

---

## 1. Where things are

```
rust/microcosm-core/     THE core: simulation, observatory, and its own math
rust/wasm/core.js        the WASM build presented as dist/core.js — MC_CORE points harnesses here
rust/microcosm-android/  JNI glue (the `jni` dependency lives out here, never in the core)
src/sim/, src/observatory/   the FROZEN JavaScript reference — read it, do not extend it
src/ui-*, src/*.jsx      the render layer: still JavaScript, still disposable, still evolving
```

Targets built from the one crate: `wasm32-unknown-unknown` (the harnesses today, the browser
later), the host triple (native CLI and headless experiments), `aarch64-linux-android` (the app).

## 2. The frozen oracle

`dist/core.js` is frozen at sha256 `6c15a2c8fd3d9dc1`, the build that `harness/conform-baseline.json`
certifies, on **Node 22 / V8 12.4**. It is kept, not built on: it is the thing the Rust core was
proved against, and the only reason to run it again is to re-check that proof.

It has to stay pinned to Node 22 because the engine moved under it: Node ≥ 23 (V8 ≥ 13.2) silently
switched `Math.pow` to the host libm, and 2026 V8 moved sin/cos/exp/atan2 to LLVM-libc's
correctly-rounded routines. A newer engine is a *different* oracle, not a better one.
`conform.js` probes for this (`Math.pow(10,-5) !== 1e-5` on fdlibm-era V8) so a wrong engine
explains itself instead of looking like a broken core.

Ending that pin is one of the things the migration bought: the Rust core carries its own math, so
no engine's drift can reach it.

## 3. What must be exact, and what is free

**`src/step.rs`, `world.rs`, `fields.rs`, `events.rs` and the founding in `lib.rs` are exact.**
Their output is defined bit-for-bit by the PRNG stream. Any deviation in the *order* of random draws
produces a different world — not a slightly different one, a completely different one after a few
thousand ticks.

**`src/observatory.rs` may be reimplemented freely.** It makes zero PRNG draws and mutates no
dynamic state; it reads the world and describes it. It lives in the crate anyway, because the
alternative was two living copies of the detectors — the dual maintenance this whole exercise
existed to end. Its thresholds were all measured, and several were measured twice after the first
design died against the data; rewriting them idiomatically would re-fight settled calibration
battles.

**`src/math/` is frozen source.** Never call `f64::sin`, `powf` or `hypot` from the core: they
dispatch to the platform's libm, which differs between glibc, bionic and WASM, and three targets
would become three different worlds. `sqrt` is the single exception, because it is an IEEE 754
operation and correctly rounded everywhere. Provenance and the rules for touching any of it:
`rust/microcosm-core/src/math/MATH-PROVENANCE.md`.

## 4. The RNG-order contract

The full contract is the banner at the top of `src/step.rs`, carried over verbatim from the
JavaScript. Read it before writing anything the tick reaches. The two rules that bite hardest:

- **One organism loop, not several.** `step()` is a single pass over all organisms, in slot order,
  doing cyst/wake, movement, feeding, hazard and reproduction per organism before moving to the
  next. Splitting that into per-system passes — the obvious "clean" decomposition — reorders the
  draws and changes every result.
- **Draw unconditionally where the original does.** Where the code draws before testing a
  condition, the draw stays there even when the value goes unused. In Rust the guards are `&&`
  chains and `if let` on `Option` fields, which short-circuit exactly as `T.hazard && R()<T.hazard`
  did; the thing to watch is that an `Option::map`/`unwrap_or` refactor which looks tidier can
  silently make a draw unconditional.

One bug from the translation is worth remembering, because it is the shape of mistake this contract
is about: `for (let i=0; i<W.n; i++)` re-reads `W.n` every iteration and `spawn()` grows it, so a
child born this tick is processed this tick. Hoisting the bound — the obvious Rust translation —
left every newborn unstepped, with the parents staying bit-identical while the children silently
diverged.

## 5. Data layout, heredity, and the write API

Structure-of-arrays over flat vectors sized `MAXN = 6000`, allocating nothing per tick. Slots are
recycled: an organism is `(index, gen)`, and index alone is not stable across ticks. Turning
organisms into objects is the one "refactor" guaranteed to make this slower than the JavaScript it
replaced.

Storage is f32, arithmetic f64 — the pattern JavaScript gets implicitly from doubles and
`Float32Array`, spelled out at each site here. `src/jsnum.rs` carries the semantics that do *not*
come free in Rust: `ToInt32` wraps where Rust's cast saturates, `Math.min`/`max` propagate NaN and
order signed zeros, and typed-array stores narrow.

`W.g` is `MAXLOCI` planes of `MAXN`. Expression is inline in `step()` and constructed so that at
`g == g0` every expression collapses to the bare trait — that identity is what makes the silent
genome bit-identical to a world with no genome, and it depends on `g0 - g0` being exactly zero in
floating point. Do not pre-multiply or rearrange. Inheritance draws one uniform kick per locus, in
`loci` order, at every division, and **only** when `sigma > 0 && mutation`: that short-circuit is
part of the contract, because with mutation off the stream must be identical to a world with no
genome at all.

`apply_event` / `queue_event` / `drain_events` are the only legal way to mutate the world from
outside. Events are applied at tick boundaries and logged, which is what makes interventions
undoable and replayable. A UI that writes into the world directly desynchronises from the event log
and breaks replay.

## 6. How a change is proved

Same ritual as always, pointed at the crate.

| command | what it certifies |
|---|---|
| `npm run conform:core` | the fingerprint, bound to a hash of the Rust sources — **and that native and WASM agree** |
| `npm run port:check` | the Rust core still reproduces the frozen JavaScript oracle (see §7), world and level API alike |
| `npm run port:math` | the math module against a V8 trace, exact bits, no tolerance |
| `npm run port:snapshot` | save/load resumes a world identically |
| `npm run port:levels` | the Phase 8 honesty gate on the ported core — every level still fails untouched and passes on its lesson |
| `npm run test:port` | all of the above plus the K6 gate on the ported core |
| `MC_CORE=rust/wasm/core.js npm run tune` | the 8-seed × 18,000-tick ecology acceptance |
| the gates | `gate`, `gate5`, `heat:gate`, `light:gate`, `corridor`, `levels` — all take `MC_CORE` |

**A behaviour change is declared, then re-accepted, then re-captured** — `conform:core --capture`
is always a visible, deliberate act, never a way past a warning. Recapturing on a *changed*
fingerprint without a declared reason would launder a behaviour change, which is the one thing
never to do. A `NOTE` from either conformance harness means the baseline no longer certifies the
sources that produce it: rebind it deliberately or find out why it moved.

**Cross-target identity is a standing gate.** `conform:core` fails if the native and WASM builds
disagree, and refuses to capture a baseline in that state. Two targets diverging means the core has
stopped being deterministic across platforms, which is the property everything else rests on.

## 7. `port:check` has an expiry date, on purpose

`port:check` compares the Rust core against the frozen JavaScript oracle. It passes today because
nothing has changed since the handover.

**The first declared ecology change in Rust will make it fail, and that is correct.** At that point
it stops being a gate and becomes history: annotate it as retired, keep the frozen fingerprints in
`harness/conform-baseline.json` as the record of the world the two implementations once shared, and
let `conform:core` carry the certification from there. Do not "fix" it by touching `src/sim/`, and
do not delete the record.

Until then it is the strongest check in the repository, so run it.

## 8. What the migration proved

Every claim below was measured, not argued:

- the world fingerprint identical at 1 / 20 / 100 / 500 / 3,000 / 18,000 ticks, on all 8 acceptance
  seeds, both genomes — raw IEEE754 bits **and the final PRNG state**, so both implementations
  consumed the same draws in the same order;
- scripted events covering every event type, and scenario founding, identical;
- `tune2` across 8 seeds × 18,000 ticks: **byte-identical output**;
- the observatory's 141 channels and its narration: identical;
- K6, gate5, heat, light and a corridor sample: all pass, byte-identical output;
- the math: 0 mismatches against V8 12.4 over 200,000 samples per function;
- save/load: a resumed world equals one that was never interrupted, and a re-save is byte-identical;
- **on a phone** (Fairphone 5, Android 15, arm64-v8a): the four certified fingerprints reproduced
  bit-for-bit, 0 math mismatches, and 0.400 ms/tick — 250× the world's real-time speed, against a
  UI that currently caps at 16×.

## 9. If someone ports this again

The same rules would apply, and this document plus the harnesses are the specification. Port
`conform` first — it is small and it fails loudly and early. Then the raw-bit fingerprints
(`harness/fingerprint-raw.js` and the crate's `conform` bin print the same thing), then events and
scenarios, then `tune2`, then the gates.

If bit-exactness is abandoned deliberately, say so loudly in the port's own documentation and fall
back to the statistical criterion: all four core species surviving on all eight seeds, and the
mineral audit flat to within 0.01%. Silent divergence is the failure mode that costs weeks — and
the one that nearly happened here, when a gate that ignored `MC_CORE` reported the JavaScript core
passing and looked exactly like the port passing.
