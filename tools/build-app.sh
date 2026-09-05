#!/usr/bin/env bash
# Build the native app's Rust input: the core plus the JNI adapter, as a .so for the phone.
#
#   tools/build-app.sh [abi]           (default arm64-v8a)
#
# Requires the Android NDK (ANDROID_NDK_HOME or ANDROID_NDK_LATEST_HOME) and cargo-ndk:
#   cargo install cargo-ndk && rustup target add aarch64-linux-android
#
# The JNI crate is rust/microcosm-android: one .so carrying the app's surface under
# org.microcosm.app (the diagnostics probe's surface retired with the probe, 2026-09-02).
# Generated, not committed; see android-app/.gitignore.
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


# microcosm-core is built as ["lib", "cdylib"] — the cdylib is what the WASM target needs, and
# cargo-ndk copies every cdylib it finds. libmicrocosm.so already links the core statically, so the
# second copy is dead weight in the APK. Drop it rather than ship it.
find "$JNILIBS" -name 'libmicrocosm_core.so' -delete

echo "built:"
find "$JNILIBS" -name '*.so' -exec ls -l {} \; | awk '{printf "  %8d  %s\n", $5, $9}'
