//! `scalbn(x, n)` — x * 2^n, computed by exponent manipulation with the standard MUSL staging for
//! over/underflow. Hand-written for the same reason as fabs and floor: the upstream file dispatches
//! per architecture, and the arithmetic here must not depend on the target. Pure exponent
//! arithmetic, so it is exact on every platform.
pub fn scalbn(x: f64, mut n: i32) -> f64 {
    let x1p1023 = f64::from_bits(0x7fe0000000000000); // 2^1023
    let x1p53 = f64::from_bits(0x4340000000000000); // 2^53
    let x1p_1022 = f64::from_bits(0x0010000000000000); // 2^-1022

    let mut y = x;
    if n > 1023 {
        y *= x1p1023;
        n -= 1023;
        if n > 1023 {
            y *= x1p1023;
            n -= 1023;
            if n > 1023 {
                n = 1023;
            }
        }
    } else if n < -1022 {
        // Subnormal scaling is staged so the intermediate stays normal.
        y *= x1p_1022 * x1p53;
        n += 1022 - 53;
        if n < -1022 {
            y *= x1p_1022 * x1p53;
            n += 1022 - 53;
            if n < -1022 {
                n = -1022;
            }
        }
    }
    y * f64::from_bits(((0x3ff + n) as u64) << 52)
}
