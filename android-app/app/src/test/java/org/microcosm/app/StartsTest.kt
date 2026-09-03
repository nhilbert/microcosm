package org.microcosm.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * The sandbox start worlds, as the app meets them (Phase 9).
 *
 * The ECOLOGY of every start is calibrated where it belongs — `harness/starts.js`, eight seeds to
 * the 18,000-tick horizon, on the same core this loads. What can only be checked here is the seam
 * between the core's table and the shell's: that founding a start through the app's own entry
 * point really builds the sky and the walls that start declares, and that every row the core
 * carries has WORDS. A start added to the crate with no strings would otherwise reach the front
 * door showing its key.
 *
 * Carries BootTest's exact sandbox signature; the JNI core fits one classloader.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StartsTest {

    private fun requireNativeLib() {
        val dir = System.getProperty("microcosm.native.dir") ?: ""
        assumeTrue("host libmicrocosm.so not built", File(dir, "libmicrocosm.so").exists())
    }

    /**
     * How many organisms the founding put in the world. `scalar(0)` is the core's `n`, the number
     * of slots in use — at t=0, before anything can die, that is exactly the founded population.
     */
    private fun founded(): Int = Native.scalar(0).toInt()

    @Test
    fun everyStartFoundsTheWorldItDeclares() {
        requireNativeLib()
        Native.boot()
        val table = Start.all()
        assertTrue("the core carries no start table", table.size >= 4)

        for (st in table) {
            Native.startWorld(st.idx, 11)
            val suns = Native.sourceCount()
            val alive = founded()
            when (st.key) {
                // The certified world: one sun, no walls, a founded pond.
                "pond" -> {
                    assertEquals("pond: one sun", 1, suns)
                    assertEquals("pond: no walls", 0, Native.wallCount())
                    assertTrue("pond: a founded pond has life in it", alive > 0)
                }
                // Still water: the sun and the mineral are there, nobody else is.
                "still" -> {
                    assertEquals("still: one sun", 1, suns)
                    assertEquals("still: nobody home", 0, alive)
                }
                "twosuns" -> {
                    assertEquals("twosuns: two suns", 2, suns)
                    assertTrue("twosuns: the suns stand apart",
                        Math.abs(Native.sourceNum(0, 0) - Native.sourceNum(1, 0)) > 256.0)
                    assertTrue("twosuns: a founded pond has life in it", alive > 0)
                }
                "refuge" -> {
                    assertEquals("refuge: the pen has four sides", 4, Native.wallCount())
                    assertTrue("refuge: the player keeps wall slots", Native.wallCount() < 8)
                    assertTrue("refuge: a founded pond has life in it", alive > 0)
                }
                "shallows" -> {
                    assertEquals("shallows: one sun", 1, suns)
                    assertTrue("shallows: a founded pond has life in it", alive > 0)
                }
            }
            // Whatever it composes, a start leaves the player's own slots alone.
            assertEquals("${st.key}: the undo slot must be empty", 0, Native.undoKind())
            assertTrue("${st.key}: a start is not an intervention", Native.ivCount() == 0)
        }
    }

    @Test
    fun everyStartHasWords() {
        requireNativeLib()
        Native.boot()
        val ctx = RuntimeEnvironment.getApplication()
        for (st in Start.all()) {
            assertTrue("start '${st.key}' has no title", st.title(ctx) != st.key)
            assertTrue("start '${st.key}' has no subtitle", st.subtitle(ctx).isNotEmpty())
        }
    }
}
