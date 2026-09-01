package org.microcosm.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * The level table, parsed from the JSON the core carries.
 *
 * This is not a second definition of anything: `src/observatory/levels.json` is inlined into the
 * built core, generated into `levels_gen.rs`, and handed over here verbatim. The predicates are
 * evaluated by the core (`levels.rs`), whose verdicts the honesty gate proves identical on both
 * cores; what the shell reads out of the JSON is the player text and the meter labels.
 *
 * German (DE.3): when the display language is German, `assets/levels.de.json` is laid over the
 * player-text fields of each level — DISPLAY ONLY. The core keeps judging over its own English
 * table (it is inside the certified hash), so verdicts are identical in every language; the
 * overlay also registers the fail-reason translations with [L10n]. A level the overlay does not
 * carry stays English — untranslated is honest, invented is not.
 */
class Level(private val o: JSONObject) {
    val key: String = o.optString("key")
    val n: Int = o.optInt("n")
    val title: String = o.optString("title")
    val science: String = o.optString("science")
    val question: String = o.optString("question")
    val briefing: String = o.optString("briefing")
    val goalText: String = o.optString("goalText")
    val deadline: Long = o.optLong("deadline")

    val predictPrompt: String get() = o.optJSONObject("predict")?.optString("prompt") ?: ""
    val predictOptions: List<String> get() = strings(o.optJSONObject("predict")?.optJSONArray("options"))
    val predictReflect: List<String> get() = strings(o.optJSONObject("predict")?.optJSONArray("reflect"))

    val debriefPass: String get() = o.optJSONObject("debrief")?.optString("pass") ?: ""
    val debriefFail: String get() = o.optJSONObject("debrief")?.optString("fail") ?: ""

    /** Labels and units, in the order the core reports meter rows. */
    val meterLabels: Array<String> get() = meter { it.optString("label") }
    val meterUnits: Array<String> get() = meter { it.optString("unit", "") }

    private fun meter(f: (JSONObject) -> String): Array<String> {
        val a = o.optJSONArray("meter") ?: return emptyArray()
        return Array(a.length()) { f(a.getJSONObject(it)) }
    }

    private fun strings(a: JSONArray?): List<String> {
        if (a == null) return emptyList()
        return (0 until a.length()).map { a.getString(it) }
    }

    companion object {
        fun all(ctx: Context): List<Level> {
            val a = JSONArray(Native.levelsJson())
            val overlay = if (L10n.de) loadOverlay(ctx) else null
            return (0 until a.length()).map { i ->
                val o = a.getJSONObject(i)
                overlay?.optJSONObject(o.optString("key"))?.let { merge(o, it) }
                Level(o)
            }
        }

        /** Lay the translated player text over one level row; verdicts never read these fields. */
        private fun merge(o: JSONObject, de: JSONObject) {
            for (f in arrayOf("title", "science", "question", "briefing", "goalText"))
                de.optString(f).takeIf { it.isNotEmpty() }?.let { o.put(f, it) }
            de.optJSONObject("predict")?.let { o.put("predict", it) }
            de.optJSONObject("debrief")?.let { o.put("debrief", it) }
            de.optJSONArray("meter")?.let { m ->
                // keep the EN meter row count authoritative: extra overlay rows are ignored
                val base = o.optJSONArray("meter")
                if (base != null && m.length() == base.length()) o.put("meter", m)
            }
            de.optJSONObject("whys")?.let { w ->
                val map = HashMap<String, String>()
                for (k in w.keys()) map[k] = w.getString(k)
                L10n.addWhys(map)
            }
        }

        private fun loadOverlay(ctx: Context): JSONObject? = try {
            JSONObject(ctx.assets.open("levels.de.json").readBytes().decodeToString())
        } catch (e: Exception) {
            null // a missing or broken overlay costs the translation, never the level
        }
    }
}
