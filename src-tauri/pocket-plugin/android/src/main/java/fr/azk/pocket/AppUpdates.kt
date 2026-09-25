package fr.azk.pocket

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.plugin.JSObject
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONArray
import org.json.JSONObject

internal class AppUpdates(private val activity: Activity) {
    private val worker = Executors.newSingleThreadExecutor()
    private val folder = File(activity.cacheDir, "updates").apply { mkdirs() }
    private val apk = File(folder, "mochi.apk")
    private val meta = File(folder, "release.json")
    private val cancel = AtomicBoolean(false)
    @Volatile private var phase = "idle"
    @Volatile private var error = ""
    @Volatile private var received = 0L
    @Volatile
    private var release: JSONObject? =
        try {
            JSONObject(meta.readText())
        } catch (_: Exception) {
            null
        }

    private fun version() =
        activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "0.0.0"

    private fun parts(v: String) = v.removePrefix("v").split('.').map { it.toIntOrNull() ?: -1 }

    private fun newer(v: String): Boolean {
        val a = parts(v)
        val b = parts(version())
        if (a.size != 3 || a.any { it < 0 }) return false
        for (i in 0..2) {
            if (a[i] != b[i]) return a[i] > b[i]
        }
        return false
    }

    fun status(): JSObject {
        val r = release
        return JSObject()
            .put("supported", Build.SUPPORTED_ABIS.contains("arm64-v8a"))
            .put("current", version())
            .put("phase", phase)
            .put("error", error)
            .put("received", received)
            .put("release", r)
            .put("ready", apk.exists() && r != null && newer(r.optString("version")))
            .put("available", r != null && newer(r.optString("version")))
            .put("canInstall", activity.packageManager.canRequestPackageInstalls())
    }

    @Synchronized
    fun check() {
        if (phase in listOf("checking", "downloading")) return
        phase = "checking"
        error = ""
        worker.execute {
            try {
                val releases =
                    JSONArray(
                        RemoteFiles.json(
                            "https://api.github.com/repos/azksama/ComfyPocket/releases?per_page=30"
                        )
                    )
                var best: JSONObject? = null
                for (i in 0 until releases.length()) {
                    val r = releases.getJSONObject(i)
                    val tag = r.optString("tag_name")
                    if (
                        r.optBoolean("draft") ||
                            r.optBoolean("prerelease") ||
                            !tag.matches(Regex("v[0-9]+\\.[0-9]+\\.[0-9]+")) ||
                            !newer(tag)
                    )
                        continue
                    val assets = r.getJSONArray("assets")
                    for (j in 0 until assets.length()) {
                        val a = assets.getJSONObject(j)
                        val expected = "Mochi-${tag.drop(1)}-Android-arm64.apk"
                        val url = a.optString("browser_download_url")
                        val sha = a.optString("digest").removePrefix("sha256:")
                        val size = a.optLong("size")
                        if (
                            a.optString("name") == expected &&
                                url ==
                                    "https://github.com/azksama/ComfyPocket/releases/download/$tag/$expected" &&
                                sha.matches(Regex("[0-9a-f]{64}")) &&
                                size in 1..250_000_000
                        ) {
                            val candidate =
                                JSONObject()
                                    .put("version", tag.drop(1))
                                    .put("url", url)
                                    .put("sha256", sha)
                                    .put("size", size)
                            if (best == null || compare(tag, best!!.getString("version")) > 0)
                                best = candidate
                        }
                    }
                }
                val changed = release?.optString("sha256") != best?.optString("sha256")
                if (changed) apk.delete()
                release = best
                if (best == null) meta.delete() else meta.writeText(best.toString())
                phase = "idle"
            } catch (e: Exception) {
                error = e.message ?: "Update check failed"
                phase = "error"
            }
        }
    }

    private fun compare(a: String, b: String): Int {
        val x = parts(a)
        val y = parts(b)
        for (i in 0..2) if (x[i] != y[i]) return x[i].compareTo(y[i])
        return 0
    }

    @Synchronized
    fun download() {
        check(phase !in listOf("checking", "downloading")) { "Update busy" }
        val r = release ?: error("No update")
        require(newer(r.getString("version")))
        phase = "downloading"
        error = ""
        received = 0
        cancel.set(false)
        worker.execute {
            try {
                RemoteFiles.download(
                    r.getString("url"),
                    apk,
                    r.getLong("size"),
                    r.getString("sha256"),
                    cancel,
                ) {
                    received = it
                }
                verify()
                phase = "ready"
            } catch (e: Exception) {
                apk.delete()
                phase = if (cancel.get()) "idle" else "error"
                error = if (cancel.get()) "" else e.message ?: "Download failed"
            }
        }
    }

    private fun verify() {
        val r = release ?: error("No update")
        require(
            apk.isFile &&
                apk.length() == r.getLong("size") &&
                RemoteFiles.hash(apk) == r.getString("sha256")
        ) {
            "Integrity check failed"
        }
        val pm = activity.packageManager
        val incoming =
            pm.getPackageArchiveInfo(apk.path, PackageManager.GET_SIGNING_CERTIFICATES)
                ?: error("Invalid APK")
        val current =
            pm.getPackageInfo(activity.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        require(
            incoming.packageName == activity.packageName &&
                incoming.longVersionCode > current.longVersionCode &&
                incoming.versionName == r.getString("version")
        ) {
            "Wrong app or version"
        }
        val installed =
            current.signingInfo?.apkContentsSigners ?: error("Missing signing certificate")
        val signatures = incoming.signingInfo?.apkContentsSigners ?: error("Unsigned APK")
        require(
            installed.size == signatures.size &&
                installed.all { old -> signatures.any { it == old } }
        ) {
            "Signing certificate mismatch"
        }
    }

    fun install(done: (String?) -> Unit) {
        worker.execute {
            try {
                verify()
                activity.runOnUiThread {
                    try {
                        if (!activity.packageManager.canRequestPackageInstalls()) {
                            activity.startActivity(
                                Intent(
                                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:${activity.packageName}"),
                                )
                            )
                            done("permission")
                        } else {
                            val uri =
                                FileProvider.getUriForFile(
                                    activity,
                                    "${activity.packageName}.updates",
                                    apk,
                                )
                            activity.startActivity(
                                Intent(Intent.ACTION_VIEW)
                                    .setDataAndType(uri, "application/vnd.android.package-archive")
                                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            )
                            done(null)
                        }
                    } catch (e: Exception) {
                        done(e.message ?: "Installer unavailable")
                    }
                }
            } catch (e: Exception) {
                done(e.message ?: "Installation failed")
            }
        }
    }

    fun cancel() {
        cancel.set(true)
    }

    fun close() {
        cancel()
        worker.shutdown()
    }
}
