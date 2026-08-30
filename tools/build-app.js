// Build the self-contained web app for the Android wrapper.
//
//   npm run apk:assets   ->  android/app/src/main/assets/index.html
//
// Chain: build.py regenerates dist/microcosm.jsx -> esbuild bundles it with
// React into one minified script -> the script is inlined into a single HTML
// file the WebView loads from file:///android_asset/. Species card images are
// copied alongside so their relative assets/species/<key>.jpg paths resolve.
//
// Nothing here touches the sim or the artifact; the wrapper consumes the
// built artifact exactly as claude.ai would. Output is generated, not
// committed (see .gitignore) — CI rebuilds it for every APK.
const esbuild = require("esbuild");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "android", "app", "src", "main", "assets");

function buildArtifact(){
  const r = spawnSync("python3", [path.join(ROOT, "tools", "build.py")], { stdio: "inherit" });
  if (r.status !== 0) { console.error("build.py failed"); process.exit(1); }
}

const ENTRY = `
import React from "react";
import { createRoot } from "react-dom/client";
import Microcosm from "./dist/microcosm.jsx";
createRoot(document.getElementById("root")).render(React.createElement(Microcosm));
`;

(async () => {
  buildArtifact();

  const result = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: ROOT, loader: "jsx" },
    bundle: true,
    minify: true,
    write: false,
    format: "iife",
    target: "es2020",
    loader: { ".jsx": "jsx" },
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  });
  const js = result.outputFiles[0].text;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>Microcosm</title>
<style>
  html, body { margin:0; padding:0; height:100%; background:#05070C; overflow:hidden; overscroll-behavior:none; }
  #root { height:100%; }
</style>
</head>
<body>
<div id="root"></div>
<script>${js.replace(/<\/script>/gi, "<\\/script>")}</script>
</body>
</html>
`;

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "assets", "species"), { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.html"), html);

  const imgs = path.join(ROOT, "assets", "species");
  for (const f of fs.readdirSync(imgs)) {
    if (/\.jpg$/.test(f)) fs.copyFileSync(path.join(imgs, f), path.join(OUT, "assets", "species", f));
  }

  const kb = (fs.statSync(path.join(OUT, "index.html")).size / 1024).toFixed(0);
  console.log(`apk assets: index.html ${kb} KB + species images -> ${path.relative(ROOT, OUT)}`);
})();
