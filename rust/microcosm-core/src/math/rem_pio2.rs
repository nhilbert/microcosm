//! `__ieee754_rem_pio2` — argument reduction, transliterated from V8 12.4
//! (`src/base/ieee754.cc`, itself fdlibm 5.3).
//!
//! This file REPLACES the vendored libm version. MUSL/msun carries an optimized reduction that
//! rounds with `rint` and skips fdlibm's `npio2_hw` table; it is a fine reduction and a different
//! one, and it disagrees with V8 for |x| > pi/4 — measured at ~0.7% of samples, which is inside
//! this simulation's range (headings, gradients, every angle it takes a sine of). fdlibm's version
//! is what V8 runs, so it is what the port must run.
//!
//! Returns `(n, y0, y1)` with `x = n*(pi/2) + y0 + y1`.

use super::floor::floor;
use super::rem_pio2_large;

const ZERO: f64 = 0.0;
const HALF: f64 = 5.00000000000000000000e-01; /* 0x3FE00000, 0x00000000 */
const TWO24: f64 = 1.67772160000000000000e+07; /* 0x41700000, 0x00000000 */
const INVPIO2: f64 = 6.36619772367581382433e-01; /* 0x3FE45F30, 0x6DC9C883 */
const PIO2_1: f64 = 1.57079632673412561417e+00; /* 0x3FF921FB, 0x54400000 */
const PIO2_1T: f64 = 6.07710050650619224932e-11; /* 0x3DD0B461, 0x1A626331 */
const PIO2_2: f64 = 6.07710050630396597660e-11; /* 0x3DD0B461, 0x1A600000 */
const PIO2_2T: f64 = 2.02226624879595063154e-21; /* 0x3BA3198A, 0x2E037073 */
const PIO2_3: f64 = 2.02226624871116645580e-21; /* 0x3BA3198A, 0x2E000000 */
const PIO2_3T: f64 = 8.47842766036889956997e-32; /* 0x397B839A, 0x252049C1 */

/// High words of n*pi/2, for the cancellation check in the medium branch.
const NPIO2_HW: [i32; 32] = [
    0x3FF921FBu32 as i32, 0x400921FBu32 as i32, 0x4012D97Cu32 as i32, 0x401921FBu32 as i32,
    0x401F6A7Au32 as i32, 0x4022D97Cu32 as i32, 0x4025FDBBu32 as i32, 0x402921FBu32 as i32,
    0x402C463Au32 as i32, 0x402F6A7Au32 as i32, 0x4031475Cu32 as i32, 0x4032D97Cu32 as i32,
    0x40346B9Cu32 as i32, 0x4035FDBBu32 as i32, 0x40378FDBu32 as i32, 0x403921FBu32 as i32,
    0x403AB41Bu32 as i32, 0x403C463Au32 as i32, 0x403DD85Au32 as i32, 0x403F6A7Au32 as i32,
    0x40407E4Cu32 as i32, 0x4041475Cu32 as i32, 0x4042106Cu32 as i32, 0x4042D97Cu32 as i32,
    0x4043A28Cu32 as i32, 0x40446B9Cu32 as i32, 0x404534ACu32 as i32, 0x4045FDBBu32 as i32,
    0x4046C6CBu32 as i32, 0x40478FDBu32 as i32, 0x404858EBu32 as i32, 0x404921FBu32 as i32,
];

#[inline]
fn get_high_word_i(x: f64) -> i32 {
    (x.to_bits() >> 32) as u32 as i32
}

pub(crate) fn rem_pio2(x: f64) -> (i32, f64, f64) {
    let mut z: f64 = 0.0;
    let (mut y0, mut y1): (f64, f64);
    let hx = get_high_word_i(x);
    let ix = hx & 0x7FFFFFFF;

    if ix <= 0x3FE921FB {
        /* |x| ~<= pi/4 , no need for reduction */
        return (0, x, 0.0);
    }
    if ix < 0x4002D97C {
        /* |x| < 3pi/4, special case with n=+-1 */
        if hx > 0 {
            z = x - PIO2_1;
            if ix != 0x3FF921FB {
                /* 33+53 bit pi is good enough */
                y0 = z - PIO2_1T;
                y1 = (z - y0) - PIO2_1T;
            } else {
                /* near pi/2, use 33+33+53 bit pi */
                z -= PIO2_2;
                y0 = z - PIO2_2T;
                y1 = (z - y0) - PIO2_2T;
            }
            return (1, y0, y1);
        } else {
            /* negative x */
            z = x + PIO2_1;
            if ix != 0x3FF921FB {
                y0 = z + PIO2_1T;
                y1 = (z - y0) + PIO2_1T;
            } else {
                z += PIO2_2;
                y0 = z + PIO2_2T;
                y1 = (z - y0) + PIO2_2T;
            }
            return (-1, y0, y1);
        }
    }
    if ix <= 0x413921FB {
        /* |x| ~<= 2^19*(pi/2), medium size */
        let t = super::fabs::fabs(x);
        // C's `(int32_t)(t*invpio2 + half)` truncates toward zero; the argument is positive here.
        let n = (t * INVPIO2 + HALF) as i32;
        let fnd = n as f64;
        let mut r = t - fnd * PIO2_1;
        let mut w = fnd * PIO2_1T; /* 1st round good to 85 bit */
        if n < 32 && ix != NPIO2_HW[(n - 1) as usize] {
            y0 = r - w; /* quick check no cancellation */
        } else {
            let j = ix >> 20;
            y0 = r - w;
            let high = (y0.to_bits() >> 32) as u32;
            let i = j - ((high >> 20) & 0x7FF) as i32;
            if i > 16 {
                /* 2nd iteration needed, good to 118 */
                let t2 = r;
                w = fnd * PIO2_2;
                r = t2 - w;
                w = fnd * PIO2_2T - ((t2 - r) - w);
                y0 = r - w;
                let high = (y0.to_bits() >> 32) as u32;
                let i = j - ((high >> 20) & 0x7FF) as i32;
                if i > 49 {
                    /* 3rd iteration needed, 151 bits accuracy */
                    let t3 = r;
                    w = fnd * PIO2_3;
                    r = t3 - w;
                    w = fnd * PIO2_3T - ((t3 - r) - w);
                    y0 = r - w;
                }
            }
        }
        y1 = (r - y0) - w;
        if hx < 0 {
            return (-n, -y0, -y1);
        }
        return (n, y0, y1);
    }
    /* all other (large) arguments */
    if ix >= 0x7FF00000 {
        /* x is inf or NaN */
        let v = x - x;
        return (0, v, v);
    }
    /* set z = scalbn(|x|, ilogb(x)-23) */
    let low = x.to_bits() as u32;
    z = f64::from_bits(low as u64); // SET_LOW_WORD on a zero high word
    let e0 = (ix >> 20) - 1046; /* e0 = ilogb(z)-23 */
    z = f64::from_bits((z.to_bits() & 0x0000_0000_FFFF_FFFF) | (((ix - (e0 << 20)) as u32 as u64) << 32));
    let mut tx = [0.0f64; 3];
    for item in tx.iter_mut().take(2) {
        *item = (z as i32) as f64;
        z = (z - *item) * TWO24;
    }
    tx[2] = z;
    let mut nx = 3usize;
    while nx > 0 && tx[nx - 1] == ZERO {
        nx -= 1; /* skip zero term */
    }
    let mut ty = [0.0f64; 3];
    let n = rem_pio2_large(&tx[..nx], &mut ty, e0, 2); // V8 passes prec=2 (jk=4), not msun's 1
    if hx < 0 {
        return (-n, -ty[0], -ty[1]);
    }
    (n, ty[0], ty[1])
}

// `floor` is imported for parity with the original's helper set; the reduction itself does not
// use it, and Rust warns rather than letting it rot unnoticed.
#[allow(unused_imports)]
use floor as _floor_unused;
