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

    /** The drawn diagram, found by type — a picture that is missing is a page that lost it. */
    private fun countCycles(v: android.view.View): Int = when (v) {
        is Help.CycleView -> 1
        is android.view.ViewGroup -> (0 until v.childCount).sumOf { countCycles(v.getChildAt(it)) }
        else -> 0
    }

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

            // Round 4: the badge is a notice, not a monument. It leaves by itself while the
            // change still stands, and any further touch of the sun brings it back. The window
            // is shortened here; the shipped one is WorldView.SUN_BADGE_SHOW_NS.
            world.sunBadgeShowNs = 1_500_000_000L
            fun nudgeSun() {
                val done = java.util.concurrent.CountDownLatch(1)
                world.post {
                    Native.ivPush(WorldView.IV_SOURCE)
                    Native.evSource(0, Native.sourceNum(0, 0) + 128.0, Native.sourceNum(0, 1))
                    done.countDown()
                }
                assertTrue(done.await(5, java.util.concurrent.TimeUnit.SECONDS))
            }
            fun awaitBadge(want: Boolean): Boolean {
                val stop = System.currentTimeMillis() + 8000
                while (world.sunBadge.isNotEmpty() != want && System.currentTimeMillis() < stop)
                    Thread.sleep(10)
                return world.sunBadge.isNotEmpty() == want
            }
            nudgeSun()
            assertTrue("a moved sun must wear the badge", awaitBadge(true))
            assertTrue("the badge must leave by itself while the change still stands",
                awaitBadge(false))
            nudgeSun()
            assertTrue("touching the sun again must bring the badge back", awaitBadge(true))
            world.sunBadgeShowNs = WorldView.SUN_BADGE_SHOW_NS
            world.putSunBack()
            assertTrue(awaitBadge(false))
            println("BOOT GATE: the badge leaves on its own and a further sun change re-arms it")

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
            // Let go first, and WAIT for it. The Observe-mode tap above already left a selection
            // standing, so "wait until specimen != null" was satisfied the moment it was asked
            // and this block read the OLD creature: the gate printed a 4-locus Drifta while the
            // card on screen was a 1-locus Solara. The app was right and the gate was lying —
            // measured 2026-09-02, and the reason `snap` is trustworthy below.
            world.deselect()
            until = System.currentTimeMillis() + 3000
            while (world.specimen != null && System.currentTimeMillis() < until) Thread.sleep(10)
            assertTrue("the previous selection must be let go before this one", world.specimen == null)
            val t3 = SystemClock.uptimeMillis()
            world.onTouchEvent(MotionEvent.obtain(t3, t3, MotionEvent.ACTION_DOWN, cx, cy, 0))
            world.onTouchEvent(MotionEvent.obtain(t3, t3 + 50, MotionEvent.ACTION_UP, cx, cy, 0))
            until = System.currentTimeMillis() + 3000
            while (world.specimen == null && System.currentTimeMillis() < until) Thread.sleep(10)
            val snap = world.specimen
            assertTrue("selecting a creature must publish its card", snap != null)
            assertTrue("the card should carry the creature's traits", snap!!.loci.isNotEmpty() || snap.sp == 0)
            println("BOOT GATE: selection published a structured card (sp ${snap.sp}, ${snap.loci.size} loci)")

            // The specimen card's ORDER (owner, 2026-09-02). It used to open on the numbers —
            // the mono line and the trait tiles — and hide the portrait and the description
            // behind a second tap. Now the first glance is what the creature IS (picture, role,
            // food web, description) plus its energy, and the tiles are the fold.
            //
            // This block was run against the old build before the change and failed on exactly
            // the two visibility claims below: a gate that does not convict the state it is
            // meant to replace proves nothing.
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(300))
            assertTrue("a selection must open the specimen sheet",
                activity.specimenSheet.visibility == android.view.View.VISIBLE)
            assertTrue("the first glance must show the Steckbrief, untouched",
                activity.specimenProfile.visibility == android.view.View.VISIBLE)
            assertTrue("the first glance must fold the trait tiles away",
                activity.specimenTiles.visibility == android.view.View.GONE)
            assertTrue("the Steckbrief must carry words for a founded species",
                activity.profileAbout.text.isNotBlank())
            assertTrue("every founded species ships with its portrait",
                Profiles.portrait(activity, Native.traitText(snap.sp, 0)) != null)
            assertTrue("the portrait slot must show the art",
                activity.profilePortrait.visibility == android.view.View.VISIBLE)
            // The order as the sheet stacks it: who it is, then what it is doing, then the fold.
            val sheet = activity.specimenSheet
            fun at(v: android.view.View) = sheet.indexOfChild(v)
            assertTrue("the Steckbrief must come before the numbers",
                at(activity.specimenProfile) in 1 until at(activity.specimenTiles))
            assertTrue("the fold's own row must sit directly above the tiles",
                at(activity.specimenDetails) == at(activity.specimenTiles) - 1)
            // Lay the sheet out for real before judging it: a VISIBLE flag with zero height is
            // exactly the kind of green a stale layout hands out (the first run of this block
            // photographed a sheet whose unfolded profile had never been measured).
            fun layOut() {
                sheet.measure(
                    android.view.View.MeasureSpec.makeMeasureSpec(world.width, android.view.View.MeasureSpec.EXACTLY),
                    android.view.View.MeasureSpec.makeMeasureSpec(0, android.view.View.MeasureSpec.UNSPECIFIED),
                )
                sheet.layout(0, 0, sheet.measuredWidth, sheet.measuredHeight)
            }
            layOut()
            assertTrue("the Steckbrief must take real space at first glance",
                activity.specimenProfile.height > 0 && activity.profilePortrait.height > 0)
            val firstGlance = sheet.measuredHeight
            photograph(sheet, "specimen@first")

            // Icons, not words: both actions must speak their word to a screen reader, in the
            // locale's own language. An icon with no contentDescription is an unlabelled button.
            val header = sheet.getChildAt(0) as android.widget.LinearLayout
            val actions = header.getChildAt(header.childCount - 1) as android.widget.LinearLayout
            val described = (0 until actions.childCount)
                .map { actions.getChildAt(it) }
                .filterIsInstance<android.widget.ImageButton>()
            assertTrue("the header must carry three icon buttons (feed, kill, close)",
                described.size == 3)
            for (b in described) assertTrue(
                "every icon button must carry the word it replaced",
                !b.contentDescription.isNullOrBlank())
            assertTrue("feed and kill must speak their own labels",
                described[0].contentDescription == Chrome.label(activity, "feed") &&
                described[1].contentDescription == Chrome.label(activity, "kill"))
            println("BOOT GATE: header icons speak ${described.map { it.contentDescription }}")

            // The fold still opens — on the tiles now, and only on the tiles.
            activity.specimenDetails.performClick()
            assertTrue("the disclosure row must unfold the trait tiles",
                activity.specimenTiles.visibility == android.view.View.VISIBLE)
            assertTrue("unfolding must not hide the Steckbrief",
                activity.specimenProfile.visibility == android.view.View.VISIBLE)
            layOut()
            assertTrue("the fold must actually add height",
                sheet.measuredHeight > firstGlance)
            photograph(sheet, "specimen@details")
            activity.specimenDetails.performClick()
            assertTrue("the disclosure row must fold them back",
                activity.specimenTiles.visibility == android.view.View.GONE)

            // BOTH ways out. The finding this was asked to check (src/ui.jsx line 921): the
            // BROWSER's close button clears the card and LEAVES the selection standing, so its
            // 500 ms loop rebuilds the card and the sheet reopens by itself. The app must not
            // do that — so the test does not stop at "the sheet went away", it keeps ticking
            // and demands it stays away.
            activity.specimenClose.performClick()
            var until2 = System.currentTimeMillis() + 3000
            while (world.specimen != null && System.currentTimeMillis() < until2) Thread.sleep(10)
            assertTrue("the close icon must let the selection GO, not just hide the card",
                world.specimen == null && world.selSpecies < 0)
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1500))
            assertTrue("the sheet must stay closed — the render thread must not re-select",
                world.specimen == null && activity.specimenSheet.visibility != android.view.View.VISIBLE)
            println("BOOT GATE: the close icon released the selection, and 1.5 s did not bring it back")

            // ...and the gesture the owner kept: select again, then press back.
            val t4 = SystemClock.uptimeMillis()
            world.onTouchEvent(MotionEvent.obtain(t4, t4, MotionEvent.ACTION_DOWN, cx, cy, 0))
            world.onTouchEvent(MotionEvent.obtain(t4, t4 + 50, MotionEvent.ACTION_UP, cx, cy, 0))
            until2 = System.currentTimeMillis() + 3000
            while (world.specimen == null && System.currentTimeMillis() < until2) Thread.sleep(10)
            assertTrue("a second tap must select again", world.specimen != null)
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(300))
            // This test drives the WorldView directly and never walked the front door, so the
            // start screen is still up — and back correctly exits THAT first. Put the activity
            // in the state a player pressing back on a selection is actually in. (Found by the
            // gate itself: the first run failed here, and the reason was the front door, not
            // the sheet.)
            activity.startPanel.visibility = android.view.View.GONE
            activity.onBackPressed()
            until2 = System.currentTimeMillis() + 3000
            while (world.specimen != null && System.currentTimeMillis() < until2) Thread.sleep(10)
            assertTrue("back must still close the sheet — the gesture stays",
                world.specimen == null && world.selSpecies < 0)
            println("BOOT GATE: both ways out work — the icon and the back gesture")
            println("BOOT GATE: the card opens on the Steckbrief; the tiles are the fold (sp ${snap.sp})")
        } finally {
            world.surfaceDestroyed(world.holder)
        }
    }

    /**
     * L7 (The Second Sun): the level's timeline must run through the REAL render loop — the
     * scripted sun rises on its tick because the loop calls `levelScript` before every step —
     * and the founded sky is locked (no grip through the real gesture pipeline) while the risen
     * sun grips normally.
     */
    @Test
    fun theScriptedSunRisesAndTheFoundedSkyStaysLocked() {
        requireNativeLib()
        org.robolectric.RuntimeEnvironment.setQualifiers("w408dp-h900dp-xxhdpi")
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val world = activity.world
        world.surfaceCreated(world.holder)
        world.surfaceChanged(world.holder, 0, world.width, world.height)
        try {
            // find the outpost row in the shared table, on the render thread (the core lives there)
            val idx = intArrayOf(-1)
            val found = java.util.concurrent.CountDownLatch(1)
            world.post {
                val a = org.json.JSONArray(Native.levelsJson())
                for (i in 0 until a.length())
                    if (a.getJSONObject(i).optString("key") == "outpost") idx[0] = i
                found.countDown()
            }
            assertTrue(found.await(5, java.util.concurrent.TimeUnit.SECONDS))
            assertTrue("the shared table should carry L7", idx[0] >= 0)
            world.speed = 0.0
            world.startLevel(idx[0], -1, arrayOf("S", "D"), arrayOf("", ""), 12000)
            // walk to the eve of the sunrise the way the loop does (hook, then step)
            val eve = java.util.concurrent.CountDownLatch(1)
            world.post {
                while (Native.tick() < 1990) { Native.markPrev(); Native.levelScript(); Native.step() }
                eve.countDown()
            }
            assertTrue("the fast-forward never finished", eve.await(30, java.util.concurrent.TimeUnit.SECONDS))
            // now the REAL loop carries the world across t=2000 — the loop itself must fire the script
            world.speed = 16.0
            val suns = intArrayOf(0)
            val until = System.currentTimeMillis() + 20000
            while (suns[0] < 2 && System.currentTimeMillis() < until) {
                val read = java.util.concurrent.CountDownLatch(1)
                world.post { suns[0] = Native.sourceCount(); read.countDown() }
                assertTrue(read.await(5, java.util.concurrent.TimeUnit.SECONDS))
                if (suns[0] < 2) Thread.sleep(50)
            }
            world.speed = 0.0
            assertTrue("the render loop should raise the scripted sun at t=2000", suns[0] == 2)
            println("BOOT GATE: the scripted second sun rose through the real loop")

            // the founded sun refuses the grip; the risen one grips — the real gesture pipeline
            world.intervene = true
            val cx = world.width / 2f
            val cy = world.height / 2f
            fun parkOn(k: Int) {
                val parked = java.util.concurrent.CountDownLatch(1)
                world.post {
                    world.cam.x = Native.sourceNum(k, 0)
                    world.cam.y = Native.sourceNum(k, 1)
                    parked.countDown()
                }
                assertTrue(parked.await(5, java.util.concurrent.TimeUnit.SECONDS))
            }
            fun tapCentre() {
                val t = SystemClock.uptimeMillis()
                world.onTouchEvent(MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, cx, cy, 0))
                world.onTouchEvent(MotionEvent.obtain(t, t + 50, MotionEvent.ACTION_UP, cx, cy, 0))
            }
            parkOn(0)
            tapCentre()
            Thread.sleep(400)
            assertTrue("the founded sun must refuse the grip (L7 lock)", world.sunSel < 0)
            assertTrue("the lock must be published for the UI", world.homeSunLocked)
            parkOn(1)
            tapCentre()
            val grip = System.currentTimeMillis() + 3000
            while (world.sunSel < 0 && System.currentTimeMillis() < grip) Thread.sleep(10)
            assertTrue("the risen sun must grip", world.sunSel == 1)
            println("BOOT GATE: founded sky locked, risen sun grips (L7)")
        } finally {
            world.stopLevel()
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
        // The menu thumbnails (tools/level-thumbs.js): SP's lesson is that a picture must take
        // laid-out space, not merely exist — require at least one row's captured moment measured.
        fun thumbs(v: android.view.View): Int = when (v) {
            is PortraitView ->
                if (v.visibility == android.view.View.VISIBLE && v.width > 0 && v.height > 0) 1 else 0
            is android.view.ViewGroup -> (0 until v.childCount).sumOf { thumbs(v.getChildAt(it)) }
            else -> 0
        }
        assertTrue("the experiment menu should show at least one gameplay thumbnail",
            thumbs(activity.expPanel) > 0)
        activity.expPanel.visibility = android.view.View.GONE
        // The help page (2026-09-02): it is the one screen a beginner meets before anything else,
        // and it reads the CORE for its species names, colours and portraits — so an empty card
        // means the page lost the world, not merely a string. Photographed for the same reason
        // the front door is: no one in this container can look at it otherwise.
        activity.startPanel.getChildAt(5).performClick() // help
        assertTrue("the help page should open from the front door",
            activity.helpPanel.visibility == android.view.View.VISIBLE)
        fun texts(v: android.view.View): List<String> = when (v) {
            is android.widget.TextView -> listOf(v.text.toString())
            is android.view.ViewGroup -> (0 until v.childCount).flatMap { texts(v.getChildAt(it)) }
            else -> emptyList()
        }
        val help = texts(activity.helpPanel)
        for (sp in listOf("Solara", "Drifta", "Cilio", "Bacillus", "Venator"))
            assertTrue("the help page should profile $sp", help.any { it == sp })
        assertTrue("every species card should carry its real-world model",
            help.count { it.contains("Modelled on") || it.contains("Vorbild") } == 5)
        assertTrue("the mineral diagram should be drawn, not described",
            texts(activity.helpPanel).isNotEmpty() &&
                countCycles(activity.helpPanel) == 1)
        photograph(activity.helpPanel, "help@boot")
        activity.onBackPressed()
        assertTrue("back should close the help page",
            activity.helpPanel.visibility != android.view.View.VISIBLE)

        // GR.7: the optic switch. It is a view, so the test's whole claim is that a tap flips the
        // state both switches read, that the world hears it, and that the label follows — whether
        // the light field LOOKS right is WorldCameraTest's photograph and the owner's device.
        val darkLabel = activity.opticButton.text.toString()
        activity.opticRow.performClick()
        assertTrue("tapping the optic should put the world in the light field", activity.world.lightField)
        assertTrue("the drawer's switch must say the same thing as the front door's",
            activity.opticButton.text.toString() != darkLabel)
        photograph(activity.startPanel, "frontdoor@light")
        activity.opticRow.performClick()
        assertTrue("tapping it again should return the dark field", !activity.world.lightField)
        assertTrue("the label must come back with it",
            activity.opticButton.text.toString() == darkLabel)
        // Phase 9: the sandbox row opens the water chooser, and a start world founds from there.
        activity.startPanel.getChildAt(2).performClick() // sandbox
        assertTrue("choosing sandbox should open the water chooser",
            activity.startsPanel.visibility == android.view.View.VISIBLE)
        assertTrue("a first launch has no kept pond to continue",
            activity.keptPondRow.visibility != android.view.View.VISIBLE)
        photograph(activity.startsPanel, "starts")
        // the chooser is [title][scrolling list][back]; the list is [kept pond][every start world]
        val startsList = ((activity.startsPanel.getChildAt(1) as android.widget.ScrollView)
            .getChildAt(0) as android.widget.LinearLayout)
        assertTrue("every start world the core carries must have a row",
            startsList.childCount == Native.startCount() + 1)
        startsList.getChildAt(3).performClick() // the third start world: two suns
        assertTrue("choosing water should close the chooser",
            activity.startsPanel.visibility != android.view.View.VISIBLE)
        assertTrue("choosing water should close the front door",
            activity.startPanel.visibility != android.view.View.VISIBLE)
        assertTrue("choosing water should start the pond", activity.world.speed == 1.0)
        // The founding itself is queued for the render thread (this test has no surface, so it
        // never runs here) — what the shell owes is the choice: StartsTest founds the worlds.
        assertTrue("the chosen start is the one the world stands in", activity.world.startIdx == 2)
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
     * The armed touch tools (owner round 3): feed and kill are no longer selection errands — an
     * armed hand feeds or erases what a tap or drag touches. This drives the real gesture
     * pipeline with the kill tool armed and requires the creature under the finger to die, the
     * tap NOT to select (an armed hand and an open specimen drawer were round 3's overlap mess),
     * and the undo chip to appear while the kill is fresh.
     */
    @Test
    fun theArmedToolTouchesTheWorld() {
        requireNativeLib()
        org.robolectric.RuntimeEnvironment.setQualifiers("w408dp-h900dp-xxhdpi")
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val world = activity.world
        world.surfaceCreated(world.holder)
        world.surfaceChanged(world.holder, 0, world.width, world.height)
        try {
            world.speed = 0.0
            world.intervene = true
            world.toolArmed = WorldView.TOOL_KILL
            // park the camera on a living creature, read on the render thread where the core lives
            val spot = DoubleArray(4)
            val found = java.util.concurrent.CountDownLatch(1)
            world.post {
                val n = Native.scalar(0).toInt()
                for (i in 0 until n) if (Native.org(i, 0) != 0.0) {
                    spot[0] = Native.org(i, 3); spot[1] = Native.org(i, 4)
                    spot[2] = 1.0; spot[3] = i.toDouble(); break
                }
                found.countDown()
            }
            assertTrue(found.await(5, java.util.concurrent.TimeUnit.SECONDS))
            assertTrue("a founded world should hold something alive", spot[2] == 1.0)
            world.cam.x = spot[0]
            world.cam.y = spot[1]
            val t = SystemClock.uptimeMillis()
            val cx = activity.world.width / 2f
            val cy = activity.world.height / 2f
            world.onTouchEvent(MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, cx, cy, 0))
            world.onTouchEvent(MotionEvent.obtain(t, t + 50, MotionEvent.ACTION_UP, cx, cy, 0))
            val dead = java.util.concurrent.CountDownLatch(1)
            val alive = DoubleArray(1) { 1.0 }
            val until = System.currentTimeMillis() + 3000
            while (System.currentTimeMillis() < until) {
                val probe = java.util.concurrent.CountDownLatch(1)
                world.post { alive[0] = Native.org(spot[3].toInt(), 0); probe.countDown() }
                probe.await(5, java.util.concurrent.TimeUnit.SECONDS)
                if (alive[0] == 0.0) { dead.countDown(); break }
                Thread.sleep(10)
            }
            assertTrue("the armed kill tool must erase the creature under the tap", alive[0] == 0.0)
            assertTrue("an armed tool's tap must not select", world.specimen == null)
            assertTrue("a fresh kill must offer its undo", world.undoKind != 0)
            println("BOOT GATE: the armed kill tool erased the creature it touched, without selecting")
        } finally {
            world.toolArmed = 0
            world.intervene = false
            world.surfaceDestroyed(world.holder)
        }
    }

    /**
     * The evolution and sun levers (EV): the Evolution panel's mutation toggle and presets, and
     * the sun card's layouts, driven through the same methods their buttons call, against the
     * real core. What it proves: the three new JNI wrappers work (evMutation, evLocus, locusGet),
     * a preset is one bundle that actually moves sigma, and a layout reshapes the sky.
     */
    @Test
    fun theEvolutionAndSunLeversDriveTheCore() {
        requireNativeLib()
        org.robolectric.RuntimeEnvironment.setQualifiers("w408dp-h900dp-xxhdpi")
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val world = activity.world
        world.surfaceCreated(world.holder)
        world.surfaceChanged(world.holder, 0, world.width, world.height)
        val looper = shadowOf(Looper.getMainLooper())
        fun onCore(f: () -> Double): Double {
            val out = DoubleArray(1)
            val l = java.util.concurrent.CountDownLatch(1)
            world.post { out[0] = f(); l.countDown() }
            assertTrue("render thread went quiet", l.await(5, java.util.concurrent.TimeUnit.SECONDS))
            return out[0]
        }
        try {
            world.speed = 0.0
            activity.evoPanel.open()
            onCore { 0.0 } // the fetch has run once this returns
            looper.idle()  // and its UI-thread build is delivered
            assertTrue("the panel should be open", activity.evoPanel.isOpen())
            photograph(activity.evoPanel.view, "evolution@panel")

            val before = onCore { Native.scalar(50) }
            activity.evoPanel.gateToggleMutation()
            val after = onCore { Native.scalar(50) }
            assertTrue("the mutation toggle must reach the core", before != after)
            activity.evoPanel.gateToggleMutation()
            looper.idle()

            val s0 = onCore { Native.locusGet(1, 0, 0) } // Drifta's display locus, sigma
            activity.evoPanel.gatePreset(2) // wild: sigma = min(0.12, 2 * shipped)
            val wild = onCore { Native.locusGet(1, 0, 0) }
            assertTrue("preset wild must raise sigma ($s0 -> $wild)", wild > s0 + 1e-12)
            activity.evoPanel.gatePreset(0) // shipped: back to founding values
            val back = onCore { Native.locusGet(1, 0, 0) }
            assertTrue("preset shipped must restore sigma ($back != $s0)", Math.abs(back - s0) < 1e-9)
            looper.idle()
            activity.evoPanel.close()

            // the sun card's layouts reshape the sky as one intervention
            world.intervene = true
            world.sunSel = 0
            activity.applyLayout(1) // second sun
            assertTrue("the twin layout must add a source", onCore { Native.sourceCount().toDouble() } == 2.0)
            activity.applyLayout(0) // one sun
            assertTrue("the one-sun layout must remove it", onCore { Native.sourceCount().toDouble() } == 1.0)
            looper.idleFor(Duration.ofMillis(300)) // a HUD tick, so the sun sheet shows
            assertTrue("a gripped sun must open its card", activity.sunSheet.visibility == android.view.View.VISIBLE)
            photograph(activity.sunSheet, "sun@card")
            println("BOOT GATE: evolution and sun levers drive the core (mutation, preset, layout, card)")
        } finally {
            world.intervene = false
            world.sunSel = -1
            world.surfaceDestroyed(world.holder)
        }
    }

    /**
     * The owner's experiment-save report, played back (2026-09-02): "world state is saved but the
     * fact that I run an experiment is not." A save taken mid-experiment must carry the
     * experiment (snapshot format v2), and loading it back must land the shell in that
     * experiment — running level adopted, meters labelled, the front door offering to continue —
     * not in a sandbox wearing the experiment's world.
     */
    @Test
    fun theExperimentSurvivesSaveAndLoad() {
        requireNativeLib()
        org.robolectric.RuntimeEnvironment.setQualifiers("w408dp-h900dp-xxhdpi")
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val world = activity.world
        world.surfaceCreated(world.holder)
        world.surfaceChanged(world.holder, 0, world.width, world.height)
        try {
            world.speed = 0.0
            // L7 again: the richest runtime — a scripted sunrise, a region census ring, a budget
            val idx = intArrayOf(-1)
            val found = java.util.concurrent.CountDownLatch(1)
            world.post {
                val a = org.json.JSONArray(Native.levelsJson())
                for (i in 0 until a.length())
                    if (a.getJSONObject(i).optString("key") == "outpost") idx[0] = i
                found.countDown()
            }
            assertTrue(found.await(5, java.util.concurrent.TimeUnit.SECONDS))
            assertTrue(idx[0] >= 0)
            world.startLevel(idx[0], 1, arrayOf("S", "D"), arrayOf("", ""), 12000)
            // across the scripted sunrise, driven exactly as the render loop drives it
            val ran = java.util.concurrent.CountDownLatch(1)
            world.post {
                while (Native.tick() < 2500) { Native.markPrev(); Native.levelScript(); Native.step() }
                Native.levelCheck()
                ran.countDown()
            }
            assertTrue("the fast-forward never finished", ran.await(60, java.util.concurrent.TimeUnit.SECONDS))

            // save mid-experiment, then walk away to a fresh sandbox world
            val saved = java.util.concurrent.atomic.AtomicReference<ByteArray?>()
            world.save { b -> saved.set(b) }
            var until = System.currentTimeMillis() + 5000
            while (saved.get() == null && System.currentTimeMillis() < until) {
                shadowOf(Looper.getMainLooper()).idle(); Thread.sleep(10)
            }
            val bytes = saved.get()
            assertTrue("the mid-experiment save never arrived", bytes != null && bytes.isNotEmpty())
            world.stopLevel()
            world.resetWorld(99)

            // load it back: the core must be mid-experiment again, and the shell must adopt it
            val loaded = java.util.concurrent.atomic.AtomicInteger(-1)
            world.load(bytes!!) { ok -> loaded.set(if (ok) 1 else 0) }
            until = System.currentTimeMillis() + 5000
            while (loaded.get() < 0 && System.currentTimeMillis() < until) {
                shadowOf(Looper.getMainLooper()).idle(); Thread.sleep(10)
            }
            assertTrue("the snapshot must load", loaded.get() == 1)
            val core = DoubleArray(4)
            val read = java.util.concurrent.CountDownLatch(1)
            world.post {
                core[0] = Native.levelNum(0) // state
                core[1] = Native.levelNum(1) // level index
                core[2] = Native.tick().toDouble()
                core[3] = Native.sourceCount().toDouble()
                read.countDown()
            }
            assertTrue(read.await(5, java.util.concurrent.TimeUnit.SECONDS))
            assertTrue("the loaded world must be running the experiment", core[0] == 1.0)
            assertTrue("the loaded world must be running L7", core[1].toInt() == idx[0])
            assertTrue("the loaded world resumes at the save's tick", core[2] >= 2500.0)
            assertTrue("the scripted second sun must have survived the round trip", core[3] == 2.0)

            world.meterLabels = emptyArray() // so adoption's own labels are what the assert sees
            activity.adoptCoreLevel()
            until = System.currentTimeMillis() + 5000
            while (world.meterLabels.isEmpty() && System.currentTimeMillis() < until) {
                shadowOf(Looper.getMainLooper()).idle(); Thread.sleep(10)
            }
            assertTrue("the shell must adopt the loaded experiment's meters", world.meterLabels.isNotEmpty())
            assertTrue("the front door must offer to continue the experiment",
                activity.continueRow.visibility == android.view.View.VISIBLE)
            println("BOOT GATE: a mid-experiment save restores the experiment, and the shell adopts it")
        } finally {
            world.stopLevel()
            world.surfaceDestroyed(world.holder)
        }
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
