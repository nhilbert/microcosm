package org.microcosm.app

import android.graphics.Bitmap
import android.graphics.Canvas
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

/**
 * The start-world thumbnails, photographed from the app's OWN renderer.
 *
 * A curation tool that happens to live in the test source set, because that is the only place the
 * real renderer runs without a phone. It is the start worlds' answer to `tools/level-thumbs.js`,
 * and it keeps that tool's rule: a menu picture is a photograph of the world it opens, never
 * drawn, never stock art. The difference is the camera — the level pictures are captured through
 * the browser's painter on a live loop, these through `Renderer.draw`, the very painter that will
 * show them, driven headlessly. That makes them REPRODUCIBLE: a fixed seed, a fixed tick count and
 * a fixed camera give the same jpg every time.
 *
 * Off by default, since it writes committed files:
 *
 *     gradle -p android-app testReleaseUnitTest --tests '*StartThumbsTest*' -Pthumbs
 *
 * Without `-Pthumbs` it skips. Each picture is asserted to have painted something over the
 * abyss — a thumbnail of nothing would otherwise ship silently.
 *
 * Carries BootTest's exact sandbox signature; the JNI core fits one classloader.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StartThumbsTest {

    /**
     * One curated moment per start world: a tick, a place, a zoom. `z` is backing pixels per world
     * unit, so the frame shows `SIDE / z` units of a 1024-wide torus.
     *
     * `twosuns` is the one shot no phone could frame: the app clamps zoom-out at roughly 460 units
     * and its suns stand 512 apart, so the picture pulls further back than a player can. It is a
     * picture OF the world, not a screenshot of a session — said plainly here rather than implied.
     */
    private data class Shot(val t: Int, val x: Double, val y: Double, val z: Double)

    private val shots = mapOf(
        //                 tick    where the camera looks     zoom
        "pond" to     Shot(1200, 512.0, 560.0, 1.30),  // the mat under the sun
        "still" to    Shot( 200, 512.0, 512.0, 0.50),  // the whole lit pool, and nobody in it
        "twosuns" to  Shot(1500, 512.0, 512.0, 0.42),  // both pools and the strait between
        "refuge" to   Shot(1500, 416.0, 608.0, 1.55),  // the mesh pen on the sun's flank
        "shallows" to Shot(1500, 512.0, 560.0, 1.30),  // pond's framing, thinner water
    )

    private val seed = 11
    private val side = 320      // rendered edge, backing px
    private val out = 160       // written edge, px — the level thumbnails' size
    private val density = 2.0

    @Test
    fun photographEveryStartWorld() {
        assumeTrue("thumbnails are regenerated deliberately: -Pthumbs",
            System.getProperty("microcosm.thumbs") == "1")
        val dir = System.getProperty("microcosm.native.dir") ?: ""
        assumeTrue("host libmicrocosm.so not built", File(dir, "libmicrocosm.so").exists())
        Native.boot()

        val root = File(System.getProperty("microcosm.repo.root") ?: "../..")
        val outDir = File(root, "assets/starts").apply { mkdirs() }
        val r = Renderer(density)
        r.setOptic(false)
        val ground = Optics.ground()
        var wrote = 0

        for (st in Start.all()) {
            val s = shots[st.key]
            if (s == null) { println("START THUMBS: no shot for '${st.key}' — skipped"); continue }
            Native.startWorld(st.idx, seed)
            repeat(s.t) { Native.markPrev(); Native.step() }
            Native.markPrev()

            val big = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
            val cam = Camera().apply { x = s.x; y = s.y; z = s.z }
            r.draw(Canvas(big), cam, side.toFloat(), side.toFloat(), 1.0, 0)

            val px = IntArray(side * side)
            big.getPixels(px, 0, side, 0, 0, side, side)
            val painted = px.count { it != ground }
            val f = File(outDir, "${st.key}.jpg")
            Bitmap.createScaledBitmap(big, out, out, true).let { small ->
                FileOutputStream(f).use { small.compress(Bitmap.CompressFormat.JPEG, 86, it) }
            }
            println("START THUMBS: ${st.key} t=${s.t} at (${s.x},${s.y}) z=${s.z}" +
                " -> ${f.path} ${f.length()} bytes, ${100 * painted / px.size}% painted")
            assertTrue("${st.key}: the thumbnail painted nothing over its ground", painted > 1000)
            wrote++
        }
        assertTrue("no thumbnails were written", wrote > 0)
    }
}
