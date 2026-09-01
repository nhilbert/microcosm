// Observatory fingerprint — every recorder channel and every narrated event.
//
// The sim must be bit-exact; the observatory need not be (docs/porting.md licenses rewriting it).
// But its thresholds were all measured, several of them twice after the first design died against
// the data, so a port that quietly narrates differently has thrown those calibrations away. This
// prints per-channel sums over the whole ring as raw bits, plus every system event with its tick,
// type, species and text — enough that a divergence names the channel or the detector.
//
//   node harness/fingerprint-obs.js [ticks] [seed] [mutation 0|1]
const path = require("path");
const CORE = process.env.MC_CORE || path.join(__dirname, "..", "dist", "core.js");
const C = require(CORE);
const { W, P, REC } = C;

const TICKS = parseInt(process.argv[2] || "6000", 10);
const SEED = parseInt(process.argv[3] || "11", 10);
const MUT = process.argv[4] === "1";

const buf = Buffer.alloc(8);
const h = d => { buf.writeDoubleBE(d); return buf.toString("hex"); };

P.mutation = MUT;
C.resetWorld(); C.initWorld(SEED);
for (let t = 0; t < TICKS; t++) C.step();

console.log(`recHead=${W.recHead} recCount=${W.recCount} sysEvents=${W.sysEvents.length}`);
for (let ch = 0; ch < REC.CH; ch++){
  let s = 0;
  for (let n = 0; n < REC.N; n++) s += W.rec[n*REC.CH + ch];
  console.log(`ch${String(ch).padStart(3, "0")} ${h(s)}`);
}
for (const e of W.sysEvents)
  console.log(`ev t=${e.tick} ${e.type} sp=${e.sp}${e.locus !== undefined ? " L"+e.locus : ""} | ${e.text}`);
