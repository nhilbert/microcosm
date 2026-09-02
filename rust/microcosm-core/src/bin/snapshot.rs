//! Save/load correctness, checked the only way that means anything for a deterministic sim:
//! save at tick T, load the bytes back, run on — and require the same state as the run that was
//! never interrupted. If save/load is right these are identical to the last bit; if it is wrong,
//! the fingerprint says so immediately instead of a player losing a world.
//!
//!   cargo run --release --bin snapshot

use microcosm_core::events::Event;
use microcosm_core::fields::WallSpec;
use microcosm_core::params::{MAXN, NCELL};
use microcosm_core::Sim;

fn state_hash(sim: &Sim) -> String {
    // A digest over everything a resumed world must carry, not just the populations.
    let w = &sim.w;
    let (mut sx, mut se, mut sm, mut sg, mut sv, mut sh) = (0.0f64, 0.0, 0.0, 0.0, 0.0, 0.0);
    let mut pops = [0i32; 7];
    for i in 0..w.n_slots() {
        if w.alive[i] == 0 {
            continue;
        }
        pops[w.sp[i] as usize] += 1;
        sx += w.x[i] as f64 + w.y[i] as f64;
        se += w.en[i] as f64;
        sm += w.mn[i] as f64;
        sv += w.vx[i] as f64 + w.vy[i] as f64;
        sh += w.hd[i] as f64 + w.gen[i] as f64 + w.cd[i] as f64 + w.pc[i] as f64;
        for k in 0..sim.tr[w.sp[i] as usize].loci.len() {
            sg += w.g[k * MAXN + i] as f64;
        }
    }
    let (mut fm, mut fd, mut fs) = (0.0f64, 0.0, 0.0);
    for c in 0..NCELL {
        fm += w.m[c] as f64;
        fd += w.d_e[c] as f64 + w.d_p[c] as f64 + w.d_m[c] as f64;
        fs += w.sc[c] as f64 + w.al[c] as f64 + w.light[c] as f64 + w.temp[c] as f64;
    }
    let mut cm = 0.0f64;
    for k in 0..w.c_n {
        if w.c_alive[k] != 0 {
            cm += w.c_e[k] as f64 + w.c_p[k] as f64 + w.c_m[k] as f64;
        }
    }
    format!(
        "pops=[{}] pos={:016x} en={:016x} mn={:016x} g={:016x} v={:016x} misc={:016x} \
M={:016x} det={:016x} field={:016x} corpse={:016x} rng={} tick={} n={} cN={} free={} log={}",
        pops.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(","),
        sx.to_bits(), se.to_bits(), sm.to_bits(), sg.to_bits(), sv.to_bits(), sh.to_bits(),
        fm.to_bits(), fd.to_bits(), fs.to_bits(), cm.to_bits(),
        w.rng.state, w.tick, w.n, w.c_n, w.free_list.len(), w.event_log.len()
    )
}

fn main() {
    let mut fails = 0;

    // A world with some history in it: events applied, walls built, a warm source, mutation on —
    // so the snapshot has to carry more than positions.
    let build = |sim: &mut Sim| {
        sim.p.mutation = true;
        sim.reset_world();
        sim.init_world(Some(11), None);
        for t in 1..=1200 {
            match t {
                100 => sim.queue_event(Event::Fertilize { x: 300.0, y: 400.0, amount: 50.0 }),
                200 => sim.queue_event(Event::SourceAdd {
                    x: 200.0, y: 200.0, i: Some(0.8), a: Some(5.0), sigma: Some(150.0), at: None }),
                300 => sim.queue_event(Event::WallAdd {
                    spec: WallSpec { x0: 400.0, y0: 100.0, dx: 0.0, dy: 500.0,
                        lt: 0.2, ht: 0.5, fl: 0.1, pass: 0 }, at: None }),
                400 => sim.queue_event(Event::SpawnPack { sp: 2, x: 500.0, y: 500.0 }),
                500 => sim.queue_event(Event::LightMul { v: 0.8 }),
                _ => {}
            }
            sim.step();
        }
    };

    // 1. the uninterrupted reference
    let mut a = Sim::new();
    build(&mut a);
    let at_save = state_hash(&a);
    let bytes = a.save();
    for _ in 0..2000 {
        a.step();
    }
    let reference = state_hash(&a);

    // 2. load into a FRESH sim and run the same 2,000 ticks
    let mut b = Sim::new();
    match b.load(&bytes) {
        Ok(()) => {}
        Err(e) => {
            println!("  load FAILED: {}", e);
            std::process::exit(1);
        }
    }
    let restored = state_hash(&b);
    for _ in 0..2000 {
        b.step();
    }
    let resumed = state_hash(&b);

    println!("SNAPSHOT CHECK ({} bytes for a 1,200-tick world)", bytes.len());
    let check = |label: &str, x: &str, y: &str, fails: &mut i32| {
        if x == y {
            println!("  {:<44} identical", label);
        } else {
            println!("  {:<44} DIFFERS\n    saved:   {}\n    loaded:  {}", label, x, y);
            *fails += 1;
        }
    };
    check("state at save == state after load", &at_save, &restored, &mut fails);
    check("resumed 2,000 ticks == uninterrupted", &reference, &resumed, &mut fails);

    // 3. a save of the loaded world must be byte-identical to the original save: anything the
    //    format drops would show up here as a difference the state hash cannot see.
    let mut c = Sim::new();
    c.load(&bytes).unwrap();
    let round = c.save();
    if round == bytes {
        println!("  {:<44} identical", "re-save is byte-identical");
    } else {
        println!("  {:<44} DIFFERS ({} vs {} bytes)", "re-save is byte-identical", round.len(), bytes.len());
        fails += 1;
    }

    // 5. the running experiment rides the snapshot (version 2). L7 "outpost" is the richest
    //    runtime — a scripted sunrise (fired), region census ring (rg), pour budget — and its
    //    null run fails at the deadline, so resuming must reproduce the exact verdict, not just
    //    world bytes. Save mid-run, load into a fresh sim, drive both the way every caller
    //    drives a level (script, step, check), and require identical level state throughout.
    {
        let lvl_hash = |sim: &Sim| {
            let l = &sim.lvl;
            let mut rg = 0.0f64;
            for v in &l.rg {
                rg += v;
            }
            format!(
                "def={} state={:?} run={} seenS={} pred={} pour={} mem={:?} fired={} src0={} rgS={} rg={:016x}",
                l.def, l.state, l.run, l.seen_s, l.predicted, l.pour_left, l.mem, l.fired,
                l.src0, l.rg_s, rg.to_bits()
            )
        };
        let idx = microcosm_core::levels_gen::LEVELS
            .iter()
            .position(|d| d.key == "outpost")
            .expect("the shipped table carries L7");
        let drive = |sim: &mut Sim, to: i64| {
            while sim.w.tick < to {
                sim.level_script();
                sim.step();
                sim.level_check();
            }
        };
        let mut a = Sim::new();
        a.level_start(idx, 1);
        drive(&mut a, 3_000); // past the scripted sunrise, region ring filling
        let lvl_at_save = lvl_hash(&a);
        let bytes = a.save();
        drive(&mut a, 12_500); // across the deadline: the null run settles its verdict
        let reference = (lvl_hash(&a), a.lvl.fail_why, state_hash(&a));

        let mut b = Sim::new();
        b.load(&bytes).expect("level snapshot loads");
        check("level state at save == after load", &lvl_at_save, &lvl_hash(&b), &mut fails);
        drive(&mut b, 12_500);
        let resumed = (lvl_hash(&b), b.lvl.fail_why, state_hash(&b));
        check("resumed level verdict == uninterrupted", &reference.0, &resumed.0, &mut fails);
        check("resumed fail reason == uninterrupted", reference.1, resumed.1, &mut fails);
        check("resumed level world == uninterrupted", &reference.2, &resumed.2, &mut fails);

        let mut c = Sim::new();
        c.load(&bytes).unwrap();
        if c.save() == bytes {
            println!("  {:<44} identical", "level re-save is byte-identical");
        } else {
            println!("  {:<44} DIFFERS", "level re-save is byte-identical");
            fails += 1;
        }
    }

    // 6. a version-1 file (no level section) still loads — the owner's existing saves survive
    //    the format bump. Built from a sandbox save: strip the trailing "no level" byte and
    //    stamp the old version.
    {
        let mut v1 = bytes.clone();
        assert_eq!(*v1.last().unwrap(), 0u8, "a sandbox save ends with the empty level section");
        v1.pop();
        v1[4..8].copy_from_slice(&1u32.to_le_bytes());
        let mut d = Sim::new();
        match d.load(&v1) {
            Ok(()) => {
                let sandbox = d.lvl.def < 0;
                println!(
                    "  {:<44} {}",
                    "version-1 file loads, sandbox",
                    if sandbox { "identical" } else { "LEVEL SET — should be idle" }
                );
                if !sandbox {
                    fails += 1;
                }
            }
            Err(e) => {
                println!("  {:<44} REFUSED ({})", "version-1 file loads, sandbox", e);
                fails += 1;
            }
        }
    }

    // 4. refusals: a snapshot must not half-load
    let mut d = Sim::new();
    let mut bad = bytes.clone();
    bad[0] = b'X';
    match d.load(&bad) {
        Err(e) => println!("  {:<44} refused ({})", "corrupt magic", e),
        Ok(()) => { println!("  {:<44} ACCEPTED — should have refused", "corrupt magic"); fails += 1; }
    }
    match d.load(&bytes[..bytes.len() / 2]) {
        Err(e) => println!("  {:<44} refused ({})", "truncated file", e),
        Ok(()) => { println!("  {:<44} ACCEPTED — should have refused", "truncated file"); fails += 1; }
    }

    // Optional: write the snapshot out, so its on-disk and compressed size can be measured.
    if let Some(path) = std::env::args().nth(1) {
        std::fs::write(&path, &bytes).expect("write snapshot");
        println!("  wrote {} ({} bytes)", path, bytes.len());
    }

    println!(
        "{}",
        if fails == 0 { "SNAPSHOT CHECK PASS" } else { "SNAPSHOT CHECK FAIL" }
    );
    std::process::exit(if fails == 0 { 0 } else { 1 });
}
