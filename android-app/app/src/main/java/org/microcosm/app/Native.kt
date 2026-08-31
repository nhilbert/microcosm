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

    // ---- selection and read-out (A.2) ----
    /** The tap radius for a zoom: tight = 1 after the loupe, 0 for a thumb. */
    external fun pickRadius(z: Double, tight: Int): Double

    /** Candidates within `rad` of a world point, nearest first. Returns how many. */
    external fun pick(wx: Double, wy: Double, rad: Double): Int

    /** field: 0 slot index, 1 generation, 2 species, 3 squared distance. */
    external fun pickAt(k: Int, field: Int): Double

    /** field: 0 still valid, 1 sx, 2 sy, 3 radius — through the last frame's view. */
    external fun frameSel(i: Int, gen: Int, field: Int): Double

    /**
     * One organism. field: 0 alive, 1 species, 2 generation, 3 x, 4 y, 5 energy, 6 size,
     * 7 bound mineral, 8 birth tick, 9 dormant, 10 heading, 20+k genotype of locus plane k.
     */
    external fun org(i: Int, field: Int): Double

    external fun locusCount(sp: Int): Int

    /** which: 0 live, 1 apex, 2 the mat. Saves a shell keeping its own table of who is in play. */
    external fun speciesFlag(sp: Int, which: Int): Int

    /** which: 0 species name; 10+k a locus label, 20+k its high word, 30+k its low word. */
    external fun traitText(sp: Int, which: Int): String

    // ---- undo (A.3) ----
    /** What the last lever left to undo: 0 nothing, else the code of the core's Undo enum. */
    external fun undoKind(): Int

    /** The species a feed / kill / seeding undo concerns, so the chip can name it. -1 otherwise. */
    external fun undoSpecies(): Int
    external fun undo()
    external fun undoClear()

    // ---- the levers (A.3). Every one is undoable through the slot above. ----
    external fun evFertilize(x: Double, y: Double, amount: Double)
    external fun evLightMul(v: Double)
    external fun evSpawnPack(sp: Int, x: Double, y: Double)
    external fun evFeed(i: Int, gen: Int, frac: Double)
    external fun evKill(i: Int, gen: Int)
    external fun evSource(k: Int, x: Double, y: Double)
    external fun evSourceSet(k: Int, i: Double, a: Double, sigma: Double)
    external fun evSourceAdd(x: Double, y: Double, i: Double, a: Double, sigma: Double)
    external fun evSourceRemove(k: Int)
    external fun evWallAdd(x0: Double, y0: Double, dx: Double, dy: Double,
                           lt: Double, ht: Double, fl: Double, pass: Int)
    external fun evWallRemove(k: Int)

    // ---- the Observatory's read-outs (A.4) ----
    /** The recorder ring, REC_N x REC_CH float32 in WASM/native memory. Read on the render thread. */
    external fun recBuffer(): ByteBuffer

    external fun indOk(): Int

    /**
     * 0 adaptability, 1 variety, 2 production/consumption, 3 recycling minutes, 4 locked %,
     * 5..8 the pyramid's four levels.
     */
    external fun indNum(field: Int): Double

    /** Per species: 0 present, 1 level, 2 reserve, 3 trend, 4 population trend. */
    external fun indStrain(sp: Int, field: Int): Double

    /** The hunter's own vitals: 0 present, 1 reserve, 2 prey losses per second. */
    external fun indVenator(field: Int): Double

    external fun sysEventCount(): Int

    /** 0 tick, 1 species, 2 locus plane (-1 when none). */
    external fun sysEventNum(i: Int, field: Int): Double

    /** which: 0 the event type, 1 the narration text. */
    external fun sysEventText(i: Int, which: Int): String

    // ---- the learning levels (A.5) ----
    /** The whole level table as JSON — the same bytes src/observatory/levels.json carries. */
    external fun levelsJson(): String
    external fun levelCount(): Int

    /** `predicted` is the option committed before the run, or -1 if the step was skipped. */
    external fun levelStart(idx: Int, predicted: Int)
    external fun levelRestart()
    external fun levelStop()

    /** Runs the verdict loop. 0 idle, 1 running, 2 passed, 3 failed. */
    external fun levelCheck(): Int

    /** field: 0 state, 1 level index, 2 run, 3 seenS, 4 predicted, 5 pours left (-1 unlimited). */
    external fun levelNum(field: Int): Double
    external fun levelFailWhy(): String

    /** what: 0 pours, 1 seed, 2 sources, 3 walls, 4 evolution. */
    external fun levelAllows(what: Int): Int
    external fun levelPourOk(): Int
    external fun levelNotePour(d: Int)
    external fun levelNarration(): Int

    /** One meter row. field: 0 value, 1 has-goal, 2 goal, 3 direction. */
    external fun levelMeter(row: Int, field: Int): Double

    // ---- save and load (A.6) ----
    /** The world as a versioned snapshot. The format is the core's, proved by resumption since M3. */
    external fun save(): ByteArray

    /** 1 when the world was taken, 0 when the file is not one of ours or is truncated. */
    external fun load(data: ByteArray): Int

    external fun sourceCount(): Int

    /** field: 0 x, 1 y, 2 i, 3 a, 4 sigma. */
    external fun sourceNum(k: Int, field: Int): Double
}
