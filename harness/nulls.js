// The null-run truth table (2026-09-05): what every level's meters actually do when nobody
// touches anything, on the level's own seed and clock — printed, not judged. It exists because
// L1's prose said "starves at any size" for a run whose calibration table read 14/21/55 and
// nobody re-read the one against the other. Run it before editing any briefing, chip, verdict
// or debrief that describes the untouched run, and quote the numbers, not the memory of them.
//   node harness/nulls.js            (the JS oracle)        npm run levels:nulls (the crate)
//   MC_CORE=<core.js> node harness/nulls.js [--until <ticks>] [--every <ticks>] [key ...]
const path = require("path");
const C = require(process.env.MC_CORE || path.join(__dirname, "..", "dist", "core.js"));
const { W, LEVELS } = C;
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? +argv[i + 1] : d; };
const keys = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const every = opt("--every", 1000), untilOpt = opt("--until", 0);
const SP = [0, 1, 2, 3, 6];
const pop = sp => { let n = 0; for (let i = 0; i < W.n; i++) if (W.alive[i] && W.sp[i] === sp) n++; return n; };
const fmt = v => typeof v === "number" ? (Math.round(v * 100) / 100) : v;
for (const def of LEVELS){
  if (keys.length && !keys.includes(def.key)) continue;
  C.levelStart(def);
  let state = "running", endT = null; const rows = [];
  const until = untilOpt || def.deadline + 40;
  while (W.tick < until){
    C.levelScript(); C.step();
    const s = C.levelCheck();
    if (state === "running" && s !== "running"){ state = s; endT = W.tick; }
    if (W.tick % every === 0 || W.tick === def.deadline){
      const m = C.levelMeter().map(x => `${x.label}=${fmt(x.v)}${x.goal !== undefined ? "/" + x.goal : ""}`).join("  ");
      rows.push(`  ${String(W.tick).padStart(6)}  S,D,C,B,V=[${SP.map(pop).join(",")}]  ${m}`);
    }
  }
  console.log(`\nL${def.n} ${def.key}  deadline ${def.deadline}  untouched -> ${state} at t=${endT}`);
  console.log(`  says: ${JSON.stringify(def.briefing)}`);
  for (const r of rows) console.log(r);
}
