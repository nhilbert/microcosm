#!/usr/bin/env python3
"""Assemble the source layers into the two things that get consumed.

  dist/microcosm.jsx  the single-file React artifact (what ships)
  dist/core.js        the same simulation, exported for Node (what the
                      harnesses drive, and the reference for a native port)

The layers have no module system: they are concatenated into one scope, which
is why order matters and why nothing here uses import/export. CORE_PARTS is
ordered exactly as the original single-file core was, so the split is provably
behaviour-neutral; the file boundaries are for humans, not for the runtime.

The Node export block at the tail exists only so the harnesses can require the
core. It is stripped from the artifact, which has no module system at all.
"""
import io, os, sys

# Simulation first, observatory second, init/exports last (the export block
# references observatory bindings, so it must be evaluated after them).
CORE_PARTS = [
    "src/sim/params.js",            # PRNG, tunable constants P, body tags
    "src/sim/species.json",         # the species table, inlined as `const SPECIES_ROWS = [...]`
    "src/sim/traits.js",            # schema, defaults, loader, registry
    "src/sim/world.js",             # world state W (structure-of-arrays), spawn/kill
    "src/sim/events.js",            # interventions: the only legal outside mutation
    "src/sim/fields.js",            # mineral diffusion, light, spatial hash, neighbours
    "src/observatory/recorder.js",  # ring buffer + event detectors (pure observers)
    "src/observatory/analysis.js",  # reference bands, strain, indicators
    "src/observatory/impact.js",    # before/after intervention analysis
    "src/observatory/levels.json",  # the level table, inlined as `const LEVEL_ROWS = [...]`
    "src/observatory/levels.js",    # learning levels: the evaluator + pure-observer verdicts (Phase 8)
    "src/sim/step.js",              # THE RNG-ORDER CONTRACT + the tick
    "src/sim/init.js",              # world setup + the Node export block
]

UI_PARTS = [
    "src/header.jsx",     # React import, licence notice, banner
    "src/ui-render.js",   # canvas draw helpers
    "src/ui-layout.js",   # viewport breakpoints, desktop chrome, hover CSS
    "src/ui-data.jsx",    # Data mode: the Observatory's screen
    "src/ui-reset.jsx",   # reset control
    "src/ui.jsx",         # the Microcosm component
    "src/ui-thumbs.js",   # GENERATED level thumbnails (tools/level-thumbs.js)
    "src/ui-levels.jsx",  # start screen, level HUD, the app shell (default export)
]

# data parts become one const in the shared scope, named here
DATA_CONST = {
    "src/sim/species.json": "SPECIES_ROWS",
    "src/observatory/levels.json": "LEVEL_ROWS",
}

MARKER = "// __NODE_EXPORTS__"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(part):
    path = os.path.join(ROOT, part)
    if not os.path.exists(path):
        sys.exit("build.py: missing %s" % part)
    with io.open(path, encoding="utf-8") as fh:
        text = fh.read()
    if part.endswith(".json"):
        import json
        json.loads(text)  # fail loudly on malformed JSON
        if part not in DATA_CONST:
            sys.exit("build.py: no const name declared for data part %s" % part)
        return "const " + DATA_CONST[part] + " = " + text.strip() + ";\n"
    return text


def strip_exports(text):
    """Drop the marker and everything after it -- the marker's own contract says
    'everything below is stripped', so the export block must stay the file's tail."""
    if MARKER not in text:
        return text
    head, _, tail = text.partition(MARKER)
    if "module.exports" not in tail:
        sys.exit("build.py: nothing to strip after the marker -- has the export block moved?")
    return head


def write(rel, text):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("built %-20s %7d bytes" % (rel, len(text.encode("utf-8"))))


core = [read(p) for p in CORE_PARTS]
write("dist/core.js", "".join(core))
write("dist/microcosm.jsx",
      read(UI_PARTS[0])
      + "".join(strip_exports(c) for c in core)
      + "".join(read(p) for p in UI_PARTS[1:]))
