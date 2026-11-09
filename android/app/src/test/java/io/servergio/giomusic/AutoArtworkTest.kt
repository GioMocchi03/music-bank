package io.servergio.giomusic

import android.app.Application
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.sun.net.httpserver.HttpServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.FileNotFoundException
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicInteger

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE, application = Application::class)
class AutoArtworkTest {
  private val image = byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte(), 1, 2, 3)
  private val hits = AtomicInteger()
  private val queries = mutableListOf<String>()
  private lateinit var server: HttpServer
  private lateinit var provider: AutoArtworkProvider

  @Before fun start() {
    server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
      createContext("/rest/getCoverArt.view") { exchange ->
        hits.incrementAndGet()
        synchronized(queries) { queries += exchange.requestURI.rawQuery.orEmpty() }
        val json = exchange.requestURI.rawQuery.orEmpty().contains("id=error")
        val body = if (json) """{"subsonic-response":{"status":"failed"}}""".toByteArray() else image
        exchange.responseHeaders.add("Content-Type", if (json) "application/json" else "image/png")
        exchange.sendResponseHeaders(200, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
      }
      start()
    }
    provider = Robolectric.setupContentProvider(AutoArtworkProvider::class.java, AutoArtwork.AUTHORITY)
  }

  @After fun stop() {
    server.stop(0)
  }

  private fun cover(id: String, salt: String, user: String = "alice") =
    "http://127.0.0.1:${server.address.port}/rest/getCoverArt.view?u=$user&t=token$salt&s=$salt&v=1.16.1&c=music-bank&f=json&id=$id&size=500"

  private fun read(uri: Uri): ByteArray =
    ParcelFileDescriptor.AutoCloseInputStream(provider.openFile(uri, "r")).use { it.readBytes() }

  @Test fun authenticatedUrlsBecomeOpaqueContentUris() {
    val uri = AutoArtwork.localUri(cover("al-1", "salt1"))!!
    assertEquals("content", uri.scheme)
    assertEquals("io.servergio.giomusic.artwork", uri.authority)
    listOf("alice", "token", "salt1", "u=", "t=", "s=", "127.0.0.1").forEach {
      assertFalse("$it leaked in $uri", uri.toString().contains(it))
    }
    // A fresh salt keeps the same artwork key; another cover gets another one.
    assertEquals(uri, AutoArtwork.localUri(cover("al-1", "salt2")))
    assertNotEquals(uri, AutoArtwork.localUri(cover("al-2", "salt1")))
    assertNull(AutoArtwork.localUri(null))
    assertNull(AutoArtwork.localUri("  "))
    val resource = "android.resource://io.servergio.giomusic/drawable/cover"
    assertEquals(resource, AutoArtwork.localUri(resource).toString())
  }

  @Test fun providerLoadsTheImageWithTheLatestCredentialsAndCachesIt() {
    AutoArtwork.localUri(cover("al-cache", "first"))
    val uri = AutoArtwork.localUri(cover("al-cache", "second"))!!
    assertArrayEquals(image, read(uri))
    assertEquals(1, hits.get())
    assertTrue(queries.single().contains("t=tokensecond&s=second"))
    assertArrayEquals(image, read(uri))
    assertEquals(1, hits.get())
  }

  @Test fun providerRejectsUnknownNonImageAndWritableRequests() {
    val unknown = Uri.parse("content://${AutoArtwork.AUTHORITY}/${"0".repeat(64)}")
    assertThrows(FileNotFoundException::class.java) { provider.openFile(unknown, "r") }
    val traversal = Uri.parse("content://${AutoArtwork.AUTHORITY}/..%2F..%2Fshared_prefs")
    assertThrows(FileNotFoundException::class.java) { provider.openFile(traversal, "r") }
    val error = AutoArtwork.localUri(cover("error", "salt"))!!
    val failure = assertThrows(FileNotFoundException::class.java) { provider.openFile(error, "r") }
    assertFalse(failure.message.orEmpty().contains("token"))
    assertThrows(SecurityException::class.java) { provider.openFile(error, "w") }
    assertThrows(SecurityException::class.java) { provider.openFile(error, "rw") }
  }

  @Test fun usersDoNotShareArtworkAndLogoutForgetsIt() {
    val context = RuntimeEnvironment.getApplication()
    val alice = AutoArtwork.localUri(cover("al-user", "a1"))!!
    val bob = AutoArtwork.localUri(cover("al-user", "b1", user = "bob"))!!
    assertNotEquals(alice, bob)
    // Offline downloads can mix accounts in one queue: every signed cover stays loadable.
    assertNotNull(AutoArtwork.remoteUrl(alice.lastPathSegment!!))
    assertArrayEquals(image, read(alice))
    assertArrayEquals(image, read(bob))
    assertTrue(queries[0].contains("u=alice&") && queries[1].contains("u=bob&"))

    AutoArtwork.clear(context)
    assertFalse(AutoArtwork.cacheDir(context).exists())
    assertNull(AutoArtwork.remoteUrl(alice.lastPathSegment!!))
    assertNull(AutoArtwork.remoteUrl(bob.lastPathSegment!!))
    assertThrows(FileNotFoundException::class.java) { provider.openFile(alice, "r") }
    assertThrows(FileNotFoundException::class.java) { provider.openFile(bob, "r") }
    assertEquals(2, hits.get())
  }
}
