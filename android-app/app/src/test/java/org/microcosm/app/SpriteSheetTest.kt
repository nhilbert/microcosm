package org.microcosm.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

/**
 * The bucket grid, photographed and held to its dials (GR.2, docs/organism-graphics-plan.md).
 *
 * Two jobs. As a camera it renders every species' full tint x morph sprite grid to one PNG a
 * human (or the agent in a screenless container) can open — the 10-second test is applied to
 * this picture's rail columns, by a person. As a gate it asserts the two things a rebake must
 * never lose: every bucket paints a real body, and both certified dials (tint = temperature
 * locus, morph = defense or feeding locus) remain VISIBLE at their rails — a rebake that
 * flattens a dial would silently erase a locus from the world's face.
 *
 * The grid measured is the one that ships: specs come from the core's own bucket table via
 * Native, not from constants a test could drift on. Carries BootTest's exact sandbox signature
 * (sdk AND GraphicsMode — the mode is part of Robolectric's sandbox key): the JVM lets a JNI
 * library live in exactly one classloader.
 *
 * Since GR.7 all of it runs TWICE, once per optic: the light field bakes the same bodies as
 * absorbing ones, and a second regime is worth nothing if its bodies are blank, its dials flat,
 * or — the failure this feature actually risks — if a body cannot be seen on the ground it now
 * lands on. That last one is checked by compositing each bake onto its own ground and counting
 * what changed, which is the only thing about a look a screenless container may claim.
 *
 * Robolectric's caveat carries over: its rasterizer is not the device's, so the PNG is evidence,
 * not proof of beauty — the owner's device stays the only look-gate.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SpriteSheetTest {

    private data class Row(val name: String, val tN: Int, val mN: Int, val bmps: List<Bitmap>)

    @Test
    fun photographTheBucketGridAndHoldTheDials() {
        Native.initWorld(11)
        Native.grammarBuild()
        for (light in listOf(false, true)) {
            Optics.lightField = light
            oneRegime(if (light) "-light" else "")
        }
        Optics.lightField = false
    }

    private fun oneRegime(tag: String) {
        val rows = mutableListOf<Row>()
        for (sp in 0 until 7) {
            val tN = Native.grammarNum(sp, 4).toInt()
            val mN = Native.grammarNum(sp, 5).toInt()
            if (tN <= 0 || mN <= 0) continue
            val bmps = (0 until tN * mN).map { i ->
                val tb = i / mN
                val mb = i % mN
                Sprites.make(
                    intArrayOf(
                        Native.specNum(sp, tb, mb, 0).toInt(),
                        Native.specNum(sp, tb, mb, 1).toInt(),
                        Native.specNum(sp, tb, mb, 2).toInt(),
                    ),
                    Native.specNum(sp, tb, mb, 3).toInt(),
                    Native.specNum(sp, tb, mb, 5),
                    Native.specNum(sp, tb, mb, 6),
                )
            }
            rows += Row(Native.traitText(sp, 0), tN, mN, bmps)
        }
        assertTrue("no species carries a bucket grid — grammar unreadable?", rows.isNotEmpty())

        // every bucket paints a real body — and one that can be SEEN on the ground it lands on:
        // the dark field's bodies add their light to black water (SCREEN), the light field's take
        // light out of the lamp, so each bake is composited exactly as the painter composites it
        for (row in rows) for ((i, bmp) in row.bmps.withIndex()) {
            assertTrue("${row.name}$tag bucket $i is blank (${lit(bmp)} lit px)", lit(bmp) > 200)
            val seen = onGround(bmp)
            assertTrue("${row.name}$tag bucket $i is invisible on its ground ($seen px differ)",
                seen > 200)
        }

        // the dials stay visible at the rails: rebaking must never flatten a locus channel.
        // Thresholds are deliberately low water marks (Bacillus's corner dial is the subtlest).
        for (row in rows) {
            if (row.mN > 1) {
                val mid = row.tN / 2
                val d = diff(row.bmps[mid * row.mN], row.bmps[mid * row.mN + row.mN - 1])
                assertTrue("${row.name}$tag: morph dial invisible at the rails ($d px differ)", d > 40)
            }
            if (row.tN > 1) {
                val mid = row.mN / 2
                val d = diff(row.bmps[mid], row.bmps[(row.tN - 1) * row.mN + mid])
                assertTrue("${row.name}$tag: tint dial invisible at the rails ($d px differ)", d > 40)
            }
        }

        // the photograph: one sheet, tint rows x morph columns per species block
        val scale = 2
        val cell = Sprites.S * scale + 2
        val label = 18
        val w = (rows.maxOf { it.mN } * cell + 4).coerceAtLeast(220)
        val h = rows.sumOf { it.tN * cell + label + 6 }
        val sheet = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(sheet)
        c.drawColor(Optics.ground())
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Optics.ink(1f, 255, 255, 255)
            textSize = 13f
        }
        var y = 0
        for (row in rows) {
            c.drawText("${row.name}   tint ${row.tN} x morph ${row.mN}", 4f, y + 14f, text)
            y += label
            for (tb in 0 until row.tN) {
                for (mb in 0 until row.mN) {
                    val bmp = row.bmps[tb * row.mN + mb]
                    val x = mb * cell + 2
                    c.drawBitmap(
                        bmp, null,
                        android.graphics.RectF(
                            x.toFloat(), (y + tb * cell).toFloat(),
                            (x + Sprites.S * scale).toFloat(), (y + tb * cell + Sprites.S * scale).toFloat(),
                        ),
                        blit(),
                    )
                }
            }
            y += row.tN * cell + 6
        }
        val dir = File("build/reports/screens").apply { mkdirs() }
        val out = File(dir, "sprites$tag.png")
        FileOutputStream(out).use { sheet.compress(Bitmap.CompressFormat.PNG, 100, it) }
        println("SPRITE SHEET: ${rows.size} species grids$tag -> ${out.absolutePath}")
    }

    /** The painter's own composite for the regime in force (Renderer: SCREEN on black water). */
    private fun blit(): Paint = Paint(Paint.FILTER_BITMAP_FLAG).apply {
        if (!Optics.lightField) {
            xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.SCREEN)
        }
    }

    /** Pixels a bake changes when it is composited onto its own ground — "can this be seen". */
    private fun onGround(bmp: Bitmap): Int {
        val ground = Optics.ground()
        val plate = Bitmap.createBitmap(bmp.width, bmp.height, Bitmap.Config.ARGB_8888)
        val c = Canvas(plate)
        c.drawColor(ground)
        c.drawBitmap(bmp, 0f, 0f, blit())
        val px = IntArray(plate.width * plate.height)
        plate.getPixels(px, 0, plate.width, 0, 0, plate.width, plate.height)
        return px.count {
            Math.abs(Color.red(it) - Color.red(ground)) > 12 ||
                Math.abs(Color.green(it) - Color.green(ground)) > 12 ||
                Math.abs(Color.blue(it) - Color.blue(ground)) > 12
        }
    }

    private fun lit(bmp: Bitmap): Int {
        val px = IntArray(bmp.width * bmp.height)
        bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
        return px.count { Color.alpha(it) > 16 }
    }

    /** Pixels whose channels differ by more than 8 — bitmap dimensions are always equal here. */
    private fun diff(a: Bitmap, b: Bitmap): Int {
        val pa = IntArray(a.width * a.height)
        val pb = IntArray(b.width * b.height)
        a.getPixels(pa, 0, a.width, 0, 0, a.width, a.height)
        b.getPixels(pb, 0, b.width, 0, 0, b.width, b.height)
        var n = 0
        for (i in pa.indices) {
            val x = pa[i]
            val z = pb[i]
            if (Math.abs(Color.red(x) - Color.red(z)) > 8 ||
                Math.abs(Color.green(x) - Color.green(z)) > 8 ||
                Math.abs(Color.blue(x) - Color.blue(z)) > 8 ||
                Math.abs(Color.alpha(x) - Color.alpha(z)) > 8
            ) n++
        }
        return n
    }
}
