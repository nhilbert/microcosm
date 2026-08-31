//! Scripted events + scenario founding — the Rust side of `harness/fingerprint-events.js`.
//! Same script, same ticks, same columns.
//!
//!   cargo run --release --bin events

use microcosm_core::events::{Event, LocusKey};
use microcosm_core::fields::WallSpec;
use microcosm_core::params::{MAXN, NCELL};
use microcosm_core::{Scenario, Sim};

fn h(v: f64) -> String {
    format!("{:016x}", v.to_bits())
}

fn fp(sim: &Sim, label: &str) {
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
    let (mut f_m, mut li, mut tp, mut sc, mut al, mut de) = (0.0f64, 0.0, 0.0, 0.0, 0.0, 0.0);
    for c in 0..NCELL {
        f_m += w.m[c] as f64;
        li += w.light[c] as f64;
        tp += w.temp[c] as f64
            + w.q_r[c] as f64
            + w.q_p[c] as f64
            + w.q_d[c] as f64
            + w.q_h[c] as f64
            + w.q_s[c] as f64
            + w.q_a[c] as f64;
        sc += w.sc[c] as f64;
        al += w.al[c] as f64;
        de += w.d_e[c] as f64 + w.d_p[c] as f64 + w.d_m[c] as f64;
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
    println!(
        "{} pops=[{}] posSum={} enSum={} mnSum={} gSum={} fieldM={} detr={} scent={} alarm={} \
lightSum={} qSum={} auditM={} addedM={} sources={} walls={} wallsOn={} rngState={} tick={} n={} \
corpses={} evLog={}",
        label,
        p.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(","),
        h(sx),
        h(se),
        h(sm),
        h(sg),
        h(f_m),
        h(de),
        h(sc),
        h(al),
        h(li),
        h(tp),
        h(am),
        h(w.added_m),
        w.sources.len(),
        w.walls.len(),
        if w.walls_on { 1 } else { 0 },
        w.rng.state,
        w.tick,
        w.n,
        w.c_n,
        w.event_log.len()
    );
}

fn main() {
    let mut sim = Sim::new();

    // ---- 1. the scripted world: every event type, at fixed ticks ----
    sim.p.mutation = true;
    sim.reset_world();
    sim.init_world(Some(11), None);
    let mut victim: i32 = -1;
    let mut fed: i32 = -1;
    for i in 0..sim.w.n_slots() {
        if sim.w.alive[i] == 0 {
            continue;
        }
        if victim < 0 && sim.w.sp[i] == 1 {
            victim = i as i32;
        }
        if fed < 0 && sim.w.sp[i] == 2 {
            fed = i as i32;
        }
    }
    let (victim, fed) = (victim as usize, fed as usize);

    for t in 1..=1500 {
        match t {
            100 => sim.queue_event(Event::Fertilize {
                x: 300.0,
                y: 400.0,
                amount: 50.0,
            }),
            150 => sim.queue_event(Event::LightMul { v: 0.6 }),
            200 => sim.queue_event(Event::SpawnPack {
                sp: 2,
                x: 500.0,
                y: 500.0,
            }),
            250 => sim.queue_event(Event::SourceAdd {
                x: 200.0,
                y: 200.0,
                i: Some(0.8),
                a: Some(6.0),
                sigma: Some(150.0),
                at: None,
            }),
            300 => sim.queue_event(Event::SourceSet {
                k: 0,
                i: Some(1.2),
                a: Some(-3.0),
                sigma: Some(240.0),
            }),
            350 => sim.queue_event(Event::Source {
                k: 1,
                x: 260.0,
                y: 220.0,
            }),
            400 => sim.queue_event(Event::WallAdd {
                spec: WallSpec {
                    x0: 400.0,
                    y0: 100.0,
                    dx: 0.0,
                    dy: 500.0,
                    lt: 0.2,
                    ht: 0.5,
                    fl: 0.1,
                    pass: 0,
                },
                at: None,
            }),
            450 => sim.queue_event(Event::WallSet {
                k: 0,
                lt: Some(0.7),
                ht: None,
                fl: Some(0.6),
                pass: Some(2),
            }),
            500 => {
                let g1 = sim.w.gen[fed];
                sim.queue_event(Event::Feed {
                    i: fed,
                    gen: g1,
                    frac: 0.5,
                });
                let g2 = sim.w.gen[victim];
                sim.queue_event(Event::Kill {
                    i: victim,
                    gen: g2,
                });
            }
            550 => sim.queue_event(Event::Mutation { v: false }),
            600 => sim.queue_event(Event::Locus {
                sp: 1,
                locus: 0,
                key: LocusKey::KpSlope,
                v: 0.9,
            }),
            650 => sim.queue_event(Event::Mutation { v: true }),
            700 => sim.queue_event(Event::WallAdd {
                spec: WallSpec {
                    x0: 100.0,
                    y0: 600.0,
                    dx: 400.0,
                    dy: 0.0,
                    lt: 1.0,
                    ht: 1.0,
                    fl: 1.0,
                    pass: -1,
                },
                at: None,
            }),
            750 => sim.queue_event(Event::WallRemove { k: 0 }),
            800 => sim.queue_event(Event::SourceRemove { k: 1 }),
            _ => {}
        }
        sim.step();
    }
    fp(&sim, "scripted");

    // ---- 2. scenario founding: a level's world ----
    sim.p.mutation = false;
    sim.reset_world();
    let sc = Scenario {
        found: [None, Some(0), None, None, None, None, Some(0)],
        m0: Some(0.4),
    };
    sim.init_world(Some(202), Some(&sc));
    for _ in 0..1500 {
        sim.step();
    }
    fp(&sim, "scenario");
}
