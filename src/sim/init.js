function resetWorld(){
  W.initialized = false; W.n = 0; W.freeList.length = 0; W.alive.fill(0);
  W.tick = 0; W.events.length = 0; W.eventLog.length = 0;
}
function initWorld(seed){
  if (W.initialized) return; W.initialized = true;
  W.rng = mulberry32(seed === undefined ? P.SEED : seed);
  W.n=0; W.freeList.length=0; W.alive.fill(0); W.tick=0;
  W.M.fill(P.M0); W.dE.fill(0); W.dP.fill(0); W.dM.fill(0); W.sc.fill(0); W.al.fill(0);
  W.recHead=0; W.recCount=0; W.rec.fill(0); W.sysEvents.length=0;
  W.addedM=0; P.lightMul=1.0; W.evLog.length=0;
  det.estab.fill(0); det.run.fill(0); det.bloom.fill(0); det.crash.fill(0);
  det.packAwake=false; det.depleted=false; det.lockedWarn=false; det.sweep.fill(0); det.uniform.fill(0); det.diverse.fill(0); det.diverseRun.fill(0);
  recPrev.uptake=recPrev.gpp=recPrev.resp=recPrev.bacRelease=recPrev.corpseToDet=recPrev.egestE=recPrev.deaths=0;
  recPrev.deathsBy.fill(0);
  W.cN=0; W.cFree.length=0; W.cAlive.fill(0);
  for (const k in W.flows) W.flows[k] = (k==="deathsBy") ? [0,0,0,0,0,0,0] : 0;
  computeLight();
  const nearSun = rad => { const a=R()*6.283, r=Math.sqrt(R())*rad;
    return [wrap(W.sun.x+Math.cos(a)*r), wrap(W.sun.y+Math.sin(a)*r)]; };
  const endow = endowFounder; { // (hoisted to module scope in the tweaks batch; alias kept)
    void 0;
  };
  for(let k=0;k<120;k++){ const [a,b]=nearSun(380); endow(spawn(0,a,b,30+R()*30,7+R()*2)); }
  for(let k=0;k<500;k++){ const [a,b]=nearSun(330); endow(spawn(1,a,b,16+R()*12,3.4)); }
  for(let k=0;k<12;k++){ const [a,b]=nearSun(420); endow(spawn(2,a,b,60,6)); }
  if (P.spawnDecomposers) for(let k=0;k<60;k++){ const [a,b]=nearSun(460); endow(spawn(3,a,b,10+R()*6,2)); }
  { const [ax,ay]=nearSun(300); // pack founding: a brood arrives together, shares the discovered hunting ground
    for(let k=0;k<9;k++){ const v=spawn(6, wrap(ax+(R()-0.5)*120), wrap(ay+(R()-0.5)*120), 70, 9);
      if(v>=0){ endow(v); W.cy[v]=1; } } }
  // Mycora deferred (3.4 finding): establishment marginal AND, where established, it robs the predator's kill-caches — sessility does not spare the caches (spores colonize kill-grounds). Re-entry condition: predator surplus margin, jointly with Necro.
  // Necro deferred (3.3 finding): viable on kill-flux (8/8 survival) but a subsistence predator cannot afford a kleptoparasite — Venator caches kills, Necro empties the pantry. Re-entry condition: predator surplus margin.
}

// __NODE_EXPORTS__ (everything below is stripped from the artifact by build.py)
if (typeof module !== "undefined" && module.exports !== undefined){
  module.exports = { P, W, R, TRAITS, TAG, REC, indicators, impact, cellOf, diffuseM, wrap, wd, spawn, killOrg, computeLight, rebuild,
    cellLight, neighbors, step, initWorld, resetWorld, applyEvent, drainEvents,
    queueEvent, mulberry32, CELL, MAXN };
}
