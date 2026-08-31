// Per-organism state dump — the port's bisection tool.
//
// When the raw fingerprint diverges, this says WHICH organism went wrong first, and its species
// says which branch of the tick to read. Slot order is the processing order, so the first
// differing line is the first divergence.
//
//   node harness/dump.js [ticks] [seed] [mutation 0|1]
const path = require("path");
const CORE = process.env.MC_CORE || path.join(__dirname, "..", "dist", "core.js");
const C = require(CORE);
const { W, P } = C;

const TICKS = parseInt(process.argv[2] || "1", 10);
const SEED = parseInt(process.argv[3] || "11", 10);
const MUT = process.argv[4] === "1";

const buf = Buffer.alloc(8);
const h = d => { buf.writeDoubleBE(d); return buf.toString("hex"); };

P.mutation = MUT;
C.resetWorld(); C.initWorld(SEED);
for (let t = 0; t < TICKS; t++) C.step();

for (let i = 0; i < W.n; i++){
  if (!W.alive[i]) continue;
  console.log([i, W.sp[i], h(W.x[i]), h(W.y[i]), h(W.en[i]), h(W.mn[i]), h(W.pr[i]),
    h(W.vx[i]), h(W.vy[i]), h(W.hd[i]), W.cy[i], W.gr[i], W.handle[i], W.cd[i], W.bst[i], W.pc[i], W.flee[i]].join(" "));
}
