// Syntax check of the built artifact via esbuild's transform API. Cross-platform: no shell redirection.
const fs = require("fs"), path = require("path");
const esbuild = require("esbuild");
const file = path.join(__dirname, "..", "dist", "microcosm.jsx");
try { esbuild.transformSync(fs.readFileSync(file, "utf8"), { loader: "jsx", logLevel: "warning" }); console.log("syntax OK: dist/microcosm.jsx"); }
catch (e){ console.error(e.message || e); process.exit(1); }
