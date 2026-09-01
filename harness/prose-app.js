// The app-strings prose gate (U2.6 — the review's §6 third instrument, promised before the
// redesign and delivered inside it; DE.5 taught it two languages). The level text has been gated
// since 8.5; the buttons, hints, toasts and cards the player reads far more often were not — and
// the precedent says promotion convicts what a manual read missed (harness/prose.js's first run:
// 32 where the audit found 8).
//
// What it checks, since the German translation (DE.1–DE.5):
//   1. Kotlin literals in the app's main sources (the few that remain after the resource
//      extraction — anything player-facing hiding in code is exactly what this catches).
//   2. res/values/strings.xml and res/values/narration.xml — English rules; entries marked
//      translatable="false" are machine patterns, skipped; names ending in _de are German
//      display text living in the default config and get the German rules.
//   3. res/values-de/strings.xml — German rules.
//   4. Key parity: every translatable string and array in values/strings.xml exists in
//      values-de/strings.xml and vice versa; shared arrays have equal lengths, and the
//      narration/vocabulary arrays are pairwise aligned.
//   5. The level overlay (assets/levels.de.json) is COMPLETE against src/observatory/levels.json:
//      every level, every player-text field, option/reflect/meter counts equal, every English
//      fail reason translated (the timeoutWhy verdicts included — they reach the player through
//      the same whys map) — and all of its German within style.
//
// English rules are harness/prose.js's (<= 20 words a sentence, FK <= 8 on long strings, the
// banned-science list, "since" never "because"). German rules mirror them minus FK — the
// Flesch-Kincaid constants are calibrated on English syllable counts and would convict ordinary
// German compounds — so the German is held to the sentence cap, its own banned list, and rule 6's
// German form: "seit(dem)", never "weil".
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..", "android-app", "app", "src", "main");
const SRC = path.join(APP, "java", "org", "microcosm", "app");
const MAX_SENT_WORDS = 20;
const FK_MAX = 8;
const FK_MIN_WORDS = 25;
const BANNED_EN = ["biomass", "nutrient", "abiotic", "biotic", "trophic", "equilibri", "destabili",
  "population", "organism", "ecosystem", "paradigm", "mechanis", "parameter", "stochastic",
  "allele", "locus", "genotype", "because"];
const BANNED_DE = ["biomasse", "nährstoff", "abiotisch", "biotisch", "trophisch",
  "population", "organismus", "ökosystem", "paradigma", "mechanismus", "parameter",
  "stochastisch", "allel", "genotyp", "weil"];
// Strings that reach only developers (dev-mode surfaces, exception text) — named, not patterned,
// so nothing player-facing can hide here by accident.
const DEV_ONLY = new Set([
  "renderer telemetry on", "renderer telemetry off",
]);
// Mention, not use: these titles exist to STATE rule 6, so they name the word they forbid.
const TEACHES = new Set([
  "Events — the world's story, newest first; since is not because",
  "Ereignisse — die Geschichte der Welt, Neuestes zuerst; seit ist nicht weil",
]);

const words = t => t.split(/\s+/).filter(w => /[A-Za-zÀ-ÿ0-9]/.test(w));
const sentences = t => t.split(/[.!?]+/).map(s => s.trim()).filter(s => words(s).length > 0);
function syl(w){ w = w.toLowerCase().replace(/[^a-z]/g, ""); if (!w) return 0;
  const m = w.replace(/e$/, "").match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1); }
function fk(t){ const ss = sentences(t), ws = words(t);
  if (!ws.length || !ss.length) return 0;
  const sy = ws.reduce((a, w) => a + syl(w), 0);
  return 0.39 * (ws.length / ss.length) + 11.8 * (sy / ws.length) - 15.59; }

const bad = [];
let checked = 0;

// %d, %.1f, %1$d, %2$.1f are not words; neither are the glue glyphs.
const plainText = t => t
  .replace(/%[0-9]+\$[-+ #0-9.,]*[a-zA-Z]/g, "")
  .replace(/%[-+ #0-9.,]*[a-zA-Z]/g, "")
  .replace(/\\n/g, " ")
  .replace(/[·↔☀{}]/g, " ");

function check(text, where, lang){
  const plain = plainText(text);
  if (words(plain).length < 3) return;      // labels and pairs are not prose
  if (DEV_ONLY.has(text) || TEACHES.has(text)) return;
  checked++;
  for (const s of sentences(plain))
    if (words(s).length > MAX_SENT_WORDS)
      bad.push(`${where}  ${words(s).length}-word sentence: "${s.slice(0, 60)}…"`);
  if (lang === "en" && words(plain).length >= FK_MIN_WORDS && fk(plain) > FK_MAX)
    bad.push(`${where}  reads at grade ${fk(plain).toFixed(1)} (max ${FK_MAX}): "${plain.slice(0, 60)}…"`);
  const lower = plain.toLowerCase();
  for (const b of (lang === "de" ? BANNED_DE : BANNED_EN)){
    const re = (b === "weil") ? /\bweil\b/ : new RegExp(`\\b${b}`);
    if (re.test(lower))
      bad.push(`${where}  banned word "${b}": "${plain.slice(0, 60)}…"`);
  }
}

// ---- 1. Kotlin literals ----
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
for (const f of fs.readdirSync(SRC).filter(n => n.endsWith(".kt")))
  for (const { text, where } of literals(path.join(SRC, f)))
    check(text, where, "en");

// ---- 2 + 3. the resource files ----
// A dependency-free parse: the resources are plain enough (no nesting beyond arrays), and a
// stricter file would fail the Android build long before it fooled this.
const unesc = t => t
  .replace(/^"(.*)"$/s, "$1")
  .replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\@/g, "@")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** Every <string> and <string-array> in one file: {name, skip, texts:[...]}. */
function parseRes(file){
  const src = fs.readFileSync(file, "utf8");
  const out = [];
  const reS = /<string\s+([^>]*?)>([\s\S]*?)<\/string>/g;
  const reA = /<string-array\s+([^>]*?)>([\s\S]*?)<\/string-array>/g;
  const attr = (a, k) => (a.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
  let m;
  while ((m = reS.exec(src)))
    out.push({ name: attr(m[1], "name"), skip: attr(m[1], "translatable") === "false",
      texts: [unesc(m[2].trim())], array: false });
  while ((m = reA.exec(src))){
    const texts = [];
    const reI = /<item>([\s\S]*?)<\/item>/g;
    let i;
    while ((i = reI.exec(m[2]))) texts.push(unesc(i[1].trim()));
    out.push({ name: attr(m[1], "name"), skip: attr(m[1], "translatable") === "false",
      texts, array: true });
  }
  return out;
}

function checkRes(file, defaultLang){
  const rows = parseRes(file);
  for (const r of rows){
    if (r.skip) continue; // machine patterns (regexes, vocabulary keys)
    const lang = r.name.endsWith("_de") ? "de" : defaultLang;
    for (const [k, t] of r.texts.entries())
      check(t, `${path.relative(APP, file)}:${r.name}${r.array ? `[${k}]` : ""}`, lang);
  }
  return rows;
}

const enRows = checkRes(path.join(APP, "res", "values", "strings.xml"), "en");
const narrRows = checkRes(path.join(APP, "res", "values", "narration.xml"), "en");
const deRows = checkRes(path.join(APP, "res", "values-de", "strings.xml"), "de");

// ---- 4. parity ----
const enByName = new Map(enRows.map(r => [r.name, r]));
const deByName = new Map(deRows.map(r => [r.name, r]));
for (const r of enRows){
  if (r.skip) continue;
  const d = deByName.get(r.name);
  if (!d) bad.push(`values-de/strings.xml  missing German for "${r.name}"`);
  else if (r.array && d.texts.length !== r.texts.length)
    bad.push(`values-de/strings.xml  array "${r.name}" has ${d.texts.length} items, English has ${r.texts.length}`);
}
for (const r of deRows)
  if (!enByName.has(r.name)) bad.push(`values/strings.xml  German-only key "${r.name}" — no English source`);
const narr = new Map(narrRows.map(r => [r.name, r.texts.length]));
if (narr.get("narration_patterns") !== narr.get("narration_de"))
  bad.push(`narration.xml  ${narr.get("narration_patterns")} patterns vs ${narr.get("narration_de")} German templates`);
if (narr.get("trait_vocab_en") !== narr.get("trait_vocab_de"))
  bad.push(`narration.xml  ${narr.get("trait_vocab_en")} vocab keys vs ${narr.get("trait_vocab_de")} German words`);

// ---- 5. the level overlay ----
const levelsEn = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "observatory", "levels.json"), "utf8"));
const overlay = JSON.parse(fs.readFileSync(path.join(APP, "assets", "levels.de.json"), "utf8"));
const whysOf = o => { // every "why" in one English level row, wherever the predicate carries it
  const out = [];
  (function walk(v){
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object"){
      if (typeof v.why === "string") out.push(v.why);
      Object.values(v).forEach(walk);
    }
  })(o);
  return out;
};
for (const l of levelsEn){
  const de = overlay[l.key];
  const at = `levels.de.json:${l.key}`;
  if (!de){ bad.push(`${at}  level not translated`); continue; }
  for (const f of ["title", "science", "question", "briefing", "goalText"]){
    if (!de[f]) bad.push(`${at}  missing "${f}"`);
    else check(de[f], `${at}.${f}`, "de");
  }
  if (l.predict){
    const p = de.predict || {};
    if (!p.prompt) bad.push(`${at}  missing predict.prompt`);
    else check(p.prompt, `${at}.predict.prompt`, "de");
    for (const f of ["options", "reflect"]){
      const en = l.predict[f] || [], deL = p[f] || [];
      if (deL.length !== en.length)
        bad.push(`${at}  predict.${f} has ${deL.length} entries, English has ${en.length}`);
      deL.forEach((t, k) => check(t, `${at}.predict.${f}[${k}]`, "de"));
    }
  }
  for (const f of ["pass", "fail"]){
    const t = (de.debrief || {})[f];
    if (!t) bad.push(`${at}  missing debrief.${f}`);
    else check(t, `${at}.debrief.${f}`, "de");
  }
  const enMeter = l.meter || [], deMeter = de.meter || [];
  if (deMeter.length !== enMeter.length)
    bad.push(`${at}  meter has ${deMeter.length} rows, English has ${enMeter.length}`);
  const reasons = whysOf(l);
  if (l.timeoutWhy) reasons.push(l.timeoutWhy); // the timeout verdict reaches the player through the same whys map
  for (const why of reasons){
    const t = (de.whys || {})[why];
    if (!t) bad.push(`${at}  untranslated fail reason: "${why.slice(0, 50)}…"`);
    else check(t, `${at}.why`, "de");
  }
}

if (bad.length){
  console.log(`APP PROSE: ${bad.length} violation(s) in ${checked} player strings`);
  for (const b of bad) console.log("  " + b);
  process.exit(1);
}
console.log(`APP PROSE: PASS — ${checked} player strings within style (EN+DE), German complete`);
