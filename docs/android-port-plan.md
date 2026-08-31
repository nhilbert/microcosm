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
microcosm-core/            Rust crate — THE core after handover
  src/math.rs              self-contained fdlibm-lineage math (§2), no platform libm
  src/rng.rs               mulberry32, state a plain field (serializable)
  src/world.rs             SoA state, spawn/kill      — translated exactly
  src/fields.rs            diffusion, light/temp, walls, spatial hash — exactly
  src/step.rs              the tick; RNG-order banner carried over verbatim
  src/events.rs            applyEvent/queueEvent/drainEvents — the only write API
  src/observatory/         recorder, detectors, analysis, impact, levels
                           (free rewrite by contract, but lives HERE — no fork)
  src/snapshot.rs          versioned flat-binary save/load
  species.json             consumed at build time (build.rs) — same file, same
                           row order, still the RNG contract
targets:
  cargo-ndk cdylib         Android (jni-rs; @FastNative tick; render view as a
                           Rust-owned direct ByteBuffer, double-buffered)
  wasm32 + JS shim         browser build AND harness adapter: a CommonJS module
                           exposing {W,P,TRAITS,REC,SPECIES,step,initWorld,...}
                           with W columns as typed-array views into WASM memory
                           (memory pre-allocated, never grows, so views stay
                           valid) and P as a forwarding proxy — drops into every
                           harness via MC_CORE unchanged
  native CLI               headless experiments; fastest runner
android-native/            the app: Kotlin + Compose (HUD, panels, gestures,
                           Data pages, levels shell) over a SurfaceView render
                           thread (lockHardwareCanvas, Choreographer-paced,
                           interpolated) — sim ticks on its own thread
```

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

## 7. Immediate next steps

M0 in this order, each conform-checked: `W.rngState` + `W.seed`; the TRAITS
restore fix; the Node pin; the trace capture. Then M1's two prototypes — and
the go/no-go numbers go in this file, next to the estimates they test.
