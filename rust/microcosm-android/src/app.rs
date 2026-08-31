//! The app-facing JNI surface (M5.1) — `org.microcosm.app.Native`.
//!
//! Deliberately an adapter over `microcosm_core::wasm`, the same C ABI the browser shim drives,
//! rather than a second API onto the core. The phone and the browser therefore enter the core
//! through the identical entry points, and the frame gate that proves the display list also
//! covers what Kotlin paints.
//!
//! The display list and the pixel fields cross as **direct ByteBuffers** over the core's own
//! buffers: no copy per frame, and no allocation. Those buffers are allocated once and never
//! resized (`Frame::default`, `Sim::frame_field`), so the pointers stay valid for the process's
//! life — which is what makes handing them to the JVM safe.

use jni::objects::{JByteArray, JByteBuffer, JObject};
use jni::sys::{jdouble, jint, jlong};
use jni::JNIEnv;

use microcosm_core::params::{MAXN, NCELL};
use microcosm_core::wasm as abi;

const ORG_BYTES: usize = MAXN * microcosm_core::frame::ORG_STRIDE * 8;
const CORPSE_BYTES: usize = 1500 * microcosm_core::frame::CORPSE_STRIDE * 8;
const FIELD_BYTES: usize = NCELL * 4;

/// SAFETY: the three buffers below live in `Sim`, which is leaked for the process's life and never
/// reallocated, so a `ByteBuffer` over them cannot outlive or outgrow its memory.
unsafe fn wrap<'a>(env: &mut JNIEnv<'a>, ptr: usize, len: usize) -> JByteBuffer<'a> {
    env.new_direct_byte_buffer(ptr as *mut u8, len)
        .expect("direct ByteBuffer")
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_boot(_env: JNIEnv, _this: JObject) {
    abi::mc_boot();
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_resetWorld(_env: JNIEnv, _this: JObject) {
    abi::mc_reset();
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_initWorld(
    _env: JNIEnv,
    _this: JObject,
    seed: jint,
) {
    abi::mc_init(seed, 1);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_step(_env: JNIEnv, _this: JObject) {
    abi::mc_step();
}

/// The renderer's own bookkeeping: remember where everything was, so the next frames can
/// interpolate between ticks. The shell calls this immediately before `step`, as the browser does.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_markPrev(_env: JNIEnv, _this: JObject) {
    abi::mc_mark_prev();
}

/// `id` is the scalar id of the C ABI: 1 tick, 0 n, 50 mutation, 51 lightMul, …
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_scalar(
    _env: JNIEnv,
    _this: JObject,
    id: jint,
) -> jdouble {
    abi::mc_scalar(id)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_setScalar(
    _env: JNIEnv,
    _this: JObject,
    id: jint,
    v: jdouble,
) {
    abi::mc_set_scalar(id, v);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_tick(_env: JNIEnv, _this: JObject) -> jlong {
    abi::mc_scalar(1) as jlong
}

// ---------------------------------------------------------------------------
// The frame builder.

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_grammarBuild(_env: JNIEnv, _this: JObject) {
    abi::mc_frame_grammar_build();
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_grammarNum(
    _env: JNIEnv,
    _this: JObject,
    sp: jint,
    field: jint,
) -> jdouble {
    abi::mc_frame_grammar(sp, field)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_specNum(
    _env: JNIEnv,
    _this: JObject,
    sp: jint,
    tb: jint,
    mb: jint,
    field: jint,
) -> jdouble {
    abi::mc_frame_spec(sp, tb, mb, field)
}

#[allow(clippy::too_many_arguments)]
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_frameBuild(
    _env: JNIEnv,
    _this: JObject,
    cam_x: jdouble,
    cam_y: jdouble,
    vw: jdouble,
    vh: jdouble,
    z: jdouble,
    hw: jdouble,
    hh: jdouble,
    alpha: jdouble,
    lod_z: jdouble,
    hidden: jint,
) {
    abi::mc_frame_build(cam_x, cam_y, vw, vh, z, hw, hh, alpha, lod_z, hidden);
}

/// `field`: 0 orgN, 1 corpseN, 2 mnBound, 10+sp population.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_frameNum(
    _env: JNIEnv,
    _this: JObject,
    field: jint,
) -> jdouble {
    abi::mc_frame_num(field)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_orgBuffer<'a>(
    mut env: JNIEnv<'a>,
    _this: JObject,
) -> JByteBuffer<'a> {
    unsafe { wrap(&mut env, abi::mc_frame_org_ptr(), ORG_BYTES) }
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_corpseBuffer<'a>(
    mut env: JNIEnv<'a>,
    _this: JObject,
) -> JByteBuffer<'a> {
    unsafe { wrap(&mut env, abi::mc_frame_corpse_ptr(), CORPSE_BYTES) }
}

/// Fill the scratch field buffer. `which`: 0 mat carpet, 1 dissolved mineral, 2 corpse pall,
/// 3 wall shade. One buffer serves all four, so read it before filling the next.
/// `fieldBuffer` only addresses it — ask for the buffer once and keep it.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_fieldFill(
    _env: JNIEnv,
    _this: JObject,
    which: jint,
) {
    abi::mc_frame_field(which);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_fieldBuffer<'a>(
    mut env: JNIEnv<'a>,
    _this: JObject,
) -> JByteBuffer<'a> {
    unsafe { wrap(&mut env, abi::mc_frame_field_ptr(), FIELD_BYTES) }
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_glowCount(
    _env: JNIEnv,
    _this: JObject,
    which: jint,
) -> jint {
    abi::mc_frame_glow_count(which) as jint
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_glowNum(
    _env: JNIEnv,
    _this: JObject,
    which: jint,
    k: jint,
    field: jint,
) -> jdouble {
    abi::mc_frame_glow(which, k.max(0) as u32, field)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_wallCount(
    _env: JNIEnv,
    _this: JObject,
) -> jint {
    abi::mc_frame_wall_count() as jint
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_wallNum(
    _env: JNIEnv,
    _this: JObject,
    k: jint,
    field: jint,
) -> jdouble {
    abi::mc_frame_wall(k.max(0) as u32, field)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_wallPt(
    _env: JNIEnv,
    _this: JObject,
    k: jint,
    q: jint,
    axis: jint,
) -> jdouble {
    abi::mc_frame_wall_pt(k.max(0) as u32, q.max(0) as u32, axis)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_sourceCount(
    _env: JNIEnv,
    _this: JObject,
) -> jint {
    abi::mc_scalar(7) as jint
}

/// `field`: 0 x, 1 y, 2 i, 3 a, 4 sigma.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_sourceNum(
    _env: JNIEnv,
    _this: JObject,
    k: jint,
    field: jint,
) -> jdouble {
    abi::mc_source_get(k, field)
}

/// What the last lever left to undo: 0 nothing, else the code of `events::Undo`.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_undoKind(_env: JNIEnv, _this: JObject) -> jint {
    abi::mc_undo_kind()
}

/// The species a feed / kill / seeding undo concerns, so the chip can name it. -1 otherwise.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_undoSpecies(_env: JNIEnv, _this: JObject) -> jint {
    abi::mc_undo_species()
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_undo(_env: JNIEnv, _this: JObject) {
    abi::mc_undo();
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_undoClear(_env: JNIEnv, _this: JObject) {
    abi::mc_undo_clear();
}

/// The levers, as events. Every one is undoable through the slot above.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_evFertilize(
    _env: JNIEnv, _this: JObject, x: jdouble, y: jdouble, amount: jdouble,
) {
    abi::mc_event_fertilize(x, y, amount, 0);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_evLightMul(_env: JNIEnv, _this: JObject, v: jdouble) {
    abi::mc_event_light_mul(v, 0);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_evSpawnPack(
    _env: JNIEnv, _this: JObject, sp: jint, x: jdouble, y: jdouble,
) {
    abi::mc_event_spawn_pack(sp, x, y, 0);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_evFeed(
    _env: JNIEnv, _this: JObject, i: jint, gen: jint, frac: jdouble,
) {
    abi::mc_event_feed(i, gen, frac, 0);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_evKill(_env: JNIEnv, _this: JObject, i: jint, gen: jint) {
    abi::mc_event_kill(i, gen, 0);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_evSource(
    _env: JNIEnv, _this: JObject, k: jint, x: jdouble, y: jdouble,
) {
    abi::mc_event_source(k, x, y, 0);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_evSourceSet(
    _env: JNIEnv, _this: JObject, k: jint, i: jdouble, a: jdouble, sigma: jdouble,
) {
    abi::mc_event_source_set(k, i, 1, a, 1, sigma, 1, 0);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_evSourceAdd(
    _env: JNIEnv, _this: JObject, x: jdouble, y: jdouble, i: jdouble, a: jdouble, sigma: jdouble,
) {
    abi::mc_event_source_add(x, y, i, 1, a, 1, sigma, 1, -1, 0);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_evSourceRemove(_env: JNIEnv, _this: JObject, k: jint) {
    abi::mc_event_source_remove(k, 0);
}

#[allow(clippy::too_many_arguments)]
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_evWallAdd(
    _env: JNIEnv, _this: JObject, x0: jdouble, y0: jdouble, dx: jdouble, dy: jdouble,
    lt: jdouble, ht: jdouble, fl: jdouble, pass: jint,
) {
    abi::mc_event_wall_add(x0, y0, dx, dy, lt, ht, fl, pass, -1, 0);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_evWallRemove(_env: JNIEnv, _this: JObject, k: jint) {
    abi::mc_event_wall_remove(k, 0);
}

/// `id`: 0 LOD_Z, 1 TINT_BINS, 2 organism stride, 3 corpse stride. Read rather than copied, so the
/// LOD threshold has one definition rather than one per platform.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_frameConst(
    _env: JNIEnv,
    _this: JObject,
    id: jint,
) -> jdouble {
    abi::mc_frame_const(id)
}

// ---------------------------------------------------------------------------
// Selection and read-out (A.2). Text crosses as a Java String rather than a buffer: these are read
// when a card opens, not per frame.

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_pickRadius(
    _env: JNIEnv,
    _this: JObject,
    z: jdouble,
    tight: jint,
) -> jdouble {
    abi::mc_pick_radius(z, tight)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_pick(
    _env: JNIEnv,
    _this: JObject,
    wx: jdouble,
    wy: jdouble,
    rad: jdouble,
) -> jint {
    abi::mc_pick(wx, wy, rad) as jint
}

/// `field`: 0 slot index, 1 generation, 2 species, 3 squared distance.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_pickAt(
    _env: JNIEnv,
    _this: JObject,
    k: jint,
    field: jint,
) -> jdouble {
    abi::mc_pick_at(k.max(0) as u32, field)
}

/// `field`: 0 still valid, 1 sx, 2 sy, 3 radius — through the view the last frame was built for.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_frameSel(
    _env: JNIEnv,
    _this: JObject,
    i: jint,
    gen: jint,
    field: jint,
) -> jdouble {
    abi::mc_frame_sel(i, gen, field)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_org(
    _env: JNIEnv,
    _this: JObject,
    i: jint,
    field: jint,
) -> jdouble {
    abi::mc_org(i, field)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_locusCount(
    _env: JNIEnv,
    _this: JObject,
    sp: jint,
) -> jint {
    abi::mc_locus_count(sp) as jint
}

/// `which`: 0 the species name; 10+k a locus label, 20+k its high word, 30+k its low word.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_traitText(
    env: JNIEnv,
    _this: JObject,
    sp: jint,
    which: jint,
) -> jni::sys::jstring {
    let ptr = abi::mc_trait_text_ptr(sp, which) as *const u8;
    let len = abi::mc_trait_text_len(sp, which) as usize;
    let text = if len == 0 {
        ""
    } else {
        // SAFETY: the pointer addresses a &'static str in the trait table.
        unsafe { std::str::from_utf8_unchecked(std::slice::from_raw_parts(ptr, len)) }
    };
    match env.new_string(text) {
        Ok(v) => v.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// `which`: 0 live, 1 apex, 2 the mat.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_speciesFlag(
    _env: JNIEnv,
    _this: JObject,
    sp: jint,
    which: jint,
) -> jint {
    abi::mc_species_flag(sp, which)
}

// ---------------------------------------------------------------------------
// The Observatory's read-outs (A.4). All of these touch the core, so the shell must call them from
// the render thread and publish the results — never from the UI thread while a tick is running.

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_recBuffer<'a>(
    mut env: JNIEnv<'a>,
    _this: JObject,
) -> JByteBuffer<'a> {
    unsafe {
        wrap(
            &mut env,
            abi::mc_rec_ptr(),
            microcosm_core::params::REC_N * microcosm_core::params::REC_CH * 4,
        )
    }
}

/// 1 when there is enough history for the vitals to mean anything.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_indOk(_env: JNIEnv, _this: JObject) -> jint {
    abi::mc_ind_ok()
}

/// 0 adaptability, 1 variety, 2 production/consumption, 3 recycling minutes, 4 locked %,
/// 5..8 the pyramid's four levels.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_indNum(
    _env: JNIEnv,
    _this: JObject,
    field: jint,
) -> jdouble {
    abi::mc_ind_num(field)
}

/// Per species. 0 present, 1 level, 2 reserve, 3 trend, 4 population trend.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_indStrain(
    _env: JNIEnv,
    _this: JObject,
    sp: jint,
    field: jint,
) -> jdouble {
    abi::mc_ind_strain(sp, field)
}

/// The hunter's own vitals. 0 present, 1 reserve, 2 prey losses per second.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_indVenator(
    _env: JNIEnv,
    _this: JObject,
    field: jint,
) -> jdouble {
    abi::mc_ind_venator(field)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_sysEventCount(
    _env: JNIEnv,
    _this: JObject,
) -> jint {
    abi::mc_sysev_count() as jint
}

/// 0 tick, 1 species, 2 locus plane (-1 when none).
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_sysEventNum(
    _env: JNIEnv,
    _this: JObject,
    i: jint,
    field: jint,
) -> jdouble {
    abi::mc_sysev_num(i.max(0) as u32, field)
}

/// `which`: 0 the event type, 1 the narration text.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_sysEventText(
    env: JNIEnv,
    _this: JObject,
    i: jint,
    which: jint,
) -> jni::sys::jstring {
    let ptr = abi::mc_sysev_ptr(i.max(0) as u32, which) as *const u8;
    let len = abi::mc_sysev_len(i.max(0) as u32, which) as usize;
    let text = if len == 0 || ptr.is_null() {
        String::new()
    } else {
        // SAFETY: the event's own bytes, alive for as long as the event is in the ring.
        unsafe { String::from_utf8_lossy(std::slice::from_raw_parts(ptr, len)).into_owned() }
    };
    match env.new_string(text) {
        Ok(v) => v.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

// ---------------------------------------------------------------------------
// The learning levels (A.5). The table crosses once as JSON — the player text is the bulk of a
// level and marshalling it field by field would buy nothing — and everything the runtime decides
// crosses as numbers. All of it touches the core: render thread only.

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelsJson(
    env: JNIEnv,
    _this: JObject,
) -> jni::sys::jstring {
    let ptr = abi::mc_levels_json_ptr() as *const u8;
    let len = abi::mc_levels_json_len() as usize;
    // SAFETY: a &'static str in the generated level table.
    let text = unsafe { std::str::from_utf8_unchecked(std::slice::from_raw_parts(ptr, len)) };
    match env.new_string(text) {
        Ok(v) => v.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelCount(_env: JNIEnv, _this: JObject) -> jint {
    abi::mc_level_count() as jint
}

/// `predicted` is the option the player committed to before the run, or -1 if they skipped it.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelStart(
    _env: JNIEnv,
    _this: JObject,
    idx: jint,
    predicted: jint,
) {
    abi::mc_level_start(idx, predicted);
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelRestart(_env: JNIEnv, _this: JObject) {
    abi::mc_level_restart();
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelStop(_env: JNIEnv, _this: JObject) {
    abi::mc_level_stop();
}

/// Runs the verdict loop. 0 idle, 1 running, 2 passed, 3 failed.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelCheck(_env: JNIEnv, _this: JObject) -> jint {
    abi::mc_level_check()
}

/// `field`: 0 state, 1 level index, 2 run, 3 seenS, 4 predicted, 5 pours left (-1 unlimited).
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelNum(
    _env: JNIEnv,
    _this: JObject,
    field: jint,
) -> jdouble {
    abi::mc_level_num(field)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelFailWhy(
    env: JNIEnv,
    _this: JObject,
) -> jni::sys::jstring {
    let ptr = abi::mc_level_fail_why_ptr() as *const u8;
    let len = abi::mc_level_fail_why_len() as usize;
    let text = if len == 0 {
        ""
    } else {
        // SAFETY: a &'static str in the level table.
        unsafe { std::str::from_utf8_unchecked(std::slice::from_raw_parts(ptr, len)) }
    };
    match env.new_string(text) {
        Ok(v) => v.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// `what`: 0 pours, 1 seed, 2 sources, 3 walls, 4 evolution.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelAllows(
    _env: JNIEnv,
    _this: JObject,
    what: jint,
) -> jint {
    abi::mc_level_allows(what)
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelPourOk(_env: JNIEnv, _this: JObject) -> jint {
    abi::mc_level_pour_ok()
}

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelNotePour(
    _env: JNIEnv,
    _this: JObject,
    d: jint,
) {
    abi::mc_level_note_pour(d);
}

/// The index into the event feed of the freshest event this level narrates, or -1.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelNarration(_env: JNIEnv, _this: JObject) -> jint {
    abi::mc_level_narration()
}

/// One meter row. `field`: 0 value, 1 has-goal, 2 goal, 3 direction.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_levelMeter(
    _env: JNIEnv,
    _this: JObject,
    row: jint,
    field: jint,
) -> jdouble {
    abi::mc_level_meter(row.max(0) as u32, field)
}

// ---------------------------------------------------------------------------
// Save and load (A.6). The bytes cross as a Java byte array, which is one copy each way for a
// 700 KB world — a rounding error against writing the file, and it keeps the shell free to hand
// the array straight to AtomicFile.

#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_save<'a>(
    env: JNIEnv<'a>,
    _this: JObject,
) -> jni::sys::jbyteArray {
    let n = abi::mc_save() as usize;
    let ptr = abi::mc_snap_ptr() as *const u8;
    // SAFETY: the core's own snapshot buffer, valid until the next save or load.
    let bytes = unsafe { std::slice::from_raw_parts(ptr, n) };
    match env.byte_array_from_slice(bytes) {
        Ok(v) => v.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// 1 when the world was taken, 0 when the file is not one of ours or is truncated.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_app_Native_load(
    env: JNIEnv,
    _this: JObject,
    data: JByteArray,
) -> jint {
    let bytes = match env.convert_byte_array(&data) {
        Ok(v) => v,
        Err(_) => return 0,
    };
    let dst = abi::mc_snap_reserve(bytes.len() as u32) as *mut u8;
    // SAFETY: mc_snap_reserve just sized the buffer to exactly this length.
    unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), dst, bytes.len()) };
    abi::mc_load()
}
