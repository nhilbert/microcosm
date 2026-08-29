// 5.4 CORRIDOR CERTIFICATION: a locus may evolve freely inside [0,1] ONLY if the rails are
// proven safe. Runs the 8-seed ecology acceptance at every CORNER of the corridor -- each
// species with a locus pinned at 0 or 1, all combinations -- mutation off so nothing moves.
// Criterion: the amended one -- the four core species persist to t=18,000 and the mineral
// audit stays flat; the apex is reported.
const L = require("./lib.js"); const { C, W, TRAITS, SEEDS, HORIZON, LOCI } = L;
const corners = []; for (let m=0; m < (1<<LOCI.length); m++) corners.push(LOCI.map((sp,k) => [sp, (m>>k)&1]));
let anyFail = false;
for (const corner of corners){
  const label = corner.map(([sp,r]) => TRAITS[sp].name+" "+(r ? TRAITS[sp].locus.hiWord : TRAITS[sp].locus.loWord)).join(" + ");
  console.log(`\n=== corner: ${label}, mutation off ===`);
  for (const seed of SEEDS){
    L.start(seed, false); L.pin(corner); // pin the founders; children inherit
    const M0 = L.auditM(); let ok=true, vLost=-1, vSeen=false, last=null;
    for (let t=0;t<=HORIZON;t++){
      C.step(); const p = L.pops(); last=p;
      if (p[6]>0) vSeen=true; else if (vSeen && vLost<0) vLost=t;
      if (L.coreCollapsed(p, t)){ console.log(`seed ${seed}: ECOSYSTEM COLLAPSE at t=${t} pops=${p}`); ok=false; anyFail=true; break; }
    }
    if (ok) console.log(`seed ${seed}: OK apex ${!vSeen?"never":vLost<0?"held ("+last[6]+")":"lost t="+vLost} | S=${last[0]} D=${last[1]} C=${last[2]} B=${last[3]} | audit ${(100*(L.auditM()-M0)/M0).toFixed(4)}%`);
  }
}
console.log(anyFail ? "\nCORRIDOR: NOT CERTIFIED — a corner breaks the ecosystem" : `\nCORRIDOR CERTIFIED: all ${corners.length} corners pass the ecosystem criterion on 8/8 seeds`);
process.exit(anyFail ? 1 : 0);
