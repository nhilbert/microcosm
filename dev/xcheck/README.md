# xcheck — cross-language bit-exactness experiment (2026-08-31)

Measured groundwork for the Rust-core port (docs/android-port-plan.md). Everything
here was RUN, not believed: 200,000 samples per transcendental function, generated
by the project's exact reference engine (Node v22 / V8 12.4) and replayed through
OpenJDK 21 and Rust 1.94. Sources only — traces and binaries regenerate.

## Verdict table (mismatches vs V8 12.4, 200k samples each)

| function | Java StrictMath | Rust `libm` crate | note |
|---|---|---|---|
| sin, cos | **0** | 1,432 / 1,398 (0.7%) | libm uses msun's `rem_pio2`, diverges for |x| > π/4 — inside sim range |
| exp | **0** | **0** | |
| atan2 | **0** | **0** | |
| sqrt | **0** | **0** | IEEE-correctly-rounded everywhere |
| pow | 8,779 (4.4%) | 8,779 (identical) | V8 modified one line of fdlibm's reconstruction in 2016 (see v8pow.c) |
| hypot | diverges | diverges | V8's is not libm at all: a Torque builtin, `sqrt((a/max)²+(b/max)²)*max` |

`v8pow.c` is the transliteration of V8 12.4's `src/base/ieee754.cc` pow — verified
**400,001/400,001 bit-exact** against the trace (`v8pow_test.c`). The one modified
line vs fdlibm 5.3 is marked; `fd53_pow.c` / `msun_pow.c` are the references it was
diffed against (`multipow.c` runs all three side by side).

`gen.js` regenerates the trace (`node gen.js > trace.txt`, ~72 MB) — deterministic,
seeded with mulberry32(20260831). `Check.java` replays it through Math/StrictMath;
`rustcheck/` through Rust's `libm`. `Rng.java` / `rng.rs` verify mulberry32 itself
(including the f32-store round-trip): bit-identical, 10k draws, both languages.

## Process findings that outlive the numbers

- **The JS reference is only a spec on pinned Node 22.** Node ≥ 23 (V8 ≥ 13.2)
  silently switches `Math.pow` to host libm (`use_std_math_pow`); 2026 V8 moved
  sin/cos/exp/atan2 to LLVM-libc correctly-rounded routines. Probe before trusting
  an engine: on fdlibm-era V8, `Math.pow(10,-5) !== 1e-5`.
- Java forbids FMA contraction by spec (JEP 306); Rust by RFC 3514. NDK C is the
  hazard (`clang` defaults `-ffp-contract=on`) — irrelevant if the core is pure Rust.
- Android's StrictMath is native `external/fdlibm` built with `c_std: "c99"`
  (contraction-proof); one on-device ARM64 trace replay is still owed before the
  port claims Android bit-exactness (plan M1).
- f64→f32 store round-trip: 0 mismatches across JS/Java/Rust, 10k samples.

Full report: https://claude.ai/code/artifact/bc7e3066-fc3f-44be-b769-0624467f23ec
