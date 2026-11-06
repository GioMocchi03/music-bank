package io.servergio.giomusic

import android.app.Application
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE, application = Application::class)
class AutoCatalogueTest {
  private val json = """{
    "albums":[{"id":"a","name":"Test Album","artist":"Test Artist","artistId":"r","year":1981}],
    "artists":[{"id":"r","name":"Test Artist"}],
    "genres":[{"value":"Hip-Hop","sourceValues":["Raw Rap"]}],
    "playlists":[{"id":"p1","name":"Mix","owner":"demo","songIds":["two","one"]}],
    "radios":[{"id":"st1","name":"Station","streamUrl":"https://radio.test/stream","homePageUrl":"https://radio.test"}],
    "songs":[
      {"id":"one","title":"First Track","album":"Test Album","albumId":"a","artist":"Test Artist","artistId":"r","genre":"Raw Rap","starred":"now","track":1,"year":1981,"streamUrl":"https://example.test/one?auth=original"},
      {"id":"two","title":"Second Track","album":"Test Album","albumId":"a","artist":"Test Artist","artistId":"r","genre":"Raw Rap","track":2,"year":1981,"streamUrl":"https://example.test/two"}
    ]
  }"""
  private fun file(): File = File.createTempFile("auto-catalog", ".json").apply { writeText(json); deleteOnExit() }

  @Test fun phoneEntitiesAndCanonicalGenresAreNavigableAndSearchable() {
    val catalog = MusicBankAutoService.AutoCatalogue().apply { load(file()) }
    assertEquals(4, catalog.children("music-bank-root").size)
    assertEquals(listOf("album:a"), catalog.children("music-bank-albums").map { it.mediaId })
    assertEquals(listOf("artist:r"), catalog.children("music-bank-artists").map { it.mediaId })
    val genre = catalog.children("music-bank-genres").single()
    assertEquals("Hip-Hop", genre.mediaMetadata.title.toString())
    assertEquals(2, catalog.children(genre.mediaId).size)
    assertEquals("album:a", catalog.children("artist:r").single().mediaId)
    assertTrue(catalog.search("Test Artist").any { it.mediaId == "artist:r" })
    assertTrue(catalog.search("Test Album").any { it.mediaId == "album:a" })
    assertTrue(catalog.search("hip hop").any { it.mediaId == genre.mediaId })
    assertEquals("song:one", catalog.search("First Track").single().mediaId)
    assertTrue(catalog.search("not present").isEmpty())
  }

  @Test fun favoritesAreVisibleAndDoNotChangePlayableStreams() {
    val catalog = MusicBankAutoService.AutoCatalogue().apply { load(file()) }
    assertEquals("music-bank-favorites", catalog.children("music-bank-tracks").first().mediaId)
    val favorite = catalog.children("music-bank-favorites").single()
    assertEquals("song:one", favorite.mediaId)
    assertEquals("https://example.test/one?auth=original", favorite.localConfiguration!!.uri.toString())
    assertEquals(listOf("song:one", "song:two"), catalog.playbackContext(favorite.mediaId).map { it.mediaId })
  }

  @Test fun collectionsMirrorThePhoneLibraryHub() {
    val catalog = MusicBankAutoService.AutoCatalogue().apply { load(file()) }
    assertEquals(
      listOf("music-bank-albums", "music-bank-artists", "music-bank-tracks", "music-bank-collections"),
      catalog.children("music-bank-root").map { it.mediaId },
    )
    assertEquals(
      listOf("music-bank-genres", "music-bank-favorites", "music-bank-playlists", "music-bank-radios", "music-bank-years"),
      catalog.children("music-bank-collections").map { it.mediaId },
    )
    // Playlist order and radio stations survive as playable, container-scoped entries.
    assertEquals(
      listOf("playlist:p1:song:two", "playlist:p1:song:one"),
      catalog.children("playlist:p1").map { it.mediaId },
    )
    assertEquals(
      listOf("song:two", "song:one"),
      catalog.playbackContext("playlist:p1:song:two").map { it.mediaId },
    )
    val station = catalog.children("music-bank-radios").single()
    assertEquals("radio:st1", station.mediaId)
    assertEquals("https://radio.test/stream", station.localConfiguration!!.uri.toString())
    assertEquals(listOf(station.mediaId), catalog.playbackContext("radio:st1").map { it.mediaId })
    assertEquals(listOf("album:a"), catalog.children("year:1981").map { it.mediaId })
    assertTrue(catalog.search("Mix").any { it.mediaId == "playlist:p1" })
    assertTrue(catalog.search("Station").any { it.mediaId == "radio:st1" })
  }

  @Test fun legacyCataloguesWithoutCollectionsStillWork() {
    val legacy = File.createTempFile("auto-legacy", ".json").apply {
      writeText("""{"songs":[{"id":"old","title":"Legacy","streamUrl":"https://example.test/old","year":1990}]}""")
      deleteOnExit()
    }
    val catalog = MusicBankAutoService.AutoCatalogue().apply { load(legacy) }
    assertEquals(
      listOf("music-bank-genres", "music-bank-years"),
      catalog.children("music-bank-collections").map { it.mediaId },
    )
    assertEquals(listOf("song:old"), catalog.children("year:1990").map { it.mediaId })
  }

  @Test fun refreshInvalidatesSearchAndFavoriteState() {
    val source = file()
    val catalog = MusicBankAutoService.AutoCatalogue().apply { load(source) }
    assertTrue(catalog.search("First Track").isNotEmpty())
    val stamp = source.lastModified()
    source.writeText(json.replace("First Track", "Renamed Track").replace("\"starred\":\"now\",", ""))
    source.setLastModified(stamp + 2000)
    catalog.reloadIfChanged()
    assertTrue(catalog.search("First Track").isEmpty())
    assertEquals("song:one", catalog.search("Renamed Track").single().mediaId)
    assertTrue(catalog.children("music-bank-favorites").isEmpty())
  }

  @Test fun corruptUpdateRetainsUsableCatalogueAndLegacyFilesStillWork() {
    val source = file()
    val catalog = MusicBankAutoService.AutoCatalogue().apply { load(source) }
    val stamp = source.lastModified()
    source.writeText("broken json")
    source.setLastModified(stamp + 2000)
    catalog.reloadIfChanged()
    assertEquals("song:one", catalog.search("First Track").single().mediaId)
    source.writeText("""{"songs":[{"id":"old","title":"Legacy Track","streamUrl":"https://example.test/old"}]}""")
    source.setLastModified(stamp + 4000)
    catalog.reloadIfChanged()
    assertEquals("song:old", catalog.search("Legacy").single().mediaId)
    assertEquals(1, catalog.children("music-bank-albums").size)
  }
}
