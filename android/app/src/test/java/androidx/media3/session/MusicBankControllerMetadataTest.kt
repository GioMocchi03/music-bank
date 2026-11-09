package androidx.media3.session

import android.app.Application
import android.os.Bundle
import androidx.media3.common.MediaItem
import io.servergio.giomusic.MusicBankAutoService
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * Checks what Media3 sends to other processes (Media3 controllers, legacy MediaBrowserCompat
 * clients such as Android Auto, System UI): it must never contain Subsonic credentials.
 * Lives in Media3's package to reach the internal LegacyConversions used for legacy clients.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE, application = Application::class)
class MusicBankControllerMetadataTest {
  private val secrets = listOf("zz-user", "tokenvalue", "saltvalue", "streamtoken")
  private val auth = "u=zz-user&t=tokenvalue&s=saltvalue&v=1.16.1&c=music-bank&f=json"
  private fun cover(id: String) = "https://music.test/rest/getCoverArt.view?$auth&id=$id&size=500"
  private fun stream(id: String) = "https://music.test/rest/stream.view?u=zz-user&t=streamtoken&s=saltvalue&id=$id"

  private val json = """{
    "albums":[{"id":"a","name":"Test Album","artistId":"r","year":1981,"coverUrl":"${cover("al-a")}"}],
    "artists":[{"id":"r","name":"Test Artist","artistImageUrl":"${cover("ar-r")}"}],
    "genres":[{"value":"Rock","sourceValues":["Rock"]}],
    "playlists":[{"id":"p1","name":"Mix","songIds":["two","one"],"coverUrl":"${cover("pl-p1")}"}],
    "radios":[{"id":"st1","name":"Station","streamUrl":"https://radio.test/stream"}],
    "songs":[
      {"id":"one","title":"First Track","album":"Test Album","albumId":"a","artist":"Test Artist","artistId":"r","genre":"Rock","starred":"now","track":1,"year":1981,"coverUrl":"${cover("al-a")}","streamUrl":"${stream("one")}"},
      {"id":"two","title":"Second Track","album":"Test Album","albumId":"a","artist":"Test Artist","artistId":"r","genre":"Rock","track":2,"year":1981,"coverUrl":"${cover("al-a")}","streamUrl":"${stream("two")}"}
    ]
  }"""

  private fun catalogue() = MusicBankAutoService.AutoCatalogue().apply {
    load(File.createTempFile("auto-secure", ".json").apply { writeText(json); deleteOnExit() })
  }

  private fun browseAll(catalogue: MusicBankAutoService.AutoCatalogue): List<MediaItem> {
    val seen = linkedMapOf<String, MediaItem>()
    val pending = ArrayDeque(listOf(catalogue.root))
    while (pending.isNotEmpty()) {
      val item = pending.removeFirst()
      if (seen.put(item.mediaId, item) != null) continue
      pending += catalogue.children(item.mediaId)
    }
    listOf("Test", "Track", "Mix", "Station").forEach { query -> catalogue.search(query).forEach { seen[it.mediaId] = it } }
    return seen.values.toList()
  }

  @Suppress("DEPRECATION")
  private fun flatten(value: Any?): List<String> = when (value) {
    null -> emptyList()
    is Bundle -> value.keySet().flatMap { listOf(it) + flatten(value.get(it)) }
    is Iterable<*> -> value.flatMap(::flatten)
    is Array<*> -> value.flatMap(::flatten)
    else -> listOf(value.toString())
  }

  private fun assertNoSecrets(where: String, values: List<String>) {
    values.forEach { value -> secrets.forEach { assertFalse("$where leaks $it: $value", value.contains(it)) } }
  }

  @Test fun browsingSearchAndLegacyMetadataExposeNoCredentials() {
    val items = browseAll(catalogue())
    assertTrue(items.any { it.mediaId == "song:one" } && items.any { it.mediaId == "playlist:p1:song:two" })
    items.forEach { item ->
      // Media3 controllers in other processes receive MediaItem.toBundle().
      assertNoSecrets("${item.mediaId} bundle", flatten(item.toBundle()))
      val legacy = LegacyConversions.convertToBrowserItem(item, null).description
      assertNoSecrets(
        "${item.mediaId} legacy description",
        listOfNotNull(legacy.iconUri?.toString(), legacy.mediaUri?.toString()) + flatten(legacy.extras),
      )
      val nowPlaying = LegacyConversions.convertToMediaMetadataCompat(
        item.mediaMetadata, item.mediaId, item.requestMetadata.mediaUri, 0L, null,
      )
      assertNoSecrets("${item.mediaId} legacy metadata", flatten(nowPlaying.bundle))
    }
  }

  @Test fun artworkStaysAvailableAsLocalContentUris() {
    val catalogue = catalogue()
    val artwork = listOf("song:one", "playlist:p1:song:two", "album:a", "artist:r", "playlist:p1", "year:1981", "genre:Rock")
      .associateWith { catalogue.item(it)?.mediaMetadata?.artworkUri?.toString() }
    artwork.forEach { (id, uri) ->
      assertTrue("$id artwork: $uri", uri.orEmpty().startsWith("content://io.servergio.giomusic.artwork/"))
    }
    assertEquals(artwork["song:one"], artwork["album:a"])
    assertNotEquals(artwork["album:a"], artwork["artist:r"])
    assertNull(catalogue.item("radio:st1")!!.mediaMetadata.artworkUri)
  }

  @Test fun inProcessPlaybackKeepsTheAuthenticatedStreamAndQueueContext() {
    val catalogue = catalogue()
    // localConfiguration stays in-process for ExoPlayer; Media3 strips it for other processes.
    assertEquals(stream("one"), catalogue.playableItem("song:one")!!.localConfiguration!!.uri.toString())
    assertEquals(stream("two"), catalogue.playableItem("playlist:p1:song:two")!!.localConfiguration!!.uri.toString())
    assertNull(MediaItem.fromBundle(catalogue.playableItem("song:one")!!.toBundle()).localConfiguration)
    assertEquals(listOf("song:one", "song:two"), catalogue.playbackContext("song:two").map { it.mediaId })
    assertEquals(listOf("song:two", "song:one"), catalogue.playbackContext("playlist:p1:song:one").map { it.mediaId })
  }
}
