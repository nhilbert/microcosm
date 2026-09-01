//! COMPILE-CHECK SCAFFOLDING ONLY — enabled by the `stub-math` feature.
//!
//! Delegates to the platform's libm, which is precisely what the real `math.rs` exists to avoid:
//! results differ between glibc, bionic and WASM, so a world simulated with this module is not
//! reproducible anywhere else. Used only to type-check the sim translation before the verified
//! module lands. Any conformance run made with this feature on is meaningless.

#[inline]
pub fn sin(x: f64) -> f64 {
    x.sin()
}
#[inline]
pub fn cos(x: f64) -> f64 {
    x.cos()
}
#[inline]
pub fn exp(x: f64) -> f64 {
    x.exp()
}
#[inline]
pub fn pow(x: f64, y: f64) -> f64 {
    x.powf(y)
}
#[inline]
pub fn atan2(y: f64, x: f64) -> f64 {
    y.atan2(x)
}
#[inline]
pub fn hypot(x: f64, y: f64) -> f64 {
    x.hypot(y)
}
#[inline]
pub fn sqrt(x: f64) -> f64 {
    x.sqrt()
}
