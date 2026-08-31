#!/usr/bin/env bash
# Build the native app's Rust input: the core plus the JNI adapter, as a .so for the phone.
#
#   tools/build-app.sh [abi]           (default arm64-v8a)
#
# Requires the Android NDK (ANDROID_NDK_HOME or ANDROID_NDK_LATEST_HOME) and cargo-ndk:
#   cargo install cargo-ndk && rustup target add aarch64-linux-android
#
# The same crate the probe uses (rust/microcosm-android): one .so carries both JNI surfaces — the
# diagnostics one under org.microcosm.probe and the app's under org.microcosm.app. Generated, not
# committed; see android-app/.gitignore.
set -euo pipefail

ABI="${1:-arm64-v8a}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JNILIBS="$ROOT/android-app/app/src/main/jniLibs"

: "${ANDROID_NDK_HOME:=${ANDROID_NDK_LATEST_HOME:-}}"
if [ -z "$ANDROID_NDK_HOME" ]; then
  echo "error: set ANDROID_NDK_HOME (or ANDROID_NDK_LATEST_HOME) to an Android NDK" >&2
  exit 2
fi
export ANDROID_NDK_HOME

mkdir -p "$JNILIBS"

echo "==> cargo ndk ($ABI)"
cd "$ROOT/rust/microcosm-android"
cargo ndk -t "$ABI" -o "$JNILIBS" build --release

echo
echo "built:"
find "$JNILIBS" -name '*.so' -exec ls -l {} \; | awk '{printf "  %8d  %s\n", $5, $9}'
