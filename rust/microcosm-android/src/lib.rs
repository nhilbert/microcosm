//! JNI glue — the Microcosm core on Android.
//!
//! Deliberately thin. Everything it exposes is in `microcosm_core::probe`, which the host
//! `selfcheck` binary runs too, so the phone and the workstation execute the same code and their
//! answers are comparable. This crate exists only so the `jni` dependency never enters the core.
//!
//! M5.0 of docs/android-port-plan.md: prove the toolchain and close the two claims that could not
//! be measured in a container — ARM64 bit-exactness, and the tick rate on real hardware.
//!
//! `app` adds the surface the real app drives (M5.1). It is an adapter over `microcosm_core::wasm`,
//! the same C ABI the browser shim uses, so both platforms enter the core the same way.

pub mod app;

use jni::objects::{JByteArray, JObject};
use jni::sys::{jint, jstring};
use jni::JNIEnv;

// `Native` is a Kotlin `object`, so these are INSTANCE methods on the singleton: JNI passes the
// instance as the second argument, not a class. The exported symbol name is the same either way,
// but typing it as JObject says what actually arrives.
fn out(env: &mut JNIEnv, s: String) -> jstring {
    match env.new_string(s) {
        Ok(v) => v.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Reproduce the four certified 3,000-tick fingerprints. If these match on ARM64, the whole sim —
/// arithmetic, draw order, field passes, heredity — is bit-exact on the phone.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_probe_Native_simCheck(
    mut env: JNIEnv,
    _this: JObject,
) -> jstring {
    let (report, ok) = microcosm_core::probe::sim_check();
    let s = format!("{}{}", report, if ok { "  => bit-exact\n" } else { "  => DIVERGES\n" });
    out(&mut env, s)
}

/// Replay the V8 math trace shipped as an asset.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_probe_Native_mathCheck(
    mut env: JNIEnv,
    _this: JObject,
    trace: JByteArray,
) -> jstring {
    let bytes = match env.convert_byte_array(&trace) {
        Ok(v) => v,
        Err(e) => return out(&mut env, format!("  could not read the trace asset: {}\n", e)),
    };
    let (report, ok) = microcosm_core::probe::math_check(&bytes);
    let s = format!("{}{}", report, if ok { "  => bit-identical to V8\n" } else { "  => DIVERGES\n" });
    out(&mut env, s)
}

/// Tick rate on this device.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_probe_Native_perfProbe(
    mut env: JNIEnv,
    _this: JObject,
    warmup: jint,
    ticks: jint,
) -> jstring {
    let s = microcosm_core::probe::perf_probe(warmup.max(0) as usize, ticks.max(1) as usize);
    out(&mut env, s)
}

/// Save/load, exercised on the device: run a world, snapshot it, resume from the bytes, and check
/// the resumed world matches the one that was never interrupted.
#[no_mangle]
pub extern "system" fn Java_org_microcosm_probe_Native_snapshotCheck(
    mut env: JNIEnv,
    _this: JObject,
) -> jstring {
    use microcosm_core::{probe, Sim};
    let mut a = Sim::new();
    a.p.mutation = true;
    a.reset_world();
    a.init_world(Some(11), None);
    for _ in 0..1200 {
        a.step();
    }
    let bytes = a.save();
    for _ in 0..800 {
        a.step();
    }
    let reference = probe::fingerprint(&a);

    let mut b = Sim::new();
    let s = match b.load(&bytes) {
        Err(e) => format!("  load failed: {}\n", e),
        Ok(()) => {
            for _ in 0..800 {
                b.step();
            }
            let resumed = probe::fingerprint(&b);
            format!(
                "  snapshot {} bytes\n  resumed 800 ticks: {}\n",
                bytes.len(),
                if resumed == reference { "identical to the uninterrupted run" } else { "DIFFERS" }
            )
        }
    };
    out(&mut env, s)
}
