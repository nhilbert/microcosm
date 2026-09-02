// The port's gate: does the Rust core reproduce the JavaScript core, bit for bit?
//
//   npm run port:check              (3,000 ticks — the conformance horizon)
//   npm run port:check -- 18000     (the acceptance horizon)
//   npm run port:check -- 3000 11,22,33,44,55,66,77,88
//
// Runs the same harness scripts twice — once against dist/core.js, once against the WASM build of
// rust/microcosm-core — and compares the raw-bit output. Any difference is a defect in the port:
// these fingerprints carry the IEEE754 bits of every accumulator and the final PRNG state, so
// agreement means the two implementations consumed the same draws in the same order and produced
// the same doubles, not merely the same ecology.
//
// This is the M2/M4 proof protocol of docs/android-port-plan.md in one command. The observatory's
// own channels are covered by the gates (K6, gate5, heat, light), which take MC_CORE; what this
// adds on top of the world fingerprints is the level API's surface.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SHIM = path.join(ROOT, "rust", "wasm", "core.js");
const WASM = path.join(ROOT, "rust", "microcosm-core", "target", "wasm32-unknown-unknown", "release", "microcosm_core.wasm");

const TICKS = process.argv[2] || "3000";
const SEEDS = process.argv[3] || "11,88";

if (!fs.existsSync(WASM)) {
  console.error("microcosm_core.wasm not built.\n  npm run wasm");
  process.exit(2);
}

const run = (script, args, core) => execFileSync(process.execPath, [path.join(ROOT, "harness", script), ...args], {
  cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28,
  env: core ? { ...process.env, MC_CORE: SHIM } : { ...process.env, MC_CORE: "" },
});

let fails = 0;
function compare(label, script, args) {
  process.stdout.write(`  ${label.padEnd(34)}`);
  let js, rs;
  try {
    js = run(script, args, false);
    rs = run(script, args, true);
  } catch (e) {
    console.log("ERROR");
    console.log(String(e.stdout || "") + String(e.stderr || e.message));
    fails++;
    return;
  }
  if (js === rs) {
    console.log("identical");
  } else {
    console.log("DIFFERS");
    const a = js.split("\n"), b = rs.split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i++)
      if (a[i] !== b[i]) {
        console.log(`    line ${i + 1}\n      js:   ${a[i]}\n      rust: ${b[i]}`);
        break;
      }
    fails++;
  }
}

console.log(`PORT CHECK — dist/core.js vs rust/microcosm-core (wasm), ${TICKS} ticks, seeds ${SEEDS}`);
compare(`world fingerprint`, "fingerprint-raw.js", [TICKS, SEEDS]);
compare(`events + scenario founding`, "fingerprint-events.js", []);
// The level API's surface beyond the verdict: apparatus gates, pour budget, meters, narration,
// restart. `harness/levels.js` proves the verdicts; nothing else exercises these headlessly.
// 2200 ticks so L7's scripted sun (t=2000) rises inside the window: the drive then covers the
// timeline hook, the region census and the per-source lock flip on both cores.
compare(`the level API's surface`, "fingerprint-levels.js", ["2200"]);
// The visual grammar (M5.1 A.0): the display list, the sprite bucket table, the pixel fields and
// the world-tile vector lists. Against dist/core.js the harness reads the grammar out of the
// render layer, which is what the core's frame builder was transliterated from.
compare(`the visual grammar`, "fingerprint-frame.js", []);
// Undo (A.3). The browser inverts a lever with an explicit inverse event; the Rust core inverts
// from a slot it keeps itself. Two mechanisms, one arithmetic — so the worlds must agree.
compare(`undo puts the world back`, "fingerprint-undo.js", []);
// Impact cards: the honesty machinery. Every threshold in it is a Phase 4 calibration fight, so a
// port that gets one wrong narrates a different world rather than crashing.
compare(`impact cards`, "fingerprint-impact.js", []);

console.log(fails === 0
  ? "PORT CHECK PASS (bit-identical)"
  : `PORT CHECK FAIL (${fails} comparison${fails > 1 ? "s" : ""} differ)`);
process.exit(fails === 0 ? 0 : 1);
