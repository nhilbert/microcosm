//! `floor` — an IEEE 754 roundTowardNegative operation, exact and identical on every target
//! (and on every libm), so the intrinsic is safe here. Hand-written for the same reason as fabs:
//! no architecture dispatch.
#[inline]
pub fn floor(x: f64) -> f64 {
    x.floor()
}
