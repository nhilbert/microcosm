# Setting up a Claude Code cloud environment that can build Android

> **Status, 2026-09-03.** This worked: the cloud environment now HAS the SDK, gradle and a JDK 17,
> and the whole app suite runs locally — 20 tests, boot gate included. Two things were still cold
> or missing on a fresh session, both measured and both now handled by the setup script; §8 has the
> numbers. If you read the paragraph below as a description of today, it is not: it is why the
> document was written.

**Why this exists.** The environment this app was written in had no Android SDK, and its egress
proxy refused `dl.google.com`, so one could not be fetched — that was tried, not assumed. CI is
therefore the only compiler the Kotlin has ever met, at roughly two minutes per iteration. All the
work ahead (the UI repairs and the redesign) is Kotlin, which is the worst possible fit for that.

Cost already paid to it, twice in one hour: a gate failure whose reason lived in an HTML report on
the runner, and a layout gate that measured four screen sizes against one phone because the density
was never handed to the runtime. Both are thirty-second discoveries with a local SDK.

Follow this once. The environment is snapshotted afterwards, so the install is paid a single time.

---

## 1. Create the environment

At [claude.ai/code](https://claude.ai/code), open the environment selector and choose
**Add cloud environment**. The dialog has four fields: name, network access, environment variables,
setup script.

**Name:** `microcosm-android`

## 2. Network access

Select **Custom**, and leave **"Also include default list of common package managers"** *checked* —
Maven Central, the Gradle services and plugin portal, npm and crates.io are all on the default list
and all of them are needed.

Then add these two lines to **Allowed domains**:

```
dl.google.com
maven.google.com
```

`dl.google.com` is the one that matters, and it is doing two jobs: it serves the command-line tools
zip *and* it is where Gradle's `google()` repository actually resolves to
(`dl.google.com/dl/android/maven2`), which is where the Android Gradle Plugin and every AndroidX
artifact come from. Without it the setup script cannot download the SDK and the build cannot
resolve AGP. `maven.google.com` is the friendlier alias for the same repository; add it so a
redirect cannot strand the build.

Nothing else needs adding. Robolectric's `android-all` jars come from Maven Central, which is
already on the default list.

## 3. Environment variables

Paste this into the **Environment variables** box (it takes `.env` format):

```
ANDROID_HOME=/opt/android-sdk
ANDROID_SDK_ROOT=/opt/android-sdk
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
GRADLE_OPTS=-Dorg.gradle.jvmargs=-Xmx3g
```

The setup script also writes these into `/etc/profile.d/`, so this is belt and braces — but the
variables box is the one that is guaranteed to reach every shell, so do not skip it.

Note the box is not a secret store: anyone who can use the environment can read it. Nothing here is
a secret, which is the point.

## 4. Setup script

Paste the contents of **`tools/setup-android-env.sh`** (in this repository, and sent alongside this
document) into the **Setup script** box.

What it installs, and what it deliberately does not:

| installed | why |
|---|---|
| JDK 17 | the image ships 21; CI builds on 17 and the module targets 17. Matching CI removes a class of "green here, red there" |
| Android command-line tools | `sdkmanager`, and nothing else from the SDK bundle |
| `platforms;android-35`, `build-tools;35.0.0` | matches `compileSdk`/`targetSdk` in `android-app/app/build.gradle` |
| **not** the emulator or system images | gigabytes, and this container has no KVM to run them |
| **not** the NDK or cargo-ndk | a ~1 GB download that would blow the five-minute setup budget. Building the APK stays in CI; the layout gate's unit tests never load the native library, so they do not need it |

Three constraints the script is written around, from the cloud-environments documentation: it must
**exit 0** (a non-zero exit means the session fails to start, so every fallible step ends in
`|| true`), it must finish **within about five minutes** or the environment cache cannot build, and
it runs **as root on Ubuntu 24.04 before Claude Code launches**.

## 5. Start a session and verify

Start a session in the new environment on branch `claude/native-android-migration-e97e7n`, and ask
for these. They are ordered so the first failure tells you the most:

```bash
echo "$ANDROID_HOME" && ls "$ANDROID_HOME/platforms"     # expect android-35
java -version                                            # expect 17.x
node -v                                                  # expect v22.x  (see below)
gradle --version | head -3                               # expect 8.9+ for AGP 8.7.3

gradle -p android-app testReleaseUnitTest                # THE LAYOUT GATE
npm test                                                 # build + conformance + prose + smoke
```

The first `gradle` run downloads Robolectric's `android-all` jar, about 100 MB, once. It is slow
exactly once and then it is not.

**Node must be 22.x.** This is not a preference — CLAUDE.md rule 11: the JS core is the frozen
historical oracle, its fingerprints were captured on V8 12.4, and Node 23 silently changed
`Math.pow`. The image defaults to 22, so this should just be true; check it anyway, because a
conformance failure caused by the wrong Node looks exactly like a real behaviour change.

## 6. What this actually buys

Ranked by what it changes, not by what it costs:

1. **I can see the screen.** Robolectric with native graphics renders a real view tree to a
   `Bitmap`. Write it to a PNG and I can open it and look at it. That partly closes the gap
   `docs/android-app-plan.md` §6 has carried since A.1 — *nothing in the app has been seen running
   by its author* — for the chrome, at least. Reviewing my own layout beats any amount of careful
   reasoning about `LinearLayout`, and it is the single largest change of the three.
2. **The layout gate runs locally.** Its ratchet baseline gets filled in one step instead of a push
   per attempt, and a wrong instrument is caught in seconds rather than after a CI round trip.
3. **Kotlin compiles before it is pushed.** Typos and signature mistakes stop costing a cycle each.

**What it does not buy, so nothing is over-expected: a device.** No touch, no feel, no animated
world, no gesture arbitration under a real thumb. An emulator needs KVM and almost certainly will
not run here. So the last step of every UI increment is unchanged and unchangeable: **you play it.**
That remains the only test that has ever settled anything about this app.

## 7. Handover notes for the first session there

- The branch is `claude/native-android-migration-e97e7n`, and **its CI is intentionally red**: the
  layout gate's `layout-baseline.txt` ships empty so it is filled from the gate's own measured
  output rather than from a guess. Filling it and getting the branch green is the first job.
- `CLAUDE.md` carries the four owner decisions, the UX review's findings and the gate's contract.
  `docs/app-ux-review.md` is what is wrong and why; `docs/app-ux-research.md` is the five-lens
  research and what the design phase should build. Read both before touching the shell.
- **The U.0 repairs are not done.** Research was taken first, by decision.
- Rule 11 still governs everything under `rust/microcosm-core/`: that crate *is* the simulation, and
  `src/sim/` plus `src/observatory/` are the frozen oracle. None of the UI work touches either.

## 8. What a cold session still cost, and what was done about it (2026-09-03)

The environment above works. What it did not do was start *warm* — and the two costs are worth
writing down, because both were invisible until a session actually ran the Android suite here.

**Measured on one cold session:**

| | measured |
|---|---|
| Gradle cache downloaded | ~835 MB |
| Robolectric `android-all` jars | ~350 MB (two, sdk 34 and sdk 35) |
| first `gradle test` | 1m37s, **failed** — Maven Central answered 429 to the cold resolve |
| second | 2m16s, **three tests failed** fetching the android-all jar |
| third | 38s, clean |
| bandwidth through the proxy | 34 MB/s — so none of the above was bandwidth |

**The throttle.** `repo.maven.apache.org` answered 429 (Too Many Requests) to a cold Gradle
resolve, and `repo1.maven.org` failed three Robolectric fetches in the same session; minutes later
both answered 200. Central rate-limits this container's SHARED egress IP in bursts, and a cold
resolve asks it for hundreds of artifacts at once. Nothing is broken and nothing is being blocked —
it is a burst limit, and retrying eventually works.

**Two clients, not one.** Gradle resolves through its repositories; Robolectric fetches its
`android-all` jar with its OWN Maven client, which never sees them. That is why a build whose
dependency resolution succeeded can still fail three tests on a download. The two properties its
client reads are `robolectric.dependency.repo.url` and `robolectric.dependency.repo.id` (read out
of `org/robolectric/MavenRoboSettings` in the shipped jar, then verified by deleting the cached jar
and watching it come back from the mirror).

**What the setup script now does about it**, all of it inside the five-minute budget:

1. Writes `/root/.gradle/init.d/central-mirror.gradle`, pointing **both** Maven clients at
   Central's official Google Cloud Storage mirror (`maven-central.storage-download.googleapis.com`)
   — same coordinates, same artifacts, a backend that does not throttle us.
2. `rustup target add wasm32-unknown-unknown`, without which `npm run wasm`, `npm run test:port`
   and every `MC_CORE` harness stop at "the wasm32-unknown-unknown target may not be installed".
3. **Warms the caches**, which is the part that actually matters: `cargo fetch` for both crates, a
   host build of the JNI adapter (the boot gate loads it), `npm install`, and one real
   `gradle -p android-app testReleaseUnitTest` — the only task that pulls the Gradle cache, compiles
   the Kotlin AND fetches both android-all jars. All of it lands in the environment snapshot, so it
   is paid once per environment instead of once per session.

The checkout may or may not exist when a setup script runs, so the script looks for it rather than
assuming; without one it skips the warm-up, says so, and everything else still applies.

**If the environment's network access is set to Custom**, add
`maven-central.storage-download.googleapis.com` to the allowed domains. It resolved fine in the
session this was written in, so the current list already permits it — adding it explicitly is
insurance against a tightening, not a fix for a failure.
