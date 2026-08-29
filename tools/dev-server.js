// Local dev server: build the artifact, watch src/, serve the phone-frame page.
//
//   npm start   ->  http://127.0.0.1:5173
//
// Chain: edit src/ -> build.py regenerates dist/microcosm.jsx -> esbuild
// rebundles -> the browser frame reloads itself. Nothing here ships; the
// artifact is unaffected by anything in dev/.
const esbuild = require("esbuild");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || "127.0.0.1";

function buildArtifact(){
  const r = spawnSync("python3", [path.join(ROOT, "tools", "build.py")], { stdio: "inherit" });
  if (r.status !== 0) console.error("  build.py failed — serving the previous artifact");
  return r.status === 0;
}

(async () => {
  buildArtifact();

  let timer = null;
  fs.watch(path.join(ROOT, "src"), { persistent: true }, (_e, file) => {
    if (file && !/\.(js|jsx)$/.test(file)) return;
    clearTimeout(timer);
    timer = setTimeout(buildArtifact, 80);   // debounce editor multi-writes
  });

  const ctx = await esbuild.context({
    entryPoints: [path.join(ROOT, "dev", "main.jsx")],
    bundle: true,
    outdir: path.join(ROOT, "dev", ".build"),
    entryNames: "main",
    loader: { ".jsx": "jsx" },
    sourcemap: true,
    logLevel: "warning",
  });
  await ctx.watch();

  const { hosts, port } = await ctx.serve({
    servedir: path.join(ROOT, "dev"),
    host: HOST,
    port: PORT,
  });

  const shown = hosts.includes("127.0.0.1") ? "127.0.0.1" : hosts[0];
  console.log(`\n  Microcosm dev server\n  http://${shown}:${port}\n`);
  console.log("  Edit src/ and the frame reloads. Ctrl+C to stop.\n");
})();
