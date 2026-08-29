// 7.H.1 — local heat: the measurement behind phase7-heat-plan.md §4 (predictions H-P1..H-P4).
//
//   node harness/heat.js --spot  [--a 8] [--at 3000]   a warm source ON the shipped sun ("Hot sun") vs the untouched world
//   node harness/heat.js --heater [--a 10] [--at 3000]  a dark heater at the far corner (seeded, like Block L)
//   node harness/heat.js --press [--amb 6]              global warming: P.tempAmb raised at --at (the deferred lever, as an experiment)
//   --nothermo                                          H-P6 control: species blind to warmth (thermotaxis off), metabolism unchanged
//
// Every configuration: 8 seeds, evolving world, horizon 18,000. Reported per species: population, mean warmth
// experienced (recorder 58+sp), mean distance from the warm source (H-P2 rings), and for the mat the realised
// net production in warm (dT > 3) vs ambient cells (H-P1). Chemistry near the source: detritus + dissolved
// mineral in the warm cells (H-P4). Zero PRNG draws outside the sim.
const L = require("./lib.js"); const { C, W, P, TRAITS, SPECIES, SEEDS, HORIZON, REC } = L;
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const num = (f, d) => { const i = args.indexOf(f); return i >= 0 ? +args[i+1] : d; };
const AT = num("--at", 3000);
const cellOf = i => (Math.floor(W.y[i]/(P.WORLD/P.GRID))&(P.GRID-1))*P.GRID + (Math.floor(W.x[i]/(P.WORLD/P.GRID))&(P.GRID-1));
const chan = (ch) => W.rec[((W.recHead-1+REC.N)%REC.N)*REC.CH + ch];
const LIVE = SPECIES.LIVE;

function seedKit(x, y){ // Block L colonisation kit around a source
  for (const [dx,dy] of [[60,0],[-60,0],[0,60],[0,-60]]){ C.applyEvent({ type:"spawnPack", sp:SPECIES.MAT, x:C.wrap(x+dx), y:C.wrap(y+dy) }); C.applyEvent({ type:"spawnPack", sp:SPECIES.PREY, x:C.wrap(x+dx*1.5), y:C.wrap(y+dy*1.5) }); }
  C.applyEvent({ type:"spawnPack", sp:SPECIES.GRAZER, x, y }); C.applyEvent({ type:"spawnPack", sp:3, x:C.wrap(x+40), y:C.wrap(y+40) });
}
function radial(src){ // mean distance from the source per species, and counts inside its warm core (dT > 3)
  const d = new Array(7).fill(0), n = new Array(7).fill(0), core = new Array(7).fill(0);
  for (let i=0;i<W.n;i++){ if (!W.alive[i]) continue; const sp=W.sp[i];
    const dx=C.wd(W.x[i]-src.x), dy=C.wd(W.y[i]-src.y); d[sp]+=Math.hypot(dx,dy); n[sp]++; if (W.temp[cellOf(i)] > 3) core[sp]++; }
  return { dist: d.map((v,k)=> n[k]? v/n[k] : NaN), core };
}
function chemistry(){ // detritus and dissolved mineral per cell, warm cells vs ambient cells
  let wD=0, wM=0, wN=0, aD=0, aM=0, aN=0;
  for (let c=0;c<P.GRID*P.GRID;c++){ const D=W.dE[c]+W.dP[c]+W.dM[c];
    if (W.temp[c] > 3){ wD+=D; wM+=W.M[c]; wN++; } else { aD+=D; aM+=W.M[c]; aN++; } }
  return { warmD: wN? wD/wN : NaN, warmM: wN? wM/wN : NaN, ambD: aD/aN, ambM: aM/aN, warmCells: wN };
}
const NOTHERMO = flag("--nothermo");   // H-P6 control: every species blind to warmth (TRAITS.thermo = 0), metabolism unchanged
const BLIND = new Set((args.includes("--blind") ? args[args.indexOf("--blind")+1] : "").split(",").filter(Boolean).map(Number)); // --blind 2,6: these species blind
const THERMO0 = TRAITS.map(T => T.thermo);
function run(seed, setup){
  TRAITS.forEach((T, sp) => { T.thermo = (NOTHERMO || BLIND.has(sp)) ? 0 : THERMO0[sp]; });
  P.tempAmb = 0; L.start(seed, true); // ambient is a harness-level switch: reset per run (the press sets it at --at)
  let gppWarm=0, gppAmb=0, respWarm=0, respAmb=0, samples=0, apexLost=-1, coreLost=-1;
  const cyc = [];
  for (let t=1;t<=HORIZON;t++){
    if (t === AT) setup();
    C.step();
    const p = L.pops();
    if (apexLost < 0 && t > AT && p[SPECIES.APEX] === 0) apexLost = t;
    if (coreLost < 0 && L.coreCollapsed(p, t)) coreLost = t;
    if (t % 20 === 0 && t > AT) cyc.push(p[SPECIES.PREY]);
  }
  const p = L.pops(), src = W.sources[W.sources.length-1];
  const warmth = LIVE.map(sp => chan(58+sp));
  // realised mat production now: photosynthesis gain per mat cell, warm vs ambient (one tick, read off flows by a probe step)
  const g0 = W.flows.gpp; C.step(); const dg = W.flows.gpp - g0; // (probe tick; the fingerprint is not compared here)
  return { pops: p, apexLost, coreLost, warmth, rad: radial(src), chem: chemistry(), driftaCV: L.cv(cyc), gppTick: dg };
}
const f = (v, d=2) => isNaN(v) ? "  -  " : v.toFixed(d);
function report(title, setup){
  console.log(`\n=== ${title} (layout at t=${AT}, evolving, 8 seeds) ===`);
  console.log("seed | pops S/D/C/B/V     | apex lost | core | warmth felt S/D/C/B/V      | mean dist S/D/C/B/V           | in warm core S/D/C/B/V | detritus warm/amb | mineral warm/amb | Drifta CV");
  const rows = [];
  for (const s of SEEDS){ const r = run(s, setup); rows.push(r);
    const pp = LIVE.map(k => r.pops[k]).join("/"), wf = r.warmth.map(v => f(v,1)).join("/");
    const dd = LIVE.map(k => f(r.rad.dist[k],0)).join("/"), cc = LIVE.map(k => r.rad.core[k]).join("/");
    console.log(`${s}   | ${pp.padEnd(19)}| ${r.apexLost>0 ? String(r.apexLost).padStart(6) : "  held"}   | ${r.coreLost>0 ? "LOST@"+r.coreLost : "ok   "} | ${wf.padEnd(27)}| ${dd.padEnd(30)}| ${cc.padEnd(23)}| ${f(r.chem.warmD)}/${f(r.chem.ambD)}     | ${f(r.chem.warmM)}/${f(r.chem.ambM)}    | ${f(r.driftaCV)}`);
  }
  const med = xs => { const a = xs.filter(v => !isNaN(v)).sort((x,y)=>x-y); return a.length ? a[Math.floor(a.length/2)] : NaN; };
  console.log(`median dist from source: ${LIVE.map(k => TRAITS[k].name.slice(0,3)+" "+f(med(rows.map(r=>r.rad.dist[k])),0)).join(" · ")}  (H-P2: Venator > Cilio > Solara ≈ Drifta > Bacillus)`);
  console.log(`apex lost on ${rows.filter(r=>r.apexLost>0).length}/8 · core lost on ${rows.filter(r=>r.coreLost>0).length}/8 · Drifta CV median ${f(med(rows.map(r=>r.driftaCV)))}`);
  return rows;
}
if (flag("--spot")){ const a = num("--a", 8);
  report("control: untouched world", () => {});
  report(`hot sun: warmth +${a} on the shipped sun`, () => C.applyEvent({ type:"sourceSet", k:0, a }));
}
if (flag("--heater")){ const a = num("--a", 10);
  if (!flag("--only-heated")) report("seeded second sun (Block L reference)", () => { C.applyEvent({ type:"sourceAdd", x:0, y:0, i:1, a:0, sigma:130 }); seedKit(0,0); });
  report(`seeded second sun + heater +${a}`, () => { C.applyEvent({ type:"sourceAdd", x:0, y:0, i:1, a, sigma:130 }); seedKit(0,0); });
}
if (flag("--press")){ const amb = num("--amb", 6);
  report(`global warming: ambient +${amb}`, () => { P.tempAmb = amb; C.computeTemp(); });
  P.tempAmb = 0;
}
if (!flag("--spot") && !flag("--heater") && !flag("--press")) console.log("usage: node harness/heat.js --spot [--a 8] | --heater [--a 10] | --press [--amb 6]  [--at 3000]");
