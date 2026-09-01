// Scripted events + scenario founding, fingerprinted raw — the parts conform.js never reaches.
//
// conform.js founds the shipped world and lets it run: it never queues an event, never moves a
// sun, never builds a wall, and never uses a level's scenario founding. Those are the write API
// and the Phase 8 levels, so a port that is bit-exact on conform can still be wrong everywhere the
// player's hand touches. This runs one scripted world through every event type the sim exposes,
// then a scenario-founded world, and prints raw-bit fingerprints for both.
//
//   node harness/fingerprint-events.js
//
// The Rust side is `cargo run --bin events` in rust/microcosm-core; outputs must be identical.
const path = require("path");
const CORE = process.env.MC_CORE || path.join(__dirname, "..", "dist", "core.js");
const C = require(CORE);
const { W, P } = C;

const buf = Buffer.alloc(8);
const h = d => { buf.writeDoubleBE(d); return buf.toString("hex"); };

function fp(label){
  const p = [0,0,0,0,0,0,0];
  let sx = 0, se = 0, sm = 0, sg = 0;
  for (let i = 0; i < W.n; i++){
    if (!W.alive[i]) continue;
    p[W.sp[i]]++; sx += W.x[i] + W.y[i]; se += W.en[i]; sm += W.mn[i];
    const loci = C.TRAITS[W.sp[i]].loci;
    for (let k = 0; k < loci.length; k++) sg += W.g[k*C.MAXN+i] - loci[k].g0;
  }
  let fM = 0, li = 0, tp = 0, sc = 0, al = 0, de = 0;
  for (let c = 0; c < P.GRID*P.GRID; c++){
    fM += W.M[c]; li += W.light[c]; tp += W.temp[c] + W.qR[c] + W.qP[c] + W.qD[c] + W.qH[c] + W.qS[c] + W.qA[c];
    sc += W.sc[c]; al += W.al[c]; de += W.dE[c] + W.dP[c] + W.dM[c];
  }
  let am = 0;
  for (let c = 0; c < P.GRID*P.GRID; c++) am += W.M[c] + W.dM[c];
  for (let i = 0; i < W.n; i++) if (W.alive[i]) am += W.mn[i];
  for (let k = 0; k < W.cN; k++) if (W.cAlive[k]) am += W.cM[k];
  console.log(`${label} pops=[${p.join(",")}] posSum=${h(sx)} enSum=${h(se)} mnSum=${h(sm)} gSum=${h(sg)} ` +
    `fieldM=${h(fM)} detr=${h(de)} scent=${h(sc)} alarm=${h(al)} lightSum=${h(li)} qSum=${h(tp)} auditM=${h(am)} ` +
    `addedM=${h(W.addedM)} sources=${W.sources.length} walls=${W.walls.length} wallsOn=${W.wallsOn?1:0} ` +
    `rngState=${W.rngState|0} tick=${W.tick} n=${W.n} corpses=${W.cN} evLog=${W.eventLog.length}`);
}

// ---- 1. the scripted world: every event type, at fixed ticks ----
P.mutation = true;
C.resetWorld(); C.initWorld(11);
// a deterministic victim/beneficiary: the first living plankton and the first living grazer
let victim = -1, fed = -1;
for (let i = 0; i < W.n; i++){ if (!W.alive[i]) continue;
  if (victim < 0 && W.sp[i] === 1) victim = i;
  if (fed < 0 && W.sp[i] === 2) fed = i; }

const script = {
  100: () => C.queueEvent({ type: "fertilize", x: 300, y: 400, amount: 50 }),
  150: () => C.queueEvent({ type: "lightMul", v: 0.6 }),
  200: () => C.queueEvent({ type: "spawnPack", sp: 2, x: 500, y: 500 }),
  250: () => C.queueEvent({ type: "sourceAdd", x: 200, y: 200, i: 0.8, a: 6, sigma: 150 }),
  300: () => C.queueEvent({ type: "sourceSet", k: 0, i: 1.2, a: -3, sigma: 240 }),
  350: () => C.queueEvent({ type: "source", k: 1, x: 260, y: 220 }),
  400: () => C.queueEvent({ type: "wallAdd", x0: 400, y0: 100, dx: 0, dy: 500, lt: 0.2, ht: 0.5, fl: 0.1, pass: 0 }),
  450: () => C.queueEvent({ type: "wallSet", k: 0, lt: 0.7, fl: 0.6, pass: 2 }),
  500: () => { C.queueEvent({ type: "feed", i: fed, gen: W.gen[fed], frac: 0.5 });
               C.queueEvent({ type: "kill", i: victim, gen: W.gen[victim] }); },
  550: () => C.queueEvent({ type: "mutation", v: false }),
  600: () => C.queueEvent({ type: "locus", sp: 1, locus: 0, key: "kpSlope", v: 0.9 }),
  650: () => C.queueEvent({ type: "mutation", v: true }),
  700: () => C.queueEvent({ type: "wallAdd", x0: 100, y0: 600, dx: 400, dy: 0, lt: 1, ht: 1, fl: 1, pass: -1 }),
  750: () => C.queueEvent({ type: "wallRemove", k: 0 }),
  800: () => C.queueEvent({ type: "sourceRemove", k: 1 }),
};
for (let t = 1; t <= 1500; t++){ if (script[t]) script[t](); C.step(); }
fp("scripted");

// ---- 2. scenario founding: a level's world (L5-shaped: no plankton, no apex, thin water) ----
P.mutation = false;
C.resetWorld(); C.initWorld(202, { found: { 1: 0, 6: 0 }, M0: 0.4 });
for (let t = 0; t < 1500; t++) C.step();
fp("scenario");
