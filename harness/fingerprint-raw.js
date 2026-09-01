// Raw-bit conformance fingerprint — the port's oracle.
//
// harness/conform.js rounds its sums with toFixed(3), which is right for catching ecology changes
// but too coarse to certify a translation: a one-ULP difference in a single organism would hide
// there and surface 10,000 ticks later as a different world. This prints the IEEE754 bits of every
// accumulator instead, so the Rust core can be compared against V8 exactly.
//
//   node harness/fingerprint-raw.js [ticks]      (default 3000)
//
// The Rust side is `cargo run --bin conform -- [ticks]` in rust/microcosm-core; the two outputs
// must be byte-identical.
const path = require("path");
const CORE = process.env.MC_CORE || path.join(__dirname, "..", "dist", "core.js");
const C = require(CORE);
const { W, P } = C;

const TICKS = parseInt(process.argv[2] || "3000", 10);
const buf = Buffer.alloc(8);
const h = d => { buf.writeDoubleBE(d); return buf.toString("hex"); };

function fingerprint(seed, mutation){
  P.mutation = mutation;
  C.resetWorld(); C.initWorld(seed);
  for (let t = 0; t < TICKS; t++) C.step();
  const p = [0,0,0,0,0,0,0];
  let sx = 0, se = 0, sm = 0, sg = 0;
  for (let i = 0; i < W.n; i++){
    if (!W.alive[i]) continue;
    p[W.sp[i]]++; sx += W.x[i] + W.y[i]; se += W.en[i]; sm += W.mn[i];
    const loci = C.TRAITS[W.sp[i]].loci;
    for (let k = 0; k < loci.length; k++) sg += W.g[k*C.MAXN+i] - loci[k].g0;
  }
  let fM = 0; for (let c = 0; c < P.GRID*P.GRID; c++) fM += W.M[c];
  // the mineral audit too: it is the conservation claim, and a translation slip in the corpse or
  // detritus paths shows up here before it shows up in the populations
  let am = 0;
  for (let c = 0; c < P.GRID*P.GRID; c++) am += W.M[c] + W.dM[c];
  for (let i = 0; i < W.n; i++) if (W.alive[i]) am += W.mn[i];
  for (let k = 0; k < W.cN; k++) if (W.cAlive[k]) am += W.cM[k];
  // The static fields are part of the state a port must reproduce, and they are computed before
  // the first tick — so when they differ, they localise the fault to computeLight/computeTemp
  // rather than to anything the organism loop did.
  let li = 0, tp = 0;
  for (let c = 0; c < P.GRID*P.GRID; c++){ li += W.light[c]; tp += W.temp[c] + W.qR[c]; }
  return `pops=[${p.join(",")}] posSum=${h(sx)} enSum=${h(se)} mnSum=${h(sm)} gSum=${h(sg)} fieldM=${h(fM)} auditM=${h(am)} lightSum=${h(li)} tempSum=${h(tp)} rngState=${W.rngState|0} tick=${W.tick} n=${W.n}`;
}

// Default: the two conformance seeds. Pass a comma-separated list to widen it to tune2's eight.
const SEEDS = (process.argv[3] || "11,88").split(",").map(s => parseInt(s, 10));
for (const [mode, mut] of [["silent", false], ["evolving", true]])
  for (const seed of SEEDS)
    console.log(`${mode} ${seed} ${fingerprint(seed, mut)}`);
