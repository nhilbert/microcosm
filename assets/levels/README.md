Experiment-menu thumbnails, one square JPEG (160px) per level key, PHOTOGRAPHED FROM
GAMEPLAY by `tools/level-thumbs.js` (`npm run thumbs`) — never drawn by hand, never
stock art. Each is a curated moment of that level's own world (a tick, a place, a
zoom, sometimes a scripted act like seeding the hunters' pack), captured through the
real browser renderer; the per-level spec in the tool is the record of what each
picture means.

Consumed twice from this one committed home: inlined as data URIs into the artifact
(generated `src/ui-thumbs.js`) and bundled into the APK by build.gradle (loaded as
`levels/<key>.jpg`, `Profiles.levelThumb`). A level without a file simply shows no
picture — never a placeholder. Captures ride the live render loop, so regenerated
files differ by a few ticks; regenerating is a deliberate act.
