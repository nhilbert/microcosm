package org.microcosm.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.drawable.AdaptiveIconDrawable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream
import kotlin.math.hypot

/**
 * The launcher icon, photographed and measured through Android's own icon pipeline.
 *
 * The app shipped for its whole life with the stock green robot, because nothing here ever looked
 * at the home screen. This is the home screen's gate, in the shape the other picture gates take:
 * it writes the icon out at the sizes a launcher actually uses (`build/reports/screens/icon@*.png`)
 * so a human can judge it, and it asserts the two things a human eye is bad at.
 *
 *  - THE SAFE ZONE. An adaptive icon is 108dp of canvas with only the middle 66dp guaranteed to
 *    survive the launcher's mask; the rest is parallax margin. Ink outside that circle is ink the
 *    player may never see, and which mask eats it differs per phone — so the gate holds every
 *    foreground pixel with real opacity inside it. It is measured, not eyeballed: the bristles
 *    reach r≈27 against a limit of 33.
 *  - THE THEMED LAYER. Android 13 tints `monochrome` and drops the other two. A missing one is
 *    silent — the phone just keeps showing the colour icon — so it is asserted, not assumed.
 *
 * What it cannot say is whether the icon is any good. That is what the photographs are for.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class IconTest {

    private val ctx get() = RuntimeEnvironment.getApplication()

    private fun icon(): AdaptiveIconDrawable {
        val d = ctx.getDrawable(R.mipmap.ic_launcher)
        assertTrue("@mipmap/ic_launcher should be an adaptive icon, was ${d?.javaClass?.simpleName}",
            d is AdaptiveIconDrawable)
        return d as AdaptiveIconDrawable
    }

    private fun shoot(name: String, size: Int, draw: (Canvas) -> Unit): Bitmap {
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        draw(Canvas(bmp))
        val out = File("build/reports/screens").apply { mkdirs() }
        val f = File(out, "icon@$name.png")
        FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        println("ICON $name: ${size}px -> ${f.absolutePath}")
        return bmp
    }

    /** The icon as the launcher shows it — masked, at the three sizes that matter. */
    @Test
    fun photographTheIcon() {
        for (size in intArrayOf(432, 192, 96, 48)) {
            val bmp = shoot("$size", size) { c ->
                icon().apply { setBounds(0, 0, size, size) }.draw(c)
            }
            val colours = HashSet<Int>()
            for (y in 0 until size) for (x in 0 until size) colours.add(bmp.getPixel(x, y))
            assertTrue("the icon at ${size}px painted ${colours.size} colours — it is flat",
                colours.size > 24)
        }
        // and the layers on their own, so a design pass can see what the mask is doing
        shoot("layers", 432) { c ->
            val d = icon()
            d.background.apply { setBounds(0, 0, 432, 432) }.draw(c)
            d.foreground.apply { setBounds(0, 0, 432, 432) }.draw(c)
        }
    }

    /**
     * Every opaque foreground pixel inside the 66dp safe circle. `S` is the render scale: one
     * viewport unit of the 108-unit canvas is `S` pixels here, so the circle is 33*S.
     */
    @Test
    fun theForegroundStaysInsideTheSafeZone() {
        val s = 8
        val side = 108 * s
        val bmp = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
        icon().foreground.apply { setBounds(0, 0, side, side) }.draw(Canvas(bmp))

        val c = side / 2f
        var worst = 0.0
        var ink = 0
        for (y in 0 until side) for (x in 0 until side) {
            // the body's bloom fades to nothing well before the rim; only real ink is held
            if (Color.alpha(bmp.getPixel(x, y)) < 64) continue
            ink++
            worst = maxOf(worst, hypot(x + 0.5 - c, y + 0.5 - c))
        }
        val units = worst / s
        println("ICON safe zone: $ink opaque px, furthest ink at r=%.1f of 33 units".format(units))
        assertTrue("the foreground painted almost nothing ($ink px)", ink > 4000)
        assertTrue("foreground ink reaches r=%.1f units, outside the 33-unit safe circle"
            .format(units), units <= 33.0)
    }

    /** The Android 13 themed icon: present, and a silhouette rather than a solid tile. */
    @Test
    fun theIconHasAThemedLayer() {
        val mono = icon().monochrome
        assertTrue("the adaptive icon carries no <monochrome> layer — themed home screens would " +
            "silently keep the colour icon", mono != null)
        val side = 216
        // photographed the way a themed home screen shows it: one ink on one ground, the
        // system's doing, not the drawable's — a white-on-nothing render looks like an empty file
        shoot("monochrome", side) { c ->
            c.drawColor(Style.SURFACE)
            mono!!.apply {
                setBounds(0, 0, side, side)
                setTint(Style.TEXT)
            }.draw(c)
            mono.setTintList(null)
        }
        val bmp = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
        mono!!.apply { setBounds(0, 0, side, side) }.draw(Canvas(bmp))
        var painted = 0
        for (y in 0 until side) for (x in 0 until side)
            if (Color.alpha(bmp.getPixel(x, y)) > 64) painted++
        val share = painted.toDouble() / (side * side)
        println("ICON monochrome: %.1f%% of the canvas is ink".format(share * 100))
        assertTrue("the themed layer covers %.1f%% of the canvas — a silhouette, not a tile"
            .format(share * 100), share in 0.05..0.45)
    }

    /** The round variant is the same icon; a launcher that asks for it must not get the robot. */
    @Test
    fun theRoundIconIsTheSameIcon() {
        val round = ctx.getDrawable(R.mipmap.ic_launcher_round)
        assertTrue("@mipmap/ic_launcher_round should be an adaptive icon too",
            round is AdaptiveIconDrawable)
        val a = render(icon(), 96)
        val b = render(round as AdaptiveIconDrawable, 96)
        var same = 0
        for (y in 0 until 96) for (x in 0 until 96) if (a.getPixel(x, y) == b.getPixel(x, y)) same++
        assertEquals("the round icon should paint the same pixels", 96 * 96, same)
    }

    private fun render(d: AdaptiveIconDrawable, size: Int): Bitmap {
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        d.apply { setBounds(0, 0, size, size) }.draw(Canvas(bmp))
        return bmp
    }
}
