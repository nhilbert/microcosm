//! Per-function bit-exactness check of `math.rs` against the reference engine.
//!
//! The trace is captured from Node 22 / V8 12.4 — the engine `dist/core.js` is certified on —
//! by `dev/xcheck/gen.js`, as hex IEEE754 doubles: `fn arg [arg] result`. This replays every
//! sample through the crate's own math and counts exact bit mismatches. The accepted result is
//! zero for every function; anything else means a world simulated by the port diverges from the
//! world the harnesses measured.
//!
//!   node dev/xcheck/gen.js /tmp/trace.txt
//!   cargo run --release --bin xcheck-math -- /tmp/trace.txt

use microcosm_core::math;
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader};

fn hex(s: &str) -> f64 {
    f64::from_bits(u64::from_str_radix(s, 16).expect("bad hex in trace"))
}

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| "trace.txt".to_string());
    let f = match std::fs::File::open(&path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("cannot open {}: {}\n  regenerate with: node dev/xcheck/gen.js {}", path, e, path);
            std::process::exit(2);
        }
    };
    // per function: (samples, mismatches, first failing sample)
    let mut stats: BTreeMap<&'static str, (u64, u64, Option<String>)> = BTreeMap::new();

    for line in BufReader::new(f).lines() {
        let line = line.unwrap();
        let mut it = line.split(' ');
        let name = match it.next() {
            Some(n) if !n.is_empty() => n,
            _ => continue,
        };
        let parts: Vec<&str> = it.collect();
        let (got, want, args): (f64, f64, String) = match (name, parts.len()) {
            ("sin", 2) => (math::sin(hex(parts[0])), hex(parts[1]), parts[0].to_string()),
            ("cos", 2) => (math::cos(hex(parts[0])), hex(parts[1]), parts[0].to_string()),
            ("exp", 2) => (math::exp(hex(parts[0])), hex(parts[1]), parts[0].to_string()),
            ("sqrt", 2) => (math::sqrt(hex(parts[0])), hex(parts[1]), parts[0].to_string()),
            ("pow75", 2) => (math::pow(hex(parts[0]), 0.75), hex(parts[1]), parts[0].to_string()),
            ("pow", 3) => (
                math::pow(hex(parts[0]), hex(parts[1])),
                hex(parts[2]),
                format!("{} {}", parts[0], parts[1]),
            ),
            ("atan2", 3) => (
                math::atan2(hex(parts[0]), hex(parts[1])),
                hex(parts[2]),
                format!("{} {}", parts[0], parts[1]),
            ),
            ("hypot", 3) => (
                math::hypot(hex(parts[0]), hex(parts[1])),
                hex(parts[2]),
                format!("{} {}", parts[0], parts[1]),
            ),
            _ => continue,
        };
        let key: &'static str = match name {
            "sin" => "sin", "cos" => "cos", "exp" => "exp", "sqrt" => "sqrt",
            "pow" => "pow", "pow75" => "pow(x,0.75)", "atan2" => "atan2", "hypot" => "hypot",
            _ => continue,
        };
        let e = stats.entry(key).or_insert((0, 0, None));
        e.0 += 1;
        // Exact bits. NaN never appears in these traces; if it ever did, bit equality is still the
        // right test — the port must reproduce the same NaN payload V8 produced.
        if got.to_bits() != want.to_bits() {
            e.1 += 1;
            if e.2.is_none() {
                e.2 = Some(format!(
                    "args {} → got {:016x} want {:016x}",
                    args,
                    got.to_bits(),
                    want.to_bits()
                ));
            }
        }
    }

    println!("MATH CROSS-CHECK vs Node 22 / V8 12.4  ({})", path);
    let mut bad = 0u64;
    for (name, (n, m, first)) in &stats {
        println!(
            "  {:<12} {:>9} samples  {:>8} mismatches{}",
            name,
            n,
            m,
            if *m == 0 { "" } else { "   <-- DIVERGES" }
        );
        if let Some(f) = first {
            println!("      first: {}", f);
        }
        bad += m;
    }
    println!(
        "{}",
        if bad == 0 { "MATH CHECK PASS (bit-identical to V8)" } else { "MATH CHECK FAIL" }
    );
    std::process::exit(if bad == 0 { 0 } else { 1 });
}
