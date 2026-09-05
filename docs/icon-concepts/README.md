# Launcher icon — the concept round (2026-09-05)

The app shipped for its whole life with the stock Android robot, because nothing in this
repository ever looked at the home screen. This folder is the design record of the round that
fixed that, kept because the pictures are the argument.

## What is here

Five abstract concepts, 512x512 SVG, drawn to the owner's steer after a first round of literal
ones was rejected: `concept-1` a lens (the membrane reduced to geometry), `concept-2` the
mineral's round as three arcs, `concept-3` the cilia fringe alone with the body never drawn,
`concept-4` the membrane drawn AS the round, `concept-5` three bodies on an implied round.

They use the core's own species colours (`frame.rs SPECIES_RGB`) on the lit-pool gradient read
off the app's photograph of the `still` start world, and they carry no amber: rule 7 gives amber
to the player's hand alone, so it may not appear in the world's own imagery.

## What the round taught

Three separate failure modes, all found by looking rather than by reasoning:

- **The face.** A pale curve under two bright dots is a smiling face at 48 px, whatever the
  organelles are called. The app's real oral groove and its two food vacuoles produced exactly
  that, three proposals in a row.
- **The eye.** A ring around a single centred mark is an eye. It caught the fringe concept, the
  themed monochrome layer, and `concept-4`.
- **The gear.** Evenly spaced bristles of equal length around an ellipse are a gear rim or a sun.
  Uneven lengths and a curve along the beat fix it.

## Where the shipped icon lives

`android-app/app/src/main/res/drawable/ic_launcher_*.xml` plus the adaptive icon in
`mipmap-anydpi-v26/`. `IconTest` holds it: the foreground must stay inside the 66dp safe circle,
the themed layer must exist and be a silhouette rather than a tile, and the icon is photographed
at 432/192/96/48 px into `build/reports/screens/` so a human can judge what a gate cannot.
