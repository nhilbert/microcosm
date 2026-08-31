//! Per-organism state dump — the Rust side of `harness/dump.js`. Same columns, same order.
//!
//!   cargo run --release --bin dump -- [ticks] [seed] [mutation 0|1]

use microcosm_core::Sim;

fn h(v: f64) -> String {
    format!("{:016x}", v.to_bits())
}

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let ticks: usize = a.first().and_then(|s| s.parse().ok()).unwrap_or(1);
    let seed: i32 = a.get(1).and_then(|s| s.parse().ok()).unwrap_or(11);
    let mutation = a.get(2).map(|s| s == "1").unwrap_or(false);

    let mut sim = Sim::new();
    sim.p.mutation = mutation;
    sim.reset_world();
    sim.init_world(Some(seed), None);
    for _ in 0..ticks {
        sim.step();
    }
    let w = &sim.w;
    let mut out = String::new();
    for i in 0..w.n_slots() {
        if w.alive[i] == 0 {
            continue;
        }
        out.push_str(&format!(
            "{} {} {} {} {} {} {} {} {} {} {} {} {} {} {} {} {}\n",
            i,
            w.sp[i],
            h(w.x[i] as f64),
            h(w.y[i] as f64),
            h(w.en[i] as f64),
            h(w.mn[i] as f64),
            h(w.pr[i] as f64),
            h(w.vx[i] as f64),
            h(w.vy[i] as f64),
            h(w.hd[i] as f64),
            w.cy[i],
            w.gr[i],
            w.handle[i],
            w.cd[i],
            w.bst[i],
            w.pc[i],
            w.flee[i]
        ));
    }
    print!("{}", out);
}
