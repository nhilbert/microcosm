// 7.H.1 — local heat: the measurement behind phase7-heat-plan.md §4 (predictions H-P1..H-P4).
//
//   node harness/heat.js --spot  [--a 8] [--at 3000]   a warm source ON the shipped sun ("Hot sun") vs the untouched world
//   node harness/heat.js --heater [--a 10] [--at 3000]  a dark heater at the far corner (seeded, like Block L)
//   node harness/heat.js --press [--amb 6]              global warming: P.tempAmb raised at --at (the deferred lever, as an experiment)
//   node harness/heat.js --loci  [--a 10]               H-P5: the existing loci under a heated patch (per-patch locus means, heater layout)
//   node harness/heat.js --gate                         7.H.4 gate: heat narrated unprompted, untouched control silent
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
  const heatEv = W.sysEvents.filter(e => e.type.startsWith("heat")).map(e => e.type.slice(4).toLowerCase()+(e.sp>=0 ? ":"+TRAITS[e.sp].name.slice(0,3) : "")+"@"+e.tick);
  // realised mat production now: photosynthesis gain per mat cell, warm vs ambient (one tick, read off flows by a probe step)
  const g0 = W.flows.gpp; C.step(); const dg = W.flows.gpp - g0; // (probe tick; the fingerprint is not compared here)
  return { pops: p, apexLost, coreLost, warmth, rad: radial(src), chem: chemistry(), driftaCV: L.cv(cyc), gppTick: dg, heatEv };
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
    if (r.heatEv.length) console.log(`       narrated: ${r.heatEv.join(" ")}`);
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
if (flag("--loci")){ // H-P5: the existing loci under a heated patch, measured with the patch machinery of Block L
  const a = num("--a", 10);
  console.log(`H-P5 — heater +${a} on a seeded far sun at t=${AT}, evolving, 8 seeds. Patch = nearest source; per-patch locus mean where the patch holds >= 20.`);
  console.log("seed | sp       | whole mean±sd | patch0 (sun) | patch1 (warm) | spread | n0/n1");
  const LOCI = [SPECIES.PREY, 3]; // Drifta defense, Bacillus rate-yield: the two H-P5 names
  const spreads = { [SPECIES.PREY]: [], 3: [] };
  for (const s of SEEDS){
    TRAITS.forEach((T, sp) => { T.thermo = THERMO0[sp]; });
    P.tempAmb = 0; L.start(s, true);
    for (let t=1;t<=HORIZON;t++){
      if (t === AT){ C.applyEvent({ type:"sourceAdd", x:0, y:0, i:1, a, sigma:130 }); seedKit(0,0); }
      C.step();
    }
    for (const sp of LOCI){
      const K = W.sources.length, n = new Array(K).fill(0), m = new Array(K).fill(0); let N=0, sg=0, sgg=0;
      for (let i=0;i<W.n;i++){ if (!W.alive[i] || W.sp[i]!==sp) continue;
        let best=0, bd=Infinity; for (let k=0;k<K;k++){ const dx=C.wd(W.sources[k].x-W.x[i]), dy=C.wd(W.sources[k].y-W.y[i]), d=dx*dx+dy*dy; if (d<bd){ bd=d; best=k; } }
        n[best]++; m[best]+=W.g[i]; N++; sg+=W.g[i]; sgg+=W.g[i]*W.g[i]; }
      const mean = N? sg/N : NaN, sd = N? Math.sqrt(Math.max(0, sgg/N-mean*mean)) : NaN;
      const p0 = n[0]>=20 ? m[0]/n[0] : NaN, p1 = n[1]>=20 ? m[1]/n[1] : NaN;
      const spread = !isNaN(p0) && !isNaN(p1) ? Math.abs(p1-p0) : NaN;
      if (!isNaN(spread)) spreads[sp].push(spread);
      console.log(`${s}   | ${TRAITS[sp].name.padEnd(9)}| ${f(mean)}±${f(sd)}    | ${f(p0)}         | ${f(p1)}          | ${f(spread)}   | ${n[0]}/${n[1]}`);
    }
  }
  for (const sp of LOCI) console.log(`${TRAITS[sp].name}: patch spread >= 0.10 on ${spreads[sp].filter(v=>v>=0.10).length}/8 seeds (both patches held; ${8-spreads[sp].length} seed(s) without a measurable warm-patch population)`);
}
if (flag("--gate")){
  // 7.H.4 gate (phase7-heat-plan.md §12): the Observatory narrates the warm water unprompted.
  //   1. hot sun (+8 on the shipped sun at t=3000): mat thinning (heatRetreat Solara) AND detritus pile-up
  //      (heatPile) narrated on >= 6/8 seeds
  //   2. warming press (+6): the pack's starvation (heatStarve) narrated on >= 6/8 seeds, BEFORE the apex
  //      extinction event on every seed where both fire
  //   3. untouched control: zero heat events on 8/8 and channels 58-74 exactly 0 throughout
  const REC2 = L.REC;
  const gateRun = (seed, setup) => {
    TRAITS.forEach((T, sp) => { T.thermo = THERMO0[sp]; });
    P.tempAmb = 0; L.start(seed, true); let peak = 0;
    for (let t=1;t<=HORIZON;t++){
      if (t === AT) setup();
      C.step();
      if (t % REC2.STRIDE === 0) for (let ch=58; ch<=74; ch++) peak = Math.max(peak, Math.abs(chan(ch)));
    }
    const ev = W.sysEvents.filter(e => e.type.startsWith("heat"));
    const ext = W.sysEvents.find(e => e.type==="extinct" && e.sp===SPECIES.APEX);
    return { seed, ev, extTick: ext ? ext.tick : -1, peak };
  };
  const evStr = r => r.ev.map(e => e.type.slice(4).toLowerCase()+(e.sp>=0 ? ":"+TRAITS[e.sp].name.slice(0,3) : "")+"@"+e.tick).join(" ") || "none";
  console.log(`=== hot sun: warmth +8 on the shipped sun at t=${AT} (evolving) ===`);
  const hot = SEEDS.map(s => gateRun(s, () => C.applyEvent({ type:"sourceSet", k:0, a:8 })));
  for (const r of hot) console.log(`seed ${r.seed}: ${evStr(r)}`);
  console.log(`=== warming press: ambient +${num("--amb",6)} at t=${AT} (evolving) ===`);
  const prs = SEEDS.map(s => gateRun(s, () => { P.tempAmb = num("--amb",6); C.computeTemp(); }));
  P.tempAmb = 0;
  for (const r of prs) console.log(`seed ${r.seed}: ${evStr(r)}${r.extTick>0 ? " | apex extinct@"+r.extTick : ""}`);
  console.log(`=== untouched control (evolving) ===`);
  const ctl = SEEDS.map(s => gateRun(s, () => {}));
  for (const r of ctl) console.log(`seed ${r.seed}: ${r.ev.length} heat events | channel 58-74 peak ${r.peak}`);
  const c1r = hot.filter(r => r.ev.some(e => e.type==="heatRetreat" && e.sp===SPECIES.MAT)).length;
  const c1p = hot.filter(r => r.ev.some(e => e.type==="heatPile")).length;
  const starved = prs.filter(r => r.ev.some(e => e.type==="heatStarve"));
  const lead = starved.filter(r => { const sv = r.ev.find(e => e.type==="heatStarve"); return r.extTick < 0 || sv.tick < r.extTick; });
  const c3 = ctl.every(r => r.ev.length === 0 && r.peak === 0);
  console.log(`\n1. hot sun narrated: mat thinning ${c1r}/8, pile-up ${c1p}/8  (criterion: both >= 6/8) ${c1r>=6 && c1p>=6 ? "PASS" : "FAIL"}`);
  console.log(`2. press narrated: pack starving ${starved.length}/8, before the extinction on ${lead.length}/${starved.length}  (criterion: >= 6/8, always ahead) ${starved.length>=6 && lead.length===starved.length ? "PASS" : "FAIL"}`);
  console.log(`3. control silent, channels exactly 0: ${c3 ? "PASS" : "FAIL"}`);
  if (!(c1r>=6 && c1p>=6 && starved.length>=6 && lead.length===starved.length && c3)) process.exit(1);
}
if (!flag("--spot") && !flag("--heater") && !flag("--press") && !flag("--loci") && !flag("--gate")) console.log("usage: node harness/heat.js --spot [--a 8] | --heater [--a 10] | --press [--amb 6] | --loci [--a 10] | --gate  [--at 3000]");
