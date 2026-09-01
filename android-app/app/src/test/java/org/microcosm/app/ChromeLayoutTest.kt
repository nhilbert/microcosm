package org.microcosm.app

import android.content.Context
import android.view.ContextThemeWrapper
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * The layout gate, run against every control row the shell ships (`Chrome`), on four device sizes.
 *
 * It is a **ratchet**, not a pass/fail. The app has known layout violations — they are catalogued
 * in docs/app-ux-review.md §1 and are the reason the redesign exists — so failing outright would
 * only mean the gate gets switched off. Instead `layout-baseline.txt` records exactly what is
 * wrong today, and the test fails in two directions:
 *
 *   a violation NOT in the baseline    something new broke
 *   a baseline line that no longer occurs   something was fixed; delete the line
 *
 * The second half is what makes it a ratchet rather than a suppression list: the file can only
 * shrink, and it cannot shrink silently. Same discipline as `conform-baseline.json` — a baseline
 * is a claim about the current state, and it is only worth anything if it is kept true.
 *
 * The rows are built from `Chrome`, which is also what `MainActivity` builds them from. A test
 * that declared its own buttons would agree with a broken app.
 *
 * Note the world is never touched: no `Native`, no core, no render thread. This measures chrome.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromeLayoutTest {

    private fun ctx(): Context = ContextThemeWrapper(
        ApplicationProvider.getApplicationContext(),
        android.R.style.Theme_Material_NoActionBar,
    )

    /** Every row the player can be shown, by the name the baseline knows it as. */
    private fun rows(c: Context) = listOf(
        "bar" to Chrome.row(c, Chrome.BAR),
        "tools" to Chrome.row(c, Chrome.TOOLS),
        "sun" to Chrome.row(c, Chrome.SUN),
        "pages" to Chrome.row(c, Chrome.PAGES),
    )

    @Test
    fun everyControlFitsAndCanBeTouched() {
        val found = LinkedHashMap<String, LayoutGate.Violation>()
        for (p in LayoutGate.PROFILES) {
            // Reconfigure the runtime itself, then build the views. Setting the qualifiers after
            // the views exist would measure them against the previous device.
            RuntimeEnvironment.setQualifiers(p.qualifiers)
            val c = ctx()
            for ((name, row) in rows(c)) for (v in LayoutGate.check(name, row, p)) found[v.key] = v
        }

        val baseline = javaClass.classLoader!!.getResourceAsStream("layout-baseline.txt")!!
            .bufferedReader().readLines()
            .map { it.substringBefore('#').trim() }
            .filter { it.isNotEmpty() }
            .toSet()

        val fresh = found.values.filter { it.key !in baseline }
        val stale = baseline.filter { it !in found.keys }

        if (fresh.isEmpty() && stale.isEmpty()) {
            println("LAYOUT GATE: PASS — ${found.size} known violation(s), all in the baseline, " +
                "across ${LayoutGate.PROFILES.size} device profiles")
            for (v in found.values) println("  $v")
            return
        }

        val msg = StringBuilder("\nLAYOUT GATE\n")
        if (fresh.isNotEmpty()) {
            msg.append("\n  ${fresh.size} NEW violation(s) — the screen got worse:\n")
            for (v in fresh) msg.append("    $v\n")
            msg.append("\n  Fix them, or — if this is a deliberate, recorded regression — add the\n")
            msg.append("  key (the part before the brackets) to layout-baseline.txt with a reason.\n")
        }
        if (stale.isNotEmpty()) {
            msg.append("\n  ${stale.size} baseline line(s) no longer occur — the screen got better:\n")
            for (k in stale) msg.append("    $k\n")
            msg.append("\n  Delete them from layout-baseline.txt. A baseline that outlives its\n")
            msg.append("  violations stops being a record of anything.\n")
        }
        msg.append("\n  ${found.size} violation(s) total across ${LayoutGate.PROFILES.size} device profiles:\n")
        for (v in found.values) msg.append("    $v\n")
        // Printed as well as thrown: an assertion message reaches an HTML report nobody opens,
        // and this list is the entire point of the gate.
        println(msg)
        fail(msg.toString())
    }
}
