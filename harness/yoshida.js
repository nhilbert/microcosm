// 5.2 THE YOSHIDA EXPERIMENT: does heritable prey defense transform the predator-prey cycle?
//
// Same seeds, mutation on vs off -- a controlled evolution experiment the real chemostats
// needed heroic effort to run, free here by determinism. Literature prediction (Yoshida et al.
// 2003, 2007): with evolvable prey the cycle period LENGTHENS and the grazer-prey phase shifts
// from the classic quarter-period lag toward antiphase; in the cryptic regime total prey stays
// flat while genotypes churn beneath. Reported honestly whatever it shows.
//
// Method (harness/lib.js): Drifta and Cilio counts every 20 ticks over 30,000 ticks, first
// 3,000 discarded, mean removed. Period = first autocorrelation peak. Phase = lag of the peak
// cross-correlation in fractions of a period (positive: Cilio follows Drifta; 0.25 quarter lag,
// 0.5 antiphase). Cryptic check: Drifta coefficient of variation.
//   --capture   writes harness/yoshida-baseline.json (seed 22) for gate5's reproduction check
const fs = require("fs"), path = require("path");
const L = require("./lib.js"); const { SEEDS } = L;
console.log("seed  | period off  on   | phase off   on    | Drifta CV off  on   | g end");
const rows = [];
for (const seed of SEEDS){ const r = L.cycleMetrics(seed); rows.push(r);
  console.log(`${String(seed).padEnd(5)} | ${String(r.pOff).padStart(6)} ${String(r.pOn).padStart(6)} | ${r.phOff.toFixed(2).padStart(6)} ${r.phOn.toFixed(2).padStart(6)} | ${r.cvOff.toFixed(2).padStart(9)} ${r.cvOn.toFixed(2).padStart(5)} | ${r.gEnd.toFixed(2)}`); }
// NaN = no dominant cycle found on that series; the ensemble averages the seeds that have one and says how many
const vals = k => rows.map(r=>r[k]).filter(v => Number.isFinite(v));
const mean = k => { const v=vals(k); return v.reduce((a,b)=>a+b,0)/(v.length||1); };
const sd = k => { const v=vals(k), m=mean(k); return Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/(v.length||1)); };
const n = k => vals(k).length;
console.log("\n=== ensemble (mean +- sd over the seeds with a dominant cycle) ===");
console.log(`period   off ${mean("pOff").toFixed(0)} +- ${sd("pOff").toFixed(0)} ticks (n=${n("pOff")})   on ${mean("pOn").toFixed(0)} +- ${sd("pOn").toFixed(0)} ticks (n=${n("pOn")})   (literature: lengthens)`);
console.log(`phase    off ${mean("phOff").toFixed(2)} +- ${sd("phOff").toFixed(2)} (n=${n("phOff")})         on ${mean("phOn").toFixed(2)} +- ${sd("phOn").toFixed(2)} (n=${n("phOn")})         (0.25 quarter lag -> 0.5 antiphase)`);
console.log(`Drifta CV off ${mean("cvOff").toFixed(2)} +- ${sd("cvOff").toFixed(2)}        on ${mean("cvOn").toFixed(2)} +- ${sd("cvOn").toFixed(2)}        (cryptic regime: on << off)`);
const both = rows.filter(r => Number.isFinite(r.pOn) && Number.isFinite(r.pOff));
console.log(`\nseeds with a cycle in both worlds: ${both.length}/8; period longer on ${both.filter(r=>r.pOn>r.pOff).length}; phase farther from zero on ${both.filter(r=>Math.abs(r.phOn)>Math.abs(r.phOff)).length}`);
if (process.argv.includes("--capture")){
  const r22 = rows.find(r => r.seed === 22);
  const out = { seed: 22, pOff: r22.pOff, pOn: r22.pOn, phOff: r22.phOff, phOn: r22.phOn, gEnd: r22.gEnd };
  fs.writeFileSync(path.join(__dirname, "yoshida-baseline.json"), JSON.stringify(out, null, 1));
  console.log("yoshida baseline captured:", JSON.stringify(out));
}
