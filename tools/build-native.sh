#!/usr/bin/env bash
# Build the native Android probe's inputs: the Rust core as a .so, and the math trace asset.
#
#   tools/build-native.sh [abi]        (default arm64-v8a)
#
# Requires the Android NDK (ANDROID_NDK_HOME or ANDROID_NDK_LATEST_HOME) and cargo-ndk:
#   cargo install cargo-ndk && rustup target add aarch64-linux-android
#
# Both outputs are generated, not committed — see android-native/.gitignore.
set -euo pipefail

ABI="${1:-arm64-v8a}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JNILIBS="$ROOT/android-native/app/src/main/jniLibs"
ASSETS="$ROOT/android-native/app/src/main/assets"

: "${ANDROID_NDK_HOME:=${ANDROID_NDK_LATEST_HOME:-}}"
if [ -z "$ANDROID_NDK_HOME" ]; then
  echo "error: set ANDROID_NDK_HOME (or ANDROID_NDK_LATEST_HOME) to an Android NDK" >&2
  exit 2
fi
export ANDROID_NDK_HOME

mkdir -p "$JNILIBS" "$ASSETS"

# The trace the phone replays: V8's own results, captured on the reference engine. 10,000 samples
# per function is ~2 MiB — enough to catch a divergence, small enough to ship in an APK.
echo "==> math trace"
node "$ROOT/dev/xcheck/gen-bin.js" "$ASSETS/trace.bin" 10000

echo "==> cargo ndk ($ABI)"
cd "$ROOT/rust/microcosm-android"
cargo ndk -t "$ABI" -o "$JNILIBS" build --release


# microcosm-core is built as ["lib", "cdylib"] — the cdylib is what the WASM target needs, and
# cargo-ndk copies every cdylib it finds. libmicrocosm.so already links the core statically, so the
# second copy is dead weight in the APK. Drop it rather than ship it.
find "$JNILIBS" -name 'libmicrocosm_core.so' -delete

echo "built:"
find "$JNILIBS" -name '*.so' -exec ls -l {} \; | awk '{printf "  %8d  %s\n", $5, $9}'
ls -l "$ASSETS/trace.bin" | awk '{printf "  %8d  %s\n", $5, $9}'
