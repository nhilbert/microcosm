package org.microcosm.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.ContextThemeWrapper
import android.view.View
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

/**
 * The camera, not a gate: renders every control row the shell ships to a PNG a human (or the
 * agent working in a screenless container) can actually open and look at.
 *
 * Why it exists — docs/android-dev-environment.md §6: Robolectric with native graphics (the
 * default since 4.10) draws a real view tree into a real `Bitmap`. That partly closes the gap
 * android-app-plan.md §6 has carried since A.1: nothing in the app had been seen running by its
 * author. The layout gate says whether a control fits; this shows what the row looks like.
 *
 * It always passes. A camera that graded its own pictures would be a second gate, and the gate
 * already exists; this writes files and prints where they are. Robolectric's caveat carries over
 * unchanged: its text metrics and font rasterization are its own, not the device's, so these
 * pictures are evidence, not proof of beauty — the owner playing it remains the only final test.
 *
 * Output: app/build/reports/screens/<row>@<profile>.png, dp-for-pixel at the profile's density.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
// Measured, not assumed: without this the run here produced pure-black PNGs — every Canvas call
// a shadow no-op, drawColor included. NATIVE hands Canvas to real Skia so pixels exist.
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ChromeScreenshotTest {

    private fun ctx(): Context = ContextThemeWrapper(
        ApplicationProvider.getApplicationContext(),
        android.R.style.Theme_Material_NoActionBar,
    )

    @Test
    fun photographEveryRow() {
        val dir = File("build/reports/screens").apply { mkdirs() }
        // The owner's phone; the small phone is the worst case the gate knows.
        val profiles = LayoutGate.PROFILES.filter { it.name.startsWith("Fairphone") || it.name.startsWith("small") }
        for (p in profiles) {
            RuntimeEnvironment.setQualifiers(p.qualifiers)
            val c = ctx()
            val density = c.resources.displayMetrics.density
            val wPx = (p.wDp * density).toInt()
            // The shipped constructs, scroll wrappers included — the picture shows the viewport
            // the player gets, with off-screen content cropped exactly as the screen crops it.
            val rows = Chrome.ROWS.keys.map { it to Chrome.build(c, it) }
            for ((name, row) in rows) {
                row.measure(
                    View.MeasureSpec.makeMeasureSpec(wPx, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
                )
                row.layout(0, 0, wPx, row.measuredHeight)
                val bmp = Bitmap.createBitmap(wPx, row.height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bmp)
                canvas.drawColor(Color.rgb(16, 24, 32)) // the app's dark ground, so light text shows
                row.draw(canvas)
                val short = p.name.substringBefore(' ')
                val f = File(dir, "$name@$short.png")
                FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                println("SCREEN  ${f.path}  ${bmp.width}x${bmp.height}px @ density $density")
            }
        }
    }
}
