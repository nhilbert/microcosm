# Android port plan — one Rust core (decision record + plan, 2026-08-31)

## 1. The decision

**Owner decision (2026-08-31): the port is a single Rust core.** One crate holds
the simulation, the observatory, and its own math; it compiles to every target the
project needs — Android (NDK), the browser (WASM), the existing Node harnesses
(WASM behind `MC_CORE`), and a native CLI for automated experiments. The Android
app gets a Kotlin/Compose UI on top. After a one-time conformance proof, the Rust
crate **becomes the spec** and the JS core is frozen as the historical reference.

The owner's constraints, which drove the choice:

1. **No dual maintenance.** Never two evolving implementations of the same
   mechanism. (This kills the perf review's option (a) as documented — JS spec +
   native workhorse — whose stated price is every ecology change landing twice.)
2. **Native Android app**, motivated by performance and a save/load feature.
3. **The browser stays an option** — the sim must be runnable on a PC in a
   browser in the future.
4. **A headless core** for testing and automated experiments.

Scope decision: the Android app targets **full parity** with the artifact
(Observatory pages, impact cards, evolution panel, levels shell) — not a
sandbox-first cut. Save/load **waits for the port**; no interim bridge into the
WebView wrapper.

### Options considered and rejected

- **(a) JS spec + Rust workhorse** (perf-review §6a): rejected on constraint 1.
- **(b) Kotlin Multiplatform core**: one language throughout and the best
  out-of-box math match on the JVM (see §3) — but ≈V8 compute (fails the
  performance driver), the weakest browser target (Kotlin/JS, and `StrictMath`
  does not exist there, so a hand-ported fdlibm is needed anyway), and the Node
  harnesses can never drive it directly: certification would stay a
  cross-implementation fingerprint comparison forever.
- **(0) Stay JS, add saves to the wrapper**: satisfies constraints 1, 3, 4
  today and save/load is feasible via a `JavascriptInterface` bridge — but no
  performance win, and §3's engine-drift finding makes the Node/WebView version
  pin permanent. Legitimate fallback, not a destination.

## 2. What the research measured (2026-08-31)

Three tracks, run before deciding (instrument before knob, rule 4). Numbers, not
folklore:

**Performance (workload-specific, sourced).** The WebView's V8 is *not* slow —
the sim tick runs near-native there; the WebView's real costs are the React/DOM
render path and no thread control. Kotlin/ART is compute-parity with V8 (0.7–2×
either way; fragile bounds-check elimination on multi-array SoA indexing, no
SIMD). Rust is the compute win: expected **×2–5 per tick** (bounds-check-free
organism loop, NEON autovectorization on the diffusion stencils) — consistent
with the perf review's ×1.4 stencil measurement and its ×3–6 organism-loop
estimate, and **still to be confirmed on a phone before full translation (M1)**.
JNI boundary cost is negligible for this design: ~35–115 ns per call, one
`tick()` call per step. Where it pays: today's UI speed cap is 16× (160 ticks/s
target) and the JS tick is ~1.41 ms on desktop, less on phones — a native core
makes 16× actually hold on mid-range hardware and makes 64×/256× meaningful,
which save/load invites (loaded worlds want fast-forwarding).

**Bit-exactness (measured, 200k samples/function; sources in `dev/xcheck/`).**
Against the reference engine (Node 22 / V8 12.4): Java `StrictMath` matches
bit-for-bit on sin, cos, exp, atan2, sqrt; Rust's `libm` crate matches on exp,
atan2, sqrt but diverges 0.7% on sin/cos (range reduction, inside sim range).
`Math.pow` diverges everywhere — V8 modified **one line** of fdlibm's pow in
2016; transliterating V8's pow reproduced the trace 400,001/400,001 (`dev/
xcheck/v8pow.c`). `Math.hypot` is not libm at all in V8 (a Torque builtin,
~10 lines). Conclusion: the Rust core carries its **own math module** — five
functions hand-ported from the proven references (fdlibm-5.3 sin/cos with its
`rem_pio2`, V8-variant pow + hypot; exp/atan2 from vendored verified libm
sources; sqrt is IEEE everywhere) — and is then deterministic across ARM64,
x86-64 and WASM **by construction**, with no platform libm anywhere. mulberry32
and the f64-compute/f32-store pattern are already verified bit-identical in Rust.

**The reference is drifting under us.** Node ≥ 23 silently switches `Math.pow`
to host libm; 2026 V8 moved sin/cos/exp/atan2 to LLVM-libc. The JS core is a
spec only on pinned Node 22. This is an argument *for* the migration on its own:
a self-contained core ends the engine-pin problem permanently.

**Save/load (full state inventory done).** Authoritative state ≈ 1.2 MiB raw
(organism columns incl. 4 locus planes, six grid fields `M/dE/dP/dM/sc/al`,
corpse pool, walls/sources, freeList order, flows, event logs, recorder ring,
detector latches, `LVL` state, mutable `P` flags, mutated `TRAITS` loci) —
~150–350 KB compressed. Everything else (light/temp/gradients, wall planes,
spatial hash, `szPow` — though we save `szPow` to dodge a pow round-trip) is
derived and recomputed on load. Two prerequisites surfaced: **the PRNG state is
a closure variable today, unreachable and never saved — and the running world
does not even store its own seed** (`ui.jsx` discards it). And **the `locus`
event writes price slopes into shared `TRAITS` objects that `initWorld` only
partially restores** (`sigma`/`curve` come back, the slopes leak across resets)
— a live bug independent of the port. Format: versioned flat binary (magic,
version, core hash, seed, tick + little-endian array dumps), written by the
core, stored via Android `AtomicFile`; the event log rides inside as provenance.
Event-sourced saves were rejected: the log truncates at 4,000 entries, scenario
founding and some `P` flags bypass it, and replaying 18k ticks is a ~30 s load
screen. Replay remains the *verification oracle*: save at T, load, run to
T+3,000, compare conform-style fingerprints against an uninterrupted run —
identical to the last digit or the save is wrong.

Full math report: https://claude.ai/code/artifact/bc7e3066-fc3f-44be-b769-0624467f23ec

## 3. Target architecture

```
rust/microcosm-core/         the crate — THE core after handover
  src/math/                  self-contained, matched to V8 12.4. Vendored libm with
                             arch dispatch disabled, plus V8's sin/cos/k_sin/k_cos/
                             rem_pio2, V8's one-line pow change, and V8's Torque
                             hypot. MATH-PROVENANCE.md records every source and the
                             measurement. NEVER call f64::sin from this crate.
  src/jsnum.rs               JS numeric semantics: ToInt32 wrap (Rust's cast
                             saturates), Math.min/max signed-zero and NaN rules,
                             typed-array store narrowing
  src/rng.rs                 mulberry32 over an explicit, serializable state
  src/world.rs               SoA state, spawn/kill/corpses
  src/fields.rs              diffusion, light/temp, walls, spatial hash
  src/step.rs                the tick; the RNG-order banner carried over verbatim
  src/events.rs              the only write API
  src/observatory.rs         recorder, detectors, narration, indicators
  src/snapshot.rs            versioned flat-binary save/load
  src/species_gen.rs         GENERATED from the built JS core by
                             tools/gen-species-rs.js — never hand-edited, CI-checked
  src/wasm.rs                the C ABI the shim calls
  src/bin/                   conform, dump, events, obs, snapshot, xcheck-math
rust/wasm/core.js            presents the WASM build as dist/core.js, so
                             MC_CORE=rust/wasm/core.js points any harness at the port
```

Built for: `wasm32-unknown-unknown` (harnesses today, the browser later), the host
triple (native CLI and the fingerprint bins), and `aarch64-linux-android`
(compile-verified; the NDK link and an on-device run are still owed).

Two deviations from the original sketch, both deliberate. The species table is
generated by a Node script from the *built JS core* rather than parsed from
`species.json` by a `build.rs`: reading the already-normalized rows means every
default, the diet bitmask fold, the `loci` flattening and the derived `warmGated`
flag land in Rust as the same values **by construction**, not by careful copying.
And the observatory is one file rather than a directory, because it is a single
cohesive layer and splitting it bought nothing.


The sim translation obeys `docs/porting.md` to the letter: one organism loop,
pre-draw pattern, f64 arithmetic with f32 stores, no FMA (Rust default — no
fast-math exists in stable Rust), `Vec<f32>`/`Vec<i32>` SoA, slots identified by
`(index, gen)`. The observatory moves into the crate too — porting.md licenses
rewriting it, but constraint 1 forbids leaving a second living copy in JS.

## 4. The no-dual-maintenance protocol (spec handover)

The migration is a **handover, not a coexistence**. Rules:

1. **Freeze first.** From M2 on, the JS sim core is feature-frozen: no ecology
   changes land in `src/sim/` while the port is in flight. (The levels ladder
   and UI work may continue — they don't touch the core.)
2. **Pin the reference.** CI and local runs pin Node 22 for the duration; the
   fdlibm-era probe (`Math.pow(10,-5) !== 1e-5`) guards the pin.
3. **Prove, then rebind.** The WASM core must reproduce `conform` bit-exactly
   (both genomes), `tune2` 8/8 with *identical* outputs, and every gate
   (K6, gate5 + Yoshida bit-exact, heat, light, corridor rails + fuzz with the
   known owner-accepted collapses tick-exact, levels 21/21). Then the baselines
   are recaptured against the Rust core's hash — a declared, visible rebind.
   If any transcendental refuses bit-exactness on some target despite §2, that
   is a **declared statistical migration** per porting.md's fallback — loudly
   documented, never silent. The gates so far give no reason to expect this.
4. **Hand over.** `docs/porting.md` is rewritten: the crate is the spec, the
   frozen `dist/core.js` + Node 22 is the historical oracle (kept, not built).
   Future declared ecology changes land in Rust only, re-accepted by the same
   harnesses now driving the WASM build.
5. **Cross-target identity is a standing gate**: native CLI and WASM must
   produce byte-identical fingerprints on every acceptance run; one on-device
   ARM64 run joins the ritual for releases.

## 5. Milestones

**M0 — JS-reference prep (small, behavior-neutral, lands before the freeze).**
Expose the PRNG state as `W.rngState` with the arithmetic inline in `R()`
(bit-identical by construction; one conform run proves it) and store `W.seed`.
Fix the `TRAITS` loci restore leak (restore *all* mutated locus keys on
`initWorld`, not just sigma/curve) — declared as a bugfix; behavior-neutral for
every certified run (none replays locus events across resets). Pin Node 22 in
CI + `package.json` engines. Add a trace-capture harness that records the
transcendentals' real argument streams from certified runs into `dev/xcheck/`.

**M1 — measure before committing (the perf review's own demand).** Two
prototypes, one week: (i) the math module — port the five functions, replay the
sim-real traces on x86-64, WASM and one ARM64 phone; 0 mismatches required.
(ii) the perf probe — diffusion + one species' movement/feeding loop via
cargo-ndk on a mid-range phone vs the WebView. **Go/no-go**: if the measured
tick speedup is under ~×2, the owner re-decides with real numbers in hand
(option 0 + saves-in-wrapper remains the honest fallback).

**M2 — the sim, exactly.** Translate `src/sim/` (params, traits, world, fields,
events, step, init + species.json at build time). WASM + shim; `MC_CORE` points
at it. Acceptance ladder in porting.md order: conform fingerprint first (fails
early and loudly), then tune2 exact, then the full battery per §4.3.

**M3 — the observatory.** Recorder (141 channels), detectors, impact, levels
verdicts in the crate; level definitions and player text stay **data** (shared
JSON) so `harness/prose.js` and the term ladder keep binding them. Gates: K6
narration to the second, heat/light gates, levels 21/21.

**M4 — handover** per §4: baselines rebound, porting.md rewritten, CI builds
the crate for all targets and runs the harnesses on WASM; freeze lifts — the
ladder (L9, L12…) resumes on the Rust core.

**M5 — the app (full parity).** `android-native/` with Compose UI: the visual
grammar ported from `ui-render.js` (palette, sprites, tint/outline/roundness
locus channels, amber = the player's hand, exclusively), gestures and pickers,
Intervene + Evolution panels, the five Data pages, levels shell with prediction
step and session badges. SurfaceView render thread; speeds extended past 16×
now that the core affords it. **Save/load ships here**: snapshot in the core,
`AtomicFile` + autosave in Kotlin, the save/load fingerprint oracle (§2) in the
harness battery. Keeps the wrapper's good decisions: fully offline, no
permissions, screen-on while foreground, keystore = identity. New appId during
development; at parity the owner decides whether it replaces the wrapper's.

**M6 — the browser, when wanted.** wasm-bindgen build + the existing React UI
reading the same views the harness shim exposes. Open owner decision, not
blocking anything: the artifact rule ("single file, React only") vs a two-file
deliverable or base64-embedded WASM — decide when M6 starts, not before.

## 6. Risks, named

- **The ×2–5 is an estimate until M1.** The stencil measured only ×1.4; the
  organism-loop share (75% of the tick) is where the claim lives. M1 exists to
  kill or confirm it before the translation is paid for.
- **sin/cos hand-port correctness** — mitigated by trace replay (200k synthetic
  + sim-real streams, three targets) before any sim code runs on it.
- **WASM view invalidation on memory growth** — designed out: fixed-size SoA,
  memory pre-allocated, growth forbidden.
- **Vendored-math drift** — the math module is frozen source in the crate; the
  `libm` crate is a dev-dependency for cross-checks only, never linked into the
  core.
- **The UI is the bulk.** ~3,400 lines of JSX behavior → Compose. Full parity
  was chosen knowingly; M5 is the longest milestone, and the frame pipeline +
  Data pages deserve their own increment plan when M5 starts.
- **Harness direct-writes**: `pin()` writes `W.g`, `start()` sets `P.mutation`,
  heat.js pokes `P.tempAmb` — the shim must make these writes land in WASM
  memory (views + proxy cover it; audit every harness for direct `TRAITS`
  writes in M2).

## 7. Status — what is built and measured (2026-08-31)

**M0 done.** `W.rngState` + `W.seed` exposed in the JS reference (behaviour-neutral;
all four fingerprints identical, baseline rebound). Node pinned to 22 in
`package.json` with a runtime probe in `conform.js` (`Math.pow(10,-5) !== 1e-5`
on fdlibm-era V8) so a wrong engine explains itself instead of just failing.
**One M0 item was deliberately dropped**: "fix the TRAITS locus restore leak" was
wrong. `heat.js --thermal` sets `warmSlope`/`warmGainSlope` *before* `start()` and
depends on them surviving `initWorld`; restoring all locus keys would have
silently broken that price sweep. Semantics kept, and the port replicates them.

**M1 done, except the phone.** `src/math/` is self-contained and **bit-identical to
V8 12.4 on all seven functions across 200,000 samples each** — sin, cos, exp, pow,
atan2, hypot, sqrt, 0 mismatches, exact bit equality. Built from the `libm` crate
with per-architecture dispatch disabled, plus four replacements found by
measurement: fdlibm's `rem_pio2` (prec 2, not MUSL's 1), fdlibm's `k_cos` (the `qx`
correction MUSL dropped), fdlibm's `k_sin` association, and V8's undocumented 2016
`pow` change — it divides by the entire denominator where fdlibm subtracts after
dividing. `hypot` is a Torque builtin in V8, not libm, and was transliterated from
`math.tq`. Full record: `rust/microcosm-core/src/math/MATH-PROVENANCE.md`.
**Still owed: the on-device ARM64 trace replay and the phone perf probe.** Neither
is possible in this container; the go/no-go on ×2 therefore remains open, and the
speedups below are desktop measurements.

**M2 done.** `rust/microcosm-core` is the sim: world, fields, walls, diffusion,
light/temp, events, founding, the tick. Bit-exact against the JS core on:

| check | result |
|---|---|
| world fingerprint, 1 / 20 / 100 / 500 / 3,000 / 18,000 ticks | identical (raw IEEE754 bits) |
| all 8 acceptance seeds × 18,000 ticks × silent+evolving | identical |
| scripted events (every event type) + scenario founding | identical |
| `tune2`, 8 seeds × 18,000, through the real harness | **byte-identical output** |

The fingerprints carry the bits of every accumulator *and the final PRNG state*, so
agreement means both implementations consumed the same draws in the same order.
One real translation bug was found, by bisecting per organism: `for (let i=0; i<W.n; i++)`
re-reads `W.n` every iteration and `spawn()` grows it, so a child born this tick is
processed this tick. Hoisting the bound — the obvious Rust translation — left every
newborn unstepped while the parents stayed bit-identical.

**M3 done** (except `impact` and the level API). `src/observatory.rs` carries the
141-channel recorder, every detector, and `indicators`/`strainOf` with the measured
reference bands. Over 6,000 ticks: all per-channel sums bit-identical and all
narrated events matching on tick, type, species, locus and text.

Gates run against the ported core (`MC_CORE=rust/wasm/core.js`), output compared
byte for byte with the same harness on the JavaScript core:

| gate | result on the Rust core |
|---|---|
| K6 (Observatory narrates the strangulation) | **ALL CRITERIA PASS**, identical output |
| gate5 (the Observatory narrates the evolution) | **ALL CRITERIA PASS**; seed-22 Yoshida baseline reproduced exactly (pOff 4860, pOn 6680) |
| heat (7.H.4 warm-water narrations) | **ALL 3 PASS**, byte-identical output: hot-sun pile-up 8/8, thinning 8/8 for Dri/Cil/Bac, press starve 8/8 always ahead of the extinction, control silent |
| light (7.L patch adaptation) | identical output to the JavaScript core, criterion 2 (control silent, channels exactly 0) PASS |
| corridor `--sample 2` (16 runs, 8 seeds, 11 loci pinned) | identical output — CORRIDOR CERTIFIED, same apex-loss ticks and audit drifts |

The corridor run matters beyond its verdict: `pin()` writes locus values straight
into `W.g`, so it is the test that the shim's typed-array **writes** land in the
same memory the tick reads. A separate stress check confirms the views survive
allocation — filling the wall table (8 long strokes, each allocating face and path
vectors, the most likely thing to grow WASM memory and detach every view) leaves
the world readable and the mineral audit at exactly 9011.2.

The heat gate also found a real gap rather than a difference: a harness that pokes
`P.tempAmb` or `P.lightMul` directly has to ask for a field recompute, and the shim
had no `computeLight`/`computeTemp`. Both are in the ABI now.

**A correction worth keeping in the record.** The first claim that K6 passed on the
ported core was wrong: `k6gate.js` hardcoded `dist/core.js` and ignored `MC_CORE`,
so both runs were the JavaScript core and "identical" meant nothing. The tell was
visible and missed — the gate calls `indicators()`, which the shim did not provide
and which would have thrown at once had the port really been under test. Fixed by
making the gate honour `MC_CORE` like every other harness, and by porting
`indicators`; criterion 3 (Cilio strain CRITICAL, 482 s lead) now genuinely
exercises it. An audit of every harness for the same mistake found no others.

`impact()` is deliberately deferred: it reads `W.evLog`, which the UI writes, so it
belongs with M5 rather than here. The level API is deferred too — it needs the level
definitions extracted to shared JSON first, so `harness/prose.js` and the term
ladder keep binding the same text.

**The WASM bridge works.** `MC_CORE=rust/wasm/core.js` points the existing harnesses
at the ported core, unchanged. `npm run port:check` is the whole comparison in one
command.

**Save/load shipped early** (it was M5). Versioned flat-binary snapshot in the core:
715 KB raw, 202 KB gzipped for a 1,200-tick world. Proved by resumption — 2,000
ticks resumed from a load equal the same 2,000 never interrupted; a re-save of a
loaded world is byte-identical to the original; corrupt and truncated files are
refused rather than half-loaded.

**CI carries the proof.** `.github/workflows/ci.yml` gained a `port` job that runs
on every push: the generated species table must be in sync with `species.json`, the
math must be bit-identical to V8 (trace generated in the job), the world/events/
scenario fingerprints must match, save/load must resume a world exactly, and the K6
gate must narrate identically on the ported core. Node is pinned to 22 in both
workflows to match `package.json`.

**ARM64 — measured on a device (see §8).** A Fairphone 5 reproduces the four
certified fingerprints bit-for-bit and replays the V8 math trace with 0 mismatches
across all seven functions, at 0.400 ms/tick. The Android bit-exactness claim is no
longer inferred.

**Measured speed (x86-64, not the phone):** 4 × 18,000 ticks native 44.5 s vs
115.5 s in Node (**×2.6**); 4 × 3,000 ticks 5.1 s vs 16.1 s (**×3.1**); `tune2`
through WASM 54.8 s vs 132.3 s (**×2.4**). Inside the ×2–5 the plan predicted, and
the ×3–6 organism-loop estimate looks about right — but WASM and native are not the
phone, and the M1 go/no-go still wants an on-device number.

## 8. M5.0 — the core on the phone (2026-08-31)

The two claims a container could not settle — ARM64 bit-exactness and the tick rate
on real hardware — needed a device. Everything else was proved against the
JavaScript core on x86-64, and no amount of further desktop work would close them.

The approach: **make the evidence travel with the code.** There is no Node on a
phone to compare against, so the phone carries what it needs to check itself.

- `microcosm_core::probe` holds the checks, **in the core**, so the phone and the
  workstation run the same code and their answers are comparable: the four
  certified 3,000-tick fingerprints (matching them means the whole sim —
  arithmetic, draw order, field passes, heredity — is bit-exact), a replay of V8's
  own results, a save/load resumption check, and a tick-rate probe.
- `EXPECTED_3000` is embedded in the source. CI runs the same check on the host
  (`bin/selfcheck`), so a stale constant fails where the cause is unambiguous
  rather than on a device, where nobody could tell a stale constant from a
  hardware difference.
- `dev/xcheck/gen-bin.js` re-captures the trace as **1.9 MiB of binary** instead of
  72 MB of hex text — small enough to ship inside an APK, same reference engine.
- `rust/microcosm-android` is thin JNI glue. The `jni` dependency lives out there
  so it never enters the crate whose arithmetic has to stay auditable.
- `android-native/` is a plain Activity that runs the four checks and prints them.
  Its own applicationId, so it installs beside the wrapper and cannot disturb it.
  Dependency-free, like the wrapper: Compose belongs to M5.1, and adding it now
  would only slow the build that answers the measurement questions.
- `.github/workflows/android-native.yml` builds it and publishes a rolling
  `probe-latest` release, so the APK is a direct download on the phone.

**Verified locally, as far as a container allows:** both crates compile for
`aarch64-linux-android`; the four exported JNI symbols match the Kotlin
declarations exactly; and the whole JNI path was exercised from a real JVM against
the host build — sim bit-exact, math 0 mismatches on all seven functions,
save/load resumed identically, and **0.464 ms/tick (2,155 ticks/s, 215× speed) on
x86-64**, the number the phone's result should be read against.

**Not verified locally: the Gradle build.** The Android plugin repositories are
unreachable from this container — the *existing, working* `android/` project fails
identically — so this is the environment, not the configuration.

**CI settled it, first run** (run 33427511375): host self-check pass, `cargo-ndk`
cross-compile of both crates to `aarch64-linux-android` **linked cleanly**, the
APK assembled and signed, and a 3.3 MB `microcosm-probe.apk` published to the
rolling `probe-latest` release. The toolchain end of M5.0 is therefore proven; the
NDK link — the step most likely to surprise — worked without a single fix.

### The device run — Fairphone 5, Android 15, arm64-v8a (2026-08-31)

```
SIM    silent 11 · silent 88 · evolving 11 · evolving 88   all identical  => bit-exact
MATH   sin cos exp pow atan2 hypot sqrt   0 mismatches in 80,021 samples  => bit-identical to V8
SAVE   snapshot 713,103 bytes; resumed 800 ticks identical to the uninterrupted run
SPEED  2,000 ticks in 0.80 s at 2,032 organisms
       0.400 ms/tick · 2,501 ticks/s · sustains 250x speed
```

**ARM64 bit-exactness is measured, not inferred.** The four certified fingerprints
carry the PRNG state, so the phone consumed the same draws in the same order and
produced the same doubles as the JavaScript core does on Node 22. The math module
did what it was built to do: the same bits on a different architecture, from a
different compiler backend, with no platform libm anywhere. Every "owed" and
"inferred" qualifier attached to Android in this document is discharged.

**Speed, stated carefully.** On identical work — same world, same 2,000 ticks,
same 2,032 organisms — the phone is *slightly faster than the x86-64 CI runner*
(0.400 vs 0.464 ms/tick). Read that as "the runner is a shared cloud vCPU", not as
"a mid-range phone beats a workstation"; the useful conclusion is that this core is
not remotely stressed by phone hardware.

What that settles, and what it does not:

- **Settled — the product question.** The core sustains **250×** where the UI's
  speed control currently tops out at **16×**. The bottleneck is now the renderer
  and the frame pacing, not the simulation. Higher multipliers, and the
  fast-forwarding that a loaded save invites, are affordable.
- **Not measured — the ratio.** Rust versus V8 *on this same phone* was not
  measured: that needs the JS core timed on the FP5, and the WebView wrapper does
  not report tick times. The M1 go/no-go was written as "re-decide if the speedup
  is under ×2", and strictly that test never ran. It no longer gates anything —
  the core is 15× past the ceiling the UI imposes — but the honest statement is
  that the *margin* is proven and the *ratio* is not.

What the device run will settle: if the fingerprints match, the ARM64
bit-exactness claim stops being inferred; and the tick rate answers the M1
go/no-go with a real number instead of a ×2–5 estimate.

## 9. M4 — the handover (done, 2026-08-31)

The crate is the simulation. `src/sim/` and `src/observatory/` are the frozen
historical oracle: read, never extended. The render layer stays JavaScript and
keeps evolving.

- **`docs/porting.md` rewritten.** It was the contract a port had to honour; it is
  now the contract the core has to honour, plus the record of what the migration
  proved.
- **`harness/conform-core.js` is the certifying harness.** Same discipline as
  `conform.js` — stored fingerprint, a hash over the Rust sources binding it, a
  loud NOTE when they disagree, `--capture` always a deliberate act — plus one
  check the JavaScript side never needed: **native and WASM must produce
  byte-identical fingerprints**, and it refuses to capture a baseline when they do
  not. Baseline: hash `c909550c9b4fb60e` over 29 source files.
- **CLAUDE.md rule 11** turned from a freeze-in-flight into the standing rule.
- **CI** runs core conformance (failing on a NOTE, as it does for the oracle) and
  still runs `port:check` against the frozen JavaScript core.

**`port:check` has an expiry date, stated rather than left to be discovered.** It
passes today, and the first declared ecology change in Rust *will* make it fail.
That is correct: it then retires into the record — annotated, with the frozen
fingerprints kept as evidence of the world the two implementations once shared —
and `conform:core` carries the certification from there. It must not be "fixed" by
touching `src/sim/`.

## 10. Next

The port is complete: core, observatory, save/load, three targets, all proven, with
the handover done. What remains is product work and two loose ends.

1. **M5.1 — the app.** Kotlin/Compose over a SurfaceView render thread, full
   parity, save/load wired to `AtomicFile`. The longest milestone by far: ~3,400
   lines of JSX behaviour, the visual grammar, the Data pages, the levels shell.
   It deserves its own increment plan. The toolchain and the JNI path underneath
   it are now proven, and the core sustains 250× against a UI that caps at 16× —
   so the render path, not the simulation, is what that plan has to think about.
2. **Finish the observatory**: `impact()` (needs `evLog`, which the UI writes — so
   it lands with M5.1) and the level API (needs the level definitions extracted to
   shared JSON first, so `harness/prose.js` and the term ladder keep binding the
   same text). Until then the levels gate runs on the oracle.
3. **The unmeasured ratio.** Rust versus V8 *on the same phone* was never measured;
   the WebView wrapper does not report tick times. It gates nothing — the margin is
   15× past the UI's ceiling — but it is the one performance claim in this document
   that is an inference rather than a measurement, and a small addition to the
   wrapper would close it.
