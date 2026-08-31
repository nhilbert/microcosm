package org.microcosm.probe

/**
 * The Rust core, as seen from Kotlin.
 *
 * Every method here runs code that also runs on the workstation (microcosm_core::probe), so the
 * phone's answers and the desktop's are directly comparable — which is the entire point of this
 * build. The JNI glue is rust/microcosm-android.
 */
object Native {
    init {
        System.loadLibrary("microcosm")
    }

    /** Reproduce the four certified 3,000-tick fingerprints. */
    external fun simCheck(): String

    /** Replay V8's own results for sin/cos/exp/pow/atan2/hypot/sqrt. */
    external fun mathCheck(trace: ByteArray): String

    /** Tick rate on this device. */
    external fun perfProbe(warmup: Int, ticks: Int): String

    /** Save a world, load it back, and check the resumed run matches. */
    external fun snapshotCheck(): String
}
