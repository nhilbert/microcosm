package org.microcosm.app

import android.content.Context
import org.json.JSONArray

/**
 * The sandbox start worlds, as the front door offers them.
 *
 * This is not a second definition of anything. The table lives in the core (`starts.rs`), is
 * calibrated there (`harness/starts.js`, eight seeds to the 18,000-tick horizon), and crosses as
 * the JSON `Native.startsJson()` carries. What the shell owns is the WORDS — and those are
 * ordinary localized resources keyed by the core's own key, exactly as [Profiles] keys a species
 * portrait by the core's species name. A start the shell has no words for shows its key rather
 * than a blank row: untranslated is honest, invented is not.
 */
class Start(val idx: Int, val key: String) {

    fun title(ctx: Context): String = res(TITLES)?.let { ctx.getString(it) } ?: key
    fun subtitle(ctx: Context): String = res(SUBS)?.let { ctx.getString(it) } ?: ""

    private fun res(m: Map<String, Int>) = m[key]

    companion object {
        private val TITLES = mapOf(
            "pond" to R.string.start_pond,
            "still" to R.string.start_still,
            "twosuns" to R.string.start_twosuns,
            "refuge" to R.string.start_refuge,
            "shallows" to R.string.start_shallows,
        )
        private val SUBS = mapOf(
            "pond" to R.string.start_pond_sub,
            "still" to R.string.start_still_sub,
            "twosuns" to R.string.start_twosuns_sub,
            "refuge" to R.string.start_refuge_sub,
            "shallows" to R.string.start_shallows_sub,
        )

        /** The table in the core's own order — the index IS what [Native.startWorld] takes. */
        fun all(): List<Start> = try {
            val a = JSONArray(Native.startsJson())
            (0 until a.length()).map { Start(it, a.getJSONObject(it).optString("key")) }
        } catch (e: Exception) {
            listOf(Start(0, "pond")) // a broken table costs the choice, never the sandbox
        }
    }
}
