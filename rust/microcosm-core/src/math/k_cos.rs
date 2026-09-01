//! `__kernel_cos` — transliterated from V8 12.4 (`src/base/ieee754.cc`, fdlibm 5.3).
//!
//! REPLACES the vendored libm version. MUSL dropped fdlibm's `qx` correction for |x| >= 0.3 (the
//! trick that keeps the subtraction `1 - x*x/2` from losing bits), so its result differs from V8's
//! in the last place on part of the range. Reduction feeds this kernel for every angle past pi/4,
//! so the difference reaches the whole simulation.

const ONE: f64 = 1.00000000000000000000e+00; /* 0x3FF00000, 0x00000000 */
const C1: f64 = 4.16666666666666019037e-02; /* 0x3FA55555, 0x5555554C */
const C2: f64 = -1.38888888888741095749e-03; /* 0xBF56C16C, 0x16C15177 */
const C3: f64 = 2.48015872894767294178e-05; /* 0x3EFA01A0, 0x19CB1590 */
const C4: f64 = -2.75573143513906633035e-07; /* 0xBE927E4F, 0x809C52AD */
const C5: f64 = 2.08757232129817482790e-09; /* 0x3E21EE9E, 0xBDB4B1C4 */
const C6: f64 = -1.13596475577881948265e-11; /* 0xBDA8FAE9, 0xBE8838D4 */

pub(crate) fn k_cos(x: f64, y: f64) -> f64 {
    let ix = ((x.to_bits() >> 32) as u32 & 0x7FFFFFFF) as i32;
    if ix < 0x3E400000 {
        /* if x < 2**-27 */
        if (x as i32) == 0 {
            return ONE; /* generate inexact */
        }
    }
    let z = x * x;
    let r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
    if ix < 0x3FD33333 {
        /* if |x| < 0.3 */
        ONE - (0.5 * z - (z * r - x * y))
    } else {
        let qx = if ix > 0x3FE90000 {
            /* x > 0.78125 */
            0.28125
        } else {
            /* qx = x/4, low word cleared — exact by construction */
            f64::from_bits((((ix - 0x00200000) as u32) as u64) << 32)
        };
        let iz = 0.5 * z - qx;
        let a = ONE - qx;
        a - (iz - (z * r - x * y))
    }
}
