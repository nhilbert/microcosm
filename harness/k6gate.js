// 4.6 PHASE GATE: the Observatory must rediscover the K6 strangulation unprompted.
const path = require("path");
const CORE = path.join(__dirname, "..", "src", "core.js");
const C = require(CORE);
const { W, P } = C;

function runWorld(seed, decomposers, maxT){
  P.spawnDecomposers = decomposers;
  C.resetWorld(); C.initWorld(seed);
  const strainLog = [];
  let cilioExtinctT = -1;
  for (let t = 0; t < maxT; t++){
    C.step();
    if (t % 200 === 0 && t > 1200){
      const ind = C.indicators();
      const cs = ind && ind.strain[2];
      if (cs) strainLog.push({ t, level: cs.level });
    }
    if (cilioExtinctT < 0){
      let c = 0; for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===2) c++;
      if (t > 950 && c === 0) cilioExtinctT = t;
    }
    if (cilioExtinctT > 0 && t > cilioExtinctT + 400) break;
  }
  return { events: [...W.sysEvents], strainLog, cilioExtinctT };
}

console.log("=== K6 world (decomposers OFF), seed 11 — the machine's own narrative ===");
const k6 = runWorld(11, false, 18000);
for (const e of k6.events) console.log(`  t=${e.tick}  ${e.text}`);
console.log("\n=== gate criteria ===");
const ext = k6.events.find(e => e.type === "extinct" && e.sp === 2);
const extT = ext ? ext.tick : k6.cilioExtinctT;
const lockedEv = k6.events.find(e => e.type === "locked");
const deplEv = k6.events.find(e => e.type === "depleted");
const firstCrit = k6.strainLog.find(s => s.level === 2);
const critLead = firstCrit && extT > 0 ? (extT - firstCrit.t)/10 : -1;
const c1 = lockedEv && extT > 0 && lockedEv.tick < extT;
const c2 = deplEv && extT > 0 && deplEv.tick < extT;
const c3 = critLead >= 60;
const c4 = !!ext;
console.log(`1. lock-up warning before grazer extinction: ${c1 ? "PASS" : "FAIL"}` + (lockedEv ? ` (warned t=${lockedEv.tick}, extinct t=${extT})` : " (never fired)"));
console.log(`2. depletion warning before grazer extinction: ${c2 ? "PASS" : "FAIL"}` + (deplEv ? ` (warned t=${deplEv.tick})` : " (never fired)"));
console.log(`3. Cilio strain CRITICAL ≥60 s before death: ${c3 ? "PASS" : "FAIL"} (lead: ${critLead >= 0 ? Math.round(critLead)+" s" : "n/a"})`);
console.log(`4. extinction reported: ${c4 ? "PASS" : "FAIL"}`);

console.log("\n=== healthy control (decomposers ON), seed 11 — must stay quiet ===");
const ok = runWorld(11, true, 18000);
const falseLocked = ok.events.some(e => e.type === "locked");
const falseDepl = ok.events.some(e => e.type === "depleted");
const falseExt = ok.events.some(e => e.type === "extinct" && [0,1,2,3].includes(e.sp));
const critCount = ok.strainLog.filter(s => s.level === 2).length;
console.log(`5. control silence: lock-up warning ${falseLocked?"FIRED (FAIL)":"quiet"} · depletion ${falseDepl?"FIRED (FAIL)":"quiet"} · core-species extinction ${falseExt?"REPORTED (FAIL)":"none"} · Cilio critical flags: ${critCount}/${ok.strainLog.length}`);
const c5 = !falseLocked && !falseDepl && !falseExt;
const passed = c1&&c2&&c3&&c4&&c5;
console.log(`\nGATE: ${passed ? "ALL CRITERIA PASS — the Observatory narrates the collapse unprompted" : "NOT PASSED — see failures above"}`);
process.exit(passed ? 0 : 1);
