function detrend(xs){
  const n=xs.length; let sx=0,sy=0,sxy=0,sxx=0;
  for(let i=0;i<n;i++){ sx+=i; sy+=xs[i]; sxy+=i*xs[i]; sxx+=i*i; }
  const b=(n*sxy-sx*sy)/((n*sxx-sx*sx)||1), a=(sy-b*sx)/n;
  return xs.map((v,i)=>v-(a+b*i));
}
function windowStats(sp, back, Wn){ // AC1 + variance of a detrended window ending `back` samples ago
  const xs=[];
  for(let k=back+Wn;k>back;k--) xs.push(W.rec[((W.recHead-k+REC.N)%REC.N)*REC.CH + sp]);
  const mean = xs.reduce((a,b)=>a+b,0)/Wn;
  const res = detrend(xs);
  let num=0, den=0;
  for(let i=0;i<Wn-1;i++) num+=res[i]*res[i+1];
  for(let i=0;i<Wn;i++) den+=res[i]*res[i];
  return { mean, ac1: den>0 ? num/den : 0, varr: den/Wn };
}
// Clinical reference ranges, measured on the healthy six-seed ensemble (462 windows/species):
// like blood work, "low" is species-specific — a 50% Drifta crash is routine, a 10% Solara dip is not.
const REFERENCE_BANDS = {
  0: { resP03: 0.43, resP10: 0.44, popP03: 0.93, popP10: 0.97 },
  1: { resP03: 0.27, resP10: 0.28, popP03: 0.44, popP10: 0.60 },
  2: { resP03: 0.33, resP10: 0.37, popP03: 0.47, popP10: 0.62 },
  3: { resP03: 0.22, resP10: 0.23, popP03: 0.82, popP10: 0.89 },
  6: { resP03: 0.24, resP10: 0.27, popP03: 0.80, popP10: 0.88 },
};
function strainOf(sp){
  // Calibration verdict (4.2, on archived ground truth): generic EWS statistics
  // misfire on this system — absolute AC1 flags slow-lifecycle species, and
  // baseline-relative AC1 normalizes chronic decline. The mechanistic vitals we
  // used for diagnosis all phase are the honest headline; EWS ships demoted to
  // an advisory overlay (dAc1/varX fields), clearly experimental.
  const Wn=60;
  if (W.recCount < 2*Wn) return null;
  const r0=((W.recHead-1+REC.N)%REC.N)*REC.CH, r60=((W.recHead-Wn+REC.N)%REC.N)*REC.CH;
  const pop=W.rec[r0+sp];
  if (pop < 20) return null;
  const meanSz = W.rec[r0+26+sp]||1;
  const reserve = (W.rec[r0+7+sp]/pop)/(P.capMul*meanSz);
  const popAgo = W.rec[r60+sp], resAgo = popAgo>0 ? (W.rec[r60+7+sp]/popAgo)/(P.capMul*(W.rec[r60+26+sp]||1)) : reserve;
  const resTrend = reserve - resAgo, popTrend = pop/Math.max(1,popAgo);
  const RB = REFERENCE_BANDS[sp];
  if (!RB) return null;
  const level = ((reserve < RB.resP03 && resTrend < -0.01) || popTrend < RB.popP03*0.9) ? 2
              : (reserve < RB.resP10 || popTrend < RB.popP10) ? 1 : 0;
  const adv = W.recCount >= 3*Wn ? (()=>{ const now=windowStats(sp,1,Wn), base=windowStats(sp,2*Wn,Wn);
    return { dAc1:+(now.ac1-base.ac1).toFixed(2), varX:+(now.varr/(base.varr||1)).toFixed(2) }; })() : {};
  return { level, reserve:+reserve.toFixed(2), trend:+resTrend.toFixed(3), popTrend:+popTrend.toFixed(2), ...adv };
}
function indicators(){ // labels follow the naming rule: functional first, science as subtitle
  if (W.recCount < 2) return null;
  const r0 = ((W.recHead-1+REC.N)%REC.N)*REC.CH, B=W.rec;
  let H=0, bioTot=0; const bio=[];
  for(let sp=0;sp<7;sp++){ bio.push(B[r0+7+sp]); bioTot+=B[r0+7+sp]; }
  for(let sp=0;sp<7;sp++){ const p=bio[sp]/(bioTot||1); if(p>0) H-=p*Math.log(p); }
  const K=Math.min(15, W.recCount); let g=0, rr=0, up=0;
  for(let k=1;k<=K;k++){ const rk=((W.recHead-k+REC.N)%REC.N)*REC.CH; g+=B[rk+19]; rr+=B[rk+20]; up+=B[rk+18]; }
  const total = B[r0+14]+B[r0+15]+B[r0+16]+B[r0+17];
  const turnoverTicks = (up>0) ? B[r0+15] / (up/(K*REC.STRIDE)) : Infinity;
  const strain = [];
  for(let sp=0;sp<7;sp++) strain.push(TRAITS[sp].apex ? null : strainOf(sp));
  let ven = null;
  if (B[r0+6] > 0){
    const meanSz = B[r0+32]||9, cap = P.capMul*meanSz;
    let loss=0; const KL=Math.min(10,W.recCount);
    for(let k=1;k<=KL;k++) loss+=B[((W.recHead-k+REC.N)%REC.N)*REC.CH+35+2];
    ven = { reserve: (B[r0+13]/B[r0+6])/cap, preyLossRate: loss/(KL*REC.STRIDE/10) };
  }
  let adSum=0, adN=0; // adaptability (6.2): mean locus sd over every (species, locus) with >= 20 alive
  for (let sp=0;sp<7;sp++) if (B[r0+sp] >= 20)
    TRAITS[sp].loci.forEach((L, k) => { if (k < 2){ adSum += B[r0+(k ? 82 : 49)+sp]; adN++; } });
  return {
    adaptability: adN ? +(adSum/adN).toFixed(3) : null, // subtitle: mean heritable variation
    variety: +H.toFixed(2),                      // subtitle: Shannon diversity
    prodVsCons: +(g/(rr||1)).toFixed(2),         // subtitle: P/R (Odum)
    recyclingMin: turnoverTicks===Infinity ? null : +(turnoverTicks/600).toFixed(1), // subtitle: mineral turnover time
    lockedPct: +(100*(B[r0+16]+B[r0+17])/(total||1)).toFixed(0), // subtitle: locked fraction
    pyramid: { producers:+((bio[0]+bio[1])/(bioTot||1)).toFixed(2), grazers:+(bio[2]/(bioTot||1)).toFixed(2),
               decomposers:+(bio[3]/(bioTot||1)).toFixed(2), predators:+(bio[6]/(bioTot||1)).toFixed(2) },
    strain, venator: ven,
  };
}
// ---- intervention impact (4.5): Before-After windows, honestly labeled ----
// One world, no control: BACI without the CI. Every consumer of this result
// must say "since", never "because" — the wording discipline lives in the UI,
// the arithmetic lives here so the Kotlin port inherits it.
