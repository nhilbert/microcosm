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
// departure would convict every lever. The yardstick is the `butterfly` row — a 0.001-unit pour,
// undone on the same schedule — which measures pure chaotic divergence. A lever whose departure
// sits at the butterfly's level was absorbed; one that sits far above it outran its undo.
//
// Runs on the ported core only (MC_CORE=rust/wasm/core.js): the JS oracle has no undo slot — the
// browser builds inverse events in the UI — and the product whose design this feeds is the app,
// whose world IS the crate. npm run outrun.
//
// Departure metric: sum over live species of |ln((pop_T+1)/(pop_C+1))| — log so a halved Drifta
// and a doubled Drifta weigh the same, +1 so extinctions stay finite. Collapse mismatches are
// counted separately: they are the finding, not an outlier.
const { C, W, SPECIES, pops, start, coreCollapsed } = require("./lib");

if (typeof C.undo !== "function"){
  console.error("outrun.js needs the core's undo slot — run with MC_CORE=rust/wasm/core.js");
  process.exit(1);
}

const SEEDS = [11, 22, 33, 44];      // ordering pass; extend toward 8 if two levers tie
const T0 = 3000;                     // an established core (the conformance fingerprint's time)
const DELAYS = [50, 600, 3000];      // instant regret / a minute / five minutes at 1x
const AFTER = [1200, 6000];          // measured this long after the undo
const APEX = 6;
const LIVE = [0, 1, 2, 3, APEX];

const firstOf = sp => { for (let i = 0; i < W.n; i++) if (W.alive[i] && W.sp[i] === sp) return i; return -1; };

// Each lever as the app fires it. Feed/kill pick the first living Drifta — deterministic, and a
// thumb picks an arbitrary one too.
const LEVERS = {
  butterfly:  () => C.applyEvent({ type: "fertilize", x: 100, y: 100, amount: 1e-3 }),
  pour:       () => C.applyEvent({ type: "fertilize", x: 400, y: 600, amount: 40 }),
  feed:       () => { const i = firstOf(SPECIES.PREY); if (i >= 0) C.applyEvent({ type: "feed", i, gen: W.gen[i], frac: 0.35 }); },
  kill:       () => { const i = firstOf(SPECIES.PREY); if (i >= 0) C.applyEvent({ type: "kill", i, gen: W.gen[i] }); },
  seedGrazer: () => C.applyEvent({ type: "spawnPack", sp: SPECIES.GRAZER, x: 400, y: 400 }),
  seedApex:   () => C.applyEvent({ type: "spawnPack", sp: APEX, x: 400, y: 400 }),
  sunMove:    () => { const s = W.sources[0]; C.applyEvent({ type: "source", k: 0, x: s.x + 128, y: s.y }); },
  sunPress:   () => { const s = W.sources[0]; C.applyEvent({ type: "sourceSet", k: 0, i: Math.max(0, s.i - 0.3) }); },
  wall:       () => C.applyEvent({ type: "wallAdd", x0: 400, y0: 400, dx: 128, dy: 0, lt: 0, ht: 0, fl: 0, pass: 0 }),
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
for (const [name, fire] of Object.entries(LEVERS)){
  for (const d of DELAYS){
    const u = T0 + d;
    const at = new Set(AFTER.map(a => u + a));
    const cells = { near: [], far: [], collapses: 0 };
    for (const seed of SEEDS){
      const r = run(seed, u + AFTER[1], { [T0]: fire, [u]: () => C.undo() }, at);
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

console.log("\n%-11s %6s | %23s | %23s | %s".replace(/%-?\d*s/g, "%s"));
console.log("lever        delay |  +1200: med    max     |  +6000: med    max     | collapse mismatches");
for (const r of rows){
  console.log(
    `${r.name.padEnd(11)} ${String(r.d).padStart(5)} |  ${med(r.near).toFixed(2).padStart(6)} ${Math.max(...r.near).toFixed(2).padStart(6)}   |  ${med(r.far).toFixed(2).padStart(6)} ${Math.max(...r.far).toFixed(2).padStart(6)}   | ${r.collapses ? r.collapses + "/" + SEEDS.length + " X" : "-"}`);
}

// the headline: levers ranked by how far above the butterfly floor they sit at d=600, +6000
const floor = rows.find(r => r.name === "butterfly" && r.d === 600);
console.log("\nRANKING at delay 600, horizon +6000 (multiples of the butterfly floor):");
const ranked = rows.filter(r => r.d === 600 && r.name !== "butterfly")
  .map(r => ({ name: r.name, x: med(r.far) / (med(floor.far) || 1e-9), collapses: r.collapses }))
  .sort((a, b) => b.x - a.x);
for (const r of ranked)
  console.log(`  ${r.name.padEnd(11)} ${r.x.toFixed(1).padStart(7)}x${r.collapses ? "   [" + r.collapses + " collapse mismatch]" : ""}`);
console.log("\nA lever near 1x was absorbed; far above it, the consequences outran the undo.");
