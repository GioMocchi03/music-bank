package io.servergio.giomusic

import android.content.ContentProvider
import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/**
 * Keeps authenticated Subsonic artwork URLs (`u`/`t`/`s`) inside the app process.
 * Media controllers, including Android Auto and any other MediaBrowser, only receive opaque
 * content:// URIs, which [AutoArtworkProvider] resolves to image bytes.
 */
internal object AutoArtwork {
  const val AUTHORITY = "${BuildConfig.APPLICATION_ID}.artwork"
  private val CREDENTIAL_PARAMS = setOf("u", "p", "t", "s", "apikey")
  private val KEY = Regex("^[0-9a-f]{64}$")
  private val remoteByKey = ConcurrentHashMap<String, String>()

  /** Returns the controller-visible URI for [url]; http(s) URLs never leave the process. */
  fun localUri(url: String?): Uri? {
    val value = url?.trim()?.takeIf { it.isNotEmpty() && it != "null" } ?: return null
    val remote = Uri.parse(value)
    val scheme = remote.scheme?.lowercase(Locale.ROOT)
    if (scheme != "http" && scheme != "https") return remote
    val key = keyFor(remote)
    remoteByKey[key] = value
    return Uri.Builder().scheme(ContentResolver.SCHEME_CONTENT).authority(AUTHORITY).appendPath(key).build()
  }

  fun remoteUrl(key: String): String? = remoteByKey[key]

  fun isKey(value: String): Boolean = KEY.matches(value)

  fun cacheDir(context: Context): File = File(context.cacheDir, "auto-artwork")

  /** Stable across fresh salts, so one artwork keeps one cached file. Credentials are excluded. */
  private fun keyFor(remote: Uri): String {
    val query = remote.queryParameterNames
      .filter { it.lowercase(Locale.ROOT) !in CREDENTIAL_PARAMS }
      .sorted()
      .joinToString("&") { name -> remote.getQueryParameters(name).joinToString("&") { "$name=$it" } }
    val port = if (remote.port >= 0) ":${remote.port}" else ""
    val canonical = "${remote.scheme?.lowercase(Locale.ROOT)}://${remote.host?.lowercase(Locale.ROOT)}$port${remote.path.orEmpty()}?$query"
    return MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray())
      .joinToString("") { "%02x".format(it) }
  }
}

/** Read-only artwork for media controllers, as recommended for Android Auto media artwork. */
class AutoArtworkProvider : ContentProvider() {
  override fun onCreate(): Boolean = true

  override fun getType(uri: Uri): String = "image/*"

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    if (mode != "r") throw SecurityException("Artwork is read-only")
    val context = context ?: throw FileNotFoundException("Artwork unavailable")
    val key = uri.pathSegments.singleOrNull()?.takeIf {
      uri.authority == AutoArtwork.AUTHORITY && AutoArtwork.isKey(it)
    } ?: throw FileNotFoundException("Unknown artwork")
    val directory = AutoArtwork.cacheDir(context).apply { mkdirs() }
    val file = File(directory, key)
    if (!file.isFile) {
      // Never put the remote URL in exception messages: they reach the calling app.
      val remote = AutoArtwork.remoteUrl(key) ?: throw FileNotFoundException("Unknown artwork")
      download(remote, directory, file)
      trim(directory)
    } else {
      file.setLastModified(System.currentTimeMillis())
    }
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  private fun download(remote: String, directory: File, target: File) {
    val temporary = File.createTempFile("download", ".part", directory)
    try {
      val connection = URL(remote).openConnection() as HttpURLConnection
      try {
        connection.connectTimeout = TIMEOUT_MS
        connection.readTimeout = TIMEOUT_MS
        connection.instanceFollowRedirects = true
        // Subsonic reports errors as 200 + JSON/XML: only cache real images.
        if (connection.responseCode != HttpURLConnection.HTTP_OK ||
          connection.contentType?.lowercase(Locale.ROOT)?.startsWith("image/") != true
        ) throw FileNotFoundException("Artwork unavailable")
        connection.inputStream.use { input ->
          temporary.outputStream().use { output ->
            val buffer = ByteArray(16 * 1024)
            var total = 0L
            while (true) {
              val read = input.read(buffer)
              if (read < 0) break
              total += read
              if (total > MAX_IMAGE_BYTES) throw FileNotFoundException("Artwork too large")
              output.write(buffer, 0, read)
            }
          }
        }
      } finally {
        connection.disconnect()
      }
      if (!temporary.renameTo(target) && !target.isFile) throw FileNotFoundException("Artwork unavailable")
    } catch (error: IOException) {
      throw error as? FileNotFoundException ?: FileNotFoundException("Artwork unavailable")
    } finally {
      temporary.delete()
    }
  }

  private fun trim(directory: File) {
    val files = directory.listFiles { file -> file.isFile && AutoArtwork.isKey(file.name) }.orEmpty()
    var size = files.sumOf { it.length() }
    if (size <= MAX_CACHE_BYTES) return
    for (file in files.sortedBy { it.lastModified() }) {
      if (size <= TRIMMED_CACHE_BYTES) break
      val length = file.length()
      if (file.delete()) size -= length
    }
  }

  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String>?,
    sortOrder: String?,
  ): Cursor? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException()

  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int =
    throw UnsupportedOperationException()

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int =
    throw UnsupportedOperationException()

  private companion object {
    const val TIMEOUT_MS = 15_000
    const val MAX_IMAGE_BYTES = 8L * 1024 * 1024
    const val MAX_CACHE_BYTES = 64L * 1024 * 1024
    const val TRIMMED_CACHE_BYTES = 48L * 1024 * 1024
  }
}
