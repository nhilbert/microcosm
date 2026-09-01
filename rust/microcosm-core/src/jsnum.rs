//! JavaScript numeric semantics, reproduced exactly.
//!
//! The port is worthless unless arithmetic matches V8 bit for bit, and most of the ways to get
//! that wrong are not in the transcendentals (see math.rs) but here, in the boring conversions:
//!
//!   * `f64 as i32` SATURATES in Rust; JS `x|0` (ToInt32) WRAPS. Every `&`, `|0` and typed-array
//!     store in the JS core goes through ToInt32-style truncation.
//!   * `f64::min` in Rust returns the non-NaN operand and is permitted to ignore the sign of
//!     zero; `Math.min` propagates NaN and treats -0 as smaller than +0. A -0 stored into a
//!     Float32Array has different bits from +0, and the conformance fingerprint sums stored
//!     values — so the distinction is not academic.
//!   * Typed-array stores narrow: Float32Array rounds to f32, Int16Array wraps modulo 2^16.
//!
//! Every helper here is the ECMAScript operation, not an approximation of it.

/// ECMAScript ToInt32 (§7.1.6): NaN/±Inf -> 0, else truncate toward zero and wrap modulo 2^32.
#[inline]
pub fn to_int32(v: f64) -> i32 {
    // Fast path: inside i32 range `as` is exact and truncates toward zero, exactly like ToInt32.
    // NaN fails both comparisons and falls through to the slow path, which returns 0 as the spec says.
    if v >= -2147483648.0 && v < 2147483648.0 {
        return v as i32;
    }
    to_int32_slow(v)
}

#[cold]
fn to_int32_slow(v: f64) -> i32 {
    if !v.is_finite() {
        return 0;
    }
    // Doubles are exact integers past 2^53, so rem_euclid on the truncated value is exact.
    let m = v.trunc().rem_euclid(4294967296.0);
    (m as u32) as i32
}

/// ECMAScript ToUint32.
#[inline]
pub fn to_uint32(v: f64) -> u32 {
    to_int32(v) as u32
}

/// `Math.floor(v)` followed by ToInt32 — the shape every grid index in the core has
/// (`Math.floor(y/CELL) & (GRID-1)`).
#[inline]
pub fn floor_i32(v: f64) -> i32 {
    to_int32(v.floor())
}

/// `Math.min` (§21.3.2.24): NaN propagates, -0 is smaller than +0.
#[inline]
pub fn jmin(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a < b {
        a
    } else if b < a {
        b
    } else {
        // Equal (or both zero): -0 is the smaller.
        if a.is_sign_negative() {
            a
        } else {
            b
        }
    }
}

/// `Math.max` (§21.3.2.23): NaN propagates, +0 is larger than -0.
#[inline]
pub fn jmax(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a > b {
        a
    } else if b > a {
        b
    } else {
        if a.is_sign_negative() {
            b
        } else {
            a
        }
    }
}

/// Three-argument `Math.min`, evaluated left to right as the spec does.
#[inline]
pub fn jmin3(a: f64, b: f64, c: f64) -> f64 {
    jmin(jmin(a, b), c)
}

/// Store into an `Int16Array`: ToInt32 then keep the low 16 bits, reinterpreted signed.
#[inline]
pub fn to_i16(v: f64) -> i16 {
    to_int32(v) as i16
}

/// Store into a `Uint16Array`.
#[inline]
pub fn to_u16(v: f64) -> u16 {
    to_int32(v) as u16
}

/// Store into a `Uint8Array`.
#[inline]
pub fn to_u8(v: f64) -> u8 {
    to_int32(v) as u8
}

/// Store into a `Float32Array`: round to nearest f32 (Rust's `as f32` is round-to-nearest-even,
/// which is what V8 does on a Float32Array store).
#[inline]
pub fn to_f32(v: f64) -> f32 {
    v as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_int32_wraps_like_js() {
        assert_eq!(to_int32(0.0), 0);
        assert_eq!(to_int32(-1.5), -1); // truncation toward zero
        assert_eq!(to_int32(1.9), 1);
        assert_eq!(to_int32(f64::NAN), 0);
        assert_eq!(to_int32(f64::INFINITY), 0);
        assert_eq!(to_int32(-f64::INFINITY), 0);
        // 2^31 wraps to -2^31 (Rust's `as` would saturate to 2^31-1 — the bug this guards)
        assert_eq!(to_int32(2147483648.0), -2147483648);
        assert_eq!(to_int32(4294967296.0), 0);
        assert_eq!(to_int32(4294967297.0), 1);
        assert_eq!(to_int32(-4294967297.0), -1);
    }

    #[test]
    fn min_max_respect_signed_zero() {
        assert!(jmin(0.0, -0.0).is_sign_negative());
        assert!(jmin(-0.0, 0.0).is_sign_negative());
        assert!(jmax(0.0, -0.0).is_sign_positive());
        assert!(jmax(-0.0, 0.0).is_sign_positive());
        assert!(jmin(f64::NAN, 1.0).is_nan());
        assert!(jmax(f64::NAN, 1.0).is_nan());
    }

    #[test]
    fn i16_store_wraps() {
        assert_eq!(to_i16(32767.0), 32767);
        assert_eq!(to_i16(32768.0), -32768);
        assert_eq!(to_i16(-1.0), -1);
        assert_eq!(to_i16(9.6), 9); // truncation, not rounding
    }
}
