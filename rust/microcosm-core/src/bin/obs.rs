//! Observatory fingerprint — the Rust side of `harness/fingerprint-obs.js`.
//!
//!   cargo run --release --bin obs -- [ticks] [seed] [mutation 0|1]

use microcosm_core::params::{REC_CH, REC_N};
use microcosm_core::Sim;

fn h(v: f64) -> String {
    format!("{:016x}", v.to_bits())
}

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let ticks: usize = a.first().and_then(|s| s.parse().ok()).unwrap_or(6000);
    let seed: i32 = a.get(1).and_then(|s| s.parse().ok()).unwrap_or(11);
    let mutation = a.get(2).map(|s| s == "1").unwrap_or(false);

    let mut sim = Sim::new();
    sim.p.mutation = mutation;
    sim.reset_world();
    sim.init_world(Some(seed), None);
    for _ in 0..ticks {
        sim.step();
    }

    let o = &sim.obs;
    let mut out = String::new();
    out.push_str(&format!(
        "recHead={} recCount={} sysEvents={}\n",
        o.head,
        o.count,
        o.sys_events.len()
    ));
    for ch in 0..REC_CH {
        let mut s = 0.0f64;
        for n in 0..REC_N {
            s += o.rec[n * REC_CH + ch] as f64;
        }
        out.push_str(&format!("ch{:03} {}\n", ch, h(s)));
    }
    for e in &o.sys_events {
        let l = match e.locus {
            Some(k) => format!(" L{}", k),
            None => String::new(),
        };
        out.push_str(&format!(
            "ev t={} {} sp={}{} | {}\n",
            e.tick, e.kind, e.sp, l, e.text
        ));
    }
    print!("{}", out);
}
