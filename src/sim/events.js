// ---------- intervention events (the ONLY legal way to mutate world state from outside) ----------
function applyEvent(ev){
  const { done, ...logged } = ev;
  W.eventLog.push({ t: W.tick, ...logged });          // payload log: replay substrate (Phase 5)
  if (W.eventLog.length > 4000) W.eventLog.splice(0, 1000);
  switch(ev.type){
    case "spawnPack": {
      // seed a small founding group of a species at a location (conservation-safe: endow pulls
      // mineral from the local water; energy and protein are open books, as at world-founding)
      const KIT = { 0:{n:6,sz:5,en:30}, 1:{n:8,sz:3.4,en:25}, 2:{n:4,sz:6,en:35}, 3:{n:12,sz:2,en:12}, 6:{n:3,sz:9,en:70} };
      const kit = KIT[ev.sp]; if (!kit) break;
      const ids = [];
      for (let k=0;k<kit.n;k++){
        const j = spawn(ev.sp, wrap(ev.x+(R()-0.5)*70), wrap(ev.y+(R()-0.5)*70), kit.en*(0.8+R()*0.4), kit.sz);
        if (j>=0){ endowFounder(j); ids.push([j, W.gen[j]]); }
      }
      done && done({ ids }); break; }
    case "unspawnPack": {
      const sn=ev.snap; if(!sn) break;
      for (const [j,g] of sn.ids){
        if (W.alive[j] && W.gen[j]===g){
          if (W.mn[j] > 0) W.M[cellOf(j)] += W.mn[j]; // quiet removal: mineral back to the water, no corpse
          W.mn[j]=0; W.pr[j]=0; W.alive[j]=0; W.freeList.push(j);
        }
      }
      break; }
    case "fertilize": {
      // pulse lever: a mineral pour — splash over the tapped cell and its neighbours
      const G=P.GRID, gx=Math.floor(ev.x/CELL)&(G-1), gy=Math.floor(ev.y/CELL)&(G-1);
      const w=[[0,0,0.4],[1,0,0.15],[-1,0,0.15],[0,1,0.15],[0,-1,0.15]];
      const cells=[];
      for (const [dx2,dy2,f] of w){
        const c=(((gy+dy2+G)%G))*G+(((gx+dx2+G)%G));
        const amt=ev.amount*f;
        W.M[c]+=amt; cells.push([c,amt]);
      }
      W.addedM += ev.amount;
      done && done({ cells, amount: ev.amount }); break; }
    case "unfertilize": {
      // reclaim only what the water still holds; what life absorbed stays in bodies
      const sn=ev.snap; if(!sn) break;
      let reclaimed=0;
      for (const [c,amt] of sn.cells){ const take=Math.min(W.M[c], amt); W.M[c]-=take; reclaimed+=take; }
      W.addedM = Math.max(0, W.addedM - reclaimed);
      break; }
    case "lightMul": {
      const prev = P.lightMul;
      P.lightMul = Math.max(0.2, Math.min(2.0, ev.v));
      computeLight();
      done && done({ prev }); break; }
    // Phase 6 evolution settings: the player's hand on the second-order loop. Same rules as every
    // lever -- through the queue, logged, undoable via prev. Changing sigma changes the future
    // PRNG stream (draws appear or vanish at divisions) exactly as moving the sun does.
    case "mutation": {
      const prev = P.mutation;
      P.mutation = !!ev.v;
      done && done({ prev }); break; }
    case "locus": {
      const Lc = TRAITS[ev.sp] && TRAITS[ev.sp].loci[ev.locus|0]; if (!Lc || !(ev.key in LOCUS_DEFAULTS)) break; // ev.locus: which locus (default 0, the display locus)
      const prev = Lc[ev.key];
      const lim = ev.key === "sigma" ? [0, 0.12] : ev.key === "curve" ? [-0.5, 0.8] : [0, 1.5]; // slopes are prices: bounded too
      Lc[ev.key] = Math.max(lim[0], Math.min(lim[1], +ev.v || 0));
      done && done({ prev }); break; }
    // Energy sources (7.L/7.H): light i (0-1.5) and warmth a (-8..15) per source. Never fewer than one
    // (decision 2); at most P.maxSources. None of these draw; they change the future stream only through
    // ecology, like moving the sun always has.
    case "source": {
      const s = W.sources[ev.k|0]; if (!s) break;
      s.x = wrap(ev.x); s.y = wrap(ev.y);
      computeLight(); computeTemp(); W.lightDirty = true; break; }
    case "sourceAdd": {
      if (W.sources.length >= P.maxSources) break;
      const s = { x: wrap(ev.x), y: wrap(ev.y),
        i: Math.max(0, Math.min(1.5, ev.i === undefined ? P.sunI : +ev.i)),
        a: Math.max(-8, Math.min(15, ev.a === undefined ? 0 : +ev.a)),
        sigma: Math.max(90, Math.min(300, ev.sigma === undefined ? P.sunSigma : +ev.sigma)) };
      const k = ev.at === undefined ? W.sources.length : Math.max(0, Math.min(W.sources.length, ev.at|0)); // `at` restores an undone removal at its old index
      W.sources.splice(k, 0, s);
      computeLight(); computeTemp(); W.lightDirty = true; done && done({ k }); break; }
    case "sourceRemove": {
      const k = ev.k|0; if (W.sources.length <= 1 || !W.sources[k]) break;
      const snap = W.sources.splice(k, 1)[0];
      computeLight(); computeTemp(); W.lightDirty = true; done && done({ k, snap }); break; }
    case "sourceSet": {
      const s = W.sources[ev.k|0]; if (!s) break;
      const prev = { i: s.i, a: s.a, sigma: s.sigma };
      if (ev.i !== undefined) s.i = Math.max(0, Math.min(1.5, +ev.i));
      if (ev.a !== undefined) s.a = Math.max(-8, Math.min(15, +ev.a));
      if (ev.sigma !== undefined) s.sigma = Math.max(90, Math.min(300, +ev.sigma));
      computeLight(); computeTemp(); W.lightDirty = true; done && done({ prev }); break; }
    // Walls (7.W, docs/phase7-walls-plan.md): face barriers -- light/warmth/flow transmission and
    // per-species passage. Draw-free, like sources: they change the future stream only through ecology.
    case "wallAdd": {
      if (W.walls.length >= P.maxWalls) break;
      const wl = makeWall(ev); if (!wl) break;   // stroke snapped to nothing
      const k = ev.at === undefined ? W.walls.length : Math.max(0, Math.min(W.walls.length, ev.at|0)); // `at` restores an undone removal at its old index
      W.walls.splice(k, 0, wl);
      compileWalls(); computeLight(); computeTemp(); W.lightDirty = true;
      done && done({ k }); break; }
    case "wallRemove": {
      const k = ev.k|0; if (!W.walls[k]) break;
      const s = W.walls.splice(k, 1)[0];
      compileWalls(); computeLight(); computeTemp(); W.lightDirty = true;
      done && done({ k, snap: { x0:s.x0, y0:s.y0, dx:s.dx, dy:s.dy, lt:s.lt, ht:s.ht, fl:s.fl, pass:s.pass } }); break; }
    case "wallSet": {
      const wl = W.walls[ev.k|0]; if (!wl) break;
      const prev = { lt: wl.lt, ht: wl.ht, fl: wl.fl, pass: wl.pass };
      if (ev.lt !== undefined) wl.lt = Math.max(0, Math.min(1, +ev.lt || 0));
      if (ev.ht !== undefined) wl.ht = Math.max(0, Math.min(1, +ev.ht || 0));
      if (ev.fl !== undefined) wl.fl = Math.max(0, Math.min(1, +ev.fl || 0));
      if (ev.pass !== undefined) wl.pass = ev.pass|0;
      compileWalls(); computeLight(); computeTemp(); W.lightDirty = true;
      done && done({ prev }); break; }
    case "feed": {
      const i = ev.i; if (!(W.alive[i] && W.gen[i] === ev.gen)) break;
      const cap = P.capMul*W.sz[i], before = W.en[i];
      W.en[i] = Math.min(cap, W.en[i] + ev.frac*cap);
      W.pr[i] = Math.min(P.pQuota*W.sz[i], W.pr[i] + ev.frac*P.pQuota*W.sz[i]);
      if (W.cy[i]){ W.cy[i] = 0; W.gr[i] = 60; }
      done && done(W.en[i] - before); break; }
    case "unfeed": {
      const i = ev.i;
      if (W.alive[i] && W.gen[i] === ev.gen) W.en[i] = Math.max(0.5, W.en[i] - ev.delta);
      break; }
    case "kill": {
      const i = ev.i; if (!(W.alive[i] && W.gen[i] === ev.gen)) break;
      const snap = { sp:W.sp[i], x:W.x[i], y:W.y[i], en:W.en[i], sz:W.sz[i],
        hd:W.hd[i], cd:W.cd[i], cy:W.cy[i], gr:W.gr[i], birth:W.birth[i], mn:W.mn[i], pr:W.pr[i] };
      snap.corpse = killOrg(i); done && done(snap); break; }
    case "revive": {
      const sn = ev.snap;
      const j = spawn(sn.sp, sn.x, sn.y, sn.en, sn.sz);
      if (j >= 0){ W.hd[j]=sn.hd; W.cd[j]=sn.cd; W.cy[j]=sn.cy; W.gr[j]=sn.gr; W.birth[j]=sn.birth; W.pr[j]=sn.pr||0;
        let got = 0;
        if (sn.corpse >= 0 && W.cAlive[sn.corpse]){ // reclaim the corpse's remaining mineral
          got = W.cM[sn.corpse]; W.cM[sn.corpse]=0;
          W.cAlive[sn.corpse]=0; W.cFree.push(sn.corpse);
        }
        const c=cellOf(j), top=Math.min(W.M[c], Math.max(0,(sn.mn||0)-got)); W.M[c]-=top;
        W.mn[j]=got+top; }
      break; }
  }
}
function drainEvents(){ while (W.events.length) applyEvent(W.events.shift()); }
function queueEvent(ev){
  if (ev.type === "source"){ // coalesce: only the latest position of that sun matters
    const k = W.events.findIndex(e => e.type === "source" && (e.k|0) === (ev.k|0));
    if (k >= 0){ W.events[k] = ev; return; }
  }
  if (ev.type === "wallSet"){ // coalesce a slider drag: only the latest properties of that wall matter within one tick
    const k = W.events.findIndex(e => e.type === "wallSet" && (e.k|0) === (ev.k|0));
    if (k >= 0){ W.events[k] = { ...W.events[k], ...ev }; return; }
  }
  W.events.push(ev);
}

