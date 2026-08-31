const IMPACT_CHS = [[0,"Solara"],[1,"Drifta"],[2,"Cilio"],[3,"Bacillus"],[6,"Venator"],[14,"dissolved mineral"],[19,"production"]];
// natural-variability floors (measured: mats barely move, plankton blooms 2.5x unprovoked)
const IMPACT_NOISE = { 0:12, 1:170, 2:55, 3:20, 6:25, 14:15, 19:30 };
// presses: interventions that change the regime rather than poke it once (a changed sky, changed evolution settings)
const IMPACT_PRESS = new Set(["source","sunlight","sourceAdd","sourceRemove","sourceSet","sourceLayout","mutation","evolution","preset",
  "wallAdd","wallRemove","wallSet"]); // a wall changes the regime, not a moment (7.W)
function impact(entry){
  const isPress = IMPACT_PRESS.has(entry.type);
  const i0 = W.recCount-1 - Math.floor((W.tick - entry.tick)/REC.STRIDE);
  if (i0 < 15) return { status:"rolled" };
  const avail = W.recCount-1 - i0, need = isPress ? 45 : 30;
  if (avail < 8) return { status:"watching", pct: Math.min(99, Math.round(100*avail/need)) };
  const win = Math.min(avail, need);
  const at = (k,ch) => W.rec[((W.recHead-W.recCount+k+REC.N)%REC.N)*REC.CH+ch];
  // Interrupted time series: fit the baseline TREND and measure departure from its
  // extrapolation — an intervention during an ongoing decline is credited only with
  // deviations from that decline, not with the decline itself.
  const base = {}, movers = [];
  for (const [ch,name] of IMPACT_CHS){
    let sx=0, sy=0, sxy=0, sxx=0;
    for (let j=0;j<15;j++){ const v=at(i0-15+j,ch); sx+=j; sy+=v; sxy+=j*v; sxx+=j*j; }
    const slope=(15*sxy-sx*sy)/((15*sxx-sx*sx)||1), icpt=(sy-slope*sx)/15;
    const b = icpt + slope*14; // baseline level at the intervention
    base[ch] = { b, slope, icpt };
    let a=0, ex=0, cnt=0;
    for (let k=i0+Math.max(1,win-10); k<=i0+win; k++){
      a += at(k,ch);
      // never trust a trend farther than it was observed: clamp extrapolation at 15 samples
      ex += icpt + slope*(14 + Math.min(k-i0, 15));
      cnt++;
    }
    a/=(cnt||1); ex/=(cnt||1);
    if (b<2 && a<2) continue;
    // departure from trend, expressed against the stable pre-intervention level
    movers.push({ ch, name, pct: Math.round(100*(a-ex)/Math.max(3,Math.abs(b))) });
  }
  movers.sort((x,y)=>Math.abs(y.pct)-Math.abs(x.pct));
  const notable = movers
    .filter(m => Math.abs(m.pct) >= (IMPACT_NOISE[m.ch]||15))
    .map(m => ({ ...m, strong: Math.abs(m.pct) >= 1.5*(IMPACT_NOISE[m.ch]||15) }))
    .slice(0,3);
  let recoveredS = null;
  if (!isPress && notable.length){
    for (let k=i0+5; k<=i0+win; k++){
      let allIn = true;
      for (const m of notable){
        const ex = base[m.ch].icpt + base[m.ch].slope*(14 + Math.min(k-i0, 15));
        if (Math.abs(at(k,m.ch)-ex) > 0.12*Math.max(1,Math.abs(ex))){ allIn=false; break; }
      }
      if (allIn){ recoveredS = Math.round((k-i0)*REC.STRIDE/10); break; }
    }
  }
  const mixed = W.evLog.some(e => e !== entry && e.type !== "undo" &&
    e.tick > entry.tick - 600 && e.tick < entry.tick + win*REC.STRIDE);
  const pressBackdrop = !isPress && W.evLog.some(e => e !== entry &&
    IMPACT_PRESS.has(e.type) && e.tick < entry.tick);
  return { status:"done", isPress, notable, recoveredS, mixed, pressBackdrop, complete: win >= need };
}
