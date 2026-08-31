package org.microcosm.app

import java.nio.ByteBuffer

/**
 * The Rust core, as seen from Kotlin.
 *
 * Every call here lands in `rust/microcosm-android/src/app.rs`, which is an adapter over the same
 * C ABI the browser shim drives — so the phone and the browser enter the core through identical
 * entry points, and the frame gate that proves the display list (harness/fingerprint-frame.js)
 * covers what this app paints.
 *
 * The display list and the pixel fields arrive as direct ByteBuffers over the core's own memory:
 * no copy per frame. Ask for each buffer once and keep it — they are allocated at boot and never
 * resized.
 */
object Native {
    init {
        System.loadLibrary("microcosm")
    }

    // ---- the world ----
    external fun boot()
    external fun resetWorld()
    external fun initWorld(seed: Int)
    external fun step()

    /** Remember where everything was, so the next frames can interpolate. Call before `step`. */
    external fun markPrev()

    external fun tick(): Long

    /** Scalars by the C ABI's id: 0 n, 1 tick, 7 sources, 12 lightDirty, 50 mutation, 51 lightMul. */
    external fun scalar(id: Int): Double
    external fun setScalar(id: Int, v: Double)

    // ---- the frame builder ----
    /** 0 LOD_Z, 1 TINT_BINS, 2 organism record stride, 3 corpse record stride. */
    external fun frameConst(id: Int): Double

    external fun grammarBuild()

    /** 0 tintPlane, 1 morphPlane, 2 outlinePlane, 3 roundPlane, 4 tN, 5 mN; -1 = no grammar. */
    external fun grammarNum(sp: Int, field: Int): Double

    /** 0 r, 1 g, 2 b, 3 shape, 4 scale, 5 outline, 6 round. */
    external fun specNum(sp: Int, tb: Int, mb: Int, field: Int): Double

    external fun frameBuild(
        camX: Double, camY: Double, vw: Double, vh: Double, z: Double,
        hw: Double, hh: Double, alpha: Double, lodZ: Double, hidden: Int,
    )

    /** 0 orgN, 1 corpseN, 2 mnBound, 10+sp population. */
    external fun frameNum(field: Int): Double

    external fun orgBuffer(): ByteBuffer
    external fun corpseBuffer(): ByteBuffer

    /** Fill the shared scratch field: 0 mat carpet, 1 mineral, 2 corpse pall, 3 wall shade. */
    external fun fieldFill(which: Int)
    external fun fieldBuffer(): ByteBuffer

    // ---- world-tile vector lists ----
    /** which: 0 sun glows, 1 heat glows, 2 sun marks, 3 heat marks. */
    external fun glowCount(which: Int): Int

    /** field: 0 x, 1 y, 2 r, 3 a, 4 warm. */
    external fun glowNum(which: Int, k: Int, field: Int): Double

    external fun wallCount(): Int

    /** field: 0 alpha, 1 dashed, 2 point count. */
    external fun wallNum(k: Int, field: Int): Double
    external fun wallPt(k: Int, q: Int, axis: Int): Double

    external fun sourceCount(): Int

    /** field: 0 x, 1 y, 2 i, 3 a, 4 sigma. */
    external fun sourceNum(k: Int, field: Int): Double
}
