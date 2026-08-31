# Math provenance — where every routine came from, and how it was proved

The port's determinism claim rests entirely on this module. `docs/porting.md` says a silent
divergence is the failure mode that costs weeks; this file exists so that no future change to
`math/` can be made without knowing exactly what it is standing on.

## Why the crate carries its own math at all

`f64::sin` and friends call the platform's libm — glibc on a workstation, bionic on the phone,
whatever the toolchain links under WASM. Those disagree with each other in the last place. With
three targets (Android, browser, headless CLI) that means three different worlds: a save from the
phone would not replay in the browser, and headless experiment results would not match the app.
Cross-target determinism is a product requirement, not a testing nicety, and platform libm cannot
provide it. So the arithmetic is vendored, frozen, and compiled into the core.

Matching **V8** specifically is a second, cheaper decision on top of the first: since the module has
to exist anyway, making it agree with the reference engine costs a handful of constants and one
line, and buys a migration that can be *proved* against the existing baselines instead of argued.

## Sources

| routine | origin | status |
|---|---|---|
| `sin`, `cos` | V8 12.4 `src/base/ieee754.cc` (fdlibm 5.3) | transliterated here |
| `k_sin`, `k_cos` | V8 12.4 `src/base/ieee754.cc` | transliterated here |
| `rem_pio2` | V8 12.4 `src/base/ieee754.cc` | transliterated here |
| `pow` | `libm` crate, with V8's 2016 modification applied | vendored + patched |
| `exp`, `atan`, `atan2` | `libm` crate (pure-Rust MUSL port) | vendored unchanged |
| `rem_pio2_large` | `libm` crate | vendored unchanged |
| `fabs`, `floor`, `scalbn` | hand-written | upstream dispatches per architecture; these must not |
| `sqrt` | Rust intrinsic | an IEEE 754 operation: correctly rounded everywhere |
| `hypot` | V8 12.4 `src/builtins/math.tq` | transliterated here — V8's is NOT libm |

The vendored files keep their Sun/FreeBSD copyright headers. The `libm` crate is MIT/Apache-2.0,
which is GPL-compatible; this crate is GPL-3.0-or-later like the rest of the project.
A copy of the V8 sources used sits in `dev/xcheck/v8-src/`.

## The four things that had to be replaced, and why

Each was found by measurement, not by reading: the trace said which function disagreed, and how often.

1. **`rem_pio2`** — MUSL carries an optimized reduction (rounds with `rint`, no `npio2_hw` table).
   fdlibm's is what V8 runs. Disagreed on ~0.7% of samples, for |x| > π/4 — i.e. across the whole
   range of angles the simulation actually uses. Note `rem_pio2_large` is called with **prec = 2**
   (V8's value, `jk = 4`), not MUSL's 1.
2. **`k_cos`** — MUSL dropped fdlibm's `qx` correction for |x| ≥ 0.3, which keeps `1 - x*x/2` from
   losing bits in the subtraction.
3. **`k_sin`** — same coefficients, different association: MUSL evaluates
   `S2 + z*(S3 + z*S4) + z*w*(S5 + z*S6)`; fdlibm uses one Horner chain. Worth 14 mismatches in
   200,000 — mathematically equal, not equal in floating point.
4. **`pow`** — V8's undocumented 2016 change to the reconstruction step:
   fdlibm/MUSL compute `(z*t1)/(t1-2) - (w + z*w)`; V8 divides by the entire denominator,
   `(z*t1) / ((t1-2) - (w + z*w))`. Worth 4.4% of samples.

`hypot` is not a patch but a different function: V8 implements `Math.hypot` as a Torque builtin
with a Kahan-compensated sum of scaled squares, not as libm's `hypot`.

## The measurement

Reference engine: **Node 22.22.2 / V8 12.4** — the engine `dist/core.js` is certified on. The trace
is 200,000 samples per function over sim-typical and stress ranges plus special values, captured as
raw IEEE754 bits:

```
node dev/xcheck/gen.js /tmp/trace.txt          # ~72 MB, regenerable, not committed
npm run port:math -- /tmp/trace.txt            # or: cargo run --release --bin xcheck-math
```

Final result — exact bit equality, no tolerance:

| function | samples | mismatches |
|---|---:|---:|
| sin | 200,010 | **0** |
| cos | 200,010 | **0** |
| exp | 200,000 | **0** |
| pow | 200,001 | **0** |
| pow(x, 0.75) | 200,000 | **0** |
| atan2 | 200,000 | **0** |
| hypot | 200,000 | **0** |
| sqrt | 200,000 | **0** |

And the consequence, which is the claim that actually matters: with this module in place the Rust
core reproduces the JavaScript core bit-for-bit on the world fingerprint (3,000 and 18,000 ticks),
the scripted-events and scenario worlds, the observatory's 141 channels and narration, `tune2`
across 8 seeds × 18,000 ticks, and the K6 gate — all byte-identical output.

## Rules for changing anything here

- **Never** call `f64::sin`, `powf`, `hypot` or any other platform math from this crate. `sqrt` is
  the single exception, and only because it is an IEEE 754 operation.
- **Never** introduce `mul_add` / FMA. Rust forbids contraction as an optimization (RFC 3514), so
  the only way to get an FMA in here is to write one, and it would change results.
- `select_implementation!` is deliberately expanded to nothing: libm's per-architecture dispatch is
  exactly what this module exists to prevent.
- After any edit, re-run the cross-check and require zeros — then re-run `npm run port:check`,
  because agreeing with V8 sample-by-sample and reproducing a 18,000-tick world are different claims.

## Residual risk, stated plainly

- Everything above was measured on **x86-64 Linux** and on the **wasm32** build. The routines are
  pure integer and floating-point arithmetic with no platform dispatch left in them, so an ARM64
  result that differed would be a compiler bug rather than a design gap — but *"should"* is not
  *"measured"*. **One on-device ARM64 trace replay is still owed** before the Android app claims
  bit-exactness (M1 of docs/android-port-plan.md).
- The reference is pinned. Node ≥ 23 (V8 ≥ 13.2) silently switched `Math.pow` to the host libm, and
  2026 V8 moved sin/cos/exp/atan2 to LLVM-libc's correctly-rounded routines. This module matches
  **V8 12.4**, which is what the project's baselines were captured on. A newer engine is a different
  oracle, not a better one — probe with `Math.pow(10,-5) !== 1e-5`, which is true on fdlibm-era V8.
  This is also the strongest argument for finishing the migration: once the Rust core is the spec,
  the engine's drift stops mattering.
