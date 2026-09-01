// the shipped evolution settings, captured once at load; initWorld restores them (like P.lightMul)
const LOCUS_SHIPPED = TRAITS.map(T => T.loci.map(L => ({ sigma: L.sigma, curve: L.curve })));
function resetWorld(){
  W.initialized = false; W.n = 0; W.freeList.length = 0; W.alive.fill(0);
  W.tick = 0; W.events.length = 0; W.eventLog.length = 0;
}
function initWorld(seed, sc){
  if (W.initialized) return; W.initialized = true;
  W.seed = seed === undefined ? P.SEED : seed; W.rngState = W.seed|0;
  W.n=0; W.freeList.length=0; W.alive.fill(0); W.tick=0;
  W.M.fill(sc && sc.M0 !== undefined ? sc.M0 : P.M0); W.dE.fill(0); W.dP.fill(0); W.dM.fill(0); W.sc.fill(0); W.al.fill(0);
  W.recHead=0; W.recCount=0; W.rec.fill(0); W.sysEvents.length=0;
  W.addedM=0; P.lightMul=1.0; W.evLog.length=0;
  // P.mutation is a harness-level switch (like spawnDecomposers) and is NOT reset here; the UI reset restores it
  TRAITS.forEach((T, sp) => T.loci.forEach((L, k) => { L.sigma = LOCUS_SHIPPED[sp][k].sigma; L.curve = LOCUS_SHIPPED[sp][k].curve; }));
  det.estab.fill(0); det.run.fill(0); det.bloom.fill(0); det.crash.fill(0);
  det.packAwake=false; det.depleted=false; det.lockedWarn=false; det.sweep.fill(0); det.uniform.fill(0); det.diverse.fill(0); det.diverseRun.fill(0); det.rail.fill(0); det.railRun.fill(0); det.adapt.fill(0); det.adaptRun.fill(0);
  det.heatRetreat.fill(0); det.heatPile=false; det.heatPileRun=0; det.heatStarve=false; det.heatStarveRun=0;
  det.heatTrap.fill(0); det.heatTrapRun.fill(0); mv.ok.fill(0); mv.tick=-1;
  recPrev.uptake=recPrev.gpp=recPrev.resp=recPrev.bacRelease=recPrev.corpseToDet=recPrev.egestE=recPrev.deaths=0;
  recPrev.deathsBy.fill(0);
  W.cN=0; W.cFree.length=0; W.cAlive.fill(0);
  for (const k in W.flows) W.flows[k] = (k==="deathsBy") ? [0,0,0,0,0,0,0] : 0;
  W.sources.length = 0; W.sources.push({ x: P.WORLD/2, y: P.WORLD/2, i: P.sunI, a: 0, sigma: P.sunSigma }); // one sun, centred (like P.lightMul)
  W.walls.length = 0; compileWalls(); // a fresh world has no walls (7.W)
  computeLight(); computeTemp();
  const nearSun = rad => { const a=R()*6.283, r=Math.sqrt(R())*rad;
    return [wrap(W.sources[0].x+Math.cos(a)*r), wrap(W.sources[0].y+Math.sin(a)*r)]; };
  const endow = endowFounder; { // (hoisted to module scope in the tweaks batch; alias kept)
    void 0;
  };
  // Scenario founding (Phase 8 levels): sc = { found:{sp:count}, M0 } overrides founding counts and
  // starting mineral. DRAW-FREE WHEN ABSENT (the walls pattern, banner rule 6): with sc undefined
  // every count below is the shipped literal and the RNG stream is bit-identical; a scenario world
  // diverges only through its different founding, like a moved sun. A count of 0 skips the whole
  // block, so an unfounded species consumes zero draws (contract rule 2 at world scale).
  const nOf = (sp, n) => sc && sc.found && sc.found[sp] !== undefined ? sc.found[sp]|0 : n;
  for(let k=0;k<nOf(0,120);k++){ const [a,b]=nearSun(380); endow(spawn(0,a,b,30+R()*30,7+R()*2)); }
  for(let k=0;k<nOf(1,500);k++){ const [a,b]=nearSun(330); endow(spawn(1,a,b,16+R()*12,3.4)); }
  for(let k=0;k<nOf(2,12);k++){ const [a,b]=nearSun(420); endow(spawn(2,a,b,60,6)); }
  if (P.spawnDecomposers) for(let k=0;k<nOf(3,60);k++){ const [a,b]=nearSun(460); endow(spawn(3,a,b,10+R()*6,2)); }
  if (nOf(6,9) > 0){ const [ax,ay]=nearSun(300); // pack founding: a brood arrives together, shares the discovered hunting ground
    for(let k=0;k<nOf(6,9);k++){ const v=spawn(6, wrap(ax+(R()-0.5)*120), wrap(ay+(R()-0.5)*120), 70, 9);
      if(v>=0){ endow(v); W.cy[v]=1; } } }
  // Mycora deferred (3.4 finding): establishment marginal AND, where established, it robs the predator's kill-caches — sessility does not spare the caches (spores colonize kill-grounds). Re-entry condition: predator surplus margin, jointly with Necro.
  // Necro deferred (3.3 finding): viable on kill-flux (8/8 survival) but a subsistence predator cannot afford a kleptoparasite — Venator caches kills, Necro empties the pantry. Re-entry condition: predator surplus margin.
}

// __NODE_EXPORTS__ (everything below is stripped from the artifact by build.py)
if (typeof module !== "undefined" && module.exports !== undefined){
  module.exports = { P, W, R, TRAITS, TAG, REC, SPECIES, LOCUS_DEFAULTS, normalizeTraits, indicators, impact, cellOf, diffuseM, wrap, wd, spawn, killOrg, computeLight, computeTemp, rebuild,
    cellLight, neighbors, step, initWorld, resetWorld, applyEvent, drainEvents,
    queueEvent, mulberry32, CELL, MAXN, MAXLOCI,
    makeWall, compileWalls, marchMul, pathBlocked,
    LEVELS, LEVEL_ROWS, LVL, levelStart, levelRestart, levelStop, levelCheck, levelMeter, levelAllows, levelPourOk, levelNotePour, levelNarration };
}
