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
// Modification protocol: after ANY edit to this file, run
//   `node conform.js`   (2 seeds x 3000 ticks, ~3 s)
// A changed fingerprint is fine only when an ecology change is the
// declared intent — then re-capture with `node conform.js --capture`
// and re-run the full 8-seed harness (tune2.js) before shipping.
// ============================================================
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
    const gd = T.locus ? W.g[i]-T.locus.g0 : 0, gq = T.locus ? T.locus.curve*gd*gd : 0; // locus deviation and its curvature penalty (exactly 0 at g0)
    let cost = T.kb*(T.locus ? 1 + T.locus.kbSlope*gd - gq : 1)*Math.pow(W.sz[i],0.75)*W.qR[cT]; // maintenance: Q10 2.5
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
      const kpG = T.locus ? (1 + T.locus.kpSlope*(-gd) - gq) * (1 + T.locus.lightSlope*gd*(1 - 2*Lc) - gq) : 1;
      const gppGain = T.kp*kpG*Lc*W.sz[i]*sat*W.qP[cT]*tpc; // photosynthesis: Q10 1.6, cut off past ctmax
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
      W.vx[i]=W.vx[i]*T.damp + (R()-0.5)*T.noise + px;
      W.vy[i]=W.vy[i]*T.damp + (R()-0.5)*T.noise + py;
      if (T.thermo && (W.tgx[cT] !== 0 || W.tgy[cT] !== 0)){ // 7.H.2 thermotaxis: down the discomfort gradient |dT - tpref| (draw-free; skipped in a flat field)
        const sgn = dT > T.topt ? -1 : dT < T.topt ? 1 : 0;
        W.vx[i] += T.thermo*sgn*W.tgx[cT]; W.vy[i] += T.thermo*sgn*W.tgy[cT]; }
      const s=Math.hypot(W.vx[i],W.vy[i]);
      if(s>T.driftSpeed){ W.vx[i]*=T.driftSpeed/s; W.vy[i]*=T.driftSpeed/s; }
      W.x[i]=wrap(W.x[i]+W.vx[i]); W.y[i]=wrap(W.y[i]+W.vy[i]);
      cost += P.moveCost*(W.vx[i]*W.vx[i]+W.vy[i]*W.vy[i])*W.sz[i]*T.moveCostMul;
    }
    else if(T.movement==="tumble"){ // run-and-tumble chemotaxis along the detritus gradient
      const c0=cellOf(i);
      let here = T.tumbleField==="scent" ? W.sc[c0]*40 : W.dE[c0]+W.dP[c0]+W.dM[c0];
      if (T.thermo && dT !== T.topt && (W.tgx[c0] !== 0 || W.tgy[c0] !== 0)) here -= T.thermo*Math.abs(dT - T.topt); // 7.H.2 klinokinesis: discomfort reads as "worse", raising tumbling (Berg & Brown)
      const pT = here > W.mem[i]+0.01 ? T.tumbleLow : T.tumbleHigh;
      W.mem[i]=here;
      if(R()<pT) W.hd[i]=R()*6.283;
      const tor = T.torpor && W.en[i] < T.torpor*cap ? 0.6 : 1;
      W.x[i]=wrap(W.x[i]+Math.cos(W.hd[i])*T.speed*tor); W.y[i]=wrap(W.y[i]+Math.sin(W.hd[i])*T.speed*tor);
      cost += P.moveCost*T.speed*T.speed*W.sz[i]*tor;
    }
    else if(T.movement==="steer"){ // pursuit forager
      const torpid = W.en[i] < T.torpor*cap;
      const hungry = W.en[i] < T.satiation*cap && W.handle[i]<=0;
      if(W.handle[i]>0) W.handle[i]--; if(W.cd[i]>0) W.cd[i]--;
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
          const tgd = TJ.locus ? W.g[target]-TJ.locus.g0 : 0;
          const escP = TJ.escape ? (TJ.locus ? TJ.escape.p + TJ.locus.escSlope*tgd - TJ.escape.p*TJ.locus.curve*tgd*tgd : TJ.escape.p)
                                   * (T.locus ? 1 + T.locus.catchSlope*(-gd) - gq : 1) : 0;
          if(TJ.escape && R()<escP){ // escape jink: prey darts away, contact broken
            const ja=R()*6.283;
            W.x[target]=wrap(W.x[target]+Math.cos(ja)*TJ.escape.kick);
            W.y[target]=wrap(W.y[target]+Math.sin(ja)*TJ.escape.kick);
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
              if(W.en[target]<=0.5){ killOrg(target); W.handle[i]=T.handling*W.qH[cT]; } // handling shortens with warmth (Q10 0.65)
            }
          }
        }
      } else {
        W.hd[i]+=(R()-0.5)*0.5;
        if (T.thermo && !hungry && (W.tgx[cT] !== 0 || W.tgy[cT] !== 0)){ // 7.H.2: an idle, fed hunter turns toward its preferred warmth; hunger overrides (Hedgecock)
          const sgn = dT > T.topt ? -1 : 1, ta = Math.atan2(sgn*W.tgy[cT], sgn*W.tgx[cT]);
          let da=ta-W.hd[i]; while(da>Math.PI)da-=6.283; while(da<-Math.PI)da+=6.283;
          W.hd[i]+=Math.max(-T.turnRate*0.5, Math.min(T.turnRate*0.5, da)); }
        speed=(hungry? T.speed*0.7 : T.speed*0.3)*(torpid?0.75:1);
      }
      if(T.burst && !fleeing){ // jet burst: brief straight-line speed spike, quadratic cost, long cooldown
        if(W.bst[i]>0){ speed*=T.burst.mul; W.bst[i]--; if(W.bst[i]===0) W.bst[i]=-T.burst.cd; }
        else if(W.bst[i]<0) W.bst[i]++;
        else if(found && best>W.sz[i]+6 && best<T.burst.range){ W.bst[i]=T.burst.dur; speed*=T.burst.mul; W.bst[i]--; }
      }
      W.x[i]=wrap(W.x[i]+Math.cos(W.hd[i])*speed); W.y[i]=wrap(W.y[i]+Math.sin(W.hd[i])*speed);
      cost += P.moveCost*speed*speed*W.sz[i] + T.interfCost*nearKin;
      if(torpid) cost*=0.7;
    }
    if(T.detritivore){
      const c0=cellOf(i), D=T.detritivore;
      const rateG = T.locus ? 1 + T.locus.rateSlope*gd - gq : 1, effG = T.locus ? 1 - T.locus.effSlope*gd - gq : 1; // rate-yield locus; both exactly 1 at g0
      const eatE=Math.min(W.dE[c0], D.rateE*rateG*W.sz[i]*W.qD[c0]*tpc); // decomposition: Q10 2.0
      if(eatE>0){ W.dE[c0]-=eatE; W.en[i]=Math.min(cap, W.en[i]+eatE*D.effE*effG); }
      const pQ3=P.pQuota*W.sz[i];
      const eatP=Math.min(W.dP[c0], D.rateP*rateG*W.sz[i]*W.qD[c0]*tpc, Math.max(0,(pQ3-W.pr[i])/D.effP));
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
      const nx=wrap(W.x[i]+(R()-0.5)*T.spread), ny=wrap(W.y[i]+(R()-0.5)*T.spread);
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
        if (T.locus){ // heredity: child = parent, plus one uniform kick of +-sigma when mutation is on
          let gc = W.g[i];
          if (T.locus.sigma > 0 && P.mutation){ // draw only when mutating: the silent genome consumes zero draws
            gc += (R()-0.5)*2*T.locus.sigma;
            gc = gc < 0 ? 0 : gc > 1 ? 1 : gc; // the corridor
          }
          W.g[ci] = gc;
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

