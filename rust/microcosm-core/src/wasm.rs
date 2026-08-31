//! The C ABI the WASM build exposes, so `MC_CORE` can point every existing harness at this core
//! (docs/android-port-plan.md §3). Deliberately tiny and untyped: pointers into the world's
//! structure-of-arrays, plus scalar get/set by id. The JavaScript shim (`rust/wasm/core.js`) builds
//! typed-array views over those pointers and presents the same module surface as `dist/core.js`,
//! so `tune2`, the gates and the experiments run unchanged.
//!
//! The organism and field columns are allocated once and never resized, so views over them stay
//! valid; the growable structures (event log, free list, sources, walls) are reached through
//! scalars and calls instead. WASM memory can still grow when those allocate, which detaches the
//! JavaScript views — the shim re-creates them whenever the buffer identity changes.

use crate::events::{Event, LocusKey};
use crate::Sim;

static mut SIM: *mut Sim = core::ptr::null_mut();

#[allow(static_mut_refs)]
fn s() -> &'static mut Sim {
    unsafe {
        if SIM.is_null() {
            SIM = Box::into_raw(Box::new(Sim::new()));
        }
        &mut *SIM
    }
}

#[no_mangle]
pub extern "C" fn mc_boot() {
    let _ = s();
}

#[no_mangle]
pub extern "C" fn mc_reset() {
    s().reset_world();
}

/// `initWorld(seed, sc)`. `has_seed == 0` means "use P.SEED", matching `seed === undefined`.
#[no_mangle]
pub extern "C" fn mc_init(seed: i32, has_seed: i32) {
    let sim = s();
    if has_seed != 0 {
        sim.init_world(Some(seed), None);
    } else {
        sim.init_world(None, None);
    }
}

/// Scenario founding: counts per species (negative = "not overridden") and an optional M0.
#[no_mangle]
pub extern "C" fn mc_init_scenario(
    seed: i32,
    has_seed: i32,
    f0: i32,
    f1: i32,
    f2: i32,
    f3: i32,
    f4: i32,
    f5: i32,
    f6: i32,
    m0: f64,
    has_m0: i32,
) {
    let counts = [f0, f1, f2, f3, f4, f5, f6];
    let mut sc = crate::Scenario::default();
    for (i, c) in counts.iter().enumerate() {
        sc.found[i] = if *c >= 0 { Some(*c) } else { None };
    }
    sc.m0 = if has_m0 != 0 { Some(m0) } else { None };
    let sim = s();
    if has_seed != 0 {
        sim.init_world(Some(seed), Some(&sc));
    } else {
        sim.init_world(None, Some(&sc));
    }
}

#[no_mangle]
pub extern "C" fn mc_step() {
    s().step();
}

/// Pointer to an array column, by id. Ids are mirrored in the shim's layout table.
#[no_mangle]
pub extern "C" fn mc_ptr(id: i32) -> u32 {
    let sim = s();
    let w = &mut sim.w;
    let p: *const u8 = match id {
        0 => w.x.as_ptr() as *const u8,
        1 => w.y.as_ptr() as *const u8,
        2 => w.vx.as_ptr() as *const u8,
        3 => w.vy.as_ptr() as *const u8,
        4 => w.en.as_ptr() as *const u8,
        5 => w.sz.as_ptr() as *const u8,
        6 => w.sp.as_ptr() as *const u8,
        7 => w.alive.as_ptr() as *const u8,
        8 => w.hd.as_ptr() as *const u8,
        9 => w.mn.as_ptr() as *const u8,
        10 => w.pr.as_ptr() as *const u8,
        11 => w.mem.as_ptr() as *const u8,
        12 => w.g.as_ptr() as *const u8,
        13 => w.cy.as_ptr() as *const u8,
        14 => w.gr.as_ptr() as *const u8,
        15 => w.handle.as_ptr() as *const u8,
        16 => w.cd.as_ptr() as *const u8,
        17 => w.flee.as_ptr() as *const u8,
        18 => w.bst.as_ptr() as *const u8,
        19 => w.pc.as_ptr() as *const u8,
        20 => w.lg.as_ptr() as *const u8,
        21 => w.gen.as_ptr() as *const u8,
        22 => w.birth.as_ptr() as *const u8,
        23 => w.sz_pow.as_ptr() as *const u8,
        24 => w.px.as_ptr() as *const u8,
        25 => w.py.as_ptr() as *const u8,
        30 => w.m.as_ptr() as *const u8,
        31 => w.d_e.as_ptr() as *const u8,
        32 => w.d_p.as_ptr() as *const u8,
        33 => w.d_m.as_ptr() as *const u8,
        34 => w.sc.as_ptr() as *const u8,
        35 => w.al.as_ptr() as *const u8,
        36 => w.light.as_ptr() as *const u8,
        37 => w.temp.as_ptr() as *const u8,
        38 => w.q_r.as_ptr() as *const u8,
        39 => w.q_p.as_ptr() as *const u8,
        40 => w.q_d.as_ptr() as *const u8,
        41 => w.q_h.as_ptr() as *const u8,
        42 => w.q_s.as_ptr() as *const u8,
        43 => w.q_a.as_ptr() as *const u8,
        44 => w.p_b.as_ptr() as *const u8,
        45 => w.b_b.as_ptr() as *const u8,
        46 => w.f_b.as_ptr() as *const u8,
        47 => w.lgx.as_ptr() as *const u8,
        48 => w.lgy.as_ptr() as *const u8,
        49 => w.tgx.as_ptr() as *const u8,
        50 => w.tgy.as_ptr() as *const u8,
        51 => w.w_shade.as_ptr() as *const u8,
        60 => w.c_alive.as_ptr() as *const u8,
        61 => w.c_x.as_ptr() as *const u8,
        62 => w.c_y.as_ptr() as *const u8,
        63 => w.c_e.as_ptr() as *const u8,
        64 => w.c_p.as_ptr() as *const u8,
        65 => w.c_m.as_ptr() as *const u8,
        66 => w.c_sz.as_ptr() as *const u8,
        67 => w.c_sp.as_ptr() as *const u8,
        _ => core::ptr::null(),
    };
    p as u32
}

/// Scalar reads. Everything the harnesses reach through `W.` or `P.` that is not a column.
#[no_mangle]
pub extern "C" fn mc_scalar(id: i32) -> f64 {
    let sim = s();
    let w = &sim.w;
    let f = &w.flows;
    match id {
        0 => w.n as f64,
        1 => w.tick as f64,
        2 => w.c_n as f64,
        3 => w.rng.state as f64,
        4 => w.added_m,
        5 => if w.initialized { 1.0 } else { 0.0 },
        6 => if w.walls_on { 1.0 } else { 0.0 },
        7 => w.sources.len() as f64,
        8 => w.walls.len() as f64,
        9 => w.event_log.len() as f64,
        10 => w.seed as f64,
        11 => w.free_list.len() as f64,
        12 => if w.light_dirty { 1.0 } else { 0.0 },
        13 => sim.obs.head as f64,
        14 => sim.obs.count as f64,
        20 => f.uptake,
        21 => f.release,
        22 => f.excrete,
        23 => f.transfer,
        24 => f.egest_e,
        25 => f.egest_p,
        26 => f.leach_m,
        27 => f.corpse_to_det,
        28 => f.bac_release,
        29 => f.gpp,
        30 => f.resp,
        31 => f.deaths,
        32..=38 => f.deaths_by[(id - 32) as usize],
        50 => if sim.p.mutation { 1.0 } else { 0.0 },
        51 => sim.p.light_mul,
        52 => sim.p.temp_amb,
        53 => if sim.p.spawn_decomposers { 1.0 } else { 0.0 },
        54 => sim.p.seed as f64,
        _ => f64::NAN,
    }
}

/// Scalar writes — only the settings the harnesses actually poke.
#[no_mangle]
pub extern "C" fn mc_set_scalar(id: i32, v: f64) {
    let sim = s();
    match id {
        50 => sim.p.mutation = v != 0.0,
        51 => sim.p.light_mul = v,
        52 => sim.p.temp_amb = v,
        53 => sim.p.spawn_decomposers = v != 0.0,
        54 => sim.p.seed = v as i32,
        3 => sim.w.rng.state = v as i32,
        _ => {}
    }
}

fn locus_key(k: i32) -> Option<LocusKey> {
    Some(match k {
        0 => LocusKey::Sigma,
        1 => LocusKey::Curve,
        2 => LocusKey::EscSlope,
        3 => LocusKey::KpSlope,
        4 => LocusKey::CatchSlope,
        5 => LocusKey::KbSlope,
        6 => LocusKey::LightSlope,
        7 => LocusKey::RateSlope,
        8 => LocusKey::EffSlope,
        9 => LocusKey::WarmSlope,
        10 => LocusKey::WarmGainSlope,
        11 => LocusKey::TprefSpan,
        12 => LocusKey::DampSpan,
        13 => LocusKey::PcSpeedSlope,
        14 => LocusKey::PcTurnSlope,
        15 => LocusKey::TumbleSlope,
        _ => return None,
    })
}

/// Read a locus field. Backing the shim's TRAITS accessors with these keeps the JavaScript mirror
/// from going stale when `init_world` restores the shipped sigma/curve.
#[no_mangle]
pub extern "C" fn mc_locus_get(sp: i32, k: i32, key: i32) -> f64 {
    let sim = s();
    let (sp, k) = (sp as usize, k as usize);
    if sp >= sim.tr.len() || k >= sim.tr[sp].loci.len() {
        return f64::NAN;
    }
    let l = &sim.tr[sp].loci[k];
    match key {
        16 => l.g0,
        17 => if l.warm_gated { 1.0 } else { 0.0 },
        _ => match locus_key(key) {
            Some(LocusKey::Sigma) => l.sigma,
            Some(LocusKey::Curve) => l.curve,
            Some(LocusKey::EscSlope) => l.esc_slope,
            Some(LocusKey::KpSlope) => l.kp_slope,
            Some(LocusKey::CatchSlope) => l.catch_slope,
            Some(LocusKey::KbSlope) => l.kb_slope,
            Some(LocusKey::LightSlope) => l.light_slope,
            Some(LocusKey::RateSlope) => l.rate_slope,
            Some(LocusKey::EffSlope) => l.eff_slope,
            Some(LocusKey::WarmSlope) => l.warm_slope,
            Some(LocusKey::WarmGainSlope) => l.warm_gain_slope,
            Some(LocusKey::TprefSpan) => l.tpref_span,
            Some(LocusKey::DampSpan) => l.damp_span,
            Some(LocusKey::PcSpeedSlope) => l.pc_speed_slope,
            Some(LocusKey::PcTurnSlope) => l.pc_turn_slope,
            Some(LocusKey::TumbleSlope) => l.tumble_slope,
            None => f64::NAN,
        },
    }
}

/// Write a locus field RAW — no clamping. This mirrors a harness assigning to
/// `TRAITS[sp].loci[k].warmSlope` directly; the `locus` EVENT clamps, and goes through
/// `mc_event_locus` instead.
#[no_mangle]
pub extern "C" fn mc_locus_set(sp: i32, k: i32, key: i32, v: f64) {
    let sim = s();
    let (sp, k) = (sp as usize, k as usize);
    if sp >= sim.tr.len() || k >= sim.tr[sp].loci.len() {
        return;
    }
    let l = &mut sim.tr[sp].loci[k];
    match locus_key(key) {
        Some(LocusKey::Sigma) => l.sigma = v,
        Some(LocusKey::Curve) => l.curve = v,
        Some(LocusKey::EscSlope) => l.esc_slope = v,
        Some(LocusKey::KpSlope) => l.kp_slope = v,
        Some(LocusKey::CatchSlope) => l.catch_slope = v,
        Some(LocusKey::KbSlope) => l.kb_slope = v,
        Some(LocusKey::LightSlope) => l.light_slope = v,
        Some(LocusKey::RateSlope) => l.rate_slope = v,
        Some(LocusKey::EffSlope) => l.eff_slope = v,
        Some(LocusKey::WarmSlope) => l.warm_slope = v,
        Some(LocusKey::WarmGainSlope) => l.warm_gain_slope = v,
        Some(LocusKey::TprefSpan) => l.tpref_span = v,
        Some(LocusKey::DampSpan) => l.damp_span = v,
        Some(LocusKey::PcSpeedSlope) => l.pc_speed_slope = v,
        Some(LocusKey::PcTurnSlope) => l.pc_turn_slope = v,
        Some(LocusKey::TumbleSlope) => l.tumble_slope = v,
        None => {}
    }
}

/// Species-level fields a harness sets directly (heat.js zeroes and restores `thermo`).
#[no_mangle]
pub extern "C" fn mc_trait_get(sp: i32, key: i32) -> f64 {
    let sim = s();
    let sp = sp as usize;
    if sp >= sim.tr.len() {
        return f64::NAN;
    }
    let t = &sim.tr[sp];
    match key {
        0 => t.thermo,
        1 => t.topt,
        2 => t.ctmax,
        _ => f64::NAN,
    }
}

#[no_mangle]
pub extern "C" fn mc_trait_set(sp: i32, key: i32, v: f64) {
    let sim = s();
    let sp = sp as usize;
    if sp >= sim.tr.len() {
        return;
    }
    match key {
        0 => sim.tr[sp].thermo = v,
        1 => sim.tr[sp].topt = v,
        2 => sim.tr[sp].ctmax = v,
        _ => {}
    }
}

// ---------- events ----------
// One entry point per event type keeps the ABI free of any serialization format, and keeps the
// clamping and coalescing rules where they belong: in events.rs.

#[no_mangle]
pub extern "C" fn mc_event_fertilize(x: f64, y: f64, amount: f64, queue: i32) {
    push(Event::Fertilize { x, y, amount }, queue);
}

#[no_mangle]
pub extern "C" fn mc_event_light_mul(v: f64, queue: i32) {
    push(Event::LightMul { v }, queue);
}

#[no_mangle]
pub extern "C" fn mc_event_mutation(v: i32, queue: i32) {
    push(Event::Mutation { v: v != 0 }, queue);
}

#[no_mangle]
pub extern "C" fn mc_event_spawn_pack(sp: i32, x: f64, y: f64, queue: i32) {
    push(
        Event::SpawnPack {
            sp: sp as usize,
            x,
            y,
        },
        queue,
    );
}

#[no_mangle]
pub extern "C" fn mc_event_locus(sp: i32, locus: i32, key: i32, v: f64, queue: i32) {
    if let Some(k) = locus_key(key) {
        push(
            Event::Locus {
                sp: sp as usize,
                locus: locus as usize,
                key: k,
                v,
            },
            queue,
        );
    }
}

#[no_mangle]
pub extern "C" fn mc_event_source(k: i32, x: f64, y: f64, queue: i32) {
    push(
        Event::Source {
            k: k as usize,
            x,
            y,
        },
        queue,
    );
}

/// `has_*` flags distinguish an omitted optional field from a provided zero.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn mc_event_source_add(
    x: f64,
    y: f64,
    i: f64,
    has_i: i32,
    a: f64,
    has_a: i32,
    sigma: f64,
    has_sigma: i32,
    at: i32,
    queue: i32,
) {
    push(
        Event::SourceAdd {
            x,
            y,
            i: if has_i != 0 { Some(i) } else { None },
            a: if has_a != 0 { Some(a) } else { None },
            sigma: if has_sigma != 0 { Some(sigma) } else { None },
            at: if at >= 0 { Some(at as usize) } else { None },
        },
        queue,
    );
}

#[no_mangle]
pub extern "C" fn mc_event_source_remove(k: i32, queue: i32) {
    push(Event::SourceRemove { k: k as usize }, queue);
}

#[no_mangle]
pub extern "C" fn mc_event_source_set(
    k: i32,
    i: f64,
    has_i: i32,
    a: f64,
    has_a: i32,
    sigma: f64,
    has_sigma: i32,
    queue: i32,
) {
    push(
        Event::SourceSet {
            k: k as usize,
            i: if has_i != 0 { Some(i) } else { None },
            a: if has_a != 0 { Some(a) } else { None },
            sigma: if has_sigma != 0 { Some(sigma) } else { None },
        },
        queue,
    );
}

#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn mc_event_wall_add(
    x0: f64,
    y0: f64,
    dx: f64,
    dy: f64,
    lt: f64,
    ht: f64,
    fl: f64,
    pass: i32,
    at: i32,
    queue: i32,
) {
    push(
        Event::WallAdd {
            spec: crate::fields::WallSpec {
                x0,
                y0,
                dx,
                dy,
                lt,
                ht,
                fl,
                pass,
            },
            at: if at >= 0 { Some(at as usize) } else { None },
        },
        queue,
    );
}

#[no_mangle]
pub extern "C" fn mc_event_wall_remove(k: i32, queue: i32) {
    push(Event::WallRemove { k: k as usize }, queue);
}

#[no_mangle]
pub extern "C" fn mc_event_wall_set(
    k: i32,
    lt: f64,
    has_lt: i32,
    ht: f64,
    has_ht: i32,
    fl: f64,
    has_fl: i32,
    pass: i32,
    has_pass: i32,
    queue: i32,
) {
    push(
        Event::WallSet {
            k: k as usize,
            lt: if has_lt != 0 { Some(lt) } else { None },
            ht: if has_ht != 0 { Some(ht) } else { None },
            fl: if has_fl != 0 { Some(fl) } else { None },
            pass: if has_pass != 0 { Some(pass) } else { None },
        },
        queue,
    );
}

#[no_mangle]
pub extern "C" fn mc_event_feed(i: i32, gen: i32, frac: f64, queue: i32) {
    push(
        Event::Feed {
            i: i as usize,
            gen: gen as u16,
            frac,
        },
        queue,
    );
}

#[no_mangle]
pub extern "C" fn mc_event_kill(i: i32, gen: i32, queue: i32) {
    push(
        Event::Kill {
            i: i as usize,
            gen: gen as u16,
        },
        queue,
    );
}

fn push(ev: Event, queue: i32) {
    let sim = s();
    if queue != 0 {
        sim.queue_event(ev);
    } else {
        sim.apply_event(ev);
    }
}

// ---------- observatory ----------
// The recorder ring is allocated once, so a view over it stays valid. System events carry text,
// which crosses as a pointer+length into the String's own bytes — read it immediately, before any
// call that could push a new event and reallocate the vector.

#[no_mangle]
pub extern "C" fn mc_rec_ptr() -> u32 {
    s().obs.rec.as_ptr() as u32
}

#[no_mangle]
pub extern "C" fn mc_sysev_count() -> u32 {
    s().obs.sys_events.len() as u32
}

/// `field`: 0 tick, 1 species, 2 locus plane (-1 when the event carries none).
#[no_mangle]
pub extern "C" fn mc_sysev_num(i: u32, field: i32) -> f64 {
    let sim = s();
    let i = i as usize;
    if i >= sim.obs.sys_events.len() {
        return f64::NAN;
    }
    let e = &sim.obs.sys_events[i];
    match field {
        0 => e.tick as f64,
        1 => e.sp as f64,
        2 => e.locus.map_or(-1.0, |v| v as f64),
        _ => f64::NAN,
    }
}

/// `which`: 0 the event type, 1 the narration text. UTF-8 bytes.
#[no_mangle]
pub extern "C" fn mc_sysev_ptr(i: u32, which: i32) -> u32 {
    let sim = s();
    let i = i as usize;
    if i >= sim.obs.sys_events.len() {
        return 0;
    }
    let e = &sim.obs.sys_events[i];
    if which == 0 { e.kind.as_ptr() as u32 } else { e.text.as_ptr() as u32 }
}

#[no_mangle]
pub extern "C" fn mc_sysev_len(i: u32, which: i32) -> u32 {
    let sim = s();
    let i = i as usize;
    if i >= sim.obs.sys_events.len() {
        return 0;
    }
    let e = &sim.obs.sys_events[i];
    if which == 0 { e.kind.len() as u32 } else { e.text.len() as u32 }
}

/// A source's fields, for the shim's `W.sources` mirror. `field`: 0 x, 1 y, 2 i, 3 a, 4 sigma.
#[no_mangle]
pub extern "C" fn mc_source_get(k: i32, field: i32) -> f64 {
    let sim = s();
    let k = k as usize;
    if k >= sim.w.sources.len() {
        return f64::NAN;
    }
    let s = sim.w.sources[k];
    match field {
        0 => s.x,
        1 => s.y,
        2 => s.i,
        3 => s.a,
        4 => s.sigma,
        _ => f64::NAN,
    }
}

/// A wall's fields. `field`: 0 x0, 1 y0, 2 dx, 3 dy, 4 lt, 5 ht, 6 fl, 7 pass, 8 face count.
#[no_mangle]
pub extern "C" fn mc_wall_get(k: i32, field: i32) -> f64 {
    let sim = s();
    let k = k as usize;
    if k >= sim.w.walls.len() {
        return f64::NAN;
    }
    let w = &sim.w.walls[k];
    match field {
        0 => w.x0,
        1 => w.y0,
        2 => w.dx,
        3 => w.dy,
        4 => w.lt,
        5 => w.ht,
        6 => w.fl,
        7 => w.pass as f64,
        8 => w.faces.len() as f64,
        _ => f64::NAN,
    }
}

// ---------- indicators ----------
// Assembled field by field rather than serialized: the shape is small and fixed, and this keeps
// the ABI free of any encoding the two sides could disagree about.

/// 1 when `indicators()` would return an object at all (recCount >= 2).
#[no_mangle]
pub extern "C" fn mc_ind_ok() -> i32 {
    let sim = s();
    if sim.obs.indicators(&sim.p, &sim.tr, &sim.reg).is_some() { 1 } else { 0 }
}

/// Scalar fields: 0 adaptability, 1 variety, 2 prodVsCons, 3 recyclingMin, 4 lockedPct,
/// 5-8 pyramid (producers, grazers, decomposers, predators). NaN means JavaScript `null`.
#[no_mangle]
pub extern "C" fn mc_ind_num(field: i32) -> f64 {
    let sim = s();
    let ind = match sim.obs.indicators(&sim.p, &sim.tr, &sim.reg) {
        Some(v) => v,
        None => return f64::NAN,
    };
    match field {
        0 => ind.adaptability.unwrap_or(f64::NAN),
        1 => ind.variety,
        2 => ind.prod_vs_cons,
        3 => ind.recycling_min.unwrap_or(f64::NAN),
        4 => ind.locked_pct,
        5..=8 => ind.pyramid[(field - 5) as usize],
        _ => f64::NAN,
    }
}

/// Per-species strain: 0 present, 1 level, 2 reserve, 3 trend, 4 popTrend, 5 has-advisory,
/// 6 dAc1, 7 varX.
#[no_mangle]
pub extern "C" fn mc_ind_strain(sp: i32, field: i32) -> f64 {
    let sim = s();
    let ind = match sim.obs.indicators(&sim.p, &sim.tr, &sim.reg) {
        Some(v) => v,
        None => return f64::NAN,
    };
    let sp = sp as usize;
    if sp >= 7 {
        return f64::NAN;
    }
    match ind.strain[sp] {
        None => {
            if field == 0 { 0.0 } else { f64::NAN }
        }
        Some(st) => match field {
            0 => 1.0,
            1 => st.level as f64,
            2 => st.reserve,
            3 => st.trend,
            4 => st.pop_trend,
            5 => if st.adv.is_some() { 1.0 } else { 0.0 },
            6 => st.adv.map_or(f64::NAN, |a| a.0),
            7 => st.adv.map_or(f64::NAN, |a| a.1),
            _ => f64::NAN,
        },
    }
}

/// Venator read-out: 0 present, 1 reserve, 2 preyLossRate.
#[no_mangle]
pub extern "C" fn mc_ind_venator(field: i32) -> f64 {
    let sim = s();
    let ind = match sim.obs.indicators(&sim.p, &sim.tr, &sim.reg) {
        Some(v) => v,
        None => return f64::NAN,
    };
    match (ind.venator, field) {
        (None, 0) => 0.0,
        (Some(_), 0) => 1.0,
        (Some(v), 1) => v.0,
        (Some(v), 2) => v.1,
        _ => f64::NAN,
    }
}

/// Recompute the light field (and its gradients). Needed when a harness changes `P.lightMul` or
/// `P.tempAmb` directly rather than through an event — the events already recompute for themselves.
#[no_mangle]
pub extern "C" fn mc_compute_light() {
    let sim = s();
    crate::fields::compute_light(&mut sim.w, &sim.p);
}

/// Recompute the warmth field, its gradients and the per-cell Q10 tables.
#[no_mangle]
pub extern "C" fn mc_compute_temp() {
    let sim = s();
    crate::fields::compute_temp(&mut sim.w, &sim.p);
}
