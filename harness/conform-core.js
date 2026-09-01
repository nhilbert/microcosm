// Conformance for the RUST core — the certifying harness after the M4 handover.
//
// harness/conform.js certifies dist/core.js, which is the historical oracle: frozen, and expected
// never to change again. This one certifies rust/microcosm-core, which is where behaviour now
// lives. Same discipline, deliberately: a stored fingerprint, a hash binding it to the sources that
// produce it, a loud NOTE when they disagree, and a --capture that is always a visible act.
//
//   npm run conform:core            compare against harness/core-baseline.json
//   npm run conform:core -- --capture   rebind (declare a reason!)
//
// It checks three things:
//   1. cross-target identity — the native build and the WASM build must produce byte-identical
//      fingerprints. Two targets disagreeing means the core stopped being deterministic across
//      platforms, which is the one property the whole port exists to provide.
//   2. the fingerprints match the baseline.
//   3. the source hash matches the one the baseline certifies (else: NOTE).
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CRATE = path.join(ROOT, "rust", "microcosm-core");
const SHIM = path.join(ROOT, "rust", "wasm", "core.js");
const BASELINE = path.join(__dirname, "core-baseline.json");
const TICKS = "3000";

// Hash every source file that can change what the world does. src/bin/ is excluded: those are
// tools, and a change to a fingerprint printer is not a change to the simulation.
function sourceHash() {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "bin") continue;
        walk(p);
      } else if (e.name.endsWith(".rs")) {
        files.push(p);
      }
    }
  })(path.join(CRATE, "src"));
  const h = crypto.createHash("sha256");
  for (const f of files) {
    h.update(path.relative(CRATE, f).replace(/\\/g, "/"));
    h.update(fs.readFileSync(f));
  }
  return { hash: h.digest("hex").slice(0, 16), count: files.length };
}

const run = (cmd, args, opts) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });

const { hash: coreHash, count } = sourceHash();

// 1. native
let native;
try {
  native = run("cargo", ["run", "--release", "--quiet", "--offline", "--bin", "conform", "--", TICKS],
    { cwd: CRATE, stdio: ["ignore", "pipe", "ignore"] });
} catch (e) {
  console.error("cannot run the native core: " + (e.message || e));
  process.exit(2);
}

// 2. wasm, through the same shim the harnesses use
if (!fs.existsSync(path.join(CRATE, "target", "wasm32-unknown-unknown", "release", "microcosm_core.wasm"))) {
  console.error("microcosm_core.wasm not built — run: npm run wasm");
  process.exit(2);
}
const wasm = run(process.execPath, [path.join(__dirname, "fingerprint-raw.js"), TICKS],
  { cwd: ROOT, env: { ...process.env, MC_CORE: SHIM } });

const result = { coreHash, sources: count, fingerprints: native.trimEnd().split("\n") };

if (process.argv.includes("--capture")) {
  if (native !== wasm) {
    console.error("REFUSED: native and wasm disagree — capturing now would certify a core that is not deterministic across targets.");
    process.exit(1);
  }
  fs.writeFileSync(BASELINE, JSON.stringify(result, null, 1) + "\n");
  console.log(`core baseline captured: hash ${coreHash} over ${count} source files`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.error("no core baseline — capture one with: npm run conform:core -- --capture");
  process.exit(2);
}
const base = JSON.parse(fs.readFileSync(BASELINE));
let ok = true;

// 1. cross-target identity
const sameTargets = native === wasm;
console.log(`  native == wasm: ${sameTargets ? "identical" : "DIFFER"}`);
if (!sameTargets) {
  ok = false;
  const a = native.split("\n"), b = wasm.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if (a[i] !== b[i]) { console.log(`    native: ${a[i]}\n    wasm:   ${b[i]}`); break; }
}

// 2/3. the baseline, and the hash that binds it
if (base.coreHash !== coreHash)
  console.log(`NOTE: the core sources differ from the ones this baseline certifies (hash ${base.coreHash} vs ${coreHash}) — a changed fingerprint below means an undeclared behavior change; identical fingerprints mean the edit was behavior-neutral`);
for (let i = 0; i < Math.max(base.fingerprints.length, result.fingerprints.length); i++) {
  const want = base.fingerprints[i], got = result.fingerprints[i];
  const label = (got || want || "").split(" ").slice(0, 2).join(" ");
  const same = want === got;
  console.log(`  ${label.padEnd(12)} ${same ? "identical" : "DIFFERS"}`);
  if (!same) { ok = false; console.log(`    expected: ${want}\n    actual:   ${got}`); }
}

console.log(ok ? "CORE CONFORMANCE PASS (bit-identical to baseline, native and wasm agree)" : "CORE CONFORMANCE FAIL");
process.exit(ok ? 0 : 1);
