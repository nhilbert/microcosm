package org.microcosm.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

/**
 * The Data screen, photographed page by page on a real world (U3).
 *
 * The reason this test exists is the reason the redesign exists: nothing in this repository had
 * ever LOOKED at these pages. The layout gate measures the control rows and never opens the
 * screen; the boot gate opens the app and never walks the pages; the frame gate compares the
 * pond's pixels and knows nothing about a chart. Six shipped pages, and the first person to see
 * them at full size was the owner, on a phone, a year in.
 *
 * So: a real world stepped to t≈3000 through the real render loop, the real Data screen opened
 * through the app's own door, every page selected in turn and photographed at the owner's phone
 * width in both languages. Twelve pictures under `build/reports/screens/`.
 *
 * What it asserts is deliberately thin, because a picture is evidence and never a grade
 * (ChromeScreenshotTest's rule). Three things would make a page broken rather than merely ugly,
 * and only those three are asserted:
 *
 *   * every page lays out with a non-zero size and draws without throwing,
 *   * the chart pages take LESS than the screen (the U3 promise: a bounded plot with air under
 *     it, not a chart stretched to whatever container it was handed),
 *   * the vitals page shows real readings rather than "gathering history".
 *
 * Carries BootTest's exact sandbox signature — the JNI core fits one classloader.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DataPageTest {

    @Test
    fun photographEveryPage() = shoot("", "w408dp-h900dp-xxhdpi")

    /**
     * The same walk in German. "Vitalwerte", "Ereignisse" and "zurückgeholt" are longer than what
     * they translate, and this screen is a row of tabs and a column of labelled numbers — the two
     * places length actually costs something.
     */
    @Test
    fun photographEveryGermanPage() = shoot("-de", "de-w408dp-h900dp-xxhdpi")

    private fun shoot(tag: String, qualifiers: String) {
        val dir = System.getProperty("microcosm.native.dir") ?: ""
        assumeTrue("host libmicrocosm.so not built", File(dir, "libmicrocosm.so").exists())
        RuntimeEnvironment.setQualifiers(qualifiers)
        Native.boot()
        Native.initWorld(11)
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val world = activity.world
        world.surfaceCreated(world.holder)
        world.surfaceChanged(world.holder, 0, world.width, world.height)
        try {
            // A world with something to say: past the settling, with the observatory's indicators
            // warm and the recorder ring holding real history. Driven the way the loop drives it.
            //
            // The world is FOUNDED here, on the render thread, after the activity is up — not
            // before it. The JNI core is one process-global singleton shared by every test in the
            // JVM, and the shell's own boot (a front door that can adopt a saved experiment) runs
            // between `buildActivity` and this line. Founding beforehand let whatever the suite
            // had left behind decide what this gate photographed: it passed alone and failed in
            // the suite, which is the signature of a test that assumes a starting state instead
            // of making one.
            world.speed = 0.0
            world.stopLevel()
            val ran = java.util.concurrent.CountDownLatch(1)
            world.post {
                Native.initWorld(11)
                while (Native.tick() < 3000) { Native.markPrev(); Native.step() }
                ran.countDown()
            }
            assertTrue("the fast-forward never finished",
                ran.await(120, java.util.concurrent.TimeUnit.SECONDS))

            // the REAL publish path: opening the screen makes the render loop copy the channels
            world.dataOpen = true
            world.speed = 16.0
            val until = System.currentTimeMillis() + 20000
            while (world.seriesN < 120 && System.currentTimeMillis() < until) Thread.sleep(50)
            world.speed = 0.0
            // 120 samples, not "some": the observatory needs two 60-sample windows before it will
            // read a species' strain at all, so a shorter history makes the Vitals page honestly
            // empty and this gate blind to whether it lays out.
            assertTrue("the render loop published only ${world.seriesN} samples — the world this " +
                "gate photographs was not the one it founded", world.seriesN >= 120)

            val density = activity.resources.displayMetrics.density
            val w = (408 * density).toInt()
            val h = (900 * density).toInt()
            val panel = activity.dataPanel
            for ((k, key) in Chrome.PAGES.withIndex()) {
                activity.openData(k)
                shadowOf(Looper.getMainLooper()).idle()
                panel.measure(
                    View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY),
                )
                panel.layout(0, 0, w, h)
                val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                bmp.eraseColor(Style.ABYSS)
                panel.draw(Canvas(bmp))
                val out = File("build/reports/screens").apply { mkdirs() }
                val f = File(out, "data-$key$tag.png")
                FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                println("DATA PAGE  $key$tag  ${w}x${h}px -> ${f.absolutePath}")

                if (k <= 2) {
                    // The U3 promise, measured rather than admired: a chart page asks for a plot
                    // plus a legend, and the rest of the screen stays air. If this ever comes back
                    // equal to the viewport, the plot is eating the view again.
                    val chart = chartOf(panel)!!
                    val asked = chart.measureSelf(w, chart.height)
                    assertTrue("the $key chart asked for $asked px of a $h px screen — it is " +
                        "filling the view again", asked < h * 0.86)
                }
            }

            // the ⓘ card, which no other still can reach: the explanation the header used to
            // carry permanently, now shown only when it is asked for
            activity.openData(0)
            activity.toggleDataInfoForTest()
            shadowOf(Looper.getMainLooper()).idle()
            panel.measure(
                View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
            panel.layout(0, 0, w, h)
            val info = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            info.eraseColor(Style.ABYSS)
            panel.draw(Canvas(info))
            File("build/reports/screens").mkdirs()
            FileOutputStream(File("build/reports/screens", "data-info$tag.png")).use {
                info.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
            println("DATA PAGE  info$tag  ${w}x${h}px")

            // "gathering history…" is the honest empty state, and a page stuck in it is a page
            // that never got its numbers. At t=3000 the observatory has them — but it publishes
            // them from the render thread on its own cadence, so the page is re-opened until the
            // report arrives rather than read the instant after the first tap. A test that races
            // a background publisher fails on machine speed, which is not a fact about the app.
            val ready = System.currentTimeMillis() + 20000
            do {
                activity.openData(3)
                shadowOf(Looper.getMainLooper()).idle()
                if (world.healthReport.ok && world.healthReport.vitals.isNotEmpty()) break
                Thread.sleep(50)
            } while (System.currentTimeMillis() < ready)
            println("VITALS  ok=${world.healthReport.ok}  species=${world.healthReport.vitals.size}")
            assertTrue("the vitals page never got its readings (ok=${world.healthReport.ok}, " +
                "${world.seriesN} samples)", world.healthReport.ok)
            panel.measure(
                View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
            panel.layout(0, 0, w, h)
            assertTrue("the vitals page should be showing readings by t=3000",
                texts(panel).none { it == activity.getString(R.string.health_gathering) })
            // Which species carry a reading depends on the world, so the claim is not "Solara is
            // there" but "every species the observatory read is named on the page" — colour alone
            // is never allowed to be the identity, here least of all.
            val read = world.healthReport.vitals.map { it.name }
            assertTrue("the observatory should have read at least one species", read.isNotEmpty())
            val shown = texts(panel)
            for (name in read) assertTrue("$name was read but never named on the page",
                shown.any { it == name })
        } finally {
            world.surfaceDestroyed(world.holder)
        }
    }

    private fun chartOf(v: View): DataView? = when (v) {
        is DataView -> v
        is ViewGroup -> (0 until v.childCount).firstNotNullOfOrNull { chartOf(v.getChildAt(it)) }
        else -> null
    }

    private fun texts(v: View): List<String> = when (v) {
        is TextView -> listOf(v.text.toString())
        is ViewGroup -> (0 until v.childCount).flatMap { texts(v.getChildAt(it)) }
        else -> emptyList()
    }
}
