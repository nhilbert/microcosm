#!/bin/bash
# Microcosm — setup script for a Claude Code cloud environment that can build Android.
#
# Paste this into the Setup script box of the environment dialog at claude.ai/code.
# It is kept here as well so it is versioned with the code it provisions.
#
# Three constraints this is written around (docs/en/cloud-environments):
#   1. It must exit 0. A non-zero exit means the session fails to start, so every
#      fallible step ends in `|| true` and the verification is left to the human.
#   2. It must finish inside about five minutes, or the environment cache cannot build.
#      That is why the emulator and the system images are not installed — they are
#      gigabytes, and this container has no KVM to run them with anyway.
#   3. It runs as root on Ubuntu 24.04, before Claude Code launches, and only when no
#      cached environment exists. The filesystem it leaves behind is snapshotted, so
#      later sessions start with all of this already on disk.
#
# What it does NOT install, deliberately: the Android NDK and cargo-ndk. Building the
# APK stays in CI. The unit-test task the layout gate runs never loads the native
# library, so the gate needs no NDK — and the NDK is a ~1 GB download that would not
# fit the five-minute budget.

set -u   # not -e: see constraint 1

log() { echo "[microcosm-setup] $*"; }

# ---------------------------------------------------------------- JDK 17
# The image ships OpenJDK 21 and AGP accepts it, but CI builds on Temurin 17 and the
# module targets 17. Matching CI removes a whole class of "green here, red there".
log "installing JDK 17"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq || true
apt-get install -y -qq openjdk-17-jdk unzip >/dev/null 2>&1 || true

JAVA_17=/usr/lib/jvm/java-17-openjdk-amd64
[ -d "$JAVA_17" ] || JAVA_17="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"

# ---------------------------------------------------------------- Android SDK
# Command-line tools only. The pinned build is a stable artifact; if the download ever
# 404s, the current URL is on developer.android.com under "Command line tools only".
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="$JAVA_17"
CLI_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"

log "fetching Android command-line tools"
mkdir -p "$ANDROID_HOME/cmdline-tools"
curl -fsSL --retry 3 -o /tmp/cmdline-tools.zip "$CLI_URL" || true

if [ -s /tmp/cmdline-tools.zip ]; then
  unzip -q -o /tmp/cmdline-tools.zip -d "$ANDROID_HOME/cmdline-tools" || true
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  # the zip unpacks to cmdline-tools/; sdkmanager insists on being under latest/
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" || true
  rm -f /tmp/cmdline-tools.zip
else
  log "WARNING: the command-line tools did not download."
  log "         Is dl.google.com on the environment's allowed-domains list?"
fi

SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
if [ -x "$SDKMANAGER" ]; then
  log "accepting licences and installing platform 35"
  yes | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true
  # compileSdk 35 / targetSdk 35, matching android-app/app/build.gradle
  "$SDKMANAGER" --install "platform-tools" "platforms;android-35" "build-tools;35.0.0" \
    >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------- make it findable
# Set in the environment's own variables box as well; this covers shells that do not
# read that, and keeps the values in one place a human can inspect.
cat > /etc/profile.d/android-sdk.sh <<PROFILE
export ANDROID_HOME=$ANDROID_HOME
export ANDROID_SDK_ROOT=$ANDROID_HOME
export JAVA_HOME=$JAVA_17
export PATH="\$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
PROFILE
chmod +x /etc/profile.d/android-sdk.sh

# Gradle reads this and it removes the "SDK location not found" first-run failure.
mkdir -p /root/.android
cat > /root/.android/repositories.cfg <<'CFG'
### User Sources for Android SDK Manager
CFG

# ---------------------------------------------------------------- Maven Central, mirrored
# Measured 2026-09-03, not assumed: repo.maven.apache.org answered 429 (Too Many Requests) to a
# cold Gradle resolve, and repo1.maven.org failed three Robolectric fetches in the same session —
# then both answered 200 minutes later. Central rate-limits this container's SHARED egress IP in
# bursts, and a cold resolve asks it for hundreds of artifacts at once.
#
# So both Maven clients are pointed at Central's official Google Cloud Storage mirror: same
# coordinates, same artifacts, a backend that does not throttle us. Two clients, because
# Robolectric fetches its android-all jar with its OWN Maven client rather than Gradle's — that
# is why three tests can fail on a build whose dependency resolution succeeded.
#
# With the caches warmed below this is a fallback, not the main road. It is written to
# /root/.gradle/init.d, so it applies to every Gradle build in the environment; the header says so
# in the file itself, since a silent global redirect is the kind of thing that should be findable.
log "pointing Gradle and Robolectric at Central's GCS mirror"
mkdir -p /root/.gradle/init.d
cat > /root/.gradle/init.d/central-mirror.gradle <<'INIT'
// Written by tools/setup-android-env.sh. ENVIRONMENT ONLY — never a repository build setting.
// Maven Central rate-limits this container's shared egress IP in bursts, so Central is served
// from its official Google Cloud Storage mirror instead. Same coordinates, same artifacts.
def central = "https://maven-central.storage-download.googleapis.com/maven2"
beforeSettings { settings ->
    settings.pluginManagement.repositories {
        maven { url central }
        google()
        gradlePluginPortal()
    }
    settings.dependencyResolutionManagement.repositories {
        maven { url central }
        google()
    }
}
allprojects {
    // Robolectric's android-all jars come through its own Maven client, which never sees the
    // repositories above (verified: org/robolectric/MavenRoboSettings reads these two properties,
    // and defaults to repo1.maven.org).
    tasks.withType(Test).configureEach {
        systemProperty "robolectric.dependency.repo.id", "central-gcs-mirror"
        systemProperty "robolectric.dependency.repo.url", central
    }
}
INIT

# ---------------------------------------------------------------- the Rust side
# `npm run wasm`, `npm run test:port` and every MC_CORE harness need the wasm target; without it
# the build stops with "the wasm32-unknown-unknown target may not be installed". One line, and it
# rides into the snapshot.
log "adding the wasm target and fetching the crates"
rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true

# ---------------------------------------------------------------- warm the caches
# The point of the whole script: a session should start warm. Measured on a cold session,
# 2026-09-03 — ~835 MB of Gradle cache and ~350 MB of Robolectric android-all jars, with the first
# three gradle invocations costing 1m37s (failed: 429), 2m16s (three tests failed fetching the
# jar) and 38s (clean). Bandwidth was never the problem (34 MB/s through the proxy); cold caches
# and Central's throttle were. All of this lands in the snapshot, so it is paid once per
# environment rather than once per session.
#
# The checkout may or may not exist when this runs, so it is looked for rather than assumed, and
# everything below is skipped without it.
REPO=""
for d in /home/user/microcosm /workspace/microcosm /root/microcosm "$PWD"; do
  [ -f "$d/android-app/settings.gradle" ] && REPO="$d" && break
done
[ -n "$REPO" ] || REPO="$(dirname "$(dirname "$(find / -maxdepth 5 -path '*/android-app/settings.gradle' -print -quit 2>/dev/null)")")"

if [ -n "$REPO" ] && [ -f "$REPO/android-app/settings.gradle" ]; then
  log "warming caches from the checkout at $REPO"
  ( cd "$REPO" && cargo fetch --manifest-path rust/microcosm-core/Cargo.toml ) >/dev/null 2>&1 || true
  ( cd "$REPO" && cargo fetch --manifest-path rust/microcosm-android/Cargo.toml ) >/dev/null 2>&1 || true
  # The host JNI library the boot gate loads. Also warms the cargo registry and target dir.
  ( cd "$REPO" && cargo build --release --manifest-path rust/microcosm-android/Cargo.toml ) >/dev/null 2>&1 || true
  # npm's cache survives the fresh clone even though node_modules does not, so the per-session
  # `npm install` drops from a download to about a second.
  ( cd "$REPO" && npm install --no-audit --no-fund ) >/dev/null 2>&1 || true
  # One real test run: it resolves every Gradle dependency, compiles the Kotlin AND pulls both
  # Robolectric android-all jars, which no cheaper task does.
  ( cd "$REPO" && gradle -p android-app testReleaseUnitTest --no-daemon ) >/dev/null 2>&1 || true
  log "gradle cache: $(du -sh /root/.gradle/caches 2>/dev/null | cut -f1)   android-all jars: $(du -sh /root/.m2/repository/org/robolectric 2>/dev/null | cut -f1)"
else
  log "no checkout found at setup time — caches stay cold; the first gradle run in a session"
  log "will download about 1.2 GB once. Everything else above still applies."
fi

# ---------------------------------------------------------------- report
log "--- what this environment now has ---"
log "java:    $("$JAVA_17/bin/java" -version 2>&1 | head -1)"
log "gradle:  $(gradle --version 2>/dev/null | awk '/^Gradle/{print $2}')"
log "node:    $(node -v 2>/dev/null)   (the JS oracle is pinned to 22.x)"
log "cargo:   $(cargo --version 2>/dev/null)"
log "sdk:     $(ls "$ANDROID_HOME/platforms" 2>/dev/null | tr '\n' ' ')"
log "wasm target: $(rustup target list --installed 2>/dev/null | tr '\n' ' ')"
log "done. If the cache warm-up above found the checkout, the first 'gradle test' in a"
log "session is warm; if it did not, it downloads about 1.2 GB once."

exit 0
