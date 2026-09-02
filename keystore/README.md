# The signing keystore

`microcosm.keystore` is committed on purpose, and its passwords are in the clear
in `android-app/app/build.gradle`. It is **identity, not secrecy**: its only job
is that consecutive sideloaded builds carry the same signature, so a new APK
installs over the old one instead of asking to uninstall first.

It guards nothing. Anyone with this repository can sign an APK that Android will
accept as an update to a sideloaded Microcosm. That is an acceptable cost for a
sideloaded toy and an unacceptable one for a store listing, so:

**This key must never be used to publish through an app store.** A store build
needs a key that lives outside the repository, in the CI secret store.
