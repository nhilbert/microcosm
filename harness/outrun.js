// The lever-outrun study (app-ux-research.md §7.1): sort the levers by how far the world has
// moved on by the time an undo lands. This is the measurement the U.2 design is built on — which
// levers get quasimodal treatment is decided here, not by taste.
//
// Design. Same-seed A/B, the project's gold standard: a control run and, for each (lever, delay),
// a treatment run that applies the lever at t0, lets the world run `delay` ticks (the time before
// a player notices and regrets), then undoes it through the CORE'S OWN undo slot — the exact
// mechanism the phone's undo chip fires — and keeps running. Departure from control is measured
// 1,200 and 6,000 ticks after the undo (2 and 10 minutes at 1x).
//
// The floor. This world is chaotic: ANY perturbation diverges trajectories eventually, so raw
// departure would convict every lever. The yardstick is the `residue` row — a 0.001-unit pour
// NEVER undone: a true butterfly whose divergence at each horizon is what chaos alone produces.
// A lever whose departure sits at the residue's level was absorbed; far above it, the
// consequences outran the undo.
//
// The first run's floor was a 0.001 pour WITH undo, and it measured 0.00 at short delays — a
// finding, not a floor: unfertilize reclaims what the water still holds, so before diffusion has
// moved the splash the undo restores the world BIT-EXACTLY and the trajectory rejoins. The
// `butterfly` row keeps that demonstration on record.
//
// Runs on the ported core only (MC_CORE=rust/wasm/core.js): the JS oracle has no undo slot — the
// browser builds inverse events in the UI — and the product whose design this feeds is the app,
// whose world IS the crate. npm run outrun.
//
// Departure metric: sum over live species of |ln((pop_T+1)/(pop_C+1))| — log so a halved Drifta
// and a doubled Drifta weigh the same, +1 so extinctions stay finite. Collapse mismatches are
// counted separately: they are the finding, not an outlier.
const { C, W, SPECIES, SEEDS, pops, start, coreCollapsed } = require("./lib");

if (typeof C.undo !== "function"){
  console.error("outrun.js needs the core's undo slot — run with MC_CORE=rust/wasm/core.js");
  process.exit(1);
}
const T0 = 3000;                     // an established core (the conformance fingerprint's time)
const DELAYS = [50, 600, 3000];      // instant regret / a minute / five minutes at 1x
const AFTER = [1200, 6000];          // measured this long after the undo
const APEX = 6;
const LIVE = [0, 1, 2, 3, APEX];

const firstOf = sp => { for (let i = 0; i < W.n; i++) if (W.alive[i] && W.sp[i] === sp) return i; return -1; };

// Each lever as the app fires it. Feed/kill pick the first living Drifta — deterministic, and a
// thumb picks an arbitrary one too. `noUndo` rows measure the floor, not a lever.
const LEVERS = {
  residue:    { noUndo: true, fire: () => C.applyEvent({ type: "fertilize", x: 100, y: 100, amount: 1e-3 }) },
  butterfly:  { fire: () => C.applyEvent({ type: "fertilize", x: 100, y: 100, amount: 1e-3 }) },
  pour:       { fire: () => C.applyEvent({ type: "fertilize", x: 400, y: 600, amount: 40 }) },
  feed:       { fire: () => { const i = firstOf(SPECIES.PREY); if (i >= 0) C.applyEvent({ type: "feed", i, gen: W.gen[i], frac: 0.35 }); } },
  kill:       { fire: () => { const i = firstOf(SPECIES.PREY); if (i >= 0) C.applyEvent({ type: "kill", i, gen: W.gen[i] }); } },
  seedGrazer: { fire: () => C.applyEvent({ type: "spawnPack", sp: SPECIES.GRAZER, x: 400, y: 400 }) },
  seedApex:   { fire: () => C.applyEvent({ type: "spawnPack", sp: APEX, x: 400, y: 400 }) },
  sunMove:    { fire: () => { const s = W.sources[0]; C.applyEvent({ type: "source", k: 0, x: s.x + 128, y: s.y }); } },
  sunPress:   { fire: () => { const s = W.sources[0]; C.applyEvent({ type: "sourceSet", k: 0, i: Math.max(0, s.i - 0.3) }); } },
  wall:       { fire: () => C.applyEvent({ type: "wallAdd", x0: 400, y0: 400, dx: 128, dy: 0, lt: 0, ht: 0, fl: 0, pass: 0 }) },
};

// One run: seed the world, step to `until`, applying `acts` {tick: fn} on the way, sampling pops
// at each tick in `at`. Mutation on — the shipped world evolves.
function run(seed, until, acts, at){
  start(seed, true);
  const out = {};
  for (let t = 1; t <= until; t++){
    if (acts[t]) acts[t]();
    C.step();
    if (at.has(t)) out[t] = pops();
  }
  return out;
}

const dep = (a, b) => LIVE.reduce((s, sp) => s + Math.abs(Math.log((a[sp] + 1) / (b[sp] + 1))), 0);
const med = xs => { const s = [...xs].sort((p, q) => p - q); return s[s.length >> 1]; };

// every tick any (delay, after) pair needs a control sample at
const CHECKS = new Set();
for (const d of DELAYS) for (const a of AFTER) CHECKS.add(T0 + d + a);

console.log("LEVER OUTRUN — departure from same-seed control after lever + undo(delay)");
console.log(`t0=${T0}, seeds ${SEEDS.join(",")}, mutation on, core: ${process.env.MC_CORE || "dist/core.js"}`);
console.log("metric: sum over species of |ln(popT+1 / popC+1)|; X = core-collapse mismatch vs control\n");

const control = {};
for (const seed of SEEDS){
  control[seed] = run(seed, Math.max(...CHECKS), {}, CHECKS);
  process.stdout.write(`control seed ${seed} done\n`);
}

const rows = [];
for (const [name, lever] of Object.entries(LEVERS)){
  for (const d of DELAYS){
    const u = T0 + d;
    const at = new Set(AFTER.map(a => u + a));
    const cells = { near: [], far: [], collapses: 0 };
    for (const seed of SEEDS){
      const acts = { [T0]: lever.fire };
      if (!lever.noUndo) acts[u] = () => C.undo();
      const r = run(seed, u + AFTER[1], acts, at);
      cells.near.push(dep(r[u + AFTER[0]], control[seed][u + AFTER[0]]));
      cells.far.push(dep(r[u + AFTER[1]], control[seed][u + AFTER[1]]));
      const cT = coreCollapsed(r[u + AFTER[1]], u + AFTER[1]);
      const cC = coreCollapsed(control[seed][u + AFTER[1]], u + AFTER[1]);
      if (cT !== cC) cells.collapses++;
    }
    rows.push({ name, d, ...cells });
    process.stdout.write(`  ${name} d=${d} done\n`);
  }
}

console.log("\nlever        delay |  +1200: med    max     |  +6000: med    max     | collapse mismatches");
for (const r of rows){
  console.log(
    `${r.name.padEnd(11)} ${String(r.d).padStart(5)} |  ${med(r.near).toFixed(2).padStart(6)} ${Math.max(...r.near).toFixed(2).padStart(6)}   |  ${med(r.far).toFixed(2).padStart(6)} ${Math.max(...r.far).toFixed(2).padStart(6)}   | ${r.collapses ? r.collapses + "/" + SEEDS.length + " X" : "-"}`);
}

// The headline: absolute median departure at +6000 per delay, with the residue floor beside it.
// Rank at the LONGEST delay — where "noticed late" lives — and never as multiples of a floor
// that can be ~0 (the first run's lesson).
for (const d of DELAYS){
  const floor = rows.find(r => r.name === "residue" && r.d === d);
  console.log(`\nRANKING at delay ${d}, horizon +6000 — residue (chaos) floor: med ${med(floor.far).toFixed(2)}, max ${Math.max(...floor.far).toFixed(2)}`);
  const ranked = rows.filter(r => r.d === d && r.name !== "residue" && r.name !== "butterfly")
    .map(r => ({ name: r.name, m: med(r.far), collapses: r.collapses }))
    .sort((a, b) => b.m - a.m);
  for (const r of ranked)
    console.log(`  ${r.name.padEnd(11)} ${r.m.toFixed(2).padStart(6)}${r.collapses ? "   [" + r.collapses + " collapse mismatch]" : ""}`);
}
console.log("\nA lever at the residue floor was absorbed; far above it, the consequences outran the undo.");
