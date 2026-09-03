Sandbox start-world thumbnails, one square JPEG (160px) per start key, PHOTOGRAPHED FROM
THE APP'S OWN RENDERER by `StartThumbsTest` — never drawn by hand, never stock art.

    gradle -p android-app testReleaseUnitTest --tests '*StartThumbsTest*' -Pthumbs

Each is a curated moment of that start's own world: a fixed seed, a tick count, a camera
and a zoom, all in the tool's shot list, which is the record of what each picture means.
Unlike the level thumbnails (`assets/levels`, captured through the browser on a live loop)
these are driven headlessly and are therefore reproducible — the same jpg every run.

One consumer, not two: the app bundles this folder through build.gradle and loads
`starts/<key>.jpg` in `Profiles.startThumb`. The browser artifact has no start chooser, so
it carries no copy. A start without a file simply shows no picture — never a placeholder.
