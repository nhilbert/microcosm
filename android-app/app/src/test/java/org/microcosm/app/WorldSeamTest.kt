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

/**
 * The seam gate: the torus wrap must not be visible (owner report, 2026-09-02 — a hard vertical
 * edge on the world boundary at t=69,035).
 *
 * The world's layers are smooth fields; where the wrap crosses the screen, a column (or row) whose
 * neighbouring-pixel difference spikes against its surroundings is a rendering artifact, not
 * content. The convicted mechanism was bilinear filtering clamping at tile edges: the per-tile
 * drawBitmap loop could not interpolate across the wrap, and neither could the 4x field prescale.
 * Both now sample through REPEAT shaders (Renderer.paintLayer, Layers.upPaint).
 *
 * Negative-tested before its first PASS was believed: on the pre-fix renderer this exact metric
 * reads 2.4x at the wrap column (9,274 against a 3,837 neighbourhood); the fixed renderer reads
 * 1.03x. The threshold sits at 1.8x, between the two measured worlds.
 *
 * Deterministic by construction: seed-11 world, fixed tick count, software canvas, Robolectric's
 * NATIVE Skia — the same pixels every run.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WorldSeamTest {

    @Test
    fun theWorldBoundaryLeavesNoSeam() {
        val dir = System.getProperty("microcosm.native.dir") ?: ""
        assumeTrue("host libmicrocosm.so not built", File(dir, "libmicrocosm.so").exists())
        Native.boot()
        Native.resetWorld()
        Native.initWorld(11)
        // park the sun on the wrap corner, so its steep glow and mat gradients cross both seams —
        // a uniform field would hide a clamped edge, exactly as the first probe's young world did
        Native.evSource(0, 8.0, 8.0)
        repeat(3000) { Native.markPrev(); Native.step() }
        Native.markPrev()
        val density = 3.0
        val r = Renderer(density)
        val vw = 1224
        val vh = 1400
        val bmp = Bitmap.createBitmap(vw, vh, Bitmap.Config.ARGB_8888)
        // the phone's minZ; camera placed so both wrap lines cross mid-screen through the glow
        val cam = Camera().apply { x = 40.0; y = 30.0; z = 2700.0 / 1024.0 }
        r.draw(Canvas(bmp), cam, vw.toFloat(), vh.toFloat(), 1.0, 0)
        val px = IntArray(vw * vh)
        bmp.getPixels(px, 0, vw, 0, 0, vw, vh)
        File("build/reports/screens").mkdirs()
        java.io.FileOutputStream(File("build/reports/screens/seam-gate.png")).use {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, it)
        }

        fun channelSum(a: Int, b: Int): Long =
            (Math.abs(((a shr 16) and 0xFF) - ((b shr 16) and 0xFF)) +
                Math.abs(((a shr 8) and 0xFF) - ((b shr 8) and 0xFF)) +
                Math.abs((a and 0xFF) - (b and 0xFF))).toLong()

        // Judge the two pixel columns (rows) meeting at the wrap against the 20 columns (rows)
        // around them. Organisms also make sharp columns, so the gate reads the wrap line the
        // camera math pins, not the global worst.
        fun judge(axis: String, seamAt: Int, diffAt: (Int) -> Long) {
            val seam = maxOf(diffAt(seamAt), diffAt(seamAt + 1))
            var around = 0L
            var n = 0
            for (d in 2..11) {
                around += diffAt(seamAt - d) + diffAt(seamAt + 1 + d)
                n += 2
            }
            val base = around / n
            println("SEAM gate [$axis] seam=$seam neighbourhood=$base ratio=%.2f".format(seam.toDouble() / base))
            assertTrue(
                "the $axis wrap shows a seam: $seam vs neighbourhood $base (broken renderer measured 2.4x)",
                seam < base * 1.8,
            )
        }

        val sx = (vw / 2 + (0.0 - cam.x) * cam.z).toInt() // world x=0 on screen
        val sy = (vh / 2 + (0.0 - cam.y) * cam.z).toInt() // world y=0 on screen
        judge("vertical", sx) { x ->
            var s = 0L
            for (y in 0 until vh step 2) s += channelSum(px[y * vw + x], px[y * vw + x - 1])
            s
        }
        judge("horizontal", sy) { y ->
            var s = 0L
            for (x in 0 until vw step 2) s += channelSum(px[y * vw + x], px[(y - 1) * vw + x])
            s
        }
    }
}
