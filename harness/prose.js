// Player-language gate (Phase 8.5): every word a player reads obeys
// docs/phase8-language-style.md. Checks the static text fields of LEVELS:
//   budgets    per-surface word caps (§4)
//   sentences  no sentence over 20 words in body text
//   reading    Flesch–Kincaid grade ≤ 8 on body texts of 25+ words
//   words      banned terms never in player text (science subtitle exempt);
//              ladder terms never before the level that introduces them (§5)
// Since the level table became data (predicates included), the failNow verdicts are
// reachable here too and are checked like any other body text — they used to be
// closure-built and covered only by review. Exit non-zero on any violation.
const path = require("path");
const C = require(process.env.MC_CORE || path.join(__dirname, "..", "dist", "core.js"));

const BODY_MAX_SENT = 20, FK_MAX = 8, FK_MIN_WORDS = 25;
const BUDGET = { briefing: 50, question: 14, prompt: 12, chip: 9, reflect: 28, goalText: 8, timeoutWhy: 30, debrief: 75 };
// §5: banned in player text (matched as word prefixes, case-insensitive)
const BANNED = ["biomass", "nutrient", "abiotic", "biotic", "trophic", "equilibri", "destabili",
  "population", "organism", "ecosystem", "paradigm", "mechanis", "parameter", "stochastic",
  "allele", "locus", "genotype", "paine", "liebig", "huffaker", "rosenzweig", "q10"];
// §5 term ladder: a science name may appear from its introducing level on
const LADDER = { "carrying capacity": 1, "decomposer": 3, "keystone": 4, "food chain": 6,
  "coloniz": 7, "natural selection": 9, "refuge": 11 };

function words(t){ return t.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)); }
function sentences(t){ return t.split(/[.!?]+/).map(s => s.trim()).filter(s => words(s).length > 0); }
function syl(w){ w = w.toLowerCase().replace(/[^a-z]/g, ""); if (!w) return 0;
  const m = w.replace(/e$/, "").match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1); }
function fk(t){ const ss = sentences(t), ws = words(t);
  const sy = ws.reduce((a, w) => a + syl(w), 0);
  return 0.39 * (ws.length / Math.max(1, ss.length)) + 11.8 * (sy / Math.max(1, ws.length)) - 15.59; }

const bad = [];
function check(where, text, budget, body){
  const w = words(text).length;
  if (budget && w > budget) bad.push(`${where}: ${w} words (budget ${budget})`);
  if (body){
    for (const s of sentences(text)){ const n = words(s).length;
      if (n > BODY_MAX_SENT) bad.push(`${where}: ${n}-word sentence (max ${BODY_MAX_SENT}): "${s.slice(0, 60)}…"`); }
    if (w >= FK_MIN_WORDS){ const g = fk(text);
      if (g > FK_MAX) bad.push(`${where}: reading grade ${g.toFixed(1)} (max ${FK_MAX})`); }
  }
}
function vocab(where, text, n){
  const low = text.toLowerCase();
  for (const b of BANNED) if (low.includes(b)) bad.push(`${where}: banned word "${b}"`);
  for (const t in LADDER) if (low.includes(t) && n < LADDER[t])
    bad.push(`${where}: "${t}" before its ladder level (L${LADDER[t]})`);
}

for (const L of C.LEVELS){
  const id = `L${L.n} ${L.key}`;
  check(id + " briefing", L.briefing, BUDGET.briefing, true);
  check(id + " question", L.question, BUDGET.question, false);
  check(id + " goalText", L.goalText, BUDGET.goalText, false);
  if (L.timeoutWhy) check(id + " timeoutWhy", L.timeoutWhy, BUDGET.timeoutWhy, true);
  check(id + " debrief.pass", L.debrief.pass, BUDGET.debrief, true);
  check(id + " debrief.fail", L.debrief.fail, BUDGET.debrief, true);
  const texts = [L.briefing, L.question, L.goalText, L.timeoutWhy || "", L.debrief.pass, L.debrief.fail, L.title];
  L.failNow.forEach((r, i) => { check(`${id} failNow[${i}]`, r.why, BUDGET.timeoutWhy, true); texts.push(r.why); });
  if (L.predict){
    check(id + " predict.prompt", L.predict.prompt, BUDGET.prompt, false);
    L.predict.options.forEach((o, i) => check(`${id} chip[${i}]`, o, BUDGET.chip, false));
    L.predict.reflect.forEach((r, i) => check(`${id} reflect[${i}]`, r, BUDGET.reflect, true));
    texts.push(L.predict.prompt, ...L.predict.options, ...L.predict.reflect);
  }
  for (const t of texts) if (t) vocab(id, t, L.n);
}
if (bad.length){
  for (const b of bad) console.log("  FAIL  " + b);
  console.log(`PROSE GATE: ${bad.length} violation(s) — docs/phase8-language-style.md §4/§5`);
  process.exit(1);
}
console.log(`PROSE GATE: ALL PASS — ${C.LEVELS.length} levels within language budgets`);
