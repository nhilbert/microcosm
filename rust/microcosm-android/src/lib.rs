//! JNI glue — the Microcosm core on Android.
//!
//! Deliberately thin, and it exists only so the `jni` dependency never enters the core.
//!
//! `app` is the whole surface: an adapter over `microcosm_core::wasm`, the same C ABI the browser
//! shim uses, so both platforms enter the core the same way.
//!
//! The M5.0 diagnostics surface that used to live here (`Java_org_microcosm_probe_*`) retired with
//! its APK once it had answered its two questions — ARM64 bit-exactness and the tick rate on real
//! hardware (docs/android-port-plan.md §8). The code behind it did not: `microcosm_core::probe`
//! and the `selfcheck` binary still run in CI, so a future device build can be wired back to the
//! same checks rather than new ones.

pub mod app;
