//! `cos` — transliterated from V8 12.4 (`src/base/ieee754.cc`, fdlibm 5.3).
//! REPLACES the vendored libm wrapper, for the same reasons as `sin`.

use super::k_cos::k_cos;
use super::k_sin::k_sin;
use super::rem_pio2::rem_pio2;

pub fn cos(x: f64) -> f64 {
    let ix = ((x.to_bits() >> 32) as u32 & 0x7FFFFFFF) as i32;

    /* |x| ~< pi/4 */
    if ix <= 0x3FE921FB {
        return k_cos(x, 0.0);
    }
    /* cos(Inf or NaN) is NaN */
    if ix >= 0x7FF00000 {
        return x - x;
    }
    /* argument reduction needed */
    let (n, y0, y1) = rem_pio2(x);
    match n & 3 {
        0 => k_cos(y0, y1),
        1 => -k_sin(y0, y1, 1),
        2 => -k_cos(y0, y1),
        _ => k_sin(y0, y1, 1),
    }
}
