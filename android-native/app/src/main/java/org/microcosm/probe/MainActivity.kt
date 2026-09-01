package org.microcosm.probe

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.widget.ScrollView
import android.widget.TextView
import kotlin.concurrent.thread

/**
 * A diagnostics screen, not the game.
 *
 * Two claims about this port could not be measured in a container: that the arithmetic is
 * bit-exact on ARM64, and how fast the core actually ticks on a phone. Everything else was
 * proved against the JavaScript core on a workstation. This runs the same checks here, on the
 * device, and prints the numbers — after which the Android bit-exactness claim is measured rather
 * than inferred, and the M1 go/no-go has a real number behind it (docs/android-port-plan.md M5.0).
 *
 * The work runs off the main thread: the sim check alone is four 3,000-tick worlds.
 */
class MainActivity : Activity() {

    private lateinit var view: TextView
    private val ui = Handler(Looper.getMainLooper())
    private val report = StringBuilder()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        view = TextView(this).apply {
            typeface = Typeface.MONOSPACE
            textSize = 11f
            setTextColor(Color.parseColor("#E6EDF3"))
            setBackgroundColor(Color.parseColor("#05070C"))
            setPadding(24, 24, 24, 24)
            setTextIsSelectable(true)
        }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#05070C"))
            addView(view, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        }
        setContentView(scroll)

        emit("Microcosm — native core probe")
        emit("device: ${android.os.Build.MODEL} (${android.os.Build.SUPPORTED_ABIS.firstOrNull()})")
        emit("android: ${android.os.Build.VERSION.RELEASE}  sdk ${android.os.Build.VERSION.SDK_INT}")
        emit("")

        thread(name = "microcosm-probe") { runAll() }
    }

    private fun runAll() {
        try {
            emit("SIM — the certified world at 3,000 ticks")
            emit(Native.simCheck().trimEnd())
            emit("")

            emit("MATH — replay of the V8 12.4 trace")
            val trace = assets.open("trace.bin").use { it.readBytes() }
            emit("  trace: ${trace.size / 1024} KiB")
            emit(Native.mathCheck(trace).trimEnd())
            emit("")

            emit("SAVE/LOAD")
            emit(Native.snapshotCheck().trimEnd())
            emit("")

            emit("SPEED — this device")
            emit(Native.perfProbe(1000, 2000).trimEnd())
            emit("")
            emit("For comparison, the same probe on the CI x86-64 runner is recorded in")
            emit("docs/android-port-plan.md; the WebView build (android/) runs the same world in JS.")
        } catch (t: Throwable) {
            // A probe that dies silently is worse than useless — it looks like a pass.
            emit("")
            emit("FAILED: ${t.javaClass.simpleName}: ${t.message}")
            emit(t.stackTraceToString())
        }
    }

    private fun emit(line: String) {
        ui.post {
            report.append(line).append('\n')
            view.text = report
        }
    }
}
