//! Self-checks the core can run anywhere it is compiled — including on a phone.
//!
//! The desktop and WASM builds are proven against the JavaScript core by the harnesses. The
//! Android build cannot be: there is no Node on the phone to compare against. So the evidence has
//! to travel with the code — a compact trace of V8's own results, and the fingerprints the
//! certified world produces at 3,000 ticks. If the phone reproduces both, ARM64 bit-exactness is
//! measured rather than inferred (docs/android-port-plan.md M1).
//!
//! One definition, three callers: the `conform` binary, the CI self-check, and the Android probe.

use crate::math;
use crate::params::{MAXN, NCELL};
use crate::Sim;

fn h(v: f64) -> String {
    format!("{:016x}", v.to_bits())
}

/// The world fingerprint: populations, the raw bits of every accumulator, and the PRNG state —
/// which is the part that proves both implementations consumed the same draws in the same order.
pub fn fingerprint(sim: &Sim) -> String {
    let w = &sim.w;
    let mut p = [0i32; 7];
    let (mut sx, mut se, mut sm, mut sg) = (0.0f64, 0.0, 0.0, 0.0);
    for i in 0..w.n_slots() {
        if w.alive[i] == 0 {
            continue;
        }
        p[w.sp[i] as usize] += 1;
        sx += w.x[i] as f64 + w.y[i] as f64;
        se += w.en[i] as f64;
        sm += w.mn[i] as f64;
        for (k, l) in sim.tr[w.sp[i] as usize].loci.iter().enumerate() {
            sg += w.g[k * MAXN + i] as f64 - l.g0;
        }
    }
    let (mut f_m, mut am, mut li, mut tp) = (0.0f64, 0.0, 0.0, 0.0);
    for c in 0..NCELL {
        f_m += w.m[c] as f64;
        am += w.m[c] as f64 + w.d_m[c] as f64;
        li += w.light[c] as f64;
        tp += w.temp[c] as f64 + w.q_r[c] as f64;
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
    format!(
        "pops=[{}] posSum={} enSum={} mnSum={} gSum={} fieldM={} auditM={} lightSum={} tempSum={} rngState={} tick={} n={}",
        p.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(","),
        h(sx), h(se), h(sm), h(sg), h(f_m), h(am), h(li), h(tp),
        w.rng.state, w.tick, w.n
    )
}

/// Run one world to `ticks` and fingerprint it.
pub fn run_fingerprint(seed: i32, mutation: bool, ticks: usize) -> String {
    let mut sim = Sim::new();
    sim.p.mutation = mutation;
    sim.reset_world();
    sim.init_world(Some(seed), None);
    for _ in 0..ticks {
        sim.step();
    }
    fingerprint(&sim)
}

/// The certified world at 3,000 ticks, captured on the reference engine (Node 22 / V8 12.4) and
/// reproduced by the Rust core on x86-64 and wasm32. A build that matches these has the whole sim
/// — arithmetic, draw order, field passes, heredity — bit-exact.
///
/// Regenerate with `cargo run --release --bin conform -- 3000`; CI checks they are current, so
/// they cannot quietly go stale.
pub const EXPECTED_3000: [(&str, i32, bool, &str); 4] = [
    ("silent", 11, false, "pops=[402,259,132,538,0,0,7] posSum=413583133bd00000 enSum=40d67f4d34d05400 mnSum=40a4c90682b6f2be gSum=0000000000000000 fieldM=40b6bd92e4052120 auditM=40c199942272e55e lightSum=40925653c8290000 tempSum=40b0000000000000 rngState=417392214 tick=3000 n=2560"),
    ("silent", 88, false, "pops=[439,216,88,596,0,0,9] posSum=4134fe8cd7200000 enSum=40d666a524b71380 mnSum=40a346cfdbb09038 gSum=0000000000000000 fieldM=40b72f860cea3000 auditM=40c19994e760fd4a lightSum=40925653c8290000 tempSum=40b0000000000000 rngState=-1636901823 tick=3000 n=2576"),
    ("evolving", 11, true, "pops=[476,472,160,719,0,0,10] posSum=413cd35d7da90000 enSum=40dddafc33683400 mnSum=40aa8736f8c7cf8a gSum=c02b3c7145000000 fieldM=40b3b005e64bb180 auditM=40c1999373f52f16 lightSum=40925653c8290000 tempSum=40b0000000000000 rngState=-1779676648 tick=3000 n=2592"),
    ("evolving", 88, true, "pops=[647,286,116,622,0,0,8] posSum=413a50c3fe850000 enSum=40df445f6fedd000 mnSum=40a9d6614177c646 gSum=4005c84d30000000 fieldM=40b33188bab65f80 auditM=40c19992fbfb96be lightSum=40925653c8290000 tempSum=40b0000000000000 rngState=671176883 tick=3000 n=2575"),
];

/// Reproduce the four certified fingerprints. Returns (report, all_ok).
pub fn sim_check() -> (String, bool) {
    let mut out = String::new();
    let mut ok = true;
    for (mode, seed, mutation, want) in EXPECTED_3000 {
        let got = run_fingerprint(seed, mutation, 3000);
        let same = got == want;
        if !same {
            ok = false;
        }
        out.push_str(&format!(
            "  {:<8} seed {:<2}  {}\n",
            mode, seed,
            if same { "identical" } else { "DIFFERS" }
        ));
        if !same {
            out.push_str(&format!("    want {}\n    got  {}\n", want, got));
        }
    }
    (out, ok)
}

// ---------- the math trace ----------

const FN_NAMES: [&str; 7] = ["sin", "cos", "exp", "pow", "atan2", "hypot", "sqrt"];

/// Replay a binary trace produced by `dev/xcheck/gen-bin.js`. Returns (report, all_ok).
///
/// Layout: "MCTR", u32 version, u32 count, then `u8 fnId | f64 a | f64 b | f64 result`
/// little-endian and unaligned, 25 bytes per record.
pub fn math_check(trace: &[u8]) -> (String, bool) {
    if trace.len() < 12 || &trace[0..4] != b"MCTR" {
        return ("  trace: bad magic — not an MCTR file\n".to_string(), false);
    }
    let count = u32::from_le_bytes([trace[8], trace[9], trace[10], trace[11]]) as usize;
    if trace.len() < 12 + count * 25 {
        return ("  trace: truncated\n".to_string(), false);
    }
    let f64_at = |o: usize| -> f64 {
        let mut b = [0u8; 8];
        b.copy_from_slice(&trace[o..o + 8]);
        f64::from_le_bytes(b)
    };
    let mut n = [0u64; 7];
    let mut bad = [0u64; 7];
    let mut first: [Option<String>; 7] = Default::default();
    for r in 0..count {
        let o = 12 + r * 25;
        let id = trace[o] as usize;
        if id >= 7 {
            continue;
        }
        let a = f64_at(o + 1);
        let b = f64_at(o + 9);
        let want = f64_at(o + 17);
        let got = match id {
            0 => math::sin(a),
            1 => math::cos(a),
            2 => math::exp(a),
            3 => math::pow(a, b),
            4 => math::atan2(a, b),
            5 => math::hypot(a, b),
            _ => math::sqrt(a),
        };
        n[id] += 1;
        if got.to_bits() != want.to_bits() {
            bad[id] += 1;
            if first[id].is_none() {
                first[id] = Some(format!(
                    "a={:016x} b={:016x} got={:016x} want={:016x}",
                    a.to_bits(), b.to_bits(), got.to_bits(), want.to_bits()
                ));
            }
        }
    }
    let mut out = String::new();
    let mut ok = true;
    for id in 0..7 {
        if n[id] == 0 {
            continue;
        }
        if bad[id] != 0 {
            ok = false;
        }
        out.push_str(&format!(
            "  {:<6} {:>7} samples  {:>6} mismatches{}\n",
            FN_NAMES[id], n[id], bad[id],
            if bad[id] == 0 { "" } else { "  <-- DIVERGES" }
        ));
        if let Some(f) = &first[id] {
            out.push_str(&format!("      first: {}\n", f));
        }
    }
    (out, ok)
}

// ---------- performance ----------

/// Tick rate on this device. Founds seed 11, runs `warmup` ticks untimed so the population is at a
/// realistic size, then times `ticks`.
#[cfg(not(target_arch = "wasm32"))]
pub fn perf_probe(warmup: usize, ticks: usize) -> String {
    use std::time::Instant;
    let mut sim = Sim::new();
    sim.p.mutation = true;
    sim.reset_world();
    sim.init_world(Some(11), None);
    for _ in 0..warmup {
        sim.step();
    }
    let pops: i32 = sim.pops().iter().sum();
    let t0 = Instant::now();
    for _ in 0..ticks {
        sim.step();
    }
    let dt = t0.elapsed().as_secs_f64();
    let per_tick_ms = dt * 1000.0 / ticks as f64;
    let ticks_per_s = ticks as f64 / dt;
    format!(
        "  {} ticks in {:.2} s at {} organisms\n  {:.3} ms/tick · {:.0} ticks/s · sustains {:.0}x speed (10 ticks/s = 1x)\n",
        ticks, dt, pops, per_tick_ms, ticks_per_s, ticks_per_s / 10.0
    )
}
