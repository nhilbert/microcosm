// Undo fingerprint — does putting the world back put it back the same way?
//
// The browser inverts a lever by sending an explicit inverse event carrying a payload its `done`
// callback captured: `unfeed{delta}`, `revive{snap}`, `unspawnPack{snap}`, `unfertilize{snap}`.
// The Rust core keeps that payload inside itself instead — a snapshot marshalled out to Kotlin and
// back would be a second representation of world state — and inverts through `undo()`.
//
// Two mechanisms, one arithmetic, so the test is: drive the same lever on both cores, invert it
// each core's own way, run on, and compare the worlds bit for bit. Anything the inverse gets wrong
// — a reclaimed corpse, a mineral top-up, the heading draw `revive` spends — shows up as a
// different fingerprint, not as a plausible-looking world.
//
//   node harness/fingerprint-undo.js
//   MC_CORE=rust/wasm/core.js node harness/fingerprint-undo.js
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const C = require(process.env.MC_CORE || path.join(ROOT, "dist", "core.js"));
const { W, P } = C;

const buf = Buffer.alloc(8);
const h = d => { buf.writeDoubleBE(d); return buf.toString("hex"); };

function pops(){
  const p = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < W.n; i++) if (W.alive[i]) p[W.sp[i]]++;
  return p;
}
function auditM(){
  let t = 0;
  for (let c = 0; c < W.M.length; c++) t += W.M[c] + W.dM[c];
  for (let i = 0; i < W.n; i++) if (W.alive[i]) t += W.mn[i];
  for (let k = 0; k < W.cN; k++) if (W.cAlive[k]) t += W.cM[k];
  return t;
}
// The whole world as raw bits: positions, energies, the fields, and the PRNG's own state, so a
// divergence in the draw the revive spends cannot hide behind an identical population count.
function worldHash(){
  const parts = [];
  for (const name of ["x", "y", "en", "sz", "mn", "pr", "hd", "g", "M", "dM", "dE", "dP"])
    parts.push(Buffer.from(W[name].buffer, W[name].byteOffset, W[name].byteLength));
  for (const name of ["alive", "sp", "cy", "cAlive"])
    parts.push(Buffer.from(W[name].buffer, W[name].byteOffset, W[name].byteLength));
  const tail = Buffer.alloc(24);
  tail.writeDoubleBE(W.rngState, 0);
  tail.writeDoubleBE(W.addedM, 8);
  tail.writeDoubleBE(W.n, 16);
  parts.push(tail);
  return crypto.createHash("sha256").update(Buffer.concat(parts)).digest("hex").slice(0, 16);
}

// Each case: set the world up, apply the lever, invert it, then run on so any divergence compounds.
// `forward` returns the payload the JavaScript inverse needs; the Rust core ignores it and uses its
// own slot.
const CASES = [
  ["fertilize", () => {
    let snap = null;
    C.applyEvent({ type: "fertilize", x: 512, y: 512, amount: 40, done: v => { snap = v; } });
    return () => C.applyEvent({ type: "unfertilize", snap });
  }],
  ["lightMul", () => {
    let prev = null;
    C.applyEvent({ type: "lightMul", v: 1.45, done: v => { prev = v.prev; } });
    return () => C.applyEvent({ type: "lightMul", v: prev });
  }],
  ["spawnPack", () => {
    let snap = null;
    C.applyEvent({ type: "spawnPack", sp: 2, x: 512, y: 470, done: v => { snap = v; } });
    return () => C.applyEvent({ type: "unspawnPack", snap });
  }],
  ["feed", () => {
    const i = firstAlive();
    const g = W.gen[i];
    let delta = 0;
    C.applyEvent({ type: "feed", i, gen: g, frac: 0.35, done: v => { delta = v; } });
    return () => C.applyEvent({ type: "unfeed", i, gen: g, delta });
  }],
  ["kill", () => {
    const i = firstAlive();
    const g = W.gen[i];
    let snap = null;
    C.applyEvent({ type: "kill", i, gen: g, done: v => { snap = v; } });
    return () => C.applyEvent({ type: "revive", snap });
  }],
  ["sourceAdd", () => {
    C.applyEvent({ type: "sourceAdd", x: 300, y: 700, i: 0.7, a: 6, sigma: 150 });
    return () => C.applyEvent({ type: "sourceRemove", k: W.sources.length - 1 });
  }],
  ["sourceSet", () => {
    const prev = W.sources[0];
    const keep = { i: prev.i, a: prev.a, sigma: prev.sigma };
    C.applyEvent({ type: "sourceSet", k: 0, i: 0.4, a: 5, sigma: 260 });
    return () => C.applyEvent({ type: "sourceSet", k: 0, ...keep });
  }],
  ["source (moved)", () => {
    const prev = W.sources[0];
    const keep = { x: prev.x, y: prev.y };
    C.applyEvent({ type: "source", k: 0, x: 300, y: 300 });
    return () => C.applyEvent({ type: "source", k: 0, ...keep });
  }],
  ["wallAdd", () => {
    C.applyEvent({ type: "wallAdd", x0: 200, y0: 200, dx: 300, dy: 40, lt: 0.5, ht: 0.2, fl: 0.1, pass: 0 });
    return () => C.applyEvent({ type: "wallRemove", k: W.walls.length - 1 });
  }],
  ["wallSet", () => {
    C.applyEvent({ type: "wallAdd", x0: 700, y0: 900, dx: -60, dy: 220, lt: 0, ht: 0, fl: 1, pass: 4 });
    const k = W.walls.length - 1;
    const p = W.walls[k];
    const keep = { lt: p.lt, ht: p.ht, fl: p.fl, pass: p.pass };
    C.applyEvent({ type: "wallSet", k, lt: 0.8, ht: 0.5, fl: 0.2, pass: 0 });
    return () => C.applyEvent({ type: "wallSet", k, ...keep });
  }],
];

function firstAlive(){
  for (let i = 0; i < W.n; i++) if (W.alive[i] && W.sp[i] === 1) return i;
  for (let i = 0; i < W.n; i++) if (W.alive[i]) return i;
  return 0;
}

// Both cores must print the same lines, since `port:check` compares the output byte for byte —
// so the mechanism is chosen silently and only the world's bits are reported.
const ported = typeof C.undo === "function";
console.log("UNDO FINGERPRINT — apply a lever, invert it, run on");

for (const [label, setup] of CASES) {
  P.mutation = false;
  C.resetWorld();
  C.initWorld(11);
  for (let t = 0; t < 600; t++) C.step();
  const before = worldHash();

  const jsInverse = setup();
  const afterLever = worldHash();
  for (let t = 0; t < 5; t++) C.step();

  if (ported) {
    if (C.undoKind() === 0) console.log(`  ${label.padEnd(16)} NOTHING TO UNDO`);
    C.undo();
  } else {
    jsInverse();
  }
  const afterUndo = worldHash();
  for (let t = 0; t < 300; t++) C.step();

  console.log(`  ${label.padEnd(16)} before ${before}  lever ${afterLever}  undone ${afterUndo}` +
    `  +300 ${worldHash()}  pops ${pops().join(",")}  M ${h(auditM())}`);
}

// Undoing twice must do nothing the second time: the slot is one deep and an inverse is not itself
// undoable. A self-check, not a comparison — it prints only when it fails, so both cores stay
// byte-identical. The JavaScript core has no slot and skips it.
if (ported) {
  P.mutation = false;
  C.resetWorld();
  C.initWorld(11);
  for (let t = 0; t < 600; t++) C.step();
  C.applyEvent({ type: "fertilize", x: 512, y: 512, amount: 40 });
  C.undo();
  const once = worldHash();
  C.undo();
  if (worldHash() !== once){
    console.log("  SELF-CHECK FAILED: a second undo changed the world; the slot is not one deep");
    process.exitCode = 1;
  }
}
P.mutation = true;
