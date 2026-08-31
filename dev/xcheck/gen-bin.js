// Compact binary math trace, for replaying on a phone.
//
// dev/xcheck/gen.js writes ~72 MB of hex text — fine on a workstation, absurd inside an APK.
// This writes the same kind of evidence in a form that ships: one 25-byte record per sample,
// captured from the reference engine (Node 22 / V8 12.4).
//
//   node dev/xcheck/gen-bin.js <out.bin> [samplesPerFn=10000]
//
// Layout: "MCTR", u32 version, u32 recordCount, then records of
//   u8 fnId | f64 a | f64 b | f64 result      (little-endian, unaligned, 25 bytes)
// fnId: 0 sin, 1 cos, 2 exp, 3 pow, 4 atan2, 5 hypot, 6 sqrt   (b unused where n/a)
const fs = require("fs");

const OUT = process.argv[2] || "trace.bin";
const N = parseInt(process.argv[3] || "10000", 10);

// Same generator and seed as gen.js, so the arguments are the ones the sim actually meets.
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const R = mulberry32(20260831);

const recs = [];
const push = (id, a, b, r) => recs.push([id, a, b, r]);

for (let i = 0; i < N; i++){
  const r1 = R(), r2 = R(), r3 = R();
  const mode = i % 5;
  let x;
  if (mode === 0) x = (r1*2-1)*10;          // sim-typical: headings, small angles
  else if (mode === 1) x = (r1*2-1)*1e4;    // range reduction, medium
  else if (mode === 2) x = (r1*2-1)*Math.PI;
  else if (mode === 3) x = (r1*2-1)*1e10;   // the huge-argument reduction path
  else x = (r1*2-1)*1e-3;                   // tiny
  push(0, x, 0, Math.sin(x));
  push(1, x, 0, Math.cos(x));
  const e = (r2*2-1)*30;      push(2, e, 0, Math.exp(e));
  const b = r1*10+1e-6, p = (r2*2-1)*4;
  push(3, b, p, Math.pow(b, p));
  push(3, b, 0.75, Math.pow(b, 0.75));      // sz^0.75 — the sim's hottest pow site
  const ay = (r1*2-1)*5, ax = (r2*2-1)*5;
  push(4, ay, ax, Math.atan2(ay, ax));
  push(5, ay, ax, Math.hypot(ay, ax));
  push(6, r3*100, 0, Math.sqrt(r3*100));
}
// special values, where implementations usually differ if they differ at all
for (const x of [1e300, -1e300, 1e16, 123456.789, 0.5, 1, 2, 3, Math.PI/2, 1e-300]){
  push(0, x, 0, Math.sin(x));
  push(1, x, 0, Math.cos(x));
}
push(3, 10, -5, Math.pow(10, -5));  // the fdlibm-era probe: !== 1e-5 on V8 12.4

const buf = Buffer.alloc(12 + recs.length * 25);
buf.write("MCTR", 0, "ascii");
buf.writeUInt32LE(1, 4);
buf.writeUInt32LE(recs.length, 8);
let o = 12;
for (const [id, a, b, r] of recs){
  buf.writeUInt8(id, o); o += 1;
  buf.writeDoubleLE(a, o); o += 8;
  buf.writeDoubleLE(b, o); o += 8;
  buf.writeDoubleLE(r, o); o += 8;
}
fs.writeFileSync(OUT, buf);
console.log(`wrote ${OUT}  ${recs.length} records, ${(buf.length/1048576).toFixed(2)} MiB`);
