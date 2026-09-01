// The app-strings prose gate (U2.6 — the review's §6 third instrument, promised before the
// redesign and delivered inside it). The level text has been gated since 8.5; the buttons, hints,
// toasts and cards the player reads far more often were not — and the precedent says promotion
// convicts what a manual read missed (harness/prose.js's first run: 32 where the audit found 8).
//
// Method: scan the app's main Kotlin sources for double-quoted literals, keep the ones that read
// as player sentences (>= 3 words after stripping format codes), and hold them to the same rules
// as the level text (phase8-language-style.md): <= 20 words a sentence, FK <= 8 on long strings,
// the banned-science list, and rule 6's wording discipline — "since", never "because". Single
// words and label pairs pass through: prose rules are for prose.
//
// The rule constants mirror harness/prose.js deliberately — one style, two gates.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "android-app", "app", "src", "main", "java", "org", "microcosm", "app");
const MAX_SENT_WORDS = 20;
const FK_MAX = 8;
const FK_MIN_WORDS = 25;
const BANNED = ["biomass", "nutrient", "abiotic", "biotic", "trophic", "equilibri", "destabili",
  "population", "organism", "ecosystem", "paradigm", "mechanis", "parameter", "stochastic",
  "allele", "locus", "genotype", "because"];
// Strings that reach only developers (dev-mode surfaces, exception text) — named, not patterned,
// so nothing player-facing can hide here by accident.
const DEV_ONLY = new Set([
  "renderer telemetry on", "renderer telemetry off",
]);
// Mention, not use: this title exists to STATE rule 6, so it names the word it forbids.
const TEACHES = new Set([
  "Events — the world's story, newest first; since is not because",
]);

const words = t => t.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w));
const sentences = t => t.split(/[.!?]+/).map(s => s.trim()).filter(s => words(s).length > 0);
function syl(w){ w = w.toLowerCase().replace(/[^a-z]/g, ""); if (!w) return 0;
  const m = w.replace(/e$/, "").match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1); }
function fk(t){ const ss = sentences(t), ws = words(t);
  if (!ws.length || !ss.length) return 0;
  const sy = ws.reduce((a, w) => a + syl(w), 0);
  return 0.39 * (ws.length / ss.length) + 11.8 * (sy / ws.length) - 15.59; }

// Pull double-quoted Kotlin literals, honouring escapes; skip import/annotation lines.
function literals(file){
  const out = [];
  const src = fs.readFileSync(file, "utf8");
  for (const [ln, line] of src.split("\n").entries()){
    if (/^\s*(import|package|@)/.test(line)) continue;
    const re = /"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(line))) out.push({ text: m[1], where: `${path.basename(file)}:${ln + 1}` });
  }
  return out;
}

const bad = [];
let checked = 0;
for (const f of fs.readdirSync(SRC).filter(n => n.endsWith(".kt"))){
  for (const { text, where } of literals(path.join(SRC, f))){
    const plain = text
      .replace(/%[-+ #0-9.,]*[a-zA-Z]/g, "")   // format codes are not words
      .replace(/\\n/g, " ")
      .replace(/[·↔]/g, " ");
    if (words(plain).length < 3) continue;      // labels and pairs are not prose
    if (DEV_ONLY.has(text) || TEACHES.has(text)) continue;
    checked++;
    for (const s of sentences(plain))
      if (words(s).length > MAX_SENT_WORDS)
        bad.push(`${where}  ${words(s).length}-word sentence: "${s.slice(0, 60)}…"`);
    if (words(plain).length >= FK_MIN_WORDS && fk(plain) > FK_MAX)
      bad.push(`${where}  reads at grade ${fk(plain).toFixed(1)} (max ${FK_MAX}): "${plain.slice(0, 60)}…"`);
    const lower = plain.toLowerCase();
    for (const b of BANNED)
      if (new RegExp(`\\b${b}`).test(lower))
        bad.push(`${where}  banned word "${b}": "${plain.slice(0, 60)}…"`);
  }
}

if (bad.length){
  console.log(`APP PROSE: ${bad.length} violation(s) in ${checked} player strings`);
  for (const b of bad) console.log("  " + b);
  process.exit(1);
}
console.log(`APP PROSE: PASS — ${checked} player strings within style`);
