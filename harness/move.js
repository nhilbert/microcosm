// MV.0 — the movement observatory's measurement harness (phase7-movement-plan.md §2).
//
//   node harness/move.js --metrics            reference bands for the movement channels (117-140) in the
//                                             shipped world, 8 seeds: light/warmth alignment, net step,
//                                             occupancy entropy, MSD alpha of a tracked cohort per species.
//                                             Asserts structural silence: warmth channels exactly 0, no
//                                             heatTrap events. Exits 1 if silence is violated.
//   node harness/move.js --trap [--a 8]       the trap detector under the hot sun (+a at t=3000): raw
//                                             crowding/reserve-gap statistics per species (the calibration
//                                             data), heatTrap fire tick, and its lead on the extinction.
//   node harness/move.js --d5                 D5 measurement: Bacillus realized per-tick displacement vs
//                                             the flat T.speed^2 movement charge (phase7-movement-plan §5).
//
// Zero PRNG draws outside the sim; pure reads of W and the recorder ring.
const L = require("./lib.js"); const { C, W, P, TRAITS, SPECIES, SEEDS, HORIZON, REC } = L;
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const num = (f, d) => { const i = args.indexOf(f); return i >= 0 ? +args[i+1] : d; };
const AT = 3000;
const chan = ch => W.rec[((W.recHead-1+REC.N)%REC.N)*REC.CH + ch];
const MB = SPECIES.MOBILE;
const f = (v, d=2) => (v===undefined || Number.isNaN(v)) ? "  -  " : v.toFixed(d);
const med = xs => { const a = xs.filter(v => !Number.isNaN(v)).sort((x,y)=>x-y); return a.length ? a[Math.floor(a.length/2)] : NaN; };

// tracked cohort for MSD: up to `per` live organisms per mobile species at a time, followed while the
// slot stays alive with an unchanged birth tick (slot reuse ends the track, it never corrupts it).
// Rolling adoption: a dead track's seat is refilled at the next sample, because a fixed t=AT cohort
// starves the fast-turnover species -- Drifta lives a few hundred ticks, far short of a long window.
// Finished segments of >= 60 samples (1,200 ticks) are kept; alpha is fit over lags 1-25.
const SEG_MIN = 60, LAG_MAX = 25;
function makeCohort(per){ return { per, active: [], segs: [] }; }
function sampleCohort(co){
  const alive = new Map();
  for (const t of co.active){
    if (!W.alive[t.i] || W.birth[t.i] !== t.birth || W.sp[t.i] !== t.sp){
      if (t.xs.length >= SEG_MIN) co.segs.push(t);
      t.done = true; continue; }
    t.xs.push(W.x[t.i]); t.ys.push(W.y[t.i]);
    alive.set(t.sp, (alive.get(t.sp)||0)+1);
  }
  co.active = co.active.filter(t => !t.done);
  const tracked = new Set(co.active.map(t => t.sp+":"+t.i));
  for (const sp of MB){ let need = co.per - (alive.get(sp)||0);
    for (let i=0;i<W.n && need>0;i++)
      if (W.alive[i] && W.sp[i]===sp && !W.cy[i] && !tracked.has(sp+":"+i)){
        co.active.push({ sp, i, birth: W.birth[i], xs:[W.x[i]], ys:[W.y[i]], done:false }); need--; } }
}
function cohortAlpha(co, sp){
  const all = co.segs.concat(co.active.filter(t => t.xs.length >= SEG_MIN));
  const as = all.filter(t => t.sp===sp).map(t => L.msdAlpha(L.msd(L.unwrapTrack(t.xs), L.unwrapTrack(t.ys), LAG_MAX)));
  return { n: as.length, alpha: med(as) };
}

if (flag("--metrics")){
  console.log("=== MV.0 reference bands: shipped world (evolving), 8 seeds, horizon "+HORIZON+", founding (t<3000) skipped ===");
  console.log("channels per mobile species: lightAlign 117+ · warmAlign 121+ · netStep 125+ · entropy 129+ · warmRes 133+ · ambRes 137+");
  const bands = MB.map(() => ({ la:[Infinity,-Infinity], ns:[Infinity,-Infinity], oe:[Infinity,-Infinity], ar:[Infinity,-Infinity], alphas:[] }));
  let silent = true;
  for (const s of SEEDS){
    L.start(s, true);
    let tracks = null, warmPeak = 0;
    for (let t=1;t<=HORIZON;t++){
      C.step();
      if (t === AT) tracks = makeCohort(30);
      if (t % REC.STRIDE === 0){
        if (tracks) sampleCohort(tracks);
        if (t > AT) for (let m=0;m<MB.length;m++){
          const b = bands[m];
          const upd = (pair, v) => { if (v < pair[0]) pair[0]=v; if (v > pair[1]) pair[1]=v; };
          upd(b.la, chan(117+m)); upd(b.ns, chan(125+m)); upd(b.oe, chan(129+m)); upd(b.ar, chan(137+m));
          warmPeak = Math.max(warmPeak, Math.abs(chan(121+m)), Math.abs(chan(133+m)));
        }
      }
    }
    const trapEv = W.sysEvents.filter(e => e.type === "heatTrap").length;
    if (warmPeak !== 0 || trapEv){ silent = false; console.log(`seed ${s}: SILENCE VIOLATED — warm-channel peak ${warmPeak}, heatTrap events ${trapEv}`); }
    for (let m=0;m<MB.length;m++) bands[m].alphas.push(cohortAlpha(tracks, MB[m]).alpha);
    console.log(`seed ${s}: alpha ${MB.map((sp,m)=>TRAITS[sp].name.slice(0,3)+" "+f(bands[m].alphas[bands[m].alphas.length-1])).join(" · ")}`);
  }
  console.log("\nspecies  | lightAlign        | netStep/tick      | entropy           | ambRes            | MSD alpha (cohort medians over seeds)");
  for (let m=0;m<MB.length;m++){ const b = bands[m], as = b.alphas.filter(v => !Number.isNaN(v));
    console.log(`${TRAITS[MB[m]].name.padEnd(9)}| ${f(b.la[0])}..${f(b.la[1])}      | ${f(b.ns[0])}..${f(b.ns[1])}      | ${f(b.oe[0])}..${f(b.oe[1])}      | ${f(b.ar[0])}..${f(b.ar[1])}      | ${f(Math.min(...as))}..${f(Math.max(...as))} (med ${f(med(b.alphas))}, ${as.length}/8 seeds)`); }
  console.log(`\nstructural silence (warmth channels exactly 0, zero heatTrap events on 8/8): ${silent ? "PASS" : "FAIL"}`);
  if (!silent) process.exit(1);
}

if (flag("--trap")){
  const a = num("--a", 8);
  console.log(`=== trap detector calibration: warmth +${a} on the shipped sun at t=${AT} (evolving, 8 seeds) ===`);
  console.log("per species: max share of population in warm cells · max reserve gap (amb - warm) while share >= 0.5 · heatTrap fire tick · extinction tick");
  // Reports the REAL detector (recorder heatTrap) with the raw statistics behind it. Calibration
  // history: the first (gap) statistic died against this measurement -- under +8 the warm region covers
  // the whole inhabited area, share saturates at 1.0 and no ambient population remains to contrast
  // against; the shipped level statistic (felt >= 3 + reserve below band + falling vs 25 samples ago)
  // was chosen from a harness simulation of these channels and then measured to fire EARLIER than the
  // simulation, because the recorder's trend window reaches back into the pre-warming baseline while
  // the simulation's history began blind at the warming tick. The recorder is the authority.
  const fired = MB.map(() => 0), led = MB.map(() => 0), ext2 = MB.map(() => 0);
  for (const s of SEEDS){
    L.start(s, true);
    const maxFelt = MB.map(() => 0), minRes = MB.map(() => Infinity);
    let coreLost = -1;
    for (let t=1;t<=HORIZON;t++){
      if (t === AT) C.applyEvent({ type:"sourceSet", k:0, a });
      C.step();
      if (coreLost < 0 && L.coreCollapsed(L.pops(), t)) coreLost = t;
      if (t % REC.STRIDE === 0 && t > AT) for (let m=0;m<MB.length;m++){
        const sp = MB[m], pop = chan(sp);
        if (pop < 50) continue;
        const felt = chan(58+sp), reserve = (chan(7+sp)/pop)/(P.capMul*(chan(26+sp)||1));
        if (felt > maxFelt[m]) maxFelt[m] = felt;
        if (reserve < minRes[m]) minRes[m] = reserve;
      }
    }
    const cols = MB.map((sp,m) => {
      const trap = W.sysEvents.find(e => e.type==="heatTrap" && e.sp===sp);
      const ext = W.sysEvents.find(e => e.type==="extinct" && e.sp===sp);
      if (trap) fired[m]++;
      if (ext) ext2[m]++;
      if (trap && (!ext || trap.tick < ext.tick)) led[m]++;
      return `${TRAITS[sp].name.slice(0,3)} felt${f(maxFelt[m],1)} res${f(minRes[m]===Infinity?NaN:minRes[m])}${trap ? " trap@"+trap.tick : ""}${ext ? " ext@"+ext.tick : ""}`;
    }).join(" | ");
    console.log(`seed ${s}: ${cols} | core ${coreLost>0 ? "LOST@"+coreLost : "held"}`);
  }
  console.log(`\nheatTrap fired: ${MB.map((sp,m)=>TRAITS[sp].name.slice(0,3)+" "+fired[m]+"/8 (ahead of its extinction "+led[m]+"/"+fired[m]+"; extinctions "+ext2[m]+"/8)").join(" · ")}`);
}

if (flag("--d5")){
  // D5 (phase7-movement-plan §5): the tumble branch charges P.moveCost*T.speed^2 flat. Measured question:
  // does Bacillus's realized per-tick displacement equal T.speed (making the flat charge identical to a
  // realized-quadratic charge)? Bacillus torpor is 0, so the torpid discount never binds; awake organisms
  // move exactly one T.speed step per tick, cysts do not move and are skipped here.
  console.log("=== D5: Bacillus realized step vs the flat movement charge (2 seeds, ticks 1000-3000) ===");
  const sp = 3, speed = TRAITS[sp].speed;
  for (const s of [11, 88]){
    L.start(s, true);
    for (let t=1;t<=1000;t++) C.step();
    let n=0, maxDev=0, sum=0;
    const px = new Float32Array(C.MAXN), py = new Float32Array(C.MAXN), pb = new Int32Array(C.MAXN);
    for (let t=1001;t<=3000;t++){
      for (let i=0;i<W.n;i++) if (W.alive[i] && W.sp[i]===sp && !W.cy[i]){ px[i]=W.x[i]; py[i]=W.y[i]; pb[i]=W.birth[i]; } else pb[i]=-1;
      C.step();
      for (let i=0;i<W.n;i++) if (pb[i]>=0 && W.alive[i] && W.birth[i]===pb[i] && !W.cy[i]){
        const d = Math.hypot(C.wd(W.x[i]-px[i]), C.wd(W.y[i]-py[i]));
        n++; sum+=d; const dev = Math.abs(d - speed); if (dev > maxDev) maxDev = dev;
      }
    }
    console.log(`seed ${s}: ${n} organism-ticks · mean step ${(sum/n).toFixed(6)} vs T.speed ${speed} · max |step - T.speed| ${maxDev.toExponential(2)}`);
  }
  console.log("flat charge == realized-quadratic charge iff max deviation ~ 0 (then D5 needs no fix for MV.3;");
  console.log("the distortion exists only under torpor -- Necro, not live -- where the charge overprices by 1/tor).");
}

if (!flag("--metrics") && !flag("--trap") && !flag("--d5"))
  console.log("usage: node harness/move.js --metrics | --trap [--a 8] | --d5");
