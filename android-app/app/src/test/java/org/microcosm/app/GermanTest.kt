package org.microcosm.app

import androidx.test.core.app.ApplicationProvider
import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * The German display layer, exercised (DE.5).
 *
 * The translation is three mechanisms — resource localization, the narration template map, the
 * level-text overlay — and each can rot independently of the others: a regex that stops matching
 * the core's sentence translates NOTHING and fails silently, because "show the English" is the
 * designed fallback. So this gate feeds every pattern a sentence shaped exactly like the core's
 * templates (observatory.rs) and fails if any comes back untranslated. If a narration template
 * ever changes in the core, this is the test that says the German fell behind.
 *
 * What it cannot judge: whether the German reads well. The prose gate holds it to style; the
 * owner reads it. This only proves the machinery routes every sentence.
 *
 * The locale is switched at RUNTIME (`RuntimeEnvironment.setQualifiers`), not in @Config, and
 * the class carries BootTest's exact sandbox signature (sdk AND GraphicsMode — the mode is part
 * of Robolectric's sandbox key): the JVM lets a JNI library live in exactly one classloader, so
 * any config difference from the boot gate would make libmicrocosm.so unloadable here.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
class GermanTest {

    private val ctx: Context
        get() {
            org.robolectric.RuntimeEnvironment.setQualifiers("+de")
            return ApplicationProvider.getApplicationContext()
        }

    /** The core's templates, one worked example each — kept in observatory.rs's order. */
    private val samples = listOf(
        "Venator established — 6 hunters.",
        "Drifta established — 214 strong.",
        "The pack wakes — Venator is hunting.",
        "Cilio has died out.",
        "Drifta bloom under way — up 2.4x in 300 s.",
        "Solara crashing — down 41% in 300 s.",
        "Drifta has reached the limit of its defense — 62% at the tougher edge.",
        "A smooth-running Bacillus line is taking over — 61% of the population and rising.",
        "The tougher Drifta line has taken over — 87% of the population.",
        "Cilio is diversifying — keener and thriftier lines coexist, neither winning.",
        "Drifta differs by patch — tougher near sun 1, faster-growing near sun 2.",
        "Variation collapsing in Solara — the population is becoming uniform.",
        "Variation collapsing in Drifta's warmth preference — the trait is becoming uniform.",
        "Mineral is flowing into dead matter faster than it returns.",
        "Over a third of the world's mineral is locked in dead matter.",
        "Cilio is thinning out of the warm water — down 45% where it is warm.",
        "Dead matter is piling up in the warm water — 6.3 per cell against 1.1 outside.",
        "The pack is starving in the heat — upkeep ×2.1 against meals that scale flatter.",
        "Bacillus is running itself down in the warm water — reserve 4% against a healthy 12%+.",
    )

    @Test
    fun everyNarrationTemplateTranslates() {
        L10n.init(ctx)
        assertTrue("qualifiers=de must make the display language German", L10n.de)
        for (s in samples) {
            val g = L10n.narrate(s)
            assertTrue("untranslated narration: \"$s\"", g != s)
            // species names survive; the sentence's numbers survive
            for (n in Regex("\\d+(?:\\.\\d+)?").findAll(s).map { it.value })
                assertTrue("number $n lost in \"$g\"", g.contains(n))
        }
        // the vocabulary reaches the words inside the sentences
        assertEquals("Abwehr", L10n.trait("Defense"))
        assertEquals("zäher", L10n.trait("tougher"))
        assertEquals("gelöstes Mineral", L10n.trait("dissolved mineral"))
        assertTrue(L10n.narrate(samples[6]).contains("Abwehr"))
        // a sentence the map does not know stays English — the designed, honest fallback
        assertEquals("Something the core never says.", L10n.narrate("Something the core never says."))
        println("GERMAN GATE: all ${samples.size} narration templates translate; vocab routed")
    }

    @Test
    fun chromeSpeaksGerman() {
        L10n.init(ctx)
        assertEquals("füttern", Chrome.label(ctx, "feed"))
        assertEquals("1×", Chrome.label(ctx, "1×")) // keys with no resource show themselves
        assertEquals("Experimente", ctx.getString(R.string.experiments_title))
        // the parallel arrays the display leans on stay parallel (the prose gate checks the
        // files; this checks what the RUNTIME actually loads, after aapt has had its say)
        assertEquals(
            ctx.resources.getStringArray(R.array.narration_patterns).size,
            ctx.resources.getStringArray(R.array.narration_de).size,
        )
        assertEquals(
            ctx.resources.getStringArray(R.array.trait_vocab_en).size,
            ctx.resources.getStringArray(R.array.trait_vocab_de).size,
        )
        assertEquals(17, ctx.resources.getStringArray(R.array.iv_labels).size)
        println("GERMAN GATE: chrome resources resolve under the German locale")
    }

    @Test
    fun levelTableWearsTheOverlay() {
        val dir = System.getProperty("microcosm.native.dir") ?: ""
        assumeTrue(
            "host libmicrocosm.so not found — build it: cd rust/microcosm-android && cargo build --release",
            File(dir, "libmicrocosm.so").exists(),
        )
        Native.boot()
        L10n.init(ctx)
        val levels = Level.all(ctx)
        assertTrue("no levels from the core", levels.isNotEmpty())
        for (l in levels) {
            assertTrue("level ${l.key} untranslated title: ${l.title}",
                l.title.isNotEmpty() && l.title != levelTitleEn(l.key))
            assertTrue("level ${l.key} has no briefing", l.briefing.isNotEmpty())
            assertEquals("level ${l.key} option/reflect mismatch",
                l.predictOptions.size, l.predictReflect.size)
        }
        assertEquals("Erstes Licht", levels[0].title)
        // the fail reasons registered with L10n on the way through
        assertEquals(
            "Die letzte Solara ist gestorben — die Matte hat das Licht nie gefangen.",
            L10n.why("The last Solara died — the mat never caught the light."),
        )
        println("GERMAN GATE: ${levels.size} levels wear the overlay; fail reasons registered")
    }

    /** The English titles, to prove the overlay actually replaced them. */
    private fun levelTitleEn(key: String) = when (key) {
        "light" -> "First Light"; "mineral" -> "The Hungry Water"; "cycle" -> "Everything Flows"
        "garden" -> "The Gardener"; "richer" -> "The Richer Pond"; "hunters" -> "A Head Full of Hunters"
        else -> ""
    }
}
