# Android wrapper — Microcosm on the phone

The wrapper is a shell, not the port: a dependency-free Android app whose
single activity is a WebView loading the built artifact from
`file:///android_asset/index.html`. The sim still runs as JS; nothing in
`android/` touches `src/sim` or the RNG contract, and `docs/porting.md`
remains the contract for the real Kotlin port.

## Getting it on the phone

1. On the phone, open the repository's **Releases** page and pick
   **Microcosm APK (latest)** (tag `apk-latest`).
2. Download `microcosm.apk` and open it. The first time, Android asks to
   allow installs from the browser — allow it for this install.
3. Later builds install straight over the old one: every CI build is signed
   with the same committed keystore and carries a rising version code
   (the Actions run number).

The release is *rolling*: the Android APK workflow rebuilds and re-attaches
`microcosm.apk` on every push to `main` (and to `claude/**` branches) that
touches `src/`, `android/`, or the build chain. The same APK also hangs on
each workflow run as the `microcosm-apk` artifact.

## How it is built

```
tools/build.py            src/ -> dist/microcosm.jsx      (the artifact, unchanged)
tools/build-app.js        dist + React --esbuild--> one minified, inlined
                          index.html + species images -> android/app/src/main/assets/
gradle assembleRelease    assets -> signed microcosm.apk
```

`npm run apk:assets` runs the middle step locally; the generated
`android/app/src/main/assets/` is gitignored — CI rebuilds it from `dist/`
for every APK, so the APK can never drift from the committed artifact any
further than `dist/` itself can drift from `src/` (which CI already forbids).

## Decisions worth knowing

- **No permissions, fully offline.** The manifest requests nothing; a
  `WebViewClient` refuses any navigation that leaves `android_asset`.
- **No localStorage** (project rule): DOM storage stays off. A running world
  therefore lives only in memory — `configChanges` in the manifest keeps the
  WebView alive across rotation so rotating the phone doesn't end the world.
  Android killing the backgrounded app does; that is honest, not a bug.
- **Screen stays on** while the app is foreground: the world only advances
  while watched, so the screen timeout shouldn't be the thing that pauses it.
- **The committed keystore is identity, not secrecy.** `android/keystore/`
  holds a self-signed key (passwords in `app/build.gradle`, in the clear, on
  purpose): its only job is that consecutive sideloaded builds match
  signatures so updates install. It guards nothing, and this app must never
  be distributed through a store with it.
- **minSdk 26** (Android 8.0), adaptive vector icon only, no binary image
  resources; the icon uses the world's colors (mat green, glacier-blue
  Venator spearhead) — no amber, which the color grammar reserves for the
  player's hand.
