# V8 reference sources (third-party, for provenance)

These are **not** part of the build. They are the sources the port's math was
transliterated from and checked against, kept here so a future reader can verify the
claims in `rust/microcosm-core/src/math/MATH-PROVENANCE.md` without needing network
access or having to guess which V8 revision was meant.

| file | what it is | used for |
|---|---|---|
| `ieee754.cc` | V8 12.4 `src/base/ieee754.cc` — fdlibm, "modified significantly by Google" | `sin`, `cos`, `k_sin`, `k_cos`, `rem_pio2`, and the one-line `pow` change |
| `math.tq` | V8 12.4 `src/builtins/math.tq` | `Math.hypot`, which is a Torque builtin and not libm at all |
| `om.h` | V8 `src/base/overflowing-math.h` | `base::Divide`, used by `pow`'s reconstruction step |

Fetched from `chromium.googlesource.com/v8/v8` at branch `12.4-lkgr`, the engine
family Node 22 ships and the one every certified fingerprint in this repository was
captured on.

**Licensing.** V8 is BSD-3-Clause (Google), and the fdlibm-derived parts additionally
carry the Sun Microsystems notice reproduced at the top of `ieee754.cc`. Both are
GPL-compatible; this repository is GPL-3.0-or-later. The copyright headers are intact
and must stay that way. The Rust files derived from these keep a pointer back here.
