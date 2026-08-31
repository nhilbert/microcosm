package org.microcosm.app

import org.json.JSONArray
import org.json.JSONObject

/**
 * The level table, parsed from the JSON the core carries.
 *
 * This is not a second definition of anything: `src/observatory/levels.json` is inlined into the
 * built core, generated into `levels_gen.rs`, and handed over here verbatim. The predicates are
 * evaluated by the core (`levels.rs`), whose verdicts the honesty gate proves identical on both
 * cores; what the shell reads out of the JSON is the player text and the meter labels.
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
        fun all(): List<Level> {
            val a = JSONArray(Native.levelsJson())
            return (0 until a.length()).map { Level(a.getJSONObject(it)) }
        }
    }
}
