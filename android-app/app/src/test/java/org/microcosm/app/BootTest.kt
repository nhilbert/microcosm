package org.microcosm.app

import android.os.Looper
import androidx.test.core.app.ApplicationProvider
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
