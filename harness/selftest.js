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
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall harness self-tests pass");
process.exit(fails ? 1 : 0);
