//! Self-contained floating-point math, matched to V8 12.4 (the reference engine).
//!
//! **Never call `f64::sin` and friends from this crate.** They dispatch to the platform's libm —
//! glibc on a workstation, bionic on the phone, something else again under WASM — so the same
//! world would evolve differently on each target. A save from the phone would not replay in the
//! browser, and headless experiment results would not match what the app does. Determinism across
//! targets is a product requirement here, and the only way to get it is to carry the arithmetic
//! ourselves.
//!
//! Provenance and the per-function verification table: `MATH-PROVENANCE.md` next to this file.
//! In short: the routines are vendored from the `libm` crate (a pure-Rust port of MUSL's libm,
//! itself fdlibm-derived, MIT/Apache-2.0 — headers preserved), then the functions V8 does NOT
//! agree with are replaced by V8's own versions:
//!
//! * `sin`/`cos` — MUSL uses an optimized `rem_pio2`; V8 keeps fdlibm 5.3's, and they disagree
//!   for |x| > pi/4, which is inside this simulation's range.
//! * `pow` — V8 modified one line of fdlibm's reconstruction step in 2016.
//! * `hypot` — V8's is not libm at all but a Torque builtin with different arithmetic.
//!
//! Every one of these is checked against a 200,000-sample trace captured from the reference engine
//! (`dev/xcheck/gen.js`); `cargo run --bin xcheck-math` reports the per-function mismatch counts,
//! and the accepted result is zero for all seven.

#![allow(clippy::all)]
// libm's sources carry cfg names from its own build script (assert_no_panic, intrinsics_enabled);
// they are inert here and their absence is not a problem worth a warning on every build.
#![allow(unexpected_cfgs)]
#![allow(unused)]

// ---- the indexing helpers the vendored sources use ----
// libm's originals use `get_unchecked` in release builds; these are the bounds-checked forms.
// The only routine that leans on them heavily is the huge-argument path of rem_pio2, which this
// simulation never reaches, so the checks cost nothing that matters and one class of silent
// memory bug disappears with them.

macro_rules! force_eval {
    ($e:expr) => {
        // Present in the original to force evaluation for floating-point exception side effects.
        // It never affects the returned value; black_box keeps it from being optimized away
        // without needing unsafe.
        let _ = core::hint::black_box(&$e);
    };
}

macro_rules! i {
    ($array:expr, $index:expr) => {
        *$array.get($index).unwrap()
    };
    ($array:expr, $index:expr, = , $rhs:expr) => {
        *$array.get_mut($index).unwrap() = $rhs;
    };
    ($array:expr, $index:expr, -= , $rhs:expr) => {
        *$array.get_mut($index).unwrap() -= $rhs;
    };
    ($array:expr, $index:expr, += , $rhs:expr) => {
        *$array.get_mut($index).unwrap() += $rhs;
    };
    ($array:expr, $index:expr, &= , $rhs:expr) => {
        *$array.get_mut($index).unwrap() &= $rhs;
    };
    ($array:expr, $index:expr, == , $rhs:expr) => {
        *$array.get_mut($index).unwrap() == $rhs
    };
}

// libm dispatches some functions to per-architecture intrinsics through this macro. Expanding it
// to nothing forces the generic Rust body in every case, which is the whole point: the arithmetic
// must not depend on which machine the core was compiled for.
macro_rules! select_implementation {
    ($($t:tt)*) => {};
}

macro_rules! div {
    ($a:expr, $b:expr) => {
        $a / $b
    };
}

mod atan;
mod atan2;
mod cos;
mod exp;
mod fabs;
mod floor;
mod k_cos;
mod k_sin;
mod pow;
mod rem_pio2;
mod rem_pio2_large;
mod scalbn;
mod sin;

pub(crate) use atan::atan;
pub(crate) use fabs::fabs;
pub(crate) use floor::floor;
pub(crate) use k_cos::k_cos;
pub(crate) use k_sin::k_sin;
pub(crate) use rem_pio2::rem_pio2;
pub(crate) use rem_pio2_large::rem_pio2_large;
pub(crate) use scalbn::scalbn;

// ---- fdlibm's word accessors, as the vendored sources expect them ----

#[inline]
pub(crate) fn get_high_word(x: f64) -> u32 {
    (x.to_bits() >> 32) as u32
}

#[inline]
pub(crate) fn get_low_word(x: f64) -> u32 {
    x.to_bits() as u32
}

#[inline]
pub(crate) fn with_set_high_word(f: f64, hi: u32) -> f64 {
    let mut tmp = f.to_bits();
    tmp &= 0x00000000_ffffffff;
    tmp |= (hi as u64) << 32;
    f64::from_bits(tmp)
}

#[inline]
pub(crate) fn with_set_low_word(f: f64, lo: u32) -> f64 {
    let mut tmp = f.to_bits();
    tmp &= 0xffffffff_00000000;
    tmp |= lo as u64;
    f64::from_bits(tmp)
}

#[inline]
pub(crate) fn combine_words(hi: u32, lo: u32) -> f64 {
    f64::from_bits(((hi as u64) << 32) | lo as u64)
}

// ---- the public surface ----

pub fn sin(x: f64) -> f64 {
    sin::sin(x)
}

pub fn cos(x: f64) -> f64 {
    cos::cos(x)
}

pub fn exp(x: f64) -> f64 {
    exp::exp(x)
}

pub fn pow(x: f64, y: f64) -> f64 {
    pow::pow(x, y)
}

pub fn atan2(y: f64, x: f64) -> f64 {
    atan2::atan2(y, x)
}

/// `Math.sqrt` is correctly rounded on every platform (it is an IEEE 754 operation, and on every
/// target this builds for it compiles to a single instruction), so the intrinsic is exact here —
/// measured 0 mismatches against the reference trace.
pub fn sqrt(x: f64) -> f64 {
    #[allow(clippy::sqrt_without_absolute)]
    {
        x.sqrt()
    }
}

/// `Math.hypot` — V8 does NOT use libm's hypot for this. It is a Torque builtin
/// (`src/builtins/math.tq`): scale by the largest magnitude, sum the squares with a compensated
/// (two-product) correction, and rescale. Reproduced here for the two-argument case, which is the
/// only one the simulation uses.
pub fn hypot(x: f64, y: f64) -> f64 {
    hypot2(x, y)
}

fn hypot2(x: f64, y: f64) -> f64 {
    let a = fabs(x);
    let b = fabs(y);
    if a.is_infinite() || b.is_infinite() {
        return f64::INFINITY;
    }
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    let max = if a > b { a } else { b };
    if max == 0.0 {
        return 0.0;
    }
    // V8's kMaxAbsValue-scaled Kahan-compensated sum of (v/max)^2.
    let mut sum = 0.0f64;
    let mut compensation = 0.0f64;
    for v in [a, b] {
        let n = v / max;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = (preliminary - sum) - summand;
        sum = preliminary;
    }
    max * sqrt(sum)
}
