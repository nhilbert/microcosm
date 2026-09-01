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

# ---------------------------------------------------------------- report
log "--- what this environment now has ---"
log "java:    $("$JAVA_17/bin/java" -version 2>&1 | head -1)"
log "gradle:  $(gradle --version 2>/dev/null | awk '/^Gradle/{print $2}')"
log "node:    $(node -v 2>/dev/null)   (the JS oracle is pinned to 22.x)"
log "cargo:   $(cargo --version 2>/dev/null)"
log "sdk:     $(ls "$ANDROID_HOME/platforms" 2>/dev/null | tr '\n' ' ')"
log "done. First 'gradle test' in a session still downloads Robolectric's"
log "android-all jar (~100 MB) once; that is expected."

exit 0
