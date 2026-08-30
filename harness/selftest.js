// Self-test for the harness estimators on synthetic series with known answers.
// Exists because the first-ACF-peak period estimator once reported a 520-tick "period" on a
// real series; a check like this is how such things get caught before they reach a record.
const L = require("./lib.js");
let fails = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`); if (!ok) fails++; };
const N = 1200, PER = 60;
const sine = (phase, noise=0) => Array.from({ length: N }, (_, k) => Math.sin(2*Math.PI*(k/PER) + phase) + noise*(((k*7919)%97)/97 - 0.5));
const a = L.demean(sine(0)), b = L.demean(sine(-Math.PI/2)), bn = L.demean(sine(-Math.PI/2, 0.6));
const p = L.period(a);
check("period of a clean 60-sample sine", Math.abs(p - PER) <= 1, `got ${p}`);
check("period survives noise (sd 0.6)", Math.abs(L.period(L.demean(sine(0,0.6))) - PER) <= 2, `got ${L.period(L.demean(sine(0,0.6)))}`);
const ph = L.phaseLag(a, b, PER).frac;
check("quarter-period lag (b follows a by 1/4)", Math.abs(ph - 0.25) <= 0.02, `got ${ph.toFixed(3)}`);
check("quarter-period lag under noise", Math.abs(L.phaseLag(a, bn, PER).frac - 0.25) <= 0.04, `got ${L.phaseLag(a, bn, PER).frac.toFixed(3)}`);
const ramp = L.detrend(sine(0).map((v,k) => v + 0.004*k)); // founding-trend case
check("period of a sine on a linear trend, after detrend", Math.abs(L.period(ramp) - PER) <= 1, `got ${L.period(ramp)}`);
check("period of a trended sine WITHOUT detrend is unreliable (documents why detrend is mandatory)", !(Math.abs(L.period(L.demean(sine(0).map((v,k) => v + 0.004*k))) - PER) <= 1), `got ${L.period(L.demean(sine(0).map((v,k) => v + 0.004*k)))}`);
const anti = L.demean(sine(Math.PI));
check("antiphase reads as ±0.5", Math.abs(Math.abs(L.phaseLag(a, anti, PER).frac) - 0.5) <= 0.02, `got ${L.phaseLag(a, anti, PER).frac.toFixed(3)}`);
check("xcorr of a series with itself at lag 0 is 1", Math.abs(L.xcorr(a, a, 0) - 1) < 1e-9);
check("cv of a constant series is 0", L.cv([3,3,3,3]) === 0);
check("LOCI lists exactly the species with a locus", L.LOCI.every(sp => !!L.TRAITS[sp].locus), L.LOCI.map(sp => L.TRAITS[sp].name).join(", "));
// ---- MV.0 movement estimators on synthetic tracks with known answers ----
{ const WORLD = L.P.WORLD, T = 4000;
  // ballistic: straight line at speed 0.7, crossing the torus repeatedly -> unwrap must reconstruct it, alpha ~ 2
  const bx = Array.from({length:T}, (_,k) => ((k*0.7) % WORLD + WORLD) % WORLD), by = Array.from({length:T}, () => 10);
  const ux = L.unwrapTrack(bx), uy = L.unwrapTrack(by);
  check("unwrap reconstructs a straight torus-crossing track", Math.abs((ux[T-1]-ux[0]) - 0.7*(T-1)) < 1e-6, `net ${(ux[T-1]-ux[0]).toFixed(1)} vs ${(0.7*(T-1)).toFixed(1)}`);
  const aB = L.msdAlpha(L.msd(ux, uy, 50));
  check("ballistic track reads alpha ~ 2", Math.abs(aB - 2) < 0.05, `got ${aB.toFixed(2)}`);
  // diffusive: a deterministic LCG random walk, alpha ~ 1
  let s = 12345; const rnd = () => { s = (s*1664525 + 1013904223) >>> 0; return s/4294967296; };
  let px = 0, py = 0; const rx=[0], ry=[0];
  for (let k=1;k<T;k++){ const a = rnd()*2*Math.PI; px += Math.cos(a); py += Math.sin(a); rx.push(px); ry.push(py); }
  const aD = L.msdAlpha(L.msd(rx, ry, 50));
  check("random-walk track reads alpha ~ 1", Math.abs(aD - 1) < 0.2, `got ${aD.toFixed(2)}`);
  // confined: a tethered random walk (Ornstein-Uhlenbeck pull toward a point -- the drift branch's own
  // shape when taxis holds it) -> MSD saturates; alpha over the tail window ~ 0. (A deterministic orbit
  // is the wrong model: its MSD is periodic, not a plateau, and the log fit reads the oscillation.)
  let ox = 0, oy = 0; const tx=[0], ty=[0];
  for (let k=1;k<T;k++){ ox += -0.2*ox + 2*(rnd()-0.5); oy += -0.2*oy + 2*(rnd()-0.5); tx.push(ox); ty.push(oy); }
  const aC = L.msdAlpha(L.msd(tx, ty, 60), 25, 60);
  check("confined track reads alpha ~ 0 past its relaxation", Math.abs(aC) < 0.1, `got ${aC.toFixed(2)}`);
}
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall harness self-tests pass");
process.exit(fails ? 1 : 0);
