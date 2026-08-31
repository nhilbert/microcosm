// ---------- Walls (7.W): face barriers (docs/phase7-walls-plan.md) ----------
// A wall is a player stroke snapped to grid corners and rasterized into a 4-connected staircase of
// cell-boundary edges (integer Bresenham over corners) -- infinitely thin, so nothing is ever "inside"
// a wall. Everything here is draw-free. Face indices: vertical face between (x,y) and (x+1,y) lives at
// y*G+x (the LEFT cell); horizontal face between (x,y) and (x,y+1) at y*G+x (the TOP cell); a wall
// object stores horizontal faces offset by G*G to keep one list.
function makeWall(ev){
  // The stroke is a start point plus the DRAG VECTOR (dx,dy) -- not a second endpoint, because the
  // minimal-image rule would flip any stroke longer than half the world. A full-height wall is one
  // stroke with |dy| = WORLD, closing on itself around the torus.
  const G=P.GRID;
  const x0=wrap(+ev.x0||0), y0=wrap(+ev.y0||0);
  const kx0=Math.round(x0/CELL), ky0=Math.round(y0/CELL);
  const cd=v=>Math.round(Math.max(-P.WORLD,Math.min(P.WORLD,+v||0))/CELL); // one wrap at most: past that the staircase would overwrite itself
  const dkx=cd(ev.dx), dky=cd(ev.dy);
  const ax=Math.abs(dkx), ay=Math.abs(dky);
  if(ax+ay===0) return null;                       // snapped to a point: no wall
  const sx=dkx>0?1:-1, sy=dky>0?1:-1;
  const faces=[], path=[[kx0,ky0]];
  let ix=0, iy=0;
  while(ix!==ax||iy!==ay){
    // midpoint rule: step the axis whose normalized progress is behind (pure integer, deterministic)
    const stepX = iy===ay || (ix!==ax && (2*ix+1)*ay <= (2*iy+1)*ax);
    const kx=kx0+ix*sx, ky=ky0+iy*sy;
    if(stepX){ faces.push(G*G + ((ky-1)&(G-1))*G + ((sx>0?kx:kx-1)&(G-1))); ix++; } // edge along row-line ky
    else     { faces.push(((sy>0?ky:ky-1)&(G-1))*G + ((kx-1)&(G-1))); iy++; }      // edge along column-line kx
    path.push([kx0+ix*sx, ky0+iy*sy]);
  }
  const cl=(v,d)=>v===undefined?d:Math.max(0,Math.min(1,+v||0));
  return { x0:wrap(kx0*CELL), y0:wrap(ky0*CELL), dx:dkx*CELL, dy:dky*CELL,
    lt:cl(ev.lt,0), ht:cl(ev.ht,0), fl:cl(ev.fl,0), pass:ev.pass===undefined?0:(ev.pass|0),
    faces, path };
}
function compileWalls(){ // the only writer of the face planes; later walls win on shared faces
  const N=P.GRID*P.GRID;
  W.wfPassV.fill(-1); W.wfPassH.fill(-1);
  W.wfLtV.fill(1); W.wfLtH.fill(1); W.wfHtV.fill(1); W.wfHtH.fill(1); W.wfFlV.fill(1); W.wfFlH.fill(1);
  W.wallsOn = W.walls.length > 0;
  if(!W.wallsOn){ W.wShade.fill(1); return; }
  for(const wl of W.walls) for(const f of wl.faces){
    if(f>=N){ const c=f-N; W.wfPassH[c]=wl.pass; W.wfLtH[c]=wl.lt; W.wfHtH[c]=wl.ht; W.wfFlH[c]=wl.fl; }
    else    { W.wfPassV[f]=wl.pass; W.wfLtV[f]=wl.lt; W.wfHtV[f]=wl.ht; W.wfFlV[f]=wl.fl; }
  }
}
// Passage: a step's x (or y) component is dropped when any face it crosses refuses the bodyTag.
function xPassBlocked(tag, x, y, dx){
  const G=P.GRID, row=(Math.floor(y/CELL)&(G-1))*G;
  const c0=Math.floor(x/CELL), c1=Math.floor((x+dx)/CELL);
  if(dx>0){ for(let cc=c0;cc<c1;cc++)    if(!(W.wfPassV[row+(cc&(G-1))]&tag)) return true; }
  else    { for(let cc=c0-1;cc>=c1;cc--) if(!(W.wfPassV[row+(cc&(G-1))]&tag)) return true; }
  return false;
}
function yPassBlocked(tag, x, y, dy){
  const G=P.GRID, col=Math.floor(x/CELL)&(G-1);
  const r0=Math.floor(y/CELL), r1=Math.floor((y+dy)/CELL);
  if(dy>0){ for(let rr=r0;rr<r1;rr++)    if(!(W.wfPassH[(rr&(G-1))*G+col]&tag)) return true; }
  else    { for(let rr=r0-1;rr>=r1;rr--) if(!(W.wfPassH[(rr&(G-1))*G+col]&tag)) return true; }
  return false;
}
// Reachability along the L-path (x leg at the start row, then y leg at the end column) -- the same
// geometry the axis-separated mover walks, so "can target" and "can get there" agree.
function pathBlocked(tag, x, y, dx, dy){
  return xPassBlocked(tag,x,y,dx) || yPassBlocked(tag,x+dx,y,dy);
}
function moveOrg(i, dx, dy){ // THE position write for organism motion; draw-free; slides along walls
  if(!W.wallsOn){ W.x[i]=wrap(W.x[i]+dx); W.y[i]=wrap(W.y[i]+dy); return; }
  const tag=TRAITS[W.sp[i]].bodyTag;
  if(!xPassBlocked(tag,W.x[i],W.y[i],dx)) W.x[i]=wrap(W.x[i]+dx);
  if(!yPassBlocked(tag,W.x[i],W.y[i],dy)) W.y[i]=wrap(W.y[i]+dy);
}
// Product of a face-transmission plane over every boundary crossed by the minimal-image segment from
// (x0,y0) along (dx,dy). A product is order-free, so the two axes walk their crossings independently.
function marchMul(x0, y0, dx, dy, AV, AH){
  const G=P.GRID; let m=1;
  if(dx!==0){
    const s=dx>0?1:-1, c0=Math.floor(x0/CELL), c1=Math.floor((x0+dx)/CELL);
    for(let cc=c0; cc!==c1; cc+=s){
      const t=((s>0?cc+1:cc)*CELL-x0)/dx;
      const row=Math.floor((y0+t*dy)/CELL)&(G-1);
      m*=AV[row*G+((s>0?cc:cc-1)&(G-1))];
      if(m===0) return 0;
    }
  }
  if(dy!==0){
    const s=dy>0?1:-1, r0=Math.floor(y0/CELL), r1=Math.floor((y0+dy)/CELL);
    for(let rr=r0; rr!==r1; rr+=s){
      const t=((s>0?rr+1:rr)*CELL-y0)/dy;
      const col=Math.floor((x0+t*dx)/CELL)&(G-1);
      m*=AH[((s>0?rr:rr-1)&(G-1))*G+col];
      if(m===0) return 0;
    }
  }
  return m;
}

// Perf pass 2026-08-31: two bodies, one arithmetic. Every face factor is exactly 1.0 without
// walls, and multiplying by 1.0 is an exact identity in IEEE 754 — so the open-world body drops
// the four face loads+multiplies per cell per field and stays bit-identical to the walled one.
// Banner rule 4 holds for both: draw-free.
function diffuseM(){ return W.wallsOn ? diffuseMWalled() : diffuseMOpen(); }
function diffuseMWalled(){
  const G=P.GRID, M=W.M, T=W.Mtmp, k=P.mDiff*0.25;
  const FV=W.wfFlV, FH=W.wfFlH; // face flow transmission (7.W): exactly 1 on open faces, so the flux-pair form is the shipped stencil bit for bit
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, m=M[c];
      T[c]=m + k*(FV[y0+xl]*(M[y0+xl]-m)+FV[c]*(M[y0+xr]-m)+FH[yu+x]*(M[yu+x]-m)+FH[c]*(M[yd+x]-m));
    }
  }
  M.set(T);
  const dE=W.dE, dP=W.dP, dM=W.dM, qD=W.qD;
  for(let c=0;c<G*G;c++){
    const back=dM[c]*P.dLeach*qD[c], keep=1-P.dLeach*qD[c]; // abiotic breakdown warms with the cell (7.H)
    if(back>0){ M[c]+=back; W.flows.leachM+=back; }
    dM[c]*=keep; dE[c]*=keep; dP[c]*=keep;  // organic fractions dissipate
  }
  const S=W.sc, ST=W.scTmp, ks=P.scentDiff*0.25;
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, v=S[c];
      ST[c]=(v + ks*(FV[y0+xl]*(S[y0+xl]-v)+FV[c]*(S[y0+xr]-v)+FH[yu+x]*(S[yu+x]-v)+FH[c]*(S[yd+x]-v)))*P.scentDecay;
    }
  }
  S.set(ST);
  // alarm channel: fast decay, local reach — spikes, not ambience (Schreckstoff time constant)
  const A=W.al, AT=W.alTmp, ka=0.2*0.25;
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, v=A[c];
      AT[c]=(v + ka*(FV[y0+xl]*(A[y0+xl]-v)+FV[c]*(A[y0+xr]-v)+FH[yu+x]*(A[yu+x]-v)+FH[c]*(A[yd+x]-v)))*0.85;
    }
  }
  A.set(AT);
}
function diffuseMOpen(){ // the wall-free fast path: the walled body with every face factor (exactly 1) elided
  const G=P.GRID, M=W.M, T=W.Mtmp, k=P.mDiff*0.25;
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, m=M[c];
      T[c]=m + k*((M[y0+xl]-m)+(M[y0+xr]-m)+(M[yu+x]-m)+(M[yd+x]-m));
    }
  }
  M.set(T);
  const dE=W.dE, dP=W.dP, dM=W.dM, qD=W.qD;
  for(let c=0;c<G*G;c++){
    const back=dM[c]*P.dLeach*qD[c], keep=1-P.dLeach*qD[c]; // abiotic breakdown warms with the cell (7.H)
    if(back>0){ M[c]+=back; W.flows.leachM+=back; }
    dM[c]*=keep; dE[c]*=keep; dP[c]*=keep;  // organic fractions dissipate
  }
  const S=W.sc, ST=W.scTmp, ks=P.scentDiff*0.25;
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, v=S[c];
      ST[c]=(v + ks*((S[y0+xl]-v)+(S[y0+xr]-v)+(S[yu+x]-v)+(S[yd+x]-v)))*P.scentDecay;
    }
  }
  S.set(ST);
  const A=W.al, AT=W.alTmp, ka=0.2*0.25;
  for(let y=0;y<G;y++){
    const yu=((y-1+G)%G)*G, yd=((y+1)%G)*G, y0=y*G;
    for(let x=0;x<G;x++){
      const xl=(x-1+G)%G, xr=(x+1)%G;
      const c=y0+x, v=A[c];
      AT[c]=(v + ka*((A[y0+xl]-v)+(A[y0+xr]-v)+(A[yu+x]-v)+(A[yd+x]-v)))*0.85;
    }
  }
  A.set(AT);
}
// Irradiance adds: the field is the ambient floor plus one toroidal Gaussian per source's light. Draw-free.
// Walls (7.W) occlude each source's term by the product of light transmissions over faces crossed on the
// minimal-image ray; the ambient floor is a floor, not a source, and passes. W.wShade keeps the honest
// occluded/unoccluded ratio for the painted light layer. Without walls the arithmetic is the shipped one.
function computeLight(){
  const S = W.sources, on = W.wallsOn;
  for (let gy = 0; gy < P.GRID; gy++) for (let gx = 0; gx < P.GRID; gx++){
    const cx=(gx+0.5)*CELL, cyy=(gy+0.5)*CELL;
    let v = P.ambient, v0 = P.ambient;
    for (let k = 0; k < S.length; k++){
      const s = S[k], dx=wd(cx-s.x), dy=wd(cyy-s.y);
      const g = s.i * Math.exp(-(dx*dx+dy*dy)/(2*s.sigma*s.sigma));
      if (on){ v0 += g; v += g * marchMul(s.x, s.y, dx, dy, W.wfLtV, W.wfLtH); }
      else v += g;
    }
    const c = gy*P.GRID+gx;
    W.light[c] = v * P.lightMul;
    if (on) W.wShade[c] = v0 > 0 ? v/v0 : 1;
  }
  // the gradient the drifter senses (7.H.3, declared change): central differences on the torus, light per world unit
  const G = P.GRID, Lt = W.light;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++){
    const c = gy*G+gx;
    W.lgx[c] = (Lt[gy*G+((gx+1)&(G-1))] - Lt[gy*G+((gx-1+G)&(G-1))]) / (2*CELL);
    W.lgy[c] = (Lt[((gy+1)&(G-1))*G+gx] - Lt[((gy-1+G)&(G-1))*G+gx]) / (2*CELL);
  }
}
// Warmth above ambient (7.H): the same Gaussians, each source's `a` (negative = a cold source). Static like
// light, recomputed on events only. Sources with a = 0 are skipped so the shipped world's field is exactly 0.
function computeTemp(){
  const S = W.sources, on = W.wallsOn; // walls (7.W) conduct each source's warmth by their ht per crossed face
  for (let gy = 0; gy < P.GRID; gy++) for (let gx = 0; gx < P.GRID; gx++){
    const cx=(gx+0.5)*CELL, cyy=(gy+0.5)*CELL;
    let v = P.tempAmb;
    for (let k = 0; k < S.length; k++){
      const s = S[k]; if (s.a === 0) continue;
      const dx=wd(cx-s.x), dy=wd(cyy-s.y);
      let g = s.a * Math.exp(-(dx*dx+dy*dy)/(2*s.sigma*s.sigma));
      if (on) g *= marchMul(s.x, s.y, dx, dy, W.wfHtV, W.wfHtH);
      v += g;
    }
    const c = gy*P.GRID+gx; W.temp[c] = v;
    const Q = P.q10, e = v/10; // Math.pow(q, 0) is exactly 1: the certified world's factors stay 1
    W.qR[c] = Math.pow(Q.resp, e); W.qP[c] = Math.pow(Q.photo, e); W.qD[c] = Math.pow(Q.decomp, e);
    W.qH[c] = Math.pow(Q.handling, e); W.qS[c] = Math.pow(Q.pursuit, e); W.qA[c] = Math.pow(Q.attack, e);
  }
  // the gradient the organisms sense (7.H.2): central differences on the torus, degrees per world unit
  const G = P.GRID, Tm = W.temp;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++){
    const c = gy*G+gx;
    W.tgx[c] = (Tm[gy*G+((gx+1)&(G-1))] - Tm[gy*G+((gx-1+G)&(G-1))]) / (2*CELL);
    W.tgy[c] = (Tm[((gy+1)&(G-1))*G+gx] - Tm[((gy-1+G)&(G-1))*G+gx]) / (2*CELL);
  }
}

function rebuild(){
  W.pB.fill(0); W.bB.fill(0); W.fB.fill(0); W.hashHead.fill(-1); W.cHashHead.fill(-1);
  for (let k=0;k<W.cN;k++){ if(!W.cAlive[k]) continue;
    const c=(Math.floor(W.cY[k]/CELL)&(P.GRID-1))*P.GRID+(Math.floor(W.cX[k]/CELL)&(P.GRID-1));
    W.cHashNext[k]=W.cHashHead[c]; W.cHashHead[c]=k;
  }
  for (let i=0;i<W.n;i++){ if(!W.alive[i]) continue;
    const gx=Math.floor(W.x[i]/CELL)&(P.GRID-1), gy=Math.floor(W.y[i]/CELL)&(P.GRID-1);
    const c=gy*P.GRID+gx;
    W.hashNext[i]=W.hashHead[c]; W.hashHead[c]=i;
    const L = TRAITS[W.sp[i]].layer;
    if(L==="plankton" && !W.cy[i]) W.pB[c]+=W.en[i];
    else if(L==="benthic") W.bB[c]+=W.en[i];
    else if(L==="fungal") W.fB[c]+=W.en[i];
  }
}
function cellLight(i){
  const gx=Math.floor(W.x[i]/CELL)&(P.GRID-1), gy=Math.floor(W.y[i]/CELL)&(P.GRID-1);
  const c=gy*P.GRID+gx;
  const shade = TRAITS[W.sp[i]].layer==="plankton"
    ? Math.min(P.shadeMax, W.pB[c]/P.divPlank)   // plankton floats above: shaded only by plankton
    : Math.min(P.shadeMax, (W.pB[c]+W.bB[c]+W.fB[c]*0.5)/P.divBenth); // benthos: shaded from above; fungal cover half-counts
  return W.light[c]*(1-shade);
}
function neighbors(i, radius, cb){
  const r=Math.ceil(radius/CELL);
  const gx=Math.floor(W.x[i]/CELL), gy=Math.floor(W.y[i]/CELL);
  for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
    const c=((gy+dy+P.GRID)%P.GRID)*P.GRID + ((gx+dx+P.GRID)%P.GRID);
    for(let j=W.hashHead[c]; j>=0; j=W.hashNext[j]){
      if(j===i||!W.alive[j]) continue;
      const ddx=wd(W.x[j]-W.x[i]), ddy=wd(W.y[j]-W.y[i]);
      const d2=ddx*ddx+ddy*ddy;
      if(d2<=radius*radius) cb(j, ddx, ddy, Math.sqrt(d2));
    }
  }
}

