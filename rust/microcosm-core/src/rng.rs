//! mulberry32 — the world's only source of randomness.
//!
//! Transliterated from `src/sim/params.js`:
//!
//! ```js
//! function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
//!   t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
//! ```
//!
//! JS `>>>` is a logical shift on the ToUint32 value and `Math.imul` is a wrapping 32-bit multiply,
//! so the whole generator is exact 32-bit integer arithmetic — easier in Rust than in JavaScript,
//! provided every operation wraps rather than panicking (debug builds would panic on overflow with
//! plain `+`/`*`). Verified bit-identical against a 10,000-draw V8 trace, f32 store included
//! (dev/xcheck/rng.rs).
//!
//! The state lives here as a plain field rather than in a closure, which is what makes a save file
//! able to capture and restore it (docs/android-port-plan.md M0; the JS reference was changed to
//! match, `W.rngState`).

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rng {
    /// The mulberry32 integer state, exactly JS's `a` after `a|=0`.
    pub state: i32,
}

impl Rng {
    #[inline]
    pub fn new(seed: i32) -> Self {
        Rng { state: seed }
    }

    /// One draw in [0, 1). The operation order is the JS one, term for term.
    #[inline]
    pub fn next(&mut self) -> f64 {
        // a = a + 0x6D2B79F5 | 0
        let a = self.state.wrapping_add(0x6D2B79F5u32 as i32);
        self.state = a;
        let au = a as u32;
        // t = Math.imul(a ^ a >>> 15, 1 | a)
        let mut t = ((au ^ (au >> 15)) as i32).wrapping_mul(1 | a);
        // t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
        let tu = t as u32;
        t = t.wrapping_add(((tu ^ (tu >> 7)) as i32).wrapping_mul(61 | t)) ^ t;
        // ((t ^ t >>> 14) >>> 0) / 4294967296
        let tu2 = t as u32;
        ((tu2 ^ (tu2 >> 14)) as f64) / 4294967296.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The first six draws of seed 77 (P.SEED), captured from Node 22 / V8 12.4 as raw bits so the
    /// test compares doubles exactly rather than through decimal formatting.
    #[test]
    fn matches_v8_stream() {
        let want: [u64; 6] = [
            0x3fdb3d0d78000000,
            0x3fa59dd3fe000000,
            0x3fe645afe7c00000,
            0x3fdf18f4e3400000,
            0x3fbda29eb0000000,
            0x3fea6f7a6f000000,
        ];
        let mut r = Rng::new(77);
        for (k, w) in want.iter().enumerate() {
            let got = r.next();
            assert_eq!(got.to_bits(), *w, "draw {} diverged from V8", k);
        }
    }

    /// Seeds used by the harnesses must survive the negative-state region unscathed.
    #[test]
    fn state_is_round_trippable() {
        let mut a = Rng::new(11);
        for _ in 0..1000 {
            a.next();
        }
        let mut b = Rng::new(0);
        b.state = a.state; // what a save file restores
        assert_eq!(a.next().to_bits(), b.next().to_bits());
    }
}
