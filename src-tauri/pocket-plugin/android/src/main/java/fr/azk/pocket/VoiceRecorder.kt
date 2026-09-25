package fr.azk.pocket

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import app.tauri.plugin.JSObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Captures mono PCM in memory. Models and inference live on the paired PC. */
internal class VoiceRecorder {
    private val worker = Executors.newSingleThreadExecutor()
    private val cancelled = AtomicBoolean(false)
    private val stopped = AtomicBoolean(false)
    @Volatile private var phase = "idle"
    @Volatile private var error = ""
    @Volatile private var audio = ""

    fun status() = JSObject().put("supported", true).put("phase", phase).put("error", error)

    @Synchronized
    fun start() {
        check(phase != "recording") { "Une dictée est déjà en cours." }
        cancelled.set(false)
        stopped.set(false)
        audio = ""
        error = ""
        phase = "recording"
        worker.execute {
            var recorder: AudioRecord? = null
            try {
                val minimum =
                    AudioRecord.getMinBufferSize(
                        16000,
                        AudioFormat.CHANNEL_IN_MONO,
                        AudioFormat.ENCODING_PCM_16BIT,
                    )
                check(minimum > 0) { "Microphone indisponible." }
                recorder =
                    AudioRecord(
                        MediaRecorder.AudioSource.VOICE_RECOGNITION,
                        16000,
                        AudioFormat.CHANNEL_IN_MONO,
                        AudioFormat.ENCODING_PCM_16BIT,
                        maxOf(minimum, 4096),
                    )
                check(recorder.state == AudioRecord.STATE_INITIALIZED) {
                    "Microphone indisponible."
                }
                recorder.startRecording()
                val result = ByteArrayOutputStream()
                val buffer = ByteArray(4096)
                val limit = 16000 * 2 * 60
                while (!stopped.get() && !cancelled.get() && result.size() < limit) {
                    val count = recorder.read(buffer, 0, minOf(buffer.size, limit - result.size()))
                    check(count >= 0) { "Lecture du microphone interrompue." }
                    result.write(buffer, 0, count)
                }
                if (cancelled.get()) {
                    phase = "idle"
                } else {
                    check(result.size() >= 3200) { "Dictée trop courte." }
                    audio = Base64.encodeToString(result.toByteArray(), Base64.NO_WRAP)
                    phase = "complete"
                }
            } catch (e: Exception) {
                phase = if (cancelled.get()) "idle" else "error"
                error = if (cancelled.get()) "" else e.message ?: "Enregistrement impossible."
            } finally {
                try {
                    recorder?.stop()
                } catch (_: Exception) {}
                recorder?.release()
            }
        }
    }

    fun stop() {
        stopped.set(true)
    }

    fun cancel() {
        cancelled.set(true)
        stopped.set(true)
        audio = ""
        if (phase != "recording") phase = "idle"
    }

    @Synchronized
    fun take(): JSObject {
        check(phase == "complete") { "Dictée indisponible." }
        val result = JSObject().put("audio", audio)
        audio = ""
        phase = "idle"
        return result
    }

    fun background() {
        cancel()
    }

    fun close() {
        cancel()
        worker.shutdown()
    }
}
