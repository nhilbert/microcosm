// Generate argument/result traces from Node's V8 (the microcosm reference engine).
const fs=require('fs');
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const R=mulberry32(20260831);
const buf=Buffer.alloc(8);
const h=d=>{buf.writeDoubleBE(d);return buf.toString('hex')};
const N=200000;
const out=[];
function emit(fn,args,res){out.push(fn+' '+args.map(h).join(' ')+' '+h(res));}
for(let i=0;i<N;i++){
  // sim-typical and stress ranges
  const r1=R(),r2=R(),r3=R();
  let x;
  const mode=i%5;
  if(mode===0)x=(r1*2-1)*10;            // [-10,10]
  else if(mode===1)x=(r1*2-1)*1e4;      // range-reduction medium
  else if(mode===2)x=(r1*2-1)*Math.PI;  // [-pi,pi]
  else if(mode===3)x=(r1*2-1)*1e10;     // large
  else x=(r1*2-1)*1e-3;                 // tiny
  emit('sin',[x],Math.sin(x));
  emit('cos',[x],Math.cos(x));
  const e=(r2*2-1)*30; emit('exp',[e],Math.exp(e));
  const b=r1*10+1e-6, p=(r2*2-1)*4;
  emit('pow',[b,p],Math.pow(b,p));
  emit('pow75',[b],Math.pow(b,0.75));
  const ay=(r1*2-1)*5, ax=(r2*2-1)*5;
  emit('atan2',[ay,ax],Math.atan2(ay,ax));
  emit('hypot',[ay,ax],Math.hypot(ay,ax));
  emit('sqrt',[r3*100],Math.sqrt(r3*100));
}
// special values
for(const x of [1e300,-1e300,1e16,123456.789,0.5,1,2,3,Math.PI/2,1e-300]){
  emit('sin',[x],Math.sin(x));emit('cos',[x],Math.cos(x));
}
emit('pow',[10,-5],Math.pow(10,-5));
// output path as argv[2]; the trace is ~72 MB and regenerable, so keep it out of the repo
fs.writeFileSync(process.argv[2] || 'trace.txt', out.join('\n')+'\n');
console.log('wrote',out.length,'lines');
