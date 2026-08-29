// ============================================================
// OBSERVATORY RECORDER (Phase 4.0)
// Ring buffer sampled every REC.STRIDE ticks. Channels (Float32):
//  0-6   population per species        7-13  biomass (energy sum) per species
//  14    dissolved mineral   15 bound  16 in-corpses  17 in-detritus
//  18-24 flow deltas since previous sample:
//        18 uptake  19 GPP  20 respiration  21 mineralization(bacRelease)
//        22 corpseToDet  23 egested E  24 deaths
//  25    corpse count       26-32 mean size per species   33-34 sun x,y
//  35-41 deaths per species since previous sample
//  42-48 locus mean per species (Phase 5.1; 0 for species without a locus or with none alive)
//  49-55 locus standard deviation per species — variance is the fuel gauge of evolution
// CONTRACT: the recorder is a pure observer — zero PRNG draws, zero
// mutation of dynamic state. Conformance bit-identity with the recorder
// running is the standing acceptance test for this whole layer.
// (REC itself is declared in src/sim/world.js, where the buffer is sized from it.)
// ============================================================
// ---- system-event detectors (Phase 4.1): pure observers narrating the world ----
const DET_ESTAB = [40, 40, 20, 80, 10, 4, 4]; // establishment thresholds per species
const det = { estab:[0,0,0,0,0,0,0], run:[0,0,0,0,0,0,0], bloom:[0,0,0,0,0,0,0], crash:[0,0,0,0,0,0,0],
  packAwake:false, depleted:false, lockedWarn:false,
  sweep:[0,0,0,0,0,0,0],   // +-1 a line is taking over, +-2 it has taken over (sign = direction from g0)
  uniform:[0,0,0,0,0,0,0],
  diverse:[0,0,0,0,0,0,0], diverseRun:[0,0,0,0,0,0,0],   // standing polymorphism: both ends coexist
  rail:[0,0,0,0,0,0,0], railRun:[0,0,0,0,0,0,0],           // corridor contact: a locus pinned at its edge (6.2)
  adapt:[0,0,0,0,0,0,0], adaptRun:[0,0,0,0,0,0,0] };         // local adaptation (7.L): the locus differs between light patches
// 7.L patch statistics: nearest sun by toroidal distance (the phototaxis rule), locus mean per patch for one
// species. Pure reads; `spread` = max - min over patches holding >= 20 individuals (0 with one sun).
const PATCH_MIN = 20;
function patchMeans(sp){
  const K = W.sources.length, n = new Array(K).fill(0), m = new Array(K).fill(0);
  for (let i=0;i<W.n;i++){ if (!W.alive[i] || W.sp[i]!==sp) continue;
    let best=0, bd=Infinity; for (let k=0;k<K;k++){ const dx=wd(W.sources[k].x-W.x[i]), dy=wd(W.sources[k].y-W.y[i]), d=dx*dx+dy*dy; if (d<bd){ bd=d; best=k; } }
    n[best]++; m[best]+=W.g[i]; }
  let hi=-1, lo=-1;
  for (let k=0;k<K;k++){ if (n[k] < PATCH_MIN) continue; m[k]/=n[k]; if (hi<0 || m[k]>m[hi]) hi=k; if (lo<0 || m[k]<m[lo]) lo=k; }
  return { n, mean: m, hi, lo, spread: hi>=0 && lo>=0 ? m[hi]-m[lo] : 0 };
}
function pushEvent(type, sp, text){
  W.sysEvents.push({ tick: W.tick, type, sp, text });
  if (W.sysEvents.length > 200) W.sysEvents.shift();
}
function detect(r, awake){
  detectEcology(r, awake);
  detectHeredity(r);
  detectChemistry(r);
}
// ---- ecology: establishment, wake, extinction, blooms and crashes per species ----
function detectEcology(r, awake){
  const B = W.rec, N = REC.N, CH = REC.CH;
  const winSec = (10*REC.STRIDE)/10; // the 10-sample window in seconds at 1x speed (200 ticks = 20 s)
  const havePrev = W.recCount >= 1, have10 = W.recCount >= 10;
  const rPrev = ((W.recHead-1+N)%N)*CH, r10 = ((W.recHead-10+N)%N)*CH;
  for (let sp=0; sp<7; sp++){
    const name = TRAITS[sp].name;
    const apex = TRAITS[sp].apex;
    const now = apex ? awake[sp] : B[r+sp];
    const before = havePrev ? (apex ? -1 : B[rPrev+sp]) : -1;
    // establishment (sustained)
    if (!det.estab[sp]){
      det.run[sp] = now >= DET_ESTAB[sp] ? det.run[sp]+1 : 0;
      if (det.run[sp] >= 5){ det.estab[sp]=1;
        pushEvent("estab", sp, apex ? name+" established — "+(now|0)+" hunters." : name+" established — "+(now|0)+" strong."); }
    }
    // predator wake (first hunter out of its cyst)
    if (apex && !det.packAwake && awake[sp] >= 1){ det.packAwake=true;
      pushEvent("wake", sp, "The pack wakes — "+name+" is hunting."); }
    // extinction (any presence to zero, on the full count incl. dormant)
    if (havePrev && B[rPrev+sp] > 0 && B[r+sp] === 0)
      pushEvent("extinct", sp, name+" has died out.");
    // bloom onset / crash over a 10-sample window
    if (have10 && !apex){
      const ago = B[r10+sp], growth = B[r+sp]/Math.max(1, ago);
      if (det.bloom[sp]===0 && growth >= 1.8 && B[r+sp] >= 50){ det.bloom[sp]=1;
        pushEvent("bloom", sp, name+" bloom under way — up "+growth.toFixed(1)+"x in "+winSec+" s."); }
      else if (det.bloom[sp]===1 && growth < 1.1) det.bloom[sp]=0;
      if (det.crash[sp]===0 && growth <= 0.55 && ago >= 50){ det.crash[sp]=1;
        pushEvent("crashev", sp, name+" crashing — down "+Math.round((1-growth)*100)+"% in "+winSec+" s."); }
      else if (det.crash[sp]===1 && growth > 0.9) det.crash[sp]=0;
    }
  }
}
// ---- heredity (Phase 5.1/5.7): sweeps, diversifying, diversity collapse, per species with a locus ----
function detectHeredity(r){
  const B = W.rec, N = REC.N, CH = REC.CH;
  // Calibrated on the 8-seed evolving ensemble: founders sit within +-0.05 of g0 for the first
  // ~2,000 ticks (sd 0.02-0.05), so the dead zone silences the founding; a real sweep carries the
  // mean >= 0.10 from g0 with a 60% majority on that side, reached at t ~ 8,000-12,000.
  for (let sp=0; sp<7; sp++){
    const L = TRAITS[sp].locus; if (!L || B[r+sp] < 50) continue;
    const mean = B[r+42+sp], sd = B[r+49+sp], name = TRAITS[sp].name;
    let hi=0, lo=0, n=0, railHi=0, railLo=0;
    for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ n++; const g=W.g[i]; if (g > L.g0+0.05) hi++; else if (g < L.g0-0.05) lo++; if (g > 0.98) railHi++; else if (g < 0.02) railLo++; }
    const shareHi = hi/n, shareLo = lo/n;
    // rail contact (6.2): a third of the population pinned at a corridor edge for 10 samples -- the
    // trait has run out of room, which is a certification concern the player should see as a story
    const railShare = Math.max(railHi, railLo)/n, railDir = railHi >= railLo ? 1 : -1;
    det.railRun[sp] = railShare >= 0.30 ? det.railRun[sp]+1 : 0;
    if (!det.rail[sp] && det.railRun[sp] >= 10){ det.rail[sp] = railDir;
      pushEvent("rail", sp, name+" has reached the limit of its "+L.label.toLowerCase()+" — "+Math.round(railShare*100)+"% at the "+(railDir>0 ? L.hiWord : L.loWord)+" edge."); }
    else if (det.rail[sp] && railShare < 0.15) det.rail[sp] = 0;
    const dir = (mean - L.g0 >= 0.10 && shareHi >= 0.6) ? 1 : (L.g0 - mean >= 0.10 && shareLo >= 0.6) ? -1 : 0;
    const share = dir > 0 ? shareHi : shareLo;
    const word = dir > 0 ? L.hiWord : L.loWord;
    if (det.sweep[sp] === 0 && dir !== 0){ det.sweep[sp] = dir;
      pushEvent("sweep", sp, "A "+word+" "+name+" line is taking over — "+Math.round(share*100)+"% of the population and rising."); }
    else if (Math.abs(det.sweep[sp]) === 1 && dir === det.sweep[sp] && share >= 0.85){ det.sweep[sp] *= 2;
      pushEvent("sweep", sp, "The "+word+" "+name+" line has taken over — "+Math.round(share*100)+"% of the population."); }
    else if (det.sweep[sp] !== 0 && Math.max(shareHi, shareLo) < 0.45) det.sweep[sp] = 0;
    // diversifying: standing variation established with no line winning -- both strategies coexist.
    // Measured on the balanced (5.7) world: sd climbs 0.02 -> 0.10-0.17 while the mean stays near g0;
    // a sweep instead carries the mean away. The two events are mutually exclusive by construction.
    if (det.sweep[sp] === 0 && sd >= 0.10 && Math.abs(mean - L.g0) < 0.15 && shareHi >= 0.2 && shareLo >= 0.2) det.diverseRun[sp]++;
    else det.diverseRun[sp] = 0;
    if (!det.diverse[sp] && det.diverseRun[sp] >= 10){ det.diverse[sp] = 1;
      pushEvent("diverse", sp, name+" is diversifying — "+L.hiWord+" and "+L.loWord+" lines coexist, neither winning."); }
    else if (det.diverse[sp] && (sd < 0.06 || det.sweep[sp] !== 0)) det.diverse[sp] = 0;
    // local adaptation (7.L): with two or more suns, the locus mean differs between patches by >= 0.10 for
    // 10 samples (each patch holding >= 20). Calibrated on the seeded twin/dim layouts: the plankton's defense
    // locus separated by 0.10-0.18 where the grazers stayed in one patch; the mat's light locus by <= 0.04.
    if (W.sources.length > 1){
      const pm = patchMeans(sp);
      det.adaptRun[sp] = pm.spread >= 0.10 ? det.adaptRun[sp]+1 : 0;
      if (!det.adapt[sp] && det.adaptRun[sp] >= 10){ det.adapt[sp] = 1;
        pushEvent("adapt", sp, name+" differs by patch — "+L.hiWord+" near sun "+(pm.hi+1)+", "+L.loWord+" near sun "+(pm.lo+1)+"."); }
      else if (det.adapt[sp] && pm.spread < 0.05) det.adapt[sp] = 0;
    } else { det.adapt[sp] = 0; det.adaptRun[sp] = 0; }
    // diversity collapse: variation falls to well under half of what it was 270 samples ago.
    // Selection consuming variation is the normal end of a sweep; the event names the cost.
    if (W.recCount >= 271){
      const sdAgo = B[((W.recHead-270+N)%N)*CH + 49 + sp];
      if (!det.uniform[sp] && sdAgo >= 0.06 && sd <= 0.4*sdAgo){ det.uniform[sp] = 1;
        pushEvent("uniform", sp, "Variation collapsing in "+name+" — the population is becoming uniform."); }
      else if (det.uniform[sp] && sd > 0.7*sdAgo) det.uniform[sp] = 0;
    }
  }
}
// ---- chemistry: mineral depletion trend and lock-up level (the K6 detectors) ----
function detectChemistry(r){
  const B = W.rec, N = REC.N, CH = REC.CH;
  const total = B[r+14]+B[r+15]+B[r+16]+B[r+17];
  const dissolvedFrac = B[r+14]/Math.max(1,total), lockedFrac = (B[r+16]+B[r+17])/Math.max(1,total);
  // Depletion is a trend, not a level (calibrated: healthy worlds DIP to 17% and recover;
  // the dying world never once turns). Six minutes of relentless decline is the signature.
  if (W.recCount >= 271){
    // Calibration verdict (4.6): "dissolved falling" is what healthy GROWTH also does —
    // the true death axis is the locked share's trend. Measured: healthy nine-minute
    // locked gains never exceed +5.1 points; the strangling world climbs monotonically.
    const r270 = ((W.recHead-270+N)%N)*CH;
    const tot270 = B[r270+14]+B[r270+15]+B[r270+16]+B[r270+17];
    const lockedAgo = (B[r270+16]+B[r270+17])/Math.max(1,tot270);
    const lockGain = lockedFrac - lockedAgo;
    // founding-edge guard: the trend alone spikes when the window reaches back to the
    // corpse-free birth; require the locked LEVEL to already be abnormal (healthy ~9-11%).
    if (!det.depleted && lockGain >= 0.08 && lockedFrac >= 0.15){ det.depleted=true;
      pushEvent("depleted", -1, "Mineral is flowing into dead matter faster than it returns."); }
    else if (det.depleted && lockGain < 0.02) det.depleted=false;
  }
  if (!det.lockedWarn && lockedFrac > 0.35){ det.lockedWarn=true;
    pushEvent("locked", -1, "Over a third of the world's mineral is locked in dead matter."); }
  else if (det.lockedWarn && lockedFrac < 0.28) det.lockedWarn=false;
}
const recPrev = { uptake:0, gpp:0, resp:0, bacRelease:0, corpseToDet:0, egestE:0, deaths:0, deathsBy:[0,0,0,0,0,0,0] };
function record(){
  const r = W.recHead * REC.CH, B = W.rec;
  const awake = [0,0,0,0,0,0,0];
  for (let k=0;k<REC.CH;k++) B[r+k]=0;
  for (let i=0;i<W.n;i++){
    if (!W.alive[i]) continue;
    const sp = W.sp[i];
    B[r+sp]++; B[r+7+sp]+=W.en[i]; B[r+26+sp]+=W.sz[i];
    if (!W.cy[i]) awake[sp]++;
  }
  for (let sp=0;sp<7;sp++) if (B[r+sp]>0) B[r+26+sp]/=B[r+sp];
  // locus mean + sd per species, awake and dormant alike (the genome does not sleep)
  for (let sp=0;sp<7;sp++){
    if (!TRAITS[sp].locus || B[r+sp] === 0) continue;
    let m=0, m2=0;
    for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp){ const g=W.g[i]; m+=g; m2+=g*g; }
    const n=B[r+sp], mean=m/n, varr=Math.max(0, m2/n - mean*mean);
    B[r+42+sp]=mean; B[r+49+sp]=Math.sqrt(varr);
  }
  // 7.L local adaptation: the locus spread between light patches for the mat (56) and the plankton (57);
  // exactly 0 with one sun. (Measured first as a genotype-light correlation: the wrong instrument -- Solara's
  // locus reads shaded light, which mat density equalises across patches; the patch difference is what moved.)
  B[r+56] = W.sources.length > 1 && TRAITS[SPECIES.MAT].locus ? patchMeans(SPECIES.MAT).spread : 0;
  B[r+57] = W.sources.length > 1 && TRAITS[SPECIES.PREY].locus ? patchMeans(SPECIES.PREY).spread : 0;
  let fM=0, dM=0;
  for (let c=0;c<P.GRID*P.GRID;c++){ fM+=W.M[c]; dM+=W.dM[c]; }
  let bM=0; for (let i=0;i<W.n;i++) if (W.alive[i]) bM+=W.mn[i];
  let cM=0, cN2=0;
  for (let k=0;k<W.cN;k++) if (W.cAlive[k]){ cM+=W.cM[k]; cN2++; }
  B[r+14]=fM; B[r+15]=bM; B[r+16]=cM; B[r+17]=dM; B[r+25]=cN2;
  const F=W.flows;
  B[r+18]=F.uptake-recPrev.uptake;       recPrev.uptake=F.uptake;
  B[r+19]=F.gpp-recPrev.gpp;             recPrev.gpp=F.gpp;
  B[r+20]=F.resp-recPrev.resp;           recPrev.resp=F.resp;
  B[r+21]=F.bacRelease-recPrev.bacRelease; recPrev.bacRelease=F.bacRelease;
  B[r+22]=F.corpseToDet-recPrev.corpseToDet; recPrev.corpseToDet=F.corpseToDet;
  B[r+23]=F.egestE-recPrev.egestE;       recPrev.egestE=F.egestE;
  B[r+24]=F.deaths-recPrev.deaths;       recPrev.deaths=F.deaths;
  B[r+33]=W.sources[0].x; B[r+34]=W.sources[0].y;
  for (let sp=0;sp<7;sp++){ B[r+35+sp]=F.deathsBy[sp]-recPrev.deathsBy[sp]; recPrev.deathsBy[sp]=F.deathsBy[sp]; }
  detect(r, awake);
  W.recHead=(W.recHead+1)%REC.N;
  if (W.recCount<REC.N) W.recCount++;
}
// ---- indicators (Phase 4.2): the health dashboard, computed on demand ----
