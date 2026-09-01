//! `fabs` — bit manipulation only, identical everywhere. Hand-written rather than vendored: the
//! upstream file dispatches to per-architecture intrinsics, and this crate must never let the
//! target choose the arithmetic.
#[inline]
pub fn fabs(x: f64) -> f64 {
    f64::from_bits(x.to_bits() & !(1u64 << 63))
}
