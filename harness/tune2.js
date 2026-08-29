// Phase 2 harness: drives the CANONICAL core; now with mineral audit + flow meters.
const path = require("path");
const CORE = path.join(__dirname, "..", "src", "core.js");
const C = require(CORE);
const { W, P } = C;
const TICKS = 18000;
const auditM = () => {
  let t = 0;
  for (let c = 0; c < P.GRID*P.GRID; c++) t += W.M[c] + W.dM[c];
  for (let i = 0; i < W.n; i++) if (W.alive[i]) t += W.mn[i];
  for (let k = 0; k < W.cN; k++) if (W.cAlive[k]) t += W.cM[k];
  return t;
};
const detritus = () => {
  let e=0, p=0;
  for (let c = 0; c < P.GRID*P.GRID; c++){ e += W.dE[c]; p += W.dP[c]; }
  return [e, p];
};
const t0 = Date.now();
let anyFail = false;
for (const seed of [11,22,33,44,55,66,77,88]){
  C.resetWorld(); C.initWorld(seed);
  const M0 = auditM();
  let minP = new Array(7).fill(1e9), last = new Array(7).fill(0), ok = true, mStarv = 0;
  for (let t = 0; t <= TICKS; t++){
    C.step();
    const p = [0,0,0,0,0,0,0];
    for (let i = 0; i < W.n; i++) if (W.alive[i]) p[W.sp[i]]++;
    last = p;
    for (let k = 0; k < 7; k++) minP[k] = Math.min(minP[k], p[k]);
    if (t === 9000){ // mid-run: how many producers are mineral-limited?
      for (let i = 0; i < W.n; i++)
        if (W.alive[i] && W.sp[i] < 2 && !W.cy[i] && W.mn[i] < 0.5*P.mQuota*W.sz[i]) mStarv++;
    }
    if (p[0]===0 || p[1]===0 || p[3]===0 || (t>950 && p[2]===0) || (t>2500 && p[6]===0)){
      console.log(`seed ${seed}: EXTINCT at t=${t} pops=${p}`); ok = false; anyFail = true; break;
    }
  }
  const drift = 100*(auditM()-M0)/M0;
  if (ok) console.log(`seed ${seed}: OK final S=${last[0]} D=${last[1]} C=${last[2]} B=${last[3]} My=${last[4]} V=${last[6]} | min ${minP.join('/')} | M-audit drift ${drift.toFixed(4)}% | M-starved producers @t9000: ${mStarv} | uptake ${W.flows.uptake.toFixed(0)} release ${W.flows.release.toFixed(0)} | corpses=${(()=>{let n=0;for(let k=0;k<W.cN;k++)if(W.cAlive[k])n++;return n})()} | detritus E=${detritus()[0].toFixed(0)} P=${detritus()[1].toFixed(0)} egested E=${W.flows.egestE.toFixed(0)} | bacRelease M=${W.flows.bacRelease.toFixed(0)}`);
  else console.log(`  (audit drift at abort: ${drift.toFixed(4)}%)`);
}
console.log(`wall: ${(Date.now()-t0)/1000}s`);
process.exit(anyFail ? 1 : 0);
