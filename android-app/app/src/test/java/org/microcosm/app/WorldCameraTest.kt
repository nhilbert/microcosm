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
 * The world camera (GR.3, docs/organism-graphics-plan.md): photographs the real world — host
 * core, real frame builder, real painter — at the three rungs of the zoom ladder, so the ladder
 * can be looked at in a screenless container: the overview (field-only carpet, sprites small),
 * the cell tier (carpet tissue faded in), and the close-up (crisp vector overlays over the
 * blits). A camera in the ChromeScreenshotTest tradition: it asserts only that each frame
 * painted something over the abyss — grading looks is the owner's job, on the owner's device.
 *
 * Since GR.7 every rung is shot twice, once in each optic, and the light field's frames carry the
 * `-light` suffix. The assertion is the one thing a screenless container CAN judge about a second
 * ground: that the world is still painted ON it — a body that forgot to re-ink would leave the
 * lamp bare, and this counts exactly that.
 *
 * Carries BootTest's exact sandbox signature; the JNI core fits one classloader.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WorldCameraTest {

    @Test
    fun photographTheZoomLadder() {
        val dir = System.getProperty("microcosm.native.dir") ?: ""
        assumeTrue("host libmicrocosm.so not built", File(dir, "libmicrocosm.so").exists())
        Native.boot()
        Native.resetWorld()
        Native.initWorld(11)
        repeat(3000) { Native.markPrev(); Native.step() }
        Native.markPrev()
        val density = 3.0
        val r = Renderer(density)
        val vw = 1224
        val vh = 1400
        val sunX = Native.sourceNum(0, 0)
        val sunY = Native.sourceNum(0, 1)
        // device zoom = CSS zoom x density; the phone's floor is 2700/1024, its ceiling 6 x 3
        val shots = listOf(
            "overview" to Camera().apply { x = 512.0; y = 512.0; z = 2700.0 / 1024.0 },
            "mat-cells" to Camera().apply { x = sunX + 60.0; y = sunY + 40.0; z = 9.0 },
            "close-up" to Camera().apply { x = sunX + 30.0; y = sunY + 20.0; z = 18.0 },
        )
        val out = File("build/reports/screens").apply { mkdirs() }
        for (light in listOf(false, true)) {
            r.setOptic(light)
            val ground = Optics.ground()
            val tag = if (light) "-light" else ""
            for ((name, cam) in shots) {
                val bmp = Bitmap.createBitmap(vw, vh, Bitmap.Config.ARGB_8888)
                r.draw(Canvas(bmp), cam, vw.toFloat(), vh.toFloat(), 1.0, 0)
                val px = IntArray(vw * vh)
                bmp.getPixels(px, 0, vw, 0, 0, vw, vh)
                val painted = px.count { it != ground }
                val f = File(out, "world@$name$tag.png")
                FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                println("WORLD CAMERA: $name$tag z=${"%.2f".format(cam.z)} -> ${f.absolutePath}")
                assertTrue("$name$tag painted nothing over its ground", painted > 1000)
            }
        }
        r.setOptic(false)
    }
}
