package org.microcosm.app

import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.Duration

/**
 * The boot gate: the real `MainActivity`, the real native core, the first seconds of the app's
 * life — on the JVM.
 *
 * Exists because the U.0 build crashed at the splash on the owner's phone while every gate was
 * green: the layout gate deliberately never executes `MainActivity` (its note says so), so a
 * startup crash was invisible to every check this project owns. The camera photographs rows it
 * builds itself; this test runs the code path the phone actually dies in.
 *
 * The native library is the HOST build of the same crate the phone runs — `cargo build --release`
 * in `rust/microcosm-android`, pointed to by the `microcosm.native.dir` property that
 * `build.gradle` wires into `java.library.path`. The JNI symbols are identical, so
 * `System.loadLibrary("microcosm")` in `Native` binds the x86-64 build exactly as the phone binds
 * the arm64 one. When the library has not been built the test SKIPS, loudly — CI builds it first,
 * so there it always runs.
 *
 * What this cannot see, recorded so nobody over-trusts it: a real Surface (Robolectric never
 * calls `surfaceCreated`, so the render loop's frames and `lockHardwareCanvas` stay untested),
 * the GPU, and arm64-specific behaviour. "The owner plays it" remains the only full test.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BootTest {

    private fun requireNativeLib() {
        val dir = System.getProperty("microcosm.native.dir") ?: ""
        assumeTrue(
            "host libmicrocosm.so not found — build it: cd rust/microcosm-android && cargo build --release",
            File(dir, "libmicrocosm.so").exists(),
        )
    }

    /**
     * The render thread's boot, exactly as shipped: `WorldView.run()` executes the whole
     * boot-to-renderer sequence and, with no surface ever created, `running` stays false and the
     * loop body is never entered — so calling it here runs precisely the startup code and returns.
     */
    @Test
    fun theCoreBootsTheWayTheRenderThreadBootsIt() {
        requireNativeLib()
        WorldView(ApplicationProvider.getApplicationContext()).run()
        println("BOOT GATE: core boot sequence ran (boot, reset, init, markPrev, Renderer)")
    }

    /**
     * The owner's report, played back: in Intervene, a tap dead on the sun must grip it. The tap
     * goes through the real gesture pipeline (onTouchEvent → GestureDetector → takeInput on the
     * render thread), with the camera parked on the sun so the tap lands at screen centre.
     */
    @Test
    fun aTapOnTheSunGripsIt() {
        requireNativeLib()
        // the owner's phone, not the default emulator: density 3, 408x900 dp
        org.robolectric.RuntimeEnvironment.setQualifiers("w408dp-h900dp-xxhdpi")
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val world = activity.world
        assertTrue("the view was never laid out", world.width > 0 && world.height > 0)
        // the device's surface lifecycle, by hand — Robolectric has no real surface
        world.surfaceCreated(world.holder)
        world.surfaceChanged(world.holder, 0, world.width, world.height)
        try {
            world.speed = 0.0
            world.intervene = true
            // park the camera on the sun; the core is read on the render thread, where it lives
            val placed = java.util.concurrent.CountDownLatch(1)
            world.post {
                world.cam.x = Native.sourceNum(0, 0)
                world.cam.y = Native.sourceNum(0, 1)
                placed.countDown()
            }
            assertTrue("render thread never ran the command — did it die?",
                placed.await(5, java.util.concurrent.TimeUnit.SECONDS))
            val t = SystemClock.uptimeMillis()
            val cx = world.width / 2f
            val cy = world.height / 2f
            world.onTouchEvent(MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, cx, cy, 0))
            world.onTouchEvent(MotionEvent.obtain(t, t + 50, MotionEvent.ACTION_UP, cx, cy, 0))
            val deadline = System.currentTimeMillis() + 3000
            while (world.sunSel < 0 && System.currentTimeMillis() < deadline) Thread.sleep(10)
            val diag = java.util.concurrent.CountDownLatch(1)
            world.post {
                println("DIAG levelAllows(2)=${Native.levelAllows(2)} sources=${Native.sourceCount()}" +
                    " sun=(${Native.sourceNum(0, 0)}, ${Native.sourceNum(0, 1)})" +
                    " cam=(${world.cam.x}, ${world.cam.y}, z=${world.cam.z})" +
                    " view=${world.width}x${world.height} intervene=${world.intervene} sunSel=${world.sunSel}")
                diag.countDown()
            }
            diag.await(5, java.util.concurrent.TimeUnit.SECONDS)
            assertTrue("a tap dead on the sun did not grip it", world.sunSel >= 0)
            println("BOOT GATE: the tap gripped sun ${world.sunSel}")

            // And the gate the grip sits behind, made explicit: in Observe the same tap does
            // nothing — levers are Intervene's, and always were. Documented here because the
            // owner's "I never get to grip it" is exactly what Observe mode looks like.
            world.sunSel = -1
            world.intervene = false
            val t2 = SystemClock.uptimeMillis()
            world.onTouchEvent(MotionEvent.obtain(t2, t2, MotionEvent.ACTION_DOWN, cx, cy, 0))
            world.onTouchEvent(MotionEvent.obtain(t2, t2 + 50, MotionEvent.ACTION_UP, cx, cy, 0))
            Thread.sleep(300)
            assertTrue("a tap in Observe mode must not grip the sun", world.sunSel < 0)
            println("BOOT GATE: the same tap in Observe grips nothing, as designed")
        } finally {
            world.surfaceDestroyed(world.holder)
        }
    }

    /** The shell's first seconds: onCreate through onResume, HUD ticks, a pause, a back press. */
    @Test
    fun theActivityBootsAndRunsItsFirstSeconds() {
        requireNativeLib()
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        val looper = shadowOf(Looper.getMainLooper())
        // eight HUD rounds at 250 ms — the window in which the phone died
        repeat(8) { looper.idleFor(Duration.ofMillis(250)) }
        controller.pause()   // U0.6's autosave path
        controller.resume()
        controller.get().onBackPressed() // U0.5, with nothing open: must not throw
        looper.idleFor(Duration.ofMillis(250))
        controller.pause().stop().destroy()
        println("BOOT GATE: MainActivity lived through create/resume/ticks/pause/back/destroy")
    }
}
