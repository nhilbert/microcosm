# Performance review — gates and corridor (2026-08-31)

A measurement-only review: nothing in `src/` or `harness/` was touched. Every number below was
measured on the current `dist/core.js` (conform PASS, no NOTE) in Node v22 on a 4-vCPU container;
single-run times scale to other machines by single-core speed, the parallel numbers by core count.
The optimization experiments ran on scratchpad copies of the built core and were verified
fingerprint-identical (silent + evolving, seeds 11/88, the conform procedure) before being believed.
The goal posed by the owner: ~100× on the gates and the corridor.

## 1. Baseline

| measurement | value |
|---|---|
| one acceptance run (18,000 ticks, seed 11, silent) | **36.6 s** ≈ 2.03 ms/tick |
| organisms at t=18k (seed 11) | ~2,940 live, `W.n` ≈ 2,960 |
| per-organism cost | ~590 ns per organism-tick |
| harness observer overhead (`pops` + `coreCollapsed` every tick) | 0.6% — negligible |
| `node harness/conform.js` end-to-end | **18.8 s** |

Two findings before any optimization:

- **The harnesses are innocent.** The per-tick observer work the harness scripts do is under 1%.
  All the time is `step()`. Nothing in `harness/` is worth optimizing except how many cores it uses.
- **The step.js banner's "~3 s" conform claim is ~6× stale** (18.8 s measured). The tick has grown
  heavier phase by phase (loci loops, thermal tables, gradients, walls checks) with no meter on it.
  Worth adding µs/tick to the stabilization-pass records so drift like this is visible.

## 2. Where the time goes: the workload is the multiplication, not the code

Everything runs sequentially on one core. At ~2 ms/tick:

| script | runs × ticks | total ticks | ≈ time |
|---|---|---|---|
| conform | 4 × 3k | 12k | 19 s |
| tune2 | 8 × 18k | 144k | ~5 min |
| k6gate | 3 × 18k | 54k | ~2 min |
| gate5 (+ Yoshida seed-22 metrics) | 16 × 18k + 2 × 30k | 348k | ~12 min |
| yoshida (all seeds) | 16 × 30k | 480k | ~16 min |
| heat gate | 24 × 18k | 432k | ~15 min |
| light gate | ~16 × 18k | ~290k | ~10 min |
| **corridor --rails** (6 (species,locus) pairs → 14 configs × 8 seeds) | **112 × 18k** | **2.02M** | **~68 min** |
| corridor --fuzz | 8 × 54k | 432k | ~15 min |
| corridor:full adds --sample 16 | +128 × 18k | +2.30M | +~78 min |
| test:full (sum) | | ~4M+ | **~2.5 h** |

The corridor is slow because certification is *multiplicative by design* — pairs × rails × seeds —
and every run is a full 18k-tick world. That multiplication is the honesty guarantee; the review
does not propose shrinking it. It proposes paying for it with more cores and a cheaper tick.

## 3. Where a tick goes (CPU profile, 6k ticks, seed 11)

| bucket | share | detail |
|---|---|---|
| organism loop (incl. inlined frames) | ~55% | hottest single line: `Math.pow(W.sz[i],0.75)` — ~9% alone, every organism every tick for a value that is constant per organism (`sz` is written only at spawn). Then `Math.hypot` ×2 per drifter (~9%), `cos/sin` per tumbler/steerer, the per-locus expression loops, `cellOf` floors |
| `neighbors()` + hunt callback | ~20% | a fresh closure per hunter per tick (→ the 6% GC below), a call per candidate, and an **eager `Math.sqrt` for every in-radius candidate**, including same-species and non-diet ones that discard it |
| diffusion (3 stencils + leach) | ~7% | multiplies every flux by wall factors that are exactly 1.0 in every unwalled world — all rails/fuzz/tune2/gate runs |
| GC | ~6% | dominated by the per-tick hunt closures |
| rebuild | ~4% | five `fill(0)` + rebinning; fine |
| recorder + detectors | ~1% | the Observatory is cheap; bit-identity discipline holds |

A structural note: TRAITS rows and locus objects come out of the loader with **5 distinct
hidden-class shapes** (same keys, different insertion order), so every `T.x`/`L.x` in the hot loop
is polymorphic for V8.

## 4. Verified headroom in JS, bit-identical (scratchpad experiment)

Three mechanical changes were applied to a copy of the built core and verified
**fingerprint-identical** (silent + evolving, seeds 11/88):

1. cache `sz^0.75` at spawn (`Math.pow` result stored, so the same double);
2. wall-free diffusion fast path (dropping ×1.0 multiplies is exact);
3. shape canonicalization: rebuild every trait row / locus / sub-object with one fixed key order
   at load time (pure data plumbing).

Result: **×1.19** (36.6 s → 30.7 s per 18k run). Projected with the rest of the same family —
inlining the hunt loop into `step()` (no closure, no callback), computing `sqrt` lazily only for
candidates that pass the diet/species filters (the same doubles where they are used), scalar
accumulators for `W.flows` — a realistic **×1.5–2 total in JS**, every edit individually
verifiable as bit-identical under the conform ritual (rule 2's observer class: identical
fingerprint required, hash rebound with the reason "performance, behavior-neutral").

Not included above: `Math.hypot → Math.sqrt(x*x+y*y)` and friends are **not** bit-identical
(hypot rounds differently) — they are declared changes costing full re-acceptance, worth
bundling only with the next declared ecology change (~×1.2 more, not worth a re-acceptance alone).

## 5. Parallelism — the big cheap multiplier

Measured: 4 identical runs concurrently in 4 processes finish in 17.1 s vs 47.6 s sequentially —
**×2.8 on 4 vCPUs**, ~25% per-process inflation, i.e. near-linear scaling (the 4096-cell fields sit
in cache; memory bandwidth doesn't bind). Every corridor and gate run is an independent world:
112 rails runs, 8 fuzz runs, 8-seed gate loops — embarrassingly parallel at the (config, seed)
grain. This is a **harness-only change** (worker pool in `harness/lib.js` or a small runner over
child processes), touching zero core code and carrying zero conformance risk; per CLAUDE.md the
harness layer is free to rewrite. Only stdout ordering needs care (collect per-run, print in order)
— exit codes and criteria are unchanged.

Expected: ×3 on this container, **×6–12 on a modern 8–16-thread workstation**.
Corridor rails: 68 min → ~7 min; test:full: ~2.5 h → ~15 min, before any core work.

## 6. The compiled-core option (Rust / Kotlin), with the Android port in mind

The owner raised migrating the core to compiled code. The review's honest data point first:
an exact Rust transliteration of the diffusion kernel (f32 storage, f64 intermediates, same
stencils) runs at 87 µs/iter vs 123 µs/iter in V8 — **only ×1.4**. The SoA-typed-array design
chosen for ports (docs/porting.md) is also what makes V8 near-native on the straight-line array
math. The 10–30× folklore for "JS → native" does not apply to this codebase's clean parts.

Where native genuinely wins is the branchy organism loop: monomorphic struct access instead of
polymorphic property loads, no closures and no GC, bounds checks compiled out, cheap inlining of
`moveOrg`/`cellOf`, SIMD on the stencils. A realistic expectation is **×3–6 single-thread over
today's JS** — to be *measured on a prototype of the organism loop before any commitment*
(instrument before knob applies to performance work too; this review's stencil measurement is
exactly the kind of theory-killer rule 4 predicts).

What a port costs (and docs/porting.md already frames most of it):

- **Bit-exactness of the 15 transcendental call sites** (`exp`, `pow`, `cos`, `sin`, `atan2`,
  `hypot`, `sqrt`) plus every Float32 rounding point. mulberry32 is trivial. V8's math is
  fdlibm-derived; JVM `StrictMath` *is* fdlibm by spec, Rust's `libm` crate is the same lineage —
  but each function must be proven over real argument traces, and `Math.hypot` is the likeliest
  to differ. conform + tune2 8/8 is precisely the proof protocol.
- **Dual maintenance**: every future declared ecology change lands twice, cross-checked by
  fingerprint. This is the real recurring price, not the translation.

Integration is already designed for: **`MC_CORE`** points every harness at another build. A native
core exposed with the same module surface (`step`/`initWorld`/`resetWorld`, `W` as typed-array
views — NAPI addon or WASM module) drops into all harnesses unchanged.

Three shapes the migration could take:

- **(a) Rust crate → NAPI/WASM for the harnesses, same crate via NDK for Android.** JS core stays
  the spec and the artifact; the native core is the workhorse. Best perf, keeps the artifact rule
  ("single file, React only") untouched, accepts dual maintenance.
- **(b) Kotlin Multiplatform: one Kotlin core → Android natively + JS/WASM target for harness use.**
  `StrictMath` gives fdlibm exactly; single source of truth for the *Android* future, but
  Kotlin-to-JS/JVM performance is likely only ≈ V8 to ×2–3 — the weakest pure-speed option.
- **(c) Rust → WASM embedded in the artifact itself** (base64 in the single file): would end dual
  maintenance entirely — one core for artifact, harness, Android. It is also the largest
  architecture decision (redefines "core.js is the spec" and the artifact constraints) and should
  not be made for harness speed alone.

Recommendation: don't lead with the port for performance. Take it when the Android port starts
anyway — option (a) unless the owner wants Kotlin-first — and bank the harness speedup then.

## 7. What ~100× decomposes into

| lever | factor | cost | conformance risk |
|---|---|---|---|
| parallel harness runner | ×3 here, ×6–12 on a workstation | hours, harness-only | none |
| bit-identical JS pass (§4) | ×1.5–2 (×1.19 already verified) | a day, per-edit conform | none if the ritual is followed |
| native core behind MC_CORE (§6) | ×3–6 *(measure first)* | the port, amortized with Android | the port-proof protocol |
| declared micro-changes (hypot etc.) | ×1.2–1.4 | full re-acceptance | declared change |

Multiplied: **~×10–20 on this 4-core container; ~×50–120 on a 16-thread workstation with a native
core.** The 100× goal is reachable, but only with both the parallel runner *and* a compiled core,
on a many-core machine — no single lever gets there, and the first two rows deliver the biggest
part of the felt improvement (corridor:full from ~2.7 h to ~10–20 min) at a tiny fraction of the
cost and none of the risk.

## Suggested order (each its own increment, per working rule 9)

1. Parallel runner for corridor + gates (harness-only, zero risk, biggest felt win).
2. Bit-identical JS pass, one edit at a time, conform after each; recapture the hash-binding once
   with the declared reason "behavior-neutral performance pass" when the fingerprints are identical.
3. A measured Rust prototype of the organism loop *before* any port decision; revisit §6 with its
   number.
4. Fold the declared micro-changes into the next declared ecology change, never alone.
