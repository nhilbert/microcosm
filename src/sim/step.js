// ============================================================
// THE RNG-ORDER CONTRACT (read before editing anything below)
//
// Bit-exact conformance across refactors depends on step() consuming
// PRNG draws in a FIXED order. The rules:
//   1. Organisms are processed in slot order (0..n-1); never reorder.
//   2. A branch may draw from the PRNG only if its guarding trait is
//      present and truthy: absent traits must SHORT-CIRCUIT before any
//      R() call (e.g. `T.hazard && R()<T.hazard`). A species without a
//      trait consumes ZERO draws for it — this is what makes new
//      species additions inert for existing worlds.
//   3. Never move an R() call across a branch boundary, and never add
//      an unconditional R() to a shared path.
//   4. Field passes (diffusion, leach, scent) and the corpse pass are
//      draw-free and must remain so.
//   5. Heredity draws one mutation kick PER LOCUS, in TRAITS[sp].loci
//      order, at every division (sigma > 0 and P.mutation only). Adding,
//      removing or reordering a species' loci is a declared ecology change.
//   6. Walls (7.W) draw NOTHING: movement blocking, the hunt filter and
//      the field transmissions are draw-free and gated on W.wallsOn --
//      a world without walls runs the certified arithmetic bit for bit;
//      a walled world diverges only through ecology, like a moved sun.
// Modification protocol: after ANY edit to this file, run
//   `node conform.js`   (2 seeds x 3000 ticks, ~3 s)
// A changed fingerprint is fine only when an ecology change is the
// declared intent — then re-capture with `node conform.js --capture`
// and re-run the full 8-seed harness (tune2.js) before shipping.
// ============================================================
const PC_A = 30, PC_B = 30; // MV-C post-capture window: afterglow / relocate phase lengths (ticks)
function step(){
  drainEvents();
  diffuseM();
  rebuild();
  for(let i=0;i<W.n;i++){
    if(!W.alive[i]) continue;
    const T = TRAITS[W.sp[i]];
    const cap = P.capMul*W.sz[i];
    const cT = cellOf(i), dT = W.temp[cT]; // 7.H: warmth here; tpc = the falling limb of the thermal performance curve
    const tpc = dT <= T.topt ? 1 : Math.max(0, 1 - (dT - T.topt)/(T.ctmax - T.topt));
    if(W.cy[i]){ // dormant cyst
      W.en[i]-=0.002*W.sz[i]*T.cystDrainMul*W.qR[cT];
      if(W.en[i]<=0){ killOrg(i); continue; }
      if(T.cyst && T.cyst.wake==="light"){
        const c=(Math.floor(W.y[i]/CELL)&(P.GRID-1))*P.GRID+(Math.floor(W.x[i]/CELL)&(P.GRID-1));
        if(W.light[c]>0.3 && R()<T.cyst.p){ W.cy[i]=0; W.gr[i]=T.cyst.grace; }
      } else if(T.cyst && T.cyst.wake==="prey" && R()<T.cyst.p){
        let prey=false;
        neighbors(i, T.sense*2, (j)=>{ if((T.diet & TRAITS[W.sp[j]].bodyTag) && !W.cy[j]) prey=true; });
        if(prey){ W.cy[i]=0; W.gr[i]=T.cyst.grace; }
      } else if(T.cyst && T.cyst.wake==="detritus" && R()<T.cyst.p){
        const c=cellOf(i);
        if(W.dE[c]+W.dM[c] > 1.0 || W.sc[c] > T.cyst.scMin){ W.cy[i]=0; W.gr[i]=T.cyst.grace; }
      }
      continue;
    }
    if(W.gr[i]>0) W.gr[i]--;
    if(T.cyst && W.gr[i]<=0 && W.en[i]<T.cyst.enter*cap){
      W.cy[i]=1; W.vx[i]=0; W.vy[i]=0; continue;
    }
    // Multi-locus expression (Phase 7): every locus contributes one factor per site, in locus order,
    // each `1 + slope*d - curve*d*d`. A slope the locus does not name is 0 and its curve defaults to 0,
    // so an unexpressed factor multiplies by exactly 1.0 — the single-locus arithmetic bit for bit.
    const loci = T.loci, nL = loci.length;
    let kbG = 1;
    for (let k=0;k<nL;k++){ const L=loci[k], d=W.g[k*MAXN+i]-L.g0; kbG *= 1 + L.kbSlope*d - L.curve*d*d; }
    // thermal locus (7.H.5): warmth-response down-regulation (Padfield) -- upkeep's warmth response
    // flattened (wR), the warmth-scaled gain flattened with it (wA, the price). Exactly 1 at dT <= 0,
    // so the unwarmed world expresses nothing; curvature runs through the ambient sites like any locus.
    let wR = 1, wA = 1;
    if (dT > 0) for (let k=0;k<nL;k++){ const L=loci[k]; if (L.warmSlope !== 0 || L.warmGainSlope !== 0){
      const d=W.g[k*MAXN+i]-L.g0, hw=dT*0.1;
      wR *= 1 - L.warmSlope*d*hw; wA *= 1 - L.warmGainSlope*d*hw; } }
    let cost = T.kb*kbG*Math.pow(W.sz[i],0.75)*W.qR[cT]*wR; // maintenance: Q10 2.5, flattened by the thermal locus
    const mQ = P.mQuota*T.mQm*W.sz[i], mCap = mQ*P.mCapMul;
    if(T.photosynth){
      const c0 = cellOf(i);
      const want = Math.min(T.mUp*W.sz[i]*(1 - W.mn[i]/mCap), mCap - W.mn[i]);
      if (want > 0){
        const got = Math.min(W.M[c0], want);
        if (got > 0){ W.M[c0]-=got; W.mn[i]+=got; W.flows.uptake+=got; }
      }
      const sat = Math.min(1, W.mn[i]/mQ); // Liebig: mineral-starved cells photosynthesize weakly
      const Lc = cellLight(i);
      let kpG = 1;
      for (let k=0;k<nL;k++){ const L=loci[k], d=W.g[k*MAXN+i]-L.g0, q=L.curve*d*d;
        kpG *= (1 + L.kpSlope*(-d) - q) * (1 + L.lightSlope*d*(1 - 2*Lc) - q); }
      const gppGain = T.kp*kpG*Lc*W.sz[i]*sat*W.qP[cT]*tpc*wA; // photosynthesis: Q10 1.6, cut off past ctmax, flattened by the thermal locus (its price)
      W.en[i]+=gppGain; W.flows.gpp+=gppGain;
      const pQ = P.pQuota*W.sz[i];
      if (W.pr[i] < pQ && W.en[i] > 0.6*cap){
        const conv = Math.min(T.pSynth*W.sz[i], W.en[i]-0.6*cap);
        W.en[i]-=conv; W.pr[i]=Math.min(pQ, W.pr[i]+conv*P.pSynthEff);
      }
    }
    if(T.movement==="drift"){ // damped random walk + light-deficit-scaled phototaxis
      const deficit=Math.max(0, 0.9-W.light[cT]);
      // 7.H.3 (declared change, replaces the nearest-sun vector of 7.L): the drifter climbs the LOCAL light
      // gradient -- what a cell can actually sense (Chlamydomonas klinotaxis) -- scaled by its light deficit.
      // Unit direction of the gradient; in a flat cell there is nothing to steer by. Same two draws as before.
      const lgx=W.lgx[cT], lgy=W.lgy[cT], lg=Math.hypot(lgx,lgy);
      const px = lg > 0 ? T.phototaxis*deficit*lgx/lg : 0, py = lg > 0 ? T.phototaxis*deficit*lgy/lg : 0;
      // MV.2 (declared change): persistence is heritable -- damp + dampSpan*(g - g0) summed over the
      // loci carrying dampSpan, in locus order; exactly T.damp at g0. Damp-led by measurement (the
      // noise syndrome cancels in the diffusion exponent; phase7-movement-plan.md MV.2 design notes):
      // roving lines wander straighter, settled lines decay their drift quickly. Same two draws.
      let dp = T.damp;
      for (let k=0;k<T.loci.length;k++){ const Lk = T.loci[k]; if (Lk.dampSpan) dp += Lk.dampSpan*(W.g[k*MAXN+i]-Lk.g0); }
      W.vx[i]=W.vx[i]*dp + (R()-0.5)*T.noise + px;
      W.vy[i]=W.vy[i]*dp + (R()-0.5)*T.noise + py;
      if (T.thermo && (W.tgx[cT] !== 0 || W.tgy[cT] !== 0)){ // 7.H.2 thermotaxis: down the discomfort gradient |dT - tpref| (draw-free; skipped in a flat field)
        // MV.1 (declared change): the set-point is heritable -- tpref = topt + tprefSpan*(g - g0) summed
        // over the loci carrying tprefSpan, in locus order; exactly topt at g0. The §12 trap decision made
        // real: evolution, not a reprice, owns the set-point that walked the swarm into the +8 core.
        let tp = T.topt;
        for (let k=0;k<T.loci.length;k++){ const Lk = T.loci[k]; if (Lk.tprefSpan) tp += Lk.tprefSpan*(W.g[k*MAXN+i]-Lk.g0); }
        const sgn = dT > tp ? -1 : dT < tp ? 1 : 0;
        W.vx[i] += T.thermo*sgn*W.tgx[cT]; W.vy[i] += T.thermo*sgn*W.tgy[cT]; }
      const s=Math.hypot(W.vx[i],W.vy[i]);
      if(s>T.driftSpeed){ W.vx[i]*=T.driftSpeed/s; W.vy[i]*=T.driftSpeed/s; }
      moveOrg(i, W.vx[i], W.vy[i]); // 7.W: slides along walls; identical writes without them
      cost += P.moveCost*(W.vx[i]*W.vx[i]+W.vy[i]*W.vy[i])*W.sz[i]*T.moveCostMul;
    }
    else if(T.movement==="tumble"){ // run-and-tumble chemotaxis along the detritus gradient
      const c0=cellOf(i);
      let here = T.tumbleField==="scent" ? W.sc[c0]*40 : W.dE[c0]+W.dP[c0]+W.dM[c0];
      if (T.thermo && dT !== T.topt && (W.tgx[c0] !== 0 || W.tgy[c0] !== 0)) here -= T.thermo*Math.abs(dT - T.topt); // 7.H.2 klinokinesis: discomfort reads as "worse", raising tumbling (Berg & Brown)
      // MV.3 (declared): tumble frequency is heritable -- the whole tumble propensity scaled by
      // 1 - tumbleSlope*(g - g0) per locus carrying tumbleSlope, in locus order; exactly the bare
      // thresholds at g0 (the che-circuit axis: smooth-running lengthens runs, twitchy shortens them).
      // The draw at R()<pT stays unconditional; only its threshold value moves.
      let pT = here > W.mem[i]+0.01 ? T.tumbleLow : T.tumbleHigh;
      for (let k=0;k<nL;k++){ const Lk = loci[k]; if (Lk.tumbleSlope) pT *= 1 - Lk.tumbleSlope*(W.g[k*MAXN+i]-Lk.g0); }
      W.mem[i]=here;
      if(R()<pT) W.hd[i]=R()*6.283;
      const tor = T.torpor && W.en[i] < T.torpor*cap ? 0.6 : 1;
      moveOrg(i, Math.cos(W.hd[i])*T.speed*tor, Math.sin(W.hd[i])*T.speed*tor);
      cost += P.moveCost*T.speed*T.speed*W.sz[i]*tor;
    }
    else if(T.movement==="steer"){ // pursuit forager
      const torpid = W.en[i] < T.torpor*cap;
      const hungry = W.en[i] < T.satiation*cap && W.handle[i]<=0;
      if(W.handle[i]>0) W.handle[i]--; if(W.cd[i]>0) W.cd[i]--; if(W.pc[i]>0) W.pc[i]--;
      let nearKin=0, tx=0, ty=0, best=1e9, found=false, target=-1;
      let fleeing=false;
      if(T.flee){
        if(W.flee[i]<=0 && W.al[cellOf(i)] > T.flee.sense) W.flee[i]=T.flee.dur;
        if(W.flee[i]>0){ W.flee[i]--; fleeing=true; }
      }
      if(hungry && !fleeing){
        neighbors(i, T.sense, (j,ddx,ddy,d)=>{
          if(W.cy[j] && !TRAITS[W.sp[j]].cystYield) return; // cysts of shelterless species are invisible; sheltered ones are half-yield prey
          const TJ = TRAITS[W.sp[j]];
          if(W.sp[j]===W.sp[i]){ if(d<T.interfRadius) nearKin++; return; }
          if(!(T.diet & TJ.bodyTag)) return;
          if(TJ.grazeFloor && W.en[j]<=TJ.grazeFloor) return;
          if(W.wallsOn && pathBlocked(T.bodyTag, W.x[i], W.y[i], ddx, ddy)) return; // 7.W: prey beyond a face this hunter cannot cross is out of reach -- and out of mind (no wall-camping, no through-mesh bites)
          const pref = d*TJ.pursuitPenalty;
          if(pref<best){ best=pref; tx=ddx; ty=ddy; found=true; target=j; }
        });
      }
      let speed;
      if(fleeing){ // run down the alarm gradient, foraging suspended
        const gx2=Math.floor(W.x[i]/CELL), gy2=Math.floor(W.y[i]/CELL), G=P.GRID;
        const cR=(gy2&(G-1))*G+((gx2+1)&(G-1)), cL=(gy2&(G-1))*G+((gx2-1+G)&(G-1));
        const cD=(((gy2+1)&(G-1)))*G+(gx2&(G-1)), cU=(((gy2-1+G)&(G-1)))*G+(gx2&(G-1));
        let bx=1, bv=W.al[cR];
        if(W.al[cL]<bv){ bv=W.al[cL]; bx=-1; }
        let byy=0;
        if(W.al[cD]<bv){ bv=W.al[cD]; bx=0; byy=1; }
        if(W.al[cU]<bv){ bv=W.al[cU]; bx=0; byy=-1; }
        const ta=Math.atan2(byy,bx);
        let da=ta-W.hd[i]; while(da>Math.PI)da-=6.283; while(da<-Math.PI)da+=6.283;
        W.hd[i]+=Math.max(-0.5,Math.min(0.5,da));
        speed=T.speed*T.flee.speedMul;
      }
      else if(found){
        const ta=Math.atan2(ty,tx);
        let da=ta-W.hd[i]; while(da>Math.PI)da-=6.283; while(da<-Math.PI)da+=6.283;
        W.hd[i]+=Math.max(-T.turnRate,Math.min(T.turnRate,da));
        speed=T.speed*(torpid?0.75:1)*W.qS[cT]; // pursuit quickens with warmth (Q10 1.3), its quadratic cost with it
        if(best<W.sz[i]+6 && target>=0){
          const TJ = TRAITS[W.sp[target]];
          let escP = 0;
          if (TJ.escape){ // prey loci shift the base chance additively, hunter loci multiply what remains
            escP = TJ.escape.p;
            const lJ = TJ.loci;
            for (let k=0;k<lJ.length;k++){ const L=lJ[k], d=W.g[k*MAXN+target]-L.g0;
              escP = escP + L.escSlope*d - TJ.escape.p*L.curve*d*d; }
            for (let k=0;k<nL;k++){ const L=loci[k], d=W.g[k*MAXN+i]-L.g0;
              escP *= 1 + L.catchSlope*(-d) - L.curve*d*d; }
          }
          if(TJ.escape && R()<escP){ // escape jink: prey darts away, contact broken
            const ja=R()*6.283;
            moveOrg(target, Math.cos(ja)*TJ.escape.kick, Math.sin(ja)*TJ.escape.kick); // 7.W: a jink cannot cross a wall the prey cannot pass
            W.vx[target]=Math.cos(ja)*0.5; W.vy[target]=Math.sin(ja)*0.5;
          } else {
            const bite=Math.min(T.bite*W.qA[cT], W.en[target] - (TJ.grazeFloor? TJ.grazeFloor*0.99 : 0)); // ingestion warms too (7.H.4, Q10 1.8) -- flatter than upkeep, so the hunter still loses ground
            if(bite>0){
              if(TJ.alarmEmit) W.al[cellOf(target)] += TJ.alarmEmit; // Schreckstoff: injury broadcasts alarm
              const yieldMul = W.cy[target] ? TJ.cystYield : 1;
              const effE2 = T.digest[W.sp[target]]*yieldMul*tpc, effP2 = T.digestP[W.sp[target]]*yieldMul*tpc; // past ctmax the meal is wasted, not eaten
              const frac = W.en[target] > 0 ? bite/W.en[target] : 0;
              const mShare = W.mn[target]*frac, pShare = W.pr[target]*frac;
              const cHere = cellOf(i);
              W.en[target]-=bite;
              W.en[i]=Math.min(cap, W.en[i]+bite*effE2);
              const wasteE = bite*(1-effE2);
              if (wasteE>0){ W.dE[cHere]+=wasteE; W.flows.egestE+=wasteE; }
              if (pShare>0){
                W.pr[target]-=pShare;
                const pQ2 = P.pQuota*W.sz[i];
                const absP = Math.min(pShare*effP2, Math.max(0, pQ2-W.pr[i]));
                W.pr[i]+=absP;
                const wasteP = pShare-absP;
                if (wasteP>0){ W.dP[cHere]+=wasteP; W.flows.egestP+=wasteP; }
              }
              if (mShare > 0){
                W.mn[target]-=mShare; W.flows.transfer+=mShare;
                const room = mQ*P.mCapMul - W.mn[i];
                const kept = Math.min(room, mShare);
                W.mn[i]+=kept;
                const spill = mShare-kept;
                if (spill>0){ W.M[cellOf(i)]+=spill; W.flows.excrete+=spill; }
              }
              if(W.en[target]<=0.5){ killOrg(target); W.handle[i]=T.handling*W.qH[cT]; W.pc[i]=PC_A+PC_B; } // handling shortens with warmth (Q10 0.65); the kill starts the post-capture window (MV-C)
            }
          }
        }
      } else {
        // MV-C (declared): the post-capture program. A fixed two-phase state machine on W.pc whose
        // dials are the hunting-style locus: phase A (first PC_A ticks after a kill) and phase B
        // (the PC_B after) mirror one axis -- kill-and-stay searches the kill site first (slow, turny)
        // and leaves decisively after; kill-and-move departs at once and settles elsewhere. Every
        // factor is exactly 1 at g0: the timer runs, nothing expresses (the warmth-gate pattern as a
        // behaviour gate). Value modulation only, at the existing idle draw and idle speed -- no draw
        // is added, moved, or made conditional.
        let pcS = 1, pcT2 = 1;
        if (W.pc[i] > 0){
          const ph = W.pc[i] > PC_B ? 1 : -1;
          for (let k=0;k<nL;k++){ const L=loci[k]; if (L.pcSpeedSlope || L.pcTurnSlope){
            const d = W.g[k*MAXN+i]-L.g0;
            pcS *= 1 - L.pcSpeedSlope*d*ph;
            pcT2 *= 1 + L.pcTurnSlope*d*ph; } }
        }
        W.hd[i]+=(R()-0.5)*0.5*pcT2;
        if (T.thermo && !hungry && (W.tgx[cT] !== 0 || W.tgy[cT] !== 0)){ // 7.H.2: an idle, fed hunter turns toward its preferred warmth; hunger overrides (Hedgecock)
          // MV.4 (declared): the hunter is unblinded -- gain 0.25, and the set-point is heritable
          // (tprefSpan, like MV.1). H.2's fixed set-point walked fed hunters off their prey (3/8);
          // "the hunters stay blind until the movement genome can price a set-point for them" -- this
          // is that price: selection, not a constant, owns where a fed hunter idles. Draw-free.
          let tp = T.topt;
          for (let k=0;k<nL;k++){ const Lk = loci[k]; if (Lk.tprefSpan) tp += Lk.tprefSpan*(W.g[k*MAXN+i]-Lk.g0); }
          const sgn = dT > tp ? -1 : 1, ta = Math.atan2(sgn*W.tgy[cT], sgn*W.tgx[cT]);
          let da=ta-W.hd[i]; while(da>Math.PI)da-=6.283; while(da<-Math.PI)da+=6.283;
          W.hd[i]+=Math.max(-T.turnRate*0.5, Math.min(T.turnRate*0.5, da)); }
        speed=(hungry? T.speed*0.7 : T.speed*0.3)*(torpid?0.75:1)*pcS;
      }
      if(T.burst && !fleeing){ // jet burst: brief straight-line speed spike, quadratic cost, long cooldown
        if(W.bst[i]>0){ speed*=T.burst.mul; W.bst[i]--; if(W.bst[i]===0) W.bst[i]=-T.burst.cd; }
        else if(W.bst[i]<0) W.bst[i]++;
        else if(found && best>W.sz[i]+6 && best<T.burst.range){ W.bst[i]=T.burst.dur; speed*=T.burst.mul; W.bst[i]--; }
      }
      moveOrg(i, Math.cos(W.hd[i])*speed, Math.sin(W.hd[i])*speed);
      cost += P.moveCost*speed*speed*W.sz[i] + T.interfCost*nearKin;
      if(torpid) cost*=0.7;
    }
    if(T.detritivore){
      const c0=cellOf(i), D=T.detritivore;
      let rateG = 1, effG = 1; // rate-yield locus; both exactly 1 at g0
      for (let k=0;k<nL;k++){ const L=loci[k], d=W.g[k*MAXN+i]-L.g0, q=L.curve*d*d;
        rateG *= 1 + L.rateSlope*d - q; effG *= 1 - L.effSlope*d - q; }
      const eatE=Math.min(W.dE[c0], D.rateE*rateG*W.sz[i]*W.qD[c0]*tpc*wA); // decomposition: Q10 2.0, flattened by the thermal locus (its price)
      if(eatE>0){ W.dE[c0]-=eatE; W.en[i]=Math.min(cap, W.en[i]+eatE*D.effE*effG); }
      const pQ3=P.pQuota*W.sz[i];
      const eatP=Math.min(W.dP[c0], D.rateP*rateG*W.sz[i]*W.qD[c0]*tpc*wA, Math.max(0,(pQ3-W.pr[i])/D.effP));
      if(eatP>0){ W.dP[c0]-=eatP; W.pr[i]+=eatP*D.effP; }
      const minz=Math.min(W.dM[c0], D.minRate*W.sz[i]);
      if(minz>0){
        W.dM[c0]-=minz;
        const room=Math.max(0, mQ*P.mCapMul - W.mn[i]);
        const kept=Math.min(room, minz);
        W.mn[i]+=kept;
        const rel=minz-kept;
        if(rel>0){ W.M[c0]+=rel; W.flows.bacRelease+=rel; }
      }
    }
    if(T.corpsivore){
      const CV=T.corpsivore;
      let bk=-1, bd2=CV.radius*CV.radius;
      const gx=Math.floor(W.x[i]/CELL), gy=Math.floor(W.y[i]/CELL);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const c=((gy+dy+P.GRID)%P.GRID)*P.GRID+((gx+dx+P.GRID)%P.GRID);
        for(let k=W.cHashHead[c];k>=0;k=W.cHashNext[k]){
          if(!W.cAlive[k])continue;
          const ddx=wd(W.cX[k]-W.x[i]), ddy=wd(W.cY[k]-W.y[i]);
          { const cm = W.cE[k]+W.cP[k]+W.cM[k]; if(cm < CV.minMass || cm > CV.maxMass) continue; }
          if(CV.dietOnly && !(T.diet & TRAITS[W.cSp[k]].bodyTag)) continue;
          const d2=ddx*ddx+ddy*ddy; if(d2<bd2){bd2=d2;bk=k;}
        }
      }
      if(bk>=0){
        const mass=W.cE[bk]+W.cP[bk]+W.cM[bk];
        const f=Math.min(1, CV.rate*W.sz[i]/Math.max(1,mass));
        const gE=W.cE[bk]*f, gP=W.cP[bk]*f, gM=W.cM[bk]*f;
        W.cE[bk]-=gE; W.cP[bk]-=gP; W.cM[bk]-=gM;
        const c0=cellOf(i);
        W.en[i]=Math.min(cap, W.en[i]+gE*CV.effE);
        W.dE[c0]+=gE*(1-CV.effE); W.flows.egestE+=gE*(1-CV.effE);
        const pQ4=P.pQuota*W.sz[i];
        const absP=Math.min(gP*CV.effP, Math.max(0,pQ4-W.pr[i]));
        W.pr[i]+=absP; W.dP[c0]+=gP-absP;
        const room=Math.max(0, mQ*P.mCapMul - W.mn[i]);
        const kept=Math.min(room,gM); W.mn[i]+=kept;
        if(gM-kept>0){ W.M[c0]+=gM-kept; W.flows.bacRelease+=gM-kept; }
      }
    }
    W.en[i]=Math.min(cap, W.en[i]-cost); W.flows.resp+=cost;
    if(W.en[i]<=0){ killOrg(i); continue; }
    if(T.hazard && R()<T.hazard){ killOrg(i); continue; }
    if(W.en[i] > T.reproFrac*cap && W.mn[i] >= P.mReproMin*mQ && W.pr[i] >= P.pReproMin*P.pQuota*W.sz[i] && (!T.reproCooldown || W.cd[i]<=0)){
      const childE = W.en[i]*P.invest;
      const childM = W.mn[i]*P.invest;
      const childP = W.pr[i]*P.invest;
      let nx=wrap(W.x[i]+(R()-0.5)*T.spread), ny=wrap(W.y[i]+(R()-0.5)*T.spread);
      if(W.wallsOn && pathBlocked(T.bodyTag, W.x[i], W.y[i], wd(nx-W.x[i]), wd(ny-W.y[i]))){ nx=W.x[i]; ny=W.y[i]; } // 7.W: dispersal blocked -- the child settles beside the parent (draws above already spent)
      if(T.settleLimited){
        const c=(Math.floor(ny/CELL)&(P.GRID-1))*P.GRID+(Math.floor(nx/CELL)&(P.GRID-1));
        const crowd = T.layer==="fungal" ? W.fB[c] : W.bB[c];
        if(crowd > T.settleLimit){ W.en[i]-=childE*0.3; continue; }
      }
      W.en[i]-=childE+2;
      W.mn[i]-=childM; W.pr[i]-=childP;
      const childSz = Math.max(1.5, W.sz[i]*(R()<0.2? (1+(R()-0.5)*P.mutSigma*2):1));
      W.en[i]-=P.sBody*childSz; // structural substance: an energy sink now, a corpse credit later
      const ci = spawn(W.sp[i], nx, ny, childE, childSz, childM, childP);
      if (ci >= 0){
        W.lg[ci] = W.lg[i] + 1;
        for (let k=0;k<nL;k++){ // heredity: child = parent, plus one uniform kick of +-sigma PER LOCUS, in locus order (the declared L-draws-per-division rule)
          const L = loci[k];
          let gc = W.g[k*MAXN+i];
          if (L.sigma > 0 && P.mutation){ // draw only when mutating: the silent genome consumes zero draws
            gc += (R()-0.5)*2*L.sigma;
            gc = gc < 0 ? 0 : gc > 1 ? 1 : gc; // the corridor
          }
          W.g[k*MAXN+ci] = gc;
        }
      }
      if(T.reproCooldown) W.cd[i]=T.reproCooldown;
    }
  }
  for (let k = 0; k < W.cN; k++){
    if (!W.cAlive[k]) continue;
    const c = cellAt(W.cX[k], W.cY[k]);
    const mass = W.cE[k] + W.cP[k] + W.cM[k];
    if (mass < 0.5){ // expired: dump the remainder into detritus
      W.dE[c]+=W.cE[k]; W.dP[c]+=W.cP[k]; W.dM[c]+=W.cM[k];
      W.cAlive[k]=0; W.cFree.push(k); continue;
    }
    const d = P.corpseDecay*W.qD[c]; // corpses rot faster in warm water (7.H)
    W.dE[c]+=W.cE[k]*d; W.dP[c]+=W.cP[k]*d; W.dM[c]+=W.cM[k]*d;
    W.flows.corpseToDet += W.cM[k]*d;
    W.cE[k]*=(1-d); W.cP[k]*=(1-d); W.cM[k]*=(1-d);
    W.sc[c] += P.scentEmit * mass * 0.01;
  }
  W.tick++;
  if (W.tick % REC.STRIDE === 0) record();
}

