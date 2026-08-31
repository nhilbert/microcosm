//! Raw-bit conformance fingerprint, the Rust side of the port's oracle.
//!
//! Prints exactly what `harness/fingerprint-raw.js` prints from the JavaScript reference. The two
//! outputs must be byte-identical: same populations, same IEEE754 bits in every accumulator, same
//! PRNG state at the end. The final `rngState` is the sharpest of these — it certifies that the
//! two implementations consumed the same number of draws in the same order, which is the whole
//! contract, independent of what the numbers turned out to be.
//!
//!   cargo run --release --bin conform -- [ticks]

use microcosm_core::params::{MAXN, NCELL};
use microcosm_core::Sim;

fn h(v: f64) -> String {
    format!("{:016x}", v.to_bits())
}

fn fingerprint(sim: &mut Sim, seed: i32, mutation: bool, ticks: usize) -> String {
    sim.p.mutation = mutation;
    sim.reset_world();
    sim.init_world(Some(seed), None);
    for _ in 0..ticks {
        sim.step();
    }
    let w = &sim.w;
    let mut p = [0i32; 7];
    let (mut sx, mut se, mut sm, mut sg) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);
    for i in 0..w.n_slots() {
        if w.alive[i] == 0 {
            continue;
        }
        p[w.sp[i] as usize] += 1;
        sx += w.x[i] as f64 + w.y[i] as f64;
        se += w.en[i] as f64;
        sm += w.mn[i] as f64;
        let loci = &sim.tr[w.sp[i] as usize].loci;
        for (k, l) in loci.iter().enumerate() {
            sg += w.g[k * MAXN + i] as f64 - l.g0;
        }
    }
    let mut f_m = 0.0f64;
    for c in 0..NCELL {
        f_m += w.m[c] as f64;
    }
    let mut am = 0.0f64;
    for c in 0..NCELL {
        am += w.m[c] as f64 + w.d_m[c] as f64;
    }
    for i in 0..w.n_slots() {
        if w.alive[i] != 0 {
            am += w.mn[i] as f64;
        }
    }
    for k in 0..w.c_n {
        if w.c_alive[k] != 0 {
            am += w.c_m[k] as f64;
        }
    }
    // static fields: computed before the first tick, so a difference here localises the fault to
    // compute_light/compute_temp rather than to the organism loop
    let mut li = 0.0f64;
    let mut tp = 0.0f64;
    for c in 0..NCELL {
        li += w.light[c] as f64;
        tp += w.temp[c] as f64 + w.q_r[c] as f64;
    }
    format!(
        "pops=[{}] posSum={} enSum={} mnSum={} gSum={} fieldM={} auditM={} lightSum={} tempSum={} rngState={} tick={} n={}",
        p.iter()
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join(","),
        h(sx),
        h(se),
        h(sm),
        h(sg),
        h(f_m),
        h(am),
        h(li),
        h(tp),
        w.rng.state,
        w.tick,
        w.n
    )
}

fn main() {
    let ticks: usize = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(3000);
    let mut sim = Sim::new();
    for (mode, mut_on) in [("silent", false), ("evolving", true)] {
        for seed in [11, 88] {
            println!(
                "{} {} {}",
                mode,
                seed,
                fingerprint(&mut sim, seed, mut_on, ticks)
            );
        }
    }
}
