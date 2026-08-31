//! `sin` — transliterated from V8 12.4 (`src/base/ieee754.cc`, fdlibm 5.3).
//! REPLACES the vendored libm wrapper, which carries a tiny-argument early return at 2^-26 that
//! fdlibm does not have (fdlibm's kernel takes over at 2^-27), and which calls the msun reduction.

use super::k_cos::k_cos;
use super::k_sin::k_sin;
use super::rem_pio2::rem_pio2;

pub fn sin(x: f64) -> f64 {
    let ix = ((x.to_bits() >> 32) as u32 & 0x7FFFFFFF) as i32;

    /* |x| ~< pi/4 */
    if ix <= 0x3FE921FB {
        return k_sin(x, 0.0, 0);
    }
    /* sin(Inf or NaN) is NaN */
    if ix >= 0x7FF00000 {
        return x - x;
    }
    /* argument reduction needed */
    let (n, y0, y1) = rem_pio2(x);
    match n & 3 {
        0 => k_sin(y0, y1, 1),
        1 => k_cos(y0, y1),
        2 => -k_sin(y0, y1, 1),
        _ => -k_cos(y0, y1),
    }
}
