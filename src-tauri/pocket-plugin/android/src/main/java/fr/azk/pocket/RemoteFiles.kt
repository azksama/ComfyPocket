package fr.azk.pocket

import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean

internal object RemoteFiles {
    private fun allowed(url: URL): Boolean =
        url.protocol == "https" &&
            url.userInfo == null &&
            (url.port == -1 || url.port == 443) &&
            (url.host in
                setOf(
                    "api.github.com",
                    "github.com",
                    "release-assets.githubusercontent.com",
                    "objects.githubusercontent.com",
                    "huggingface.co",
                ) || url.host.endsWith(".hf.co") || url.host.endsWith(".huggingface.co"))

    fun open(address: String): HttpURLConnection {
        var url = URL(address)
        repeat(6) {
            require(allowed(url)) { "Download URL not allowed" }
            val c =
                (url.openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = false
                    connectTimeout = 15000
                    readTimeout = 30000
                    setRequestProperty("User-Agent", "Mochi")
                    setRequestProperty("Accept", "application/vnd.github+json")
                }
            val code = c.responseCode
            if (code in 300..399) {
                val next = c.getHeaderField("Location")
                c.disconnect()
                require(next != null)
                url = URL(url, next)
            } else {
                if (code !in 200..299) {
                    c.disconnect()
                    throw IllegalStateException("HTTP $code")
                }
                return c
            }
        }
        error("Too many redirects")
    }

    fun json(address: String): String {
        val c = open(address)
        return try {
            c.inputStream.use { input ->
                val out = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val n = input.read(buffer)
                    if (n < 0) break
                    require(out.size() + n <= 2_000_000) { "Response too large" }
                    out.write(buffer, 0, n)
                }
                out.toString("UTF-8")
            }
        } finally {
            c.disconnect()
        }
    }

    fun hash(file: File): String {
        val d = MessageDigest.getInstance("SHA-256")
        file.inputStream().use {
            val b = ByteArray(65536)
            while (true) {
                val n = it.read(b)
                if (n < 0) break
                d.update(b, 0, n)
            }
        }
        return d.digest().joinToString("") { "%02x".format(it) }
    }

    fun download(
        url: String,
        destination: File,
        size: Long,
        sha: String,
        cancel: AtomicBoolean,
        progress: (Long) -> Unit,
    ) {
        require(size in 1..500_000_000 && sha.matches(Regex("[0-9a-f]{64}")))
        require(destination.parentFile!!.usableSpace > size + 16_000_000) { "Not enough storage" }
        val partial = File(destination.parentFile, destination.name + ".partial")
        partial.delete()
        val c = open(url)
        try {
            require(c.contentLengthLong < 0 || c.contentLengthLong == size) {
                "Unexpected file size"
            }
            var count = 0L
            val digest = MessageDigest.getInstance("SHA-256")
            c.inputStream.use { input ->
                partial.outputStream().use { output ->
                    val b = ByteArray(65536)
                    while (true) {
                        if (cancel.get()) throw CancellationException()
                        val n = input.read(b)
                        if (n < 0) break
                        count += n
                        require(count <= size) { "File too large" }
                        output.write(b, 0, n)
                        digest.update(b, 0, n)
                        progress(count)
                    }
                }
            }
            if (cancel.get()) throw CancellationException()
            require(
                count == size && digest.digest().joinToString("") { "%02x".format(it) } == sha
            ) {
                "Integrity check failed"
            }
            check(partial.renameTo(destination)) { "Unable to save file" }
        } finally {
            c.disconnect()
            partial.delete()
        }
    }
}
