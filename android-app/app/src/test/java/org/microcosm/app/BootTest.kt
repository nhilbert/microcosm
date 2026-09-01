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

    /** The camera's discipline (ChromeScreenshotTest): pictures are evidence, never a grade. */
    private fun photograph(v: android.view.View, name: String) {
        if (v.width == 0) { // a panel that was GONE at layout time has no size yet
            val pw = (v.parent as? android.view.View)?.width ?: 320
            val ph = (v.parent as? android.view.View)?.height ?: 470
            v.measure(
                android.view.View.MeasureSpec.makeMeasureSpec(pw, android.view.View.MeasureSpec.EXACTLY),
                android.view.View.MeasureSpec.makeMeasureSpec(ph, android.view.View.MeasureSpec.EXACTLY),
            )
            v.layout(0, 0, pw, ph)
        }
        val w = v.width.coerceAtLeast(1)
        val h = v.height.coerceAtLeast(1)
        val bmp = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
        v.draw(android.graphics.Canvas(bmp))
        val f = File(File("build/reports/screens").apply { mkdirs() }, "$name.png")
        java.io.FileOutputStream(f).use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        println("SCREEN  ${f.path}  ${w}x${h}px")
    }

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

            // U2.3: a standing sun change must wear the badge, and putting the sun back clears it.
            val moved = java.util.concurrent.CountDownLatch(1)
            world.post {
                Native.ivPush(WorldView.IV_SOURCE)
                Native.evSource(0, Native.sourceNum(0, 0) + 128.0, Native.sourceNum(0, 1))
                moved.countDown()
            }
            assertTrue(moved.await(5, java.util.concurrent.TimeUnit.SECONDS))
            var until = System.currentTimeMillis() + 3000
            while (world.sunBadge.isEmpty() && System.currentTimeMillis() < until) Thread.sleep(10)
            assertTrue("a moved sun must wear the standing-change badge", world.sunBadge.isNotEmpty())
            world.putSunBack()
            until = System.currentTimeMillis() + 3000
            while (world.sunBadge.isNotEmpty() && System.currentTimeMillis() < until) Thread.sleep(10)
            assertTrue("putting the sun back must clear the badge", world.sunBadge.isEmpty())
            println("BOOT GATE: the standing-change badge appears on a moved sun and clears on restore")

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

            // U2.R2b: selecting a living creature must publish its structured card for the sheet.
            val spot = DoubleArray(3)
            val foundOne = java.util.concurrent.CountDownLatch(1)
            world.post {
                val n = Native.scalar(0).toInt()
                for (i in 0 until n) if (Native.org(i, 0) != 0.0) {
                    spot[0] = Native.org(i, 3); spot[1] = Native.org(i, 4); spot[2] = 1.0; break
                }
                foundOne.countDown()
            }
            assertTrue(foundOne.await(5, java.util.concurrent.TimeUnit.SECONDS))
            assertTrue("a founded world should hold something alive", spot[2] == 1.0)
            world.cam.x = spot[0]
            world.cam.y = spot[1]
            val t3 = SystemClock.uptimeMillis()
            world.onTouchEvent(MotionEvent.obtain(t3, t3, MotionEvent.ACTION_DOWN, cx, cy, 0))
            world.onTouchEvent(MotionEvent.obtain(t3, t3 + 50, MotionEvent.ACTION_UP, cx, cy, 0))
            until = System.currentTimeMillis() + 3000
            while (world.specimen == null && System.currentTimeMillis() < until) Thread.sleep(10)
            val snap = world.specimen
            assertTrue("selecting a creature must publish its card", snap != null)
            assertTrue("the card should carry the creature's traits", snap!!.loci.isNotEmpty() || snap.sp == 0)
            println("BOOT GATE: selection published a structured card (sp ${snap.sp}, ${snap.loci.size} loci)")
        } finally {
            world.surfaceDestroyed(world.holder)
        }
    }

    /**
     * The shell's first seconds: onCreate through onResume, the front door (U2.0), HUD ticks, a
     * pause, and the back flow — top level goes to the front door, the front door exits.
     */
    @Test
    fun theActivityBootsAndRunsItsFirstSeconds() {
        requireNativeLib()
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        val looper = shadowOf(Looper.getMainLooper())
        val activity = controller.get()
        assertTrue("the front door should be showing at boot",
            activity.startPanel.visibility == android.view.View.VISIBLE)
        assertTrue("the pond must wait behind the front door", activity.world.speed == 0.0)
        photograph(activity.startPanel, "frontdoor@boot")
        activity.expPanel.visibility = android.view.View.VISIBLE
        photograph(activity.expPanel, "experiments@boot")
        activity.expPanel.visibility = android.view.View.GONE
        activity.startPanel.getChildAt(2).performClick() // sandbox
        assertTrue("choosing sandbox should close the front door",
            activity.startPanel.visibility != android.view.View.VISIBLE)
        assertTrue("choosing sandbox should start the pond", activity.world.speed == 1.0)
        // eight HUD rounds at 250 ms — the window in which the phone died
        repeat(8) { looper.idleFor(Duration.ofMillis(250)) }

        // U2.R2: the floating chrome. The fab opens the hand and its dial, a tool arms from the
        // dial, the drawer slides in from the left, the specimen sheet follows selection — and
        // back walks it all down before it walks anything else.
        val decor = activity.window.decorView
        fun relayout() {
            decor.measure(
                android.view.View.MeasureSpec.makeMeasureSpec(decor.width, android.view.View.MeasureSpec.EXACTLY),
                android.view.View.MeasureSpec.makeMeasureSpec(decor.height, android.view.View.MeasureSpec.EXACTLY),
            )
            decor.layout(0, 0, decor.width, decor.height)
        }
        relayout()
        photograph(decor, "app@world")
        activity.interveneFab.performClick()
        assertTrue("the fab should open the hand and its dial",
            activity.world.intervene && activity.dialOpen)
        looper.idleFor(Duration.ofMillis(50))
        relayout()
        photograph(decor, "app@dial")
        (activity.toolsDial.getChildAt(3) as android.widget.LinearLayout).performClick() // wall
        assertTrue("choosing wall should arm it and close the dial",
            activity.world.wallArmed && !activity.dialOpen)
        activity.interveneFab.performClick() // an armed fab tap stands the tool down
        assertTrue("the fab should stand the wall down", !activity.world.wallArmed)
        activity.onBackPressed() // dial is open again after standing down; back closes the hand
        assertTrue("back should close the hand", !activity.dialOpen && !activity.world.intervene)
        activity.menuFab.performClick()
        assertTrue("the menu should slide in", activity.drawer.visibility == android.view.View.VISIBLE)
        looper.idleFor(Duration.ofMillis(50))
        relayout()
        photograph(decor, "app@drawer")
        activity.onBackPressed()
        assertTrue("back should close the menu", activity.drawer.visibility != android.view.View.VISIBLE)

        controller.pause()   // U0.6's autosave path
        controller.resume()
        activity.onBackPressed() // top level: back returns to the front door, saved
        assertTrue("back at top level should reopen the front door",
            activity.startPanel.visibility == android.view.View.VISIBLE)
        activity.onBackPressed() // and from the front door, back leaves
        looper.idleFor(Duration.ofMillis(250))
        controller.pause().stop().destroy()
        println("BOOT GATE: MainActivity lived through create/front-door/ticks/pause/back/destroy")
    }

    /**
     * The owner's screen-lock report, played back (2026-09-01): "when my screen locks, all data
     * is lost, no save." Two faults compounded. A lock destroys the surface and an unlock
     * creates a new one, and `WorldView.run()` founded a fresh world on every new surface — so
     * the unlock itself reset the pond, no process death needed. And the pause-time autosave was
     * queued to the render thread the teardown was busy killing, so the queue died with the
     * loop and even the fallback file was stale. This test locks and unlocks the real view and
     * requires both fixes: the queued save survives the teardown, and the world that comes back
     * is the same world, further along — never a re-founding.
     */
    @Test
    fun theScreenLockKeepsTheWorld() {
        requireNativeLib()
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val world = activity.world
        world.surfaceCreated(world.holder)
        world.surfaceChanged(world.holder, 0, world.width, world.height)
        try {
            world.speed = 16.0
            val until = System.currentTimeMillis() + 8000
            fun tickOf(s: String) = s.removePrefix("t ").trim().toLongOrNull() ?: -1L
            while (tickOf(world.clock) < 40 && System.currentTimeMillis() < until) Thread.sleep(10)
            assertTrue("the pond never ticked", tickOf(world.clock) >= 40)

            // the lock: the autosave is queued the way onPause queues it, and the surface goes
            // down immediately after — the exact race the phone loses
            val saved = java.util.concurrent.atomic.AtomicReference<ByteArray?>()
            world.save { bytes -> saved.set(bytes) }
            world.surfaceDestroyed(world.holder)
            shadowOf(Looper.getMainLooper()).idle() // deliver the save's UI-thread callback
            assertTrue("the pause-time autosave must survive the surface teardown",
                (saved.get()?.size ?: 0) > 0)
            // after the join the test thread owns the core, same as the drain does
            val tickAtLock = Native.tick()
            assertTrue("the world should be past founding at the lock", tickAtLock >= 40)

            // the unlock: a new surface, a new render thread — and the same world. Paused, so
            // the verdict is deterministic: a kept world publishes exactly tickAtLock, while a
            // re-founded one publishes 0 (at speed a re-founding could tick back past the mark
            // and slip through a >= check).
            world.speed = 0.0
            world.surfaceCreated(world.holder)
            world.surfaceChanged(world.holder, 0, world.width, world.height)
            val alive = java.util.concurrent.CountDownLatch(1)
            world.post { alive.countDown() }
            assertTrue("the unlock's render thread never ran",
                alive.await(5, java.util.concurrent.TimeUnit.SECONDS))
            Thread.sleep(200) // a few frames of clock publishing
            assertTrue(
                "unlock re-founded the world (t ${tickOf(world.clock)}, expected t $tickAtLock)",
                tickOf(world.clock) == tickAtLock,
            )
            println("BOOT GATE: lock/unlock kept the world (t $tickAtLock → ${tickOf(world.clock)}), save survived teardown")
        } finally {
            world.surfaceDestroyed(world.holder)
        }
    }
}
