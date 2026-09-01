//! `__kernel_sin` — transliterated from V8 12.4 (`src/base/ieee754.cc`, fdlibm 5.3).
//!
//! REPLACES the vendored libm version. Same coefficients, different association: MUSL evaluates
//! the polynomial as `S2 + z*(S3 + z*S4) + z*w*(S5 + z*S6)` with `w = z*z`, while fdlibm keeps a
//! single Horner chain. Mathematically equal, not equal in floating point — worth 14 last-place
//! disagreements across 200,000 samples, which is 14 too many for a world that has to replay.

const HALF: f64 = 5.00000000000000000000e-01; /* 0x3FE00000, 0x00000000 */
const S1: f64 = -1.66666666666666324348e-01; /* 0xBFC55555, 0x55555549 */
const S2: f64 = 8.33333333332248946124e-03; /* 0x3F811111, 0x1110F8A6 */
const S3: f64 = -1.98412698298579493134e-04; /* 0xBF2A01A0, 0x19C161D5 */
const S4: f64 = 2.75573137070700676789e-06; /* 0x3EC71DE3, 0x57B1FE7D */
const S5: f64 = -2.50507602534068634195e-08; /* 0xBE5AE5E6, 0x8A2B9CEB */
const S6: f64 = 1.58969099521155010221e-10; /* 0x3DE5D93A, 0x5ACFD57C */

pub(crate) fn k_sin(x: f64, y: f64, iy: i32) -> f64 {
    let ix = ((x.to_bits() >> 32) as u32 & 0x7FFFFFFF) as i32;
    if ix < 0x3E400000 {
        /* |x| < 2**-27 */
        if (x as i32) == 0 {
            return x; /* generate inexact */
        }
    }
    let z = x * x;
    let v = z * x;
    let r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
    if iy == 0 {
        x + v * (S1 + z * r)
    } else {
        x - ((z * (HALF * y - v * r) - y) - v * S1)
    }
}
