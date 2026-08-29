// 5.5 PHASE GATE: the Observatory must narrate the evolution unprompted.
//
// Eight seeds, the shipped (evolving) world against the reference (silent) control:
//   1. evolution narrated -- within 18,000 ticks, >= 7/8 evolving seeds get either a "sweep"
//                          event (a line taking over) or a "diverse" event (standing variation
//                          established, neither line winning). A balanced world does not sweep;
//                          the instrument must be able to say that too.
//   2. grounded         -- at the tick a sweep fires, the locus-mean channel is >= 0.10 from g0
//                          and the population majority sits on that side (the event is read off
//                          the instrument, not off the sim)
//   3. variance visible -- the locus-sd channel at t=18,000 exceeds its value at t=2,000 on
//                          every evolving seed (the fuel gauge moves)
//   4. control silent   -- the reference world emits zero heredity events and its sd channel
//                          reads exactly 0 on 8/8 seeds
//   5. cycle change reproduced -- the 5.2 measurement on seed 22 matches harness/yoshida-baseline.json
//                          (written by `node harness/yoshida.js --capture`) on this build, bit-exactly
const fs = require("fs"), path = require("path");
const L = require("./lib.js"); const { C, W, REC, TRAITS, SPECIES, SEEDS, HORIZON } = L;
const SP = SPECIES.PREY, LOC = TRAITS[SP].locus; // the gate watches the Yoshida prey's locus
const chan = (back, ch) => W.rec[((W.recHead-back+REC.N)%REC.N)*REC.CH + ch];
const HERED = e => e.type==="sweep" || e.type==="uniform" || e.type==="diverse";

function run(seed, mutation){
  L.start(seed, mutation);
  let sd2k = -1, sweepMeanAtFire = null, sweepShareAtFire = null, sweepTick = -1;
  for (let t=1;t<=HORIZON;t++){
    C.step();
    if (t === 2000) sd2k = chan(1, 49+SP);
    if (sweepTick < 0){
      const ev = W.sysEvents.find(e => e.type === "sweep" && e.sp === SP);
      if (ev){ sweepTick = ev.tick; sweepMeanAtFire = chan(1, 42+SP);
        let hi=0,lo=0,n=0; for (let i=0;i<W.n;i++) if (W.alive[i]&&W.sp[i]===SP){ n++; if (W.g[i]>LOC.g0+0.05) hi++; else if (W.g[i]<LOC.g0-0.05) lo++; }
        sweepShareAtFire = Math.max(hi,lo)/Math.max(1,n); }
    }
  }
  const diverseTick = (W.sysEvents.find(e => e.type==="diverse" && e.sp===SP) || { tick:-1 }).tick;
  return { sweepTick, diverseTick, sweepMeanAtFire, sweepShareAtFire, sd2k, sd18k: chan(1, 49+SP), mean18k: chan(1, 42+SP), hered: W.sysEvents.filter(HERED) };
}

console.log("=== evolving world (P.mutation=true) ===");
const ev = {}, ref = {};
for (const s of SEEDS){ const r = ev[s] = run(s, true);
  console.log(`seed ${s}: sweep ${r.sweepTick>0 ? "t="+r.sweepTick+" (mean "+r.sweepMeanAtFire.toFixed(2)+", "+Math.round(100*r.sweepShareAtFire)+"%)" : "none"} diverse ${r.diverseTick>0 ? "t="+r.diverseTick : "none"} | sd 2k ${r.sd2k.toFixed(3)} -> 18k ${r.sd18k.toFixed(3)} | mean 18k ${r.mean18k.toFixed(2)} | events: ${r.hered.map(e=>e.type+"@"+e.tick).join(" ")||"-"}`); }
console.log("\n=== reference world (P.mutation=false) ===");
for (const s of SEEDS){ const r = ref[s] = run(s, false);
  console.log(`seed ${s}: heredity events ${r.hered.length} | sd 18k ${r.sd18k} | mean 18k ${r.mean18k.toFixed(2)}`); }

const c1n = SEEDS.filter(s => ev[s].sweepTick > 0 || ev[s].diverseTick > 0).length, c1 = c1n >= 7;
const c2 = SEEDS.every(s => ev[s].sweepTick < 0 || (Math.abs(ev[s].sweepMeanAtFire - LOC.g0) >= 0.10 && ev[s].sweepShareAtFire >= 0.6));
const c3 = SEEDS.every(s => ev[s].sd18k > ev[s].sd2k);
const c4 = SEEDS.every(s => ref[s].hered.length === 0 && ref[s].sd18k === 0);
const basePath = path.join(__dirname, "yoshida-baseline.json");
const RECORDED = fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath)) : null;
const m = L.cycleMetrics(22);
const got = { seed: 22, pOff: m.pOff, pOn: m.pOn, phOff: m.phOff, phOn: m.phOn, gEnd: m.gEnd };
const c5 = !!RECORDED && ["pOff","pOn","phOff","phOn","gEnd"].every(k => got[k] === RECORDED[k]);

console.log("\n=== gate criteria ===");
console.log(`1. evolution narrated (sweep or diversifying) on >= 7/8 evolving seeds: ${c1?"PASS":"FAIL"} (${c1n}/8)`);
console.log(`2. every sweep grounded in the instrument (|mean - g0| >= 0.10, majority >= 60%): ${c2?"PASS":"FAIL"}`);
console.log(`3. variance channel rises 2k -> 18k on 8/8: ${c3?"PASS":"FAIL"}`);
console.log(`4. control silent (0 heredity events, sd channel exactly 0) on 8/8: ${c4?"PASS":"FAIL"}`);
console.log(`5. 5.2 measurement reproduced on this build (seed 22): ${c5?"PASS":"FAIL"} got ${JSON.stringify(got)} baseline ${RECORDED ? JSON.stringify(RECORDED) : "MISSING — run yoshida.js --capture"}`);
const passed = c1&&c2&&c3&&c4&&c5;
console.log(`\nGATE: ${passed ? "ALL CRITERIA PASS — the Observatory narrates the evolution unprompted" : "NOT PASSED — see failures above"}`);
process.exit(passed ? 0 : 1);
