#!/usr/bin/env python3
"""Concatenate the src/ layers into dist/microcosm.jsx, the single-file artifact.

Order matters: header, then the portable sim core, then the UI layers.
The core's Node export block (everything from the __NODE_EXPORTS__ marker to
its closing brace) exists only so the headless harnesses can require core.js;
it is stripped from the artifact, which has no module system.
"""
import io, os, sys

PARTS = [
    "src/header.jsx",     # React import + banner
    "src/core.js",        # PORTABILITY BOUNDARY: sim + observatory analytics
    "src/ui-render.js",   # canvas draw helpers
    "src/ui-layout.js",   # viewport breakpoints, desktop chrome, hover CSS
    "src/ui-data.jsx",    # Data mode (the Observatory's screen)
    "src/ui-reset.jsx",   # reset control
    "src/ui.jsx",         # the Microcosm component
]
OUT = os.path.join("dist", "microcosm.jsx")
MARKER = "// __NODE_EXPORTS__"

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chunks = []
for part in PARTS:
    path = os.path.join(root, part)
    if not os.path.exists(path):
        sys.exit("build.py: missing %s" % part)
    with io.open(path, encoding="utf-8") as fh:
        text = fh.read()
    if MARKER in text:
        head, _, tail = text.partition(MARKER)
        # drop the marker line and the export block it introduces, up to the
        # first line that is a bare closing brace at column 0
        rest = tail.split("\n")
        i = 0
        while i < len(rest) and rest[i].rstrip() != "}":
            i += 1
        text = head + "\n".join(rest[i + 1:])
    chunks.append(text)

with io.open(os.path.join(root, OUT), "w", encoding="utf-8") as fh:
    fh.write("".join(chunks))
print("built %s (%d bytes) from %d parts" % (OUT, os.path.getsize(os.path.join(root, OUT)), len(PARTS)))
