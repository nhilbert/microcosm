package org.microcosm.app

import android.content.Context

/**
 * The display-side translation of the core's own words (DE.4).
 *
 * The app's chrome is ordinary Android localization (res/values-de). This object handles the
 * text the CORE produces — narration sentences, locus labels, pole words, level fail reasons —
 * which cannot be translated at the source because the English is certified, gated behavior
 * (K6, heat gate, the levels honesty gate all assert on it; the level table is inside the hashed
 * core). So the core keeps speaking English and the shell translates what it shows.
 *
 * The honesty rule throughout: a sentence nothing here matches is shown in English, never
 * paraphrased. Untranslated is a gap; a guessed translation would be a lie about what the
 * Observatory said.
 */
object L10n {

    /** Whether the display language is German. Set once at boot from the shell's configuration. */
    @Volatile var de = false
        private set

    private var patterns: List<Regex> = emptyList()
    private var templates: Array<String> = emptyArray()
    private val vocab = HashMap<String, String>() // lowercased English → German
    private val whys = HashMap<String, String>()  // level fail reasons, exact English → German

    fun init(ctx: Context) {
        de = ctx.resources.configuration.locales[0].language == "de"
        if (!de) return
        patterns = ctx.resources.getStringArray(R.array.narration_patterns).map { Regex(it) }
        templates = ctx.resources.getStringArray(R.array.narration_de)
        val en = ctx.resources.getStringArray(R.array.trait_vocab_en)
        val deW = ctx.resources.getStringArray(R.array.trait_vocab_de)
        for (k in en.indices) vocab[en[k].lowercase()] = deW[k]
    }

    /** A locus label or pole word, translated; anything unknown passes through unchanged. */
    fun trait(s: String): String {
        if (!de) return s
        return vocab[s.lowercase()] ?: s
    }

    /** Register a level's fail-reason translations (Levels.kt, from the overlay). */
    fun addWhys(map: Map<String, String>) = whys.putAll(map)

    /** A level's fail reason — exact-match against the overlay, English when unknown. */
    fun why(s: String): String = if (de) whys[s] ?: s else s

    /**
     * One narration sentence from the core, translated by template. `{n}` takes capture n
     * verbatim (numbers, species names), `{wn}` sends it through the trait vocabulary,
     * `{ln}` the same for a locus label (narration lowercases them; the vocab doesn't care).
     */
    fun narrate(s: String): String {
        if (!de) return s
        for ((k, re) in patterns.withIndex()) {
            val m = re.matchEntire(s) ?: continue
            return Regex("\\{([wl]?)(\\d)\\}").replace(templates[k]) { ph ->
                val cap = m.groupValues[ph.groupValues[2].toInt()]
                if (ph.groupValues[1].isEmpty()) cap else trait(cap)
            }
        }
        return s
    }
}
