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
pub extern "C" fn mc_ptr(id: i32) -> usize {
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
        26 => w.ppx.as_ptr() as *const u8,
        27 => w.ppy.as_ptr() as *const u8,
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
    p as usize
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
pub extern "C" fn mc_rec_ptr() -> usize {
    s().obs.rec.as_ptr() as usize
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
pub extern "C" fn mc_sysev_ptr(i: u32, which: i32) -> usize {
    let sim = s();
    let i = i as usize;
    if i >= sim.obs.sys_events.len() {
        return 0;
    }
    let e = &sim.obs.sys_events[i];
    if which == 0 { e.kind.as_ptr() as usize } else { e.text.as_ptr() as usize }
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

// ---------------------------------------------------------------------------
// The level API (Phase 8). Definitions travel as JSON — one string, parsed once by the shim —
// because the player text is the bulk of a level and marshalling it field by field would buy
// nothing. Everything the runtime decides (state, meters, the pour budget) crosses as numbers.

/// The level table, verbatim from `src/observatory/levels.json`. UTF-8 bytes.
#[no_mangle]
pub extern "C" fn mc_levels_json_ptr() -> usize {
    crate::levels_gen::LEVELS_JSON.as_ptr() as usize
}

#[no_mangle]
pub extern "C" fn mc_levels_json_len() -> u32 {
    crate::levels_gen::LEVELS_JSON.len() as u32
}

#[no_mangle]
pub extern "C" fn mc_level_count() -> u32 {
    crate::levels_gen::LEVELS.len() as u32
}

/// `levelStart(def, predicted)`. `predicted` is -1 when the prediction step was skipped.
#[no_mangle]
pub extern "C" fn mc_level_start(idx: i32, predicted: i32) {
    if idx >= 0 && (idx as usize) < crate::levels_gen::LEVELS.len() {
        s().level_start(idx as usize, predicted);
    }
}

#[no_mangle]
pub extern "C" fn mc_level_restart() {
    s().level_restart();
}

#[no_mangle]
pub extern "C" fn mc_level_stop() {
    s().level_stop();
}

fn state_code(st: crate::levels::LvlState) -> i32 {
    match st {
        crate::levels::LvlState::Idle => 0,
        crate::levels::LvlState::Running => 1,
        crate::levels::LvlState::Passed => 2,
        crate::levels::LvlState::Failed => 3,
    }
}

/// Run the verdict loop and return the state: 0 idle, 1 running, 2 passed, 3 failed.
#[no_mangle]
pub extern "C" fn mc_level_check() -> i32 {
    state_code(s().level_check())
}

/// `field`: 0 state code, 1 level index (-1 outside a level), 2 run, 3 seenS, 4 predicted,
/// 5 pours left (-1 unlimited).
#[no_mangle]
pub extern "C" fn mc_level_num(field: i32) -> f64 {
    let l = &s().lvl;
    match field {
        0 => state_code(l.state) as f64,
        1 => l.def as f64,
        2 => l.run as f64,
        3 => l.seen_s as f64,
        4 => l.predicted as f64,
        5 => l.pour_left as f64,
        _ => f64::NAN,
    }
}

#[no_mangle]
pub extern "C" fn mc_level_fail_why_ptr() -> usize {
    s().lvl.fail_why.as_ptr() as usize
}

#[no_mangle]
pub extern "C" fn mc_level_fail_why_len() -> u32 {
    s().lvl.fail_why.len() as u32
}

/// `what`: 0 pours, 1 seed, 2 sources, 3 walls, 4 evolution.
#[no_mangle]
pub extern "C" fn mc_level_allows(what: i32) -> i32 {
    use crate::levels::Apparatus::*;
    let a = match what {
        0 => Pours,
        1 => Seed,
        2 => Sources,
        3 => Walls,
        4 => Evolution,
        _ => return 0,
    };
    s().level_allows(a) as i32
}

/// F4+F5: the level's per-tick hook — scripted events plus the region census. Call before
/// every `mc_step` while a level runs; idempotent within a tick.
#[no_mangle]
pub extern "C" fn mc_level_script() {
    s().level_script();
}

/// Per-source lock (L7): 1 when source `k` may be selected, edited, moved or removed.
#[no_mangle]
pub extern "C" fn mc_level_allows_source(k: i32) -> i32 {
    if k < 0 {
        return 0;
    }
    s().level_allows_source(k as usize) as i32
}

#[no_mangle]
pub extern "C" fn mc_level_pour_ok() -> i32 {
    s().level_pour_ok() as i32
}

#[no_mangle]
pub extern "C" fn mc_level_note_pour(d: i32) {
    s().level_note_pour(d);
}

/// Index into `W.sysEvents` of the freshest event this level narrates, or -1.
#[no_mangle]
pub extern "C" fn mc_level_narration() -> i32 {
    let sim = s();
    let def = match sim.lvl.def() {
        Some(d) => d,
        None => return -1,
    };
    for (i, e) in sim.obs.sys_events.iter().enumerate().rev() {
        if def.narrate.iter().any(|t| *t == e.kind) {
            return i as i32;
        }
    }
    -1
}

/// One evaluated meter row of the running level. `field`: 0 value, 1 has-goal, 2 goal, 3 dir.
/// Labels and units come from the level JSON, so they cross the boundary once, not per frame.
#[no_mangle]
pub extern "C" fn mc_level_meter(row: u32, field: i32) -> f64 {
    let rows = s().level_meter();
    let r = match rows.get(row as usize) {
        Some(r) => r,
        None => return f64::NAN,
    };
    match field {
        0 => r.v,
        1 => r.goal.is_some() as i32 as f64,
        2 => r.goal.unwrap_or(f64::NAN),
        3 => r.dir as f64,
        _ => f64::NAN,
    }
}

// ---------------------------------------------------------------------------
// The frame builder (M5.1). The display list crosses as raw f64 buffers the shell reads directly
// out of linear memory; the small vector lists (glows, wall strokes) cross field by field, since
// they are read once per layer redraw rather than per frame.

/// `W.px.set(W.x); W.py.set(W.y)` — the shell marks the previous tick's positions before stepping,
/// so a frame can interpolate between ticks. Deliberately NOT done inside the tick: `px`/`py` are
/// the renderer's, and moving them into `step()` would change what the frozen oracle does.
#[no_mangle]
pub extern "C" fn mc_mark_prev() {
    let sim = s();
    // shift the pipeline: the GR.5 display spline reads two segments back
    let w = &mut sim.w;
    let n = w.px.len();
    for i in 0..n {
        w.ppx[i] = w.px[i];
        w.ppy[i] = w.py[i];
    }
    sim.w.px.copy_from_slice(&sim.w.x);
    sim.w.py.copy_from_slice(&sim.w.y);
}

/// Recompute the sprite bucket table from the current trait rows. A snapshot, like the browser's.
#[no_mangle]
pub extern "C" fn mc_frame_grammar_build() {
    let sim = s();
    sim.grammar = crate::frame::grammar(&sim.tr);
}

/// `field`: 0 tintPlane, 1 morphPlane, 2 outlinePlane, 3 roundPlane, 4 tN, 5 mN. Returns -1 for a
/// species with no grammar (every field), which is how the shell knows to use the plain sprite.
#[no_mangle]
pub extern "C" fn mc_frame_grammar(sp: i32, field: i32) -> f64 {
    let sim = s();
    let gr = match sim.grammar.get(sp as usize).and_then(|g| *g) {
        Some(gr) => gr,
        None => return -1.0,
    };
    match field {
        0 => gr.tint_plane as f64,
        1 => gr.morph_plane as f64,
        2 => gr.outline_plane as f64,
        3 => gr.round_plane as f64,
        4 => gr.t_n as f64,
        5 => gr.m_n as f64,
        _ => f64::NAN,
    }
}

/// One bucket's sprite parameters. `field`: 0 r, 1 g, 2 b, 3 shape (0 nucleus, 1 dot, 2 tri,
/// 3 square, 4 ray), 4 scale, 5 outline, 6 round.
#[no_mangle]
pub extern "C" fn mc_frame_spec(sp: i32, tb: i32, mb: i32, field: i32) -> f64 {
    use crate::frame::Shape::*;
    let sim = s();
    if sp < 0 || sp as usize >= sim.grammar.len() {
        return f64::NAN;
    }
    let spec = crate::frame::bucket_spec(&sim.grammar, sp as usize, tb.max(0) as usize, mb.max(0) as usize);
    match field {
        0 => spec.rgb[0] as f64,
        1 => spec.rgb[1] as f64,
        2 => spec.rgb[2] as f64,
        3 => match spec.shape {
            Nucleus => 0.0,
            Dot => 1.0,
            Tri => 2.0,
            Square => 3.0,
            Ray => 4.0,
        },
        4 => spec.scale,
        5 => spec.outline,
        6 => spec.round,
        _ => f64::NAN,
    }
}

/// Build one frame. `hidden` is a bitmask: bits 0-6 species, bit 7 debris, bits 8-9 the light and
/// heat layers (which the shell paints, not this).
#[allow(clippy::too_many_arguments)]
#[no_mangle]
pub extern "C" fn mc_frame_build(
    cam_x: f64,
    cam_y: f64,
    vw: f64,
    vh: f64,
    z: f64,
    hw: f64,
    hh: f64,
    alpha: f64,
    lod_z: f64,
    hidden: i32,
) {
    let sim = s();
    let mut h = [false; 10];
    for (k, v) in h.iter_mut().enumerate() {
        *v = hidden & (1 << k) != 0;
    }
    let v = crate::frame::View { cam_x, cam_y, vw, vh, z, hw, hh, alpha, lod_z };
    let Sim { frame, w, grammar, .. } = sim;
    crate::frame::frame_of(frame, w, grammar, &v, &h);
}

/// Frame-builder constants a shell would otherwise have to copy. `id`: 0 LOD_Z, 1 TINT_BINS,
/// 2 the organism record stride, 3 the corpse record stride.
#[no_mangle]
pub extern "C" fn mc_frame_const(id: i32) -> f64 {
    match id {
        0 => crate::frame::LOD_Z,
        1 => crate::frame::TINT_BINS as f64,
        2 => crate::frame::ORG_STRIDE as f64,
        3 => crate::frame::CORPSE_STRIDE as f64,
        _ => f64::NAN,
    }
}

#[no_mangle]
pub extern "C" fn mc_frame_org_ptr() -> usize {
    s().frame.org.as_ptr() as usize
}

#[no_mangle]
pub extern "C" fn mc_frame_corpse_ptr() -> usize {
    s().frame.corpse.as_ptr() as usize
}

/// `field`: 0 orgN, 1 corpseN, 2 mnBound, 10+sp population.
#[no_mangle]
pub extern "C" fn mc_frame_num(field: i32) -> f64 {
    let f = &s().frame;
    match field {
        0 => f.org_n as f64,
        1 => f.corpse_n as f64,
        2 => f.mn_bound,
        10..=16 => f.pops[(field - 10) as usize] as f64,
        _ => f64::NAN,
    }
}

/// Fill the scratch field buffer and return a pointer to it. `which`: 0 mat carpet, 1 dissolved
/// mineral, 2 corpse pall, 3 wall shade. Always GRID*GRID*4 RGBA bytes.
#[no_mangle]
pub extern "C" fn mc_frame_field(which: i32) -> usize {
    let sim = s();
    let Sim { frame_field, w, tr, reg, .. } = sim;
    match which {
        0 => crate::frame::field_carpet(w, tr, reg, frame_field),
        1 => crate::frame::field_mineral(w, frame_field),
        2 => crate::frame::field_corpse_pall(w, frame_field),
        3 => crate::frame::field_shade(w, frame_field),
        _ => {}
    }
    frame_field.as_ptr() as usize
}

fn glow_list(which: i32) -> Vec<crate::frame::Glow> {
    let w = &s().w;
    if which == 0 { crate::frame::sun_glows(w) } else { crate::frame::heat_glows(w) }
}

fn mark_list(which: i32) -> Vec<crate::frame::Mark> {
    let w = &s().w;
    if which == 0 { crate::frame::sun_marks(w) } else { crate::frame::heat_marks(w) }
}

/// `which`: 0 sun glows, 1 heat glows, 2 sun marks, 3 heat marks.
/// The scratch field buffer's address, without filling it. A shell wraps this once and keeps it.
#[no_mangle]
pub extern "C" fn mc_frame_field_ptr() -> usize {
    s().frame_field.as_ptr() as usize
}

#[no_mangle]
pub extern "C" fn mc_frame_glow_count(which: i32) -> u32 {
    if which < 2 { glow_list(which).len() as u32 } else { mark_list(which - 2).len() as u32 }
}

/// `field`: 0 x, 1 y, 2 r, 3 a, 4 warm. Marks carry x, y and warm only.
#[no_mangle]
pub extern "C" fn mc_frame_glow(which: i32, k: u32, field: i32) -> f64 {
    if which < 2 {
        let l = glow_list(which);
        let g = match l.get(k as usize) {
            Some(g) => *g,
            None => return f64::NAN,
        };
        match field {
            0 => g.x,
            1 => g.y,
            2 => g.r,
            3 => g.a,
            4 => g.warm as i32 as f64,
            _ => f64::NAN,
        }
    } else {
        let l = mark_list(which - 2);
        let m = match l.get(k as usize) {
            Some(m) => *m,
            None => return f64::NAN,
        };
        match field {
            0 => m.x,
            1 => m.y,
            4 => m.warm as i32 as f64,
            _ => f64::NAN,
        }
    }
}

#[no_mangle]
pub extern "C" fn mc_frame_wall_count() -> u32 {
    crate::frame::wall_strokes(&s().w).len() as u32
}

/// `field`: 0 alpha, 1 dashed, 2 point count.
#[no_mangle]
pub extern "C" fn mc_frame_wall(k: u32, field: i32) -> f64 {
    let l = crate::frame::wall_strokes(&s().w);
    let wl = match l.get(k as usize) {
        Some(wl) => wl,
        None => return f64::NAN,
    };
    match field {
        0 => wl.a,
        1 => wl.dashed as i32 as f64,
        2 => wl.pts.len() as f64,
        _ => f64::NAN,
    }
}

#[no_mangle]
pub extern "C" fn mc_frame_wall_pt(k: u32, q: u32, axis: i32) -> f64 {
    let l = crate::frame::wall_strokes(&s().w);
    match l.get(k as usize).and_then(|wl| wl.pts.get(q as usize)) {
        Some(p) => if axis == 0 { p.0 } else { p.1 },
        None => f64::NAN,
    }
}

// ---------------------------------------------------------------------------
// Selection and read-out (M5.1 A.2). The tap radius and the tie-breaking are grammar — which
// organism a thumb lands on must not differ between platforms — so they live in frame.rs and this
// only carries the answers across.

/// Candidates within `rad` of a world point, nearest first. Returns how many.
#[no_mangle]
pub extern "C" fn mc_pick(wx: f64, wy: f64, rad: f64) -> u32 {
    let sim = s();
    let Sim { frame, w, .. } = sim;
    crate::frame::pick(w, wx, wy, rad, &mut frame.cand);
    frame.cand.len() as u32
}

/// The tap radius for a zoom: `tight` after the loupe, loose for a thumb.
#[no_mangle]
pub extern "C" fn mc_pick_radius(z: f64, tight: i32) -> f64 {
    crate::frame::pick_radius(z, tight != 0)
}

/// `field`: 0 slot index, 1 generation, 2 species, 3 squared distance.
#[no_mangle]
pub extern "C" fn mc_pick_at(k: u32, field: i32) -> f64 {
    let sim = s();
    let (d2, i) = match sim.frame.cand.get(k as usize) {
        Some(v) => *v,
        None => return f64::NAN,
    };
    match field {
        0 => i as f64,
        1 => sim.w.gen[i] as f64,
        2 => sim.w.sp[i] as f64,
        3 => d2,
        _ => f64::NAN,
    }
}

/// The selection ring, projected through the view the last frame was built for.
/// `field`: 0 still valid (0/1), 1 sx, 2 sy, 3 radius.
#[no_mangle]
pub extern "C" fn mc_frame_sel(i: i32, gen: i32, field: i32) -> f64 {
    let sim = s();
    if i < 0 {
        return if field == 0 { 0.0 } else { f64::NAN };
    }
    let view = sim.frame.view;
    match crate::frame::sel_screen(&sim.w, i as usize, gen as u16, &view) {
        None => if field == 0 { 0.0 } else { f64::NAN },
        Some((sx, sy, r)) => match field {
            0 => 1.0,
            1 => sx,
            2 => sy,
            3 => r,
            _ => f64::NAN,
        },
    }
}

/// One organism's read-out, for the specimen card. `field`: 0 alive, 1 species, 2 generation,
/// 3 x, 4 y, 5 energy, 6 size, 7 bound mineral, 8 birth tick, 9 dormant, 10 heading,
/// 20+k genotype of locus plane k.
#[no_mangle]
pub extern "C" fn mc_org(i: i32, field: i32) -> f64 {
    let sim = s();
    if i < 0 || i as usize >= sim.w.n_slots() {
        return f64::NAN;
    }
    let i = i as usize;
    let w = &sim.w;
    match field {
        0 => w.alive[i] as f64,
        1 => w.sp[i] as f64,
        2 => w.gen[i] as f64,
        3 => w.x[i] as f64,
        4 => w.y[i] as f64,
        5 => w.en[i] as f64,
        6 => w.sz[i] as f64,
        7 => w.mn[i] as f64,
        8 => w.birth[i] as f64,
        9 => w.cy[i] as f64,
        10 => w.hd[i] as f64,
        20..=23 => w.g[(field - 20) as usize * crate::params::MAXN + i] as f64,
        _ => f64::NAN,
    }
}

/// Names come from the trait rows, not from a second table in each renderer. `which`: 0 the
/// species name; for a locus, 10+k the axis label, 20+k the high word, 30+k the low word.
fn trait_text(sp: i32, which: i32) -> &'static str {
    let sim = s();
    let t = match sim.tr.get(sp as usize) {
        Some(t) => t,
        None => return "",
    };
    if which == 0 {
        return t.name;
    }
    let (base, k) = (which / 10, (which % 10) as usize);
    match t.loci.get(k) {
        None => "",
        Some(l) => match base {
            1 => l.label,
            2 => l.hi_word,
            3 => l.lo_word,
            _ => "",
        },
    }
}

#[no_mangle]
pub extern "C" fn mc_trait_text_ptr(sp: i32, which: i32) -> usize {
    trait_text(sp, which).as_ptr() as usize
}

#[no_mangle]
pub extern "C" fn mc_trait_text_len(sp: i32, which: i32) -> u32 {
    trait_text(sp, which).len() as u32
}

#[no_mangle]
pub extern "C" fn mc_locus_count(sp: i32) -> u32 {
    let sim = s();
    sim.tr.get(sp as usize).map_or(0, |t| t.loci.len()) as u32
}

/// Species flags, so a shell does not need its own table of which species are in play.
/// `which`: 0 live, 1 apex, 2 the mat.
#[no_mangle]
pub extern "C" fn mc_species_flag(sp: i32, which: i32) -> i32 {
    let sim = s();
    let t = match sim.tr.get(sp as usize) {
        Some(t) => t,
        None => return 0,
    };
    match which {
        0 => t.live as i32,
        1 => t.apex as i32,
        2 => (sim.reg.mat == sp) as i32,
        _ => 0,
    }
}

// ---------------------------------------------------------------------------
// Undo (M5.1 A.3). The inverses live in the core (events.rs) rather than crossing as payloads:
// a snapshot marshalled out and back is a second representation of world state, and avoiding a
// second representation of anything is what this port is for.

/// What the last lever left to undo. 0 nothing, else the `Undo::code` of events.rs.
#[no_mangle]
pub extern "C" fn mc_undo_kind() -> i32 {
    s().undo.code()
}

/// The species a feed / kill / seeding undo concerns, so a shell can name it. -1 otherwise.
#[no_mangle]
pub extern "C" fn mc_undo_species() -> i32 {
    let sim = s();
    sim.undo.species(sim)
}

/// Put the world back, and clear the slot. An undo is not itself undoable.
#[no_mangle]
pub extern "C" fn mc_undo() {
    crate::events::apply_undo(s());
}

/// Forget the pending undo without applying it — what the browser's five-second timer does.
#[no_mangle]
pub extern "C" fn mc_undo_clear() {
    s().undo = crate::events::Undo::None;
}

// ---------------------------------------------------------------------------
// Save and load (M5.1 A.6). The snapshot format is snapshot.rs's, proved by resumption since M3;
// this only moves the bytes. Saving parks them in a buffer the shell reads; loading fills the same
// buffer and asks the core to take it.

static mut SNAP: Vec<u8> = Vec::new();

#[allow(static_mut_refs)]
fn snap() -> &'static mut Vec<u8> {
    unsafe { &mut SNAP }
}

/// Serialise the world and return how many bytes are waiting in the buffer.
#[no_mangle]
pub extern "C" fn mc_save() -> u32 {
    let bytes = s().save();
    let b = snap();
    b.clear();
    b.extend_from_slice(&bytes);
    b.len() as u32
}

/// Make room for `n` incoming bytes and return where to write them.
#[no_mangle]
pub extern "C" fn mc_snap_reserve(n: u32) -> usize {
    let b = snap();
    b.clear();
    b.resize(n as usize, 0);
    b.as_ptr() as usize
}

#[no_mangle]
pub extern "C" fn mc_snap_ptr() -> usize {
    snap().as_ptr() as usize
}

#[no_mangle]
pub extern "C" fn mc_snap_len() -> u32 {
    snap().len() as u32
}

/// Take the buffer's bytes as the world. 1 on success, 0 when the file is not one of ours or is
/// truncated — a refusal, never a half-loaded world.
#[no_mangle]
pub extern "C" fn mc_load() -> i32 {
    let bytes = snap().clone();
    match s().load(&bytes) {
        Ok(()) => 1,
        Err(_) => 0,
    }
}

// ---------------------------------------------------------------------------
// Impact cards (A.3, completed). The core cannot tell a player's hand from a script, so the shell
// logs its own interventions here and `impact()` reads that log.

/// Log an intervention at the current tick. `kind` indexes `impact::KINDS`.
#[no_mangle]
pub extern "C" fn mc_iv_push(kind: i32) {
    let sim = s();
    if kind < 0 || kind as usize >= crate::impact::KINDS.len() {
        return;
    }
    let tick = sim.w.tick;
    sim.iv_log.push(crate::impact::IvEntry { tick, kind: kind as usize });
    if sim.iv_log.len() > 300 {
        sim.iv_log.remove(0);
    }
}

#[no_mangle]
pub extern "C" fn mc_iv_count() -> u32 {
    s().iv_log.len() as u32
}

/// `field`: 0 tick, 1 kind.
#[no_mangle]
pub extern "C" fn mc_iv_at(i: u32, field: i32) -> f64 {
    match s().iv_log.get(i as usize) {
        None => f64::NAN,
        Some(e) => match field {
            0 => e.tick as f64,
            1 => e.kind as f64,
            _ => f64::NAN,
        },
    }
}

#[no_mangle]
pub extern "C" fn mc_iv_clear() {
    s().iv_log.clear();
}

static mut IMPACT: Option<crate::impact::Impact> = None;

#[allow(static_mut_refs)]
fn imp() -> &'static crate::impact::Impact {
    unsafe { IMPACT.as_ref().unwrap() }
}

/// Compute the card for intervention `i` and park it. Returns the status: 0 rolled, 1 watching,
/// 2 done.
#[no_mangle]
pub extern "C" fn mc_impact(i: u32) -> i32 {
    let r = s().impact(i as usize);
    let code = match r.status {
        crate::impact::Status::Rolled => 0,
        crate::impact::Status::Watching => 1,
        crate::impact::Status::Done => 2,
    };
    unsafe { IMPACT = Some(r) };
    code
}

/// `field`: 0 watching pct, 1 isPress, 2 notable count, 3 recovered seconds (NaN if never),
/// 4 mixed, 5 pressBackdrop, 6 complete.
#[no_mangle]
pub extern "C" fn mc_impact_num(field: i32) -> f64 {
    let r = imp();
    match field {
        0 => r.watching_pct,
        1 => r.is_press as i32 as f64,
        2 => r.notable.len() as f64,
        3 => r.recovered_s.unwrap_or(f64::NAN),
        4 => r.mixed as i32 as f64,
        5 => r.press_backdrop as i32 as f64,
        6 => r.complete as i32 as f64,
        _ => f64::NAN,
    }
}

/// One mover. `field`: 0 channel, 1 percent, 2 strong.
#[no_mangle]
pub extern "C" fn mc_impact_mover(k: u32, field: i32) -> f64 {
    match imp().notable.get(k as usize) {
        None => f64::NAN,
        Some(m) => match field {
            0 => m.ch as f64,
            1 => m.pct,
            2 => m.strong as i32 as f64,
            _ => f64::NAN,
        },
    }
}

/// The mover's name, in the words the browser uses. UTF-8 bytes.
#[no_mangle]
pub extern "C" fn mc_impact_mover_ptr(k: u32) -> usize {
    imp().notable.get(k as usize).map_or(0, |m| m.name.as_ptr() as usize)
}

#[no_mangle]
pub extern "C" fn mc_impact_mover_len(k: u32) -> u32 {
    imp().notable.get(k as usize).map_or(0, |m| m.name.len() as u32)
}
