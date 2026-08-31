//! The same self-check the Android probe runs, on the host.
//!
//! Its job in CI is to keep the embedded constants honest: if `EXPECTED_3000` ever drifts from what
//! the core actually produces, this fails here — where it is cheap — rather than on a phone, where
//! nobody would know whether to blame the constants or the device.
//!
//!   cargo run --release --bin selfcheck -- [trace.bin]

use microcosm_core::probe;

fn main() {
    let mut ok = true;

    println!("SIM — the certified world at 3,000 ticks");
    let (report, sim_ok) = probe::sim_check();
    print!("{}", report);
    ok &= sim_ok;

    if let Some(path) = std::env::args().nth(1) {
        println!("\nMATH — replay of the V8 trace ({})", path);
        match std::fs::read(&path) {
            Ok(bytes) => {
                let (report, math_ok) = probe::math_check(&bytes);
                print!("{}", report);
                ok &= math_ok;
            }
            Err(e) => {
                println!("  cannot read {}: {}", path, e);
                println!("  regenerate with: node dev/xcheck/gen-bin.js {}", path);
                ok = false;
            }
        }
    } else {
        println!("\nMATH — skipped (pass a trace path; make one with dev/xcheck/gen-bin.js)");
    }

    // No clock on wasm32-unknown-unknown: Instant has no time source there, so the timing section
    // is compiled out rather than panicking at runtime.
    #[cfg(not(target_arch = "wasm32"))]
    {
        println!("\nSPEED");
        print!("{}", probe::perf_probe(1000, 2000));
    }

    println!("\n{}", if ok { "SELF-CHECK PASS" } else { "SELF-CHECK FAIL" });
    std::process::exit(if ok { 0 } else { 1 });
}
