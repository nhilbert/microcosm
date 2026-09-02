package org.microcosm.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import android.widget.ScrollView
import android.widget.TextView
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

/**
 * The help page, photographed WHOLE (owner request, 2026-09-02).
 *
 * The boot gate already proves the page opens, profiles all five species and draws its diagram —
 * but it can only photograph one screenful, and this page is eight. A help page is a designed
 * thing: the only way anyone in a screenless container can judge whether it holds together is to
 * lay it out at a real phone width and let it be as tall as it wants.
 *
 * It also asserts the two things that would make the page a lie rather than merely ugly: every
 * species card carries its own portrait (the art is the product's, and a missing file must show
 * as a missing picture, never as a broken one), and every model note names a source.
 *
 * Carries BootTest's exact sandbox signature — the JNI core fits one classloader.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class HelpPageTest {

    @Test
    fun photographTheWholePage() = shoot("")

    /**
     * The German page, at the same width. German compounds are longer than their English source
     * by a fifth or more, so a layout that holds in one language is not evidence for the other —
     * and this page is the app's densest text by a distance.
     */
    @Test
    @Config(sdk = [34], qualifiers = "de")
    fun photographTheGermanPage() = shoot("-de")

    private fun shoot(tag: String) {
        val dir = System.getProperty("microcosm.native.dir") ?: ""
        assumeTrue("host libmicrocosm.so not built", File(dir, "libmicrocosm.so").exists())
        Native.boot()
        Native.initWorld(11)
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val page = activity.helpPanel
        // the page is a panel with a ScrollView; photograph the SCROLLED CONTENT at its full height
        val body = (0 until page.childCount).map { page.getChildAt(it) }
            .filterIsInstance<ScrollView>().first().getChildAt(0)

        val density = activity.resources.displayMetrics.density
        val w = (408 * density).toInt() // the owner's phone, in dp
        (body.parent as ViewGroup).removeView(body)
        body.measure(
            View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        val h = body.measuredHeight
        body.layout(0, 0, w, h)
        assertTrue("the help page$tag measured $h px tall — it did not lay out", h > w)

        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        bmp.eraseColor(Style.ABYSS)
        body.draw(Canvas(bmp))
        val out = File("build/reports/screens").apply { mkdirs() }
        val f = File(out, "help@page$tag.png")
        FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        println("HELP PAGE$tag: ${w}x${h}px -> ${f.absolutePath}")

        // a card without its portrait is a product defect, not a missing string
        assertTrue("the five species cards should carry five portraits", portraits(body) == 5)
        val texts = texts(body)
        assertTrue("every model note should name where it came from",
            texts.count { it.startsWith("Wikipedia") } == 5)
        assertTrue("the sources should also stand together at the end",
            texts.count { it.contains("·  Wikipedia") } == 5)
        assertTrue("the sources note should state the licence",
            texts.any { it.contains("CC BY-SA") })
    }

    private fun portraits(v: View): Int = when (v) {
        is PortraitView -> if (v.width > 0 && v.height > 0) 1 else 0
        is ViewGroup -> (0 until v.childCount).sumOf { portraits(v.getChildAt(it)) }
        else -> 0
    }

    private fun texts(v: View): List<String> = when (v) {
        is TextView -> listOf(v.text.toString())
        is ViewGroup -> (0 until v.childCount).flatMap { texts(v.getChildAt(it)) }
        else -> emptyList()
    }
}
