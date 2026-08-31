const CELL = P.WORLD / P.GRID;
const MAXN = 6000;
// Observatory ring buffer geometry (channel map documented atop src/observatory/recorder.js).
// Lives here because W.rec is sized from it; changing CH is a declared rebaseline.
const REC = { N: 900, STRIDE: 20, CH: 141 }; // 56-57: locus spread between patches (7.L); 58-64: mean warmth per species (7.H); 65-74: warm-core census (7.H.4); 75-88: second-locus mean/sd (multi-locus); 89-116: locus planes 2-3 mean/sd (MV.0); 117-140: movement observatory (MV.0)

// ---------- world state (module singletons; one artifact instance) ----------
const W = {
  x: new Float32Array(MAXN), y: new Float32Array(MAXN),
  px: new Float32Array(MAXN), py: new Float32Array(MAXN), // previous tick, for render interpolation
  vx: new Float32Array(MAXN), vy: new Float32Array(MAXN),
  en: new Float32Array(MAXN), sz: new Float32Array(MAXN),
  sp: new Uint8Array(MAXN), alive: new Uint8Array(MAXN),
  hd: new Float32Array(MAXN), handle: new Int16Array(MAXN),
  cd: new Int16Array(MAXN), cy: new Uint8Array(MAXN), gr: new Int16Array(MAXN),
  mn: new Float32Array(MAXN), pr: new Float32Array(MAXN), mem: new Float32Array(MAXN),
  g: new Float32Array(MAXLOCI*MAXN),  // heritable locus values in [0,1]: locus k of organism i at k*MAXN+i (plane 0 = the display locus, so W.g[i] keeps reading it), else 0
  lg: new Uint16Array(MAXN),          // lineage generation: founders 0, child = parent + 1 (draw-free bookkeeping)
  flee: new Int16Array(MAXN), bst: new Int16Array(MAXN),
  pc: new Int16Array(MAXN),   // post-capture program timer (MV-C): ticks left in the two-phase after-kill window; expresses nothing at g0
  birth: new Int32Array(MAXN), gen: new Uint16Array(MAXN),
  n: 0, freeList: [], tick: 0, initialized: false, rng: mulberry32(P.SEED),
  events: [], eventLog: [], lightDirty: false,
  sources: [{ x: P.WORLD / 2, y: P.WORLD / 2, i: P.sunI, a: 0, sigma: P.sunSigma }],  // energy sources (7.L/7.H): light i, warmth a
  // Walls (7.W): thin barriers on cell boundaries. W.walls holds the drawn strokes; compileWalls()
  // (the only writer) stamps them into per-FACE property planes -- vertical faces indexed by the LEFT
  // cell, horizontal by the TOP cell. An open face is pass = all bits, every transmission exactly 1,
  // and W.wallsOn false short-circuits every wall branch: the certified world's arithmetic bit for bit.
  walls: [], wallsOn: false,
  wfPassV: new Int32Array(P.GRID * P.GRID).fill(-1), wfPassH: new Int32Array(P.GRID * P.GRID).fill(-1),
  wfLtV: new Float32Array(P.GRID * P.GRID).fill(1), wfLtH: new Float32Array(P.GRID * P.GRID).fill(1),
  wfHtV: new Float32Array(P.GRID * P.GRID).fill(1), wfHtH: new Float32Array(P.GRID * P.GRID).fill(1),
  wfFlV: new Float32Array(P.GRID * P.GRID).fill(1), wfFlH: new Float32Array(P.GRID * P.GRID).fill(1),
  wShade: new Float32Array(P.GRID * P.GRID).fill(1),  // occluded/unoccluded light ratio per cell (UI honesty layer; 1 without walls)
  temp: new Float32Array(P.GRID * P.GRID),   // warmth above ambient per cell (7.H); exactly 0 without a warm source
  // per-cell Q10 factors, all exactly 1 where temp is 0 (7.H): maintenance, photosynthesis, decomposition, handling, pursuit
  qR: new Float32Array(P.GRID * P.GRID).fill(1), qP: new Float32Array(P.GRID * P.GRID).fill(1), qD: new Float32Array(P.GRID * P.GRID).fill(1),
  qH: new Float32Array(P.GRID * P.GRID).fill(1), qS: new Float32Array(P.GRID * P.GRID).fill(1),
  qA: new Float32Array(P.GRID * P.GRID).fill(1),   // attack/ingestion (7.H.4): bite scales with warmth, flatter than maintenance
  tgx: new Float32Array(P.GRID * P.GRID), tgy: new Float32Array(P.GRID * P.GRID),   // warmth gradient per cell (7.H.2), exactly 0 when flat
  lgx: new Float32Array(P.GRID * P.GRID), lgy: new Float32Array(P.GRID * P.GRID),   // light gradient per cell (7.H.3): what the drifter steers by
  light: new Float32Array(P.GRID * P.GRID),
  pB: new Float32Array(P.GRID * P.GRID), bB: new Float32Array(P.GRID * P.GRID),
  M: new Float32Array(P.GRID * P.GRID), Mtmp: new Float32Array(P.GRID * P.GRID),
  fB: new Float32Array(P.GRID * P.GRID),
  dE: new Float32Array(P.GRID * P.GRID), dP: new Float32Array(P.GRID * P.GRID),
  dM: new Float32Array(P.GRID * P.GRID),
  sc: new Float32Array(P.GRID * P.GRID), scTmp: new Float32Array(P.GRID * P.GRID),
  al: new Float32Array(P.GRID * P.GRID), alTmp: new Float32Array(P.GRID * P.GRID),
  flows: { uptake: 0, release: 0, excrete: 0, transfer: 0, egestE: 0, egestP: 0, leachM: 0, corpseToDet: 0, bacRelease: 0, gpp: 0, resp: 0, deaths: 0, deathsBy: [0,0,0,0,0,0,0] },
  hashHead: new Int32Array(P.GRID * P.GRID), hashNext: new Int32Array(MAXN),
  cHashHead: new Int32Array(P.GRID * P.GRID), cHashNext: new Int32Array(1500),
  pops: [0, 0, 0, 0, 0, 0, 0],
  rec: new Float32Array(REC.N*REC.CH), recHead: 0, recCount: 0, sysEvents: [],
  addedM: 0,  // provenance: mineral added by the human hand (fertilize lever)
  evLog: [],  // committed interventions, for chart markers and impact cards
  // corpse pool (separate entity class: no behavior, only decay)
  cN: 0, cFree: [],
  cAlive: new Uint8Array(1500), cX: new Float32Array(1500), cY: new Float32Array(1500),
  cE: new Float32Array(1500), cP: new Float32Array(1500), cM: new Float32Array(1500),
  cSz: new Float32Array(1500), cSp: new Uint8Array(1500),
};
const R = () => W.rng();
const wrap = v => { v %= P.WORLD; return v < 0 ? v + P.WORLD : v; };
const wd = d => { if (d > P.WORLD / 2) d -= P.WORLD; if (d < -P.WORLD / 2) d += P.WORLD; return d; };

function spawn(species, sx, sy, e, size, mnEndow, prEndow){
  const i = W.freeList.length ? W.freeList.pop() : W.n++;
  if (i >= MAXN) return -1;
  W.x[i]=wrap(sx); W.y[i]=wrap(sy); W.px[i]=W.x[i]; W.py[i]=W.y[i];
  W.vx[i]=0; W.vy[i]=0; W.en[i]=e; W.sz[i]=size; W.sp[i]=species; W.alive[i]=1;
  W.hd[i]=R()*6.283; W.cd[i]=TRAITS[species].matureCd; W.handle[i]=0; W.cy[i]=0; W.gr[i]=0;
  W.mn[i]=mnEndow||0; W.pr[i]=prEndow||0; W.mem[i]=0; W.flee[i]=0; W.bst[i]=0; W.pc[i]=0;
  { const loci = TRAITS[species].loci; // every plane reset: slots are reused across species
    for (let k=0;k<MAXLOCI;k++) W.g[k*MAXN+i] = k < loci.length ? loci[k].g0 : 0; }
  W.lg[i]=0;
  W.birth[i]=W.tick; W.gen[i]=(W.gen[i]+1)&0xffff;
  return i;
}
const cellOf = i => (Math.floor(W.y[i]/CELL)&(P.GRID-1))*P.GRID + (Math.floor(W.x[i]/CELL)&(P.GRID-1));
function endowFounder(i){ // founders draw mineral from their birth cell, up to 70% of quota (draw-free)
  if (i < 0) return;
  const c = cellOf(i), want = 0.7*P.mQuota*TRAITS[W.sp[i]].mQm*W.sz[i];
  const got = Math.min(W.M[c], want);
  W.M[c]-=got; W.mn[i]=got; W.pr[i]=0.6*P.pQuota*W.sz[i];
}
const cellAt = (x,y) => (Math.floor(y/CELL)&(P.GRID-1))*P.GRID + (Math.floor(x/CELL)&(P.GRID-1));
function spawnCorpse(x, y, e, p, m, sz, sp){
  const k = W.cFree.length ? W.cFree.pop() : (W.cN < 1500 ? W.cN++ : -1);
  if (k < 0){ // pool full: overflow decays instantly to detritus (ledger stays closed)
    const c = cellAt(x,y); W.dE[c]+=e; W.dP[c]+=p; W.dM[c]+=m; return -1;
  }
  W.cAlive[k]=1; W.cX[k]=x; W.cY[k]=y; W.cE[k]=e; W.cP[k]=p; W.cM[k]=m; W.cSz[k]=sz; W.cSp[k]=sp;
  return k;
}
const killOrg = i => {
  W.flows.deaths++; W.flows.deathsBy[W.sp[i]]++;
  const m = W.mn[i]; W.mn[i]=0;
  const bodyE = Math.max(0, W.en[i]) + P.sBody*W.sz[i];
  let k = -1;
  if (bodyE + W.pr[i] + m < 4.0){ // micro-bodies (bacterial colonies etc.) decompose directly
    const c = cellAt(W.x[i], W.y[i]);
    W.dE[c]+=bodyE; W.dP[c]+=W.pr[i]; W.dM[c]+=m;
  } else {
    k = spawnCorpse(W.x[i], W.y[i], bodyE, W.pr[i], m, W.sz[i], W.sp[i]);
  }
  W.pr[i]=0;
  W.alive[i] = 0; W.freeList.push(i);
  return k;
};

