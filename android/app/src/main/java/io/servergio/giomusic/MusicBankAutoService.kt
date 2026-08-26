package io.servergio.giomusic

import android.net.Uri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject
import java.io.File
import java.text.Normalizer
import java.util.Locale

/**
 * Native Media3 catalogue exposed to Android Auto.
 *
 * React Native writes a compact, private catalogue after each Navidrome sync. This service
 * reads that catalogue directly, so the car can browse and start music even when the React
 * Native activity is not open. Every playable item points to Navidrome's authenticated raw
 * stream URL; ExoPlayer therefore receives the original file without requesting transcoding.
 */
class MusicBankAutoService : MediaLibraryService() {
  private var player: ExoPlayer? = null
  private var librarySession: MediaLibrarySession? = null
  private val catalogue = AutoCatalogue()

  override fun onCreate() {
    super.onCreate()
    catalogue.load(File(filesDir, CATALOGUE_FILE))

    val audioAttributes = AudioAttributes.Builder()
      .setUsage(C.USAGE_MEDIA)
      .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
      .build()
    player = ExoPlayer.Builder(this)
      .setAudioAttributes(audioAttributes, true)
      .build()
    librarySession = MediaLibrarySession.Builder(this, player!!, CatalogueCallback(catalogue))
      .setId("music-bank-auto")
      .build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? {
    return if (controllerInfo.isTrusted || controllerInfo.packageName == packageName) {
      librarySession
    } else {
      null
    }
  }

  override fun onDestroy() {
    librarySession?.release()
    librarySession = null
    player?.release()
    player = null
    super.onDestroy()
  }

  private class CatalogueCallback(
    private val catalogue: AutoCatalogue,
  ) : MediaLibrarySession.Callback {
    override fun onGetLibraryRoot(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<MediaItem>> {
      catalogue.reloadIfChanged()
      return Futures.immediateFuture(LibraryResult.ofItem(catalogue.root, params))
    }

    override fun onGetChildren(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      parentId: String,
      page: Int,
      pageSize: Int,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
      catalogue.reloadIfChanged()
      val children = catalogue.children(parentId)
      return Futures.immediateFuture(
        LibraryResult.ofItemList(paginate(children, page, pageSize), params),
      )
    }

    override fun onGetItem(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      mediaId: String,
    ): ListenableFuture<LibraryResult<MediaItem>> {
      catalogue.reloadIfChanged()
      val item = catalogue.item(mediaId)
      return if (item != null) {
        Futures.immediateFuture(LibraryResult.ofItem(item, null))
      } else {
        Futures.immediateFuture(
          LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE, null),
        )
      }
    }

    override fun onSearch(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      query: String,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<Void>> {
      catalogue.reloadIfChanged()
      session.notifySearchResultChanged(browser, query, catalogue.search(query).size, params)
      return Futures.immediateFuture(LibraryResult.ofVoid(params))
    }

    override fun onGetSearchResult(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      query: String,
      page: Int,
      pageSize: Int,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
      catalogue.reloadIfChanged()
      return Futures.immediateFuture(
        LibraryResult.ofItemList(paginate(catalogue.search(query), page, pageSize), params),
      )
    }

    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: List<MediaItem>,
    ): ListenableFuture<List<MediaItem>> {
      catalogue.reloadIfChanged()
      val resolved = mediaItems.mapNotNull { requested ->
        catalogue.playableItem(requested.mediaId) ?: requested.takeIf {
          it.localConfiguration != null
        }
      }
      return Futures.immediateFuture(resolved)
    }

    private fun paginate(items: List<MediaItem>, page: Int, pageSize: Int): List<MediaItem> {
      val from = (page.toLong() * pageSize.toLong()).coerceAtMost(items.size.toLong()).toInt()
      val to = (from.toLong() + pageSize.toLong()).coerceAtMost(items.size.toLong()).toInt()
      return items.subList(from, to)
    }
  }

  private class AutoCatalogue {
    private var sourceFile: File? = null
    private var lastModified = Long.MIN_VALUE
    private var songs = emptyList<AutoSong>()
    private var itemsById = emptyMap<String, MediaItem>()
    private var childrenById = emptyMap<String, List<MediaItem>>()

    val root: MediaItem
      get() = browsable(ROOT_ID, "Music Bank")

    fun load(file: File) {
      sourceFile = file
      readFile()
    }

    fun reloadIfChanged() {
      val file = sourceFile ?: return
      val modified = if (file.exists()) file.lastModified() else -1L
      if (modified != lastModified) readFile()
    }

    fun children(parentId: String): List<MediaItem> = childrenById[parentId].orEmpty()

    fun item(mediaId: String): MediaItem? = itemsById[mediaId]

    fun playableItem(mediaId: String): MediaItem? =
      itemsById[mediaId]?.takeIf { it.mediaMetadata.isPlayable == true }

    fun search(query: String): List<MediaItem> {
      val needle = normalize(query)
      if (needle.isBlank()) return emptyList()
      return songs.asSequence()
        .map { song -> song to searchScore(song, needle) }
        .filter { (_, score) -> score < Int.MAX_VALUE }
        .sortedBy { (_, score) -> score }
        .mapNotNull { (song) -> itemsById[song.mediaId] }
        .take(MAX_SEARCH_RESULTS)
        .toList()
    }

    private fun readFile() {
      val file = sourceFile ?: return
      lastModified = if (file.exists()) file.lastModified() else -1L
      songs = try {
        if (!file.exists()) emptyList() else parseSongs(file.readText())
      } catch (_: Exception) {
        emptyList()
      }
      rebuildIndex()
    }

    private fun parseSongs(json: String): List<AutoSong> {
      val array = JSONObject(json).optJSONArray("songs") ?: return emptyList()
      return buildList {
        for (index in 0 until array.length()) {
          val value = array.optJSONObject(index) ?: continue
          val id = value.optString("id").trim()
          val title = value.optString("title").trim()
          val streamUrl = value.optString("streamUrl").trim()
          if (id.isBlank() || title.isBlank() || streamUrl.isBlank()) continue
          add(
            AutoSong(
              id = id,
              title = title,
              album = value.cleanString("album"),
              albumId = value.cleanString("albumId"),
              artist = value.cleanString("artist"),
              artistId = value.cleanString("artistId"),
              track = value.optInt("track", 0),
              discNumber = value.optInt("discNumber", 0),
              durationSeconds = value.optLong("duration", 0L),
              genre = value.cleanString("genre"),
              artworkUrl = value.cleanString("coverUrl"),
              streamUrl = streamUrl,
            ),
          )
        }
      }
    }

    private fun rebuildIndex() {
      val itemIndex = linkedMapOf<String, MediaItem>()
      val childIndex = linkedMapOf<String, List<MediaItem>>()

      val categories = listOf(
        browsable(ALBUMS_ID, "Album"),
        browsable(ARTISTS_ID, "Artisti"),
        browsable(GENRES_ID, "Generi musicali"),
        browsable(TRACKS_ID, "Brani"),
      )
      itemIndex[ROOT_ID] = root
      categories.forEach { itemIndex[it.mediaId] = it }
      childIndex[ROOT_ID] = categories

      val playableSongs = songs.map { song -> playable(song).also { itemIndex[it.mediaId] = it } }
      childIndex[TRACKS_ID] = playableSongs.sortedBy { it.mediaMetadata.title.toString().lowercase() }

      indexGroups(
        songs.groupBy { it.albumId ?: it.album ?: "Album sconosciuto" },
        ALBUMS_ID,
        "album",
        { group -> group.first().album ?: "Album sconosciuto" },
        itemIndex,
        childIndex,
      )
      indexGroups(
        songs.groupBy { it.artistId ?: it.artist ?: "Artista sconosciuto" },
        ARTISTS_ID,
        "artist",
        { group -> group.first().artist ?: "Artista sconosciuto" },
        itemIndex,
        childIndex,
      )
      indexGroups(
        songs.groupBy { it.genre ?: "Genere sconosciuto" },
        GENRES_ID,
        "genre",
        { group -> group.first().genre ?: "Genere sconosciuto" },
        itemIndex,
        childIndex,
      )

      itemsById = itemIndex
      childrenById = childIndex
    }

    private fun indexGroups(
      groups: Map<String, List<AutoSong>>,
      parentId: String,
      prefix: String,
      title: (List<AutoSong>) -> String,
      itemIndex: MutableMap<String, MediaItem>,
      childIndex: MutableMap<String, List<MediaItem>>,
    ) {
      val folders = groups.entries.map { (key, groupSongs) ->
        val folderId = "$prefix:${Uri.encode(key)}"
        val artwork = groupSongs.firstNotNullOfOrNull { it.artworkUrl }
        val folder = browsable(folderId, title(groupSongs), artwork)
        itemIndex[folderId] = folder
        childIndex[folderId] = groupSongs.mapNotNull { itemIndex[it.mediaId] }
          .sortedWith(
            compareBy<MediaItem> { it.mediaMetadata.discNumber ?: Int.MAX_VALUE }
              .thenBy { it.mediaMetadata.trackNumber ?: Int.MAX_VALUE },
          )
        folder
      }.sortedBy { it.mediaMetadata.title.toString().lowercase() }
      childIndex[parentId] = folders
    }

    private fun playable(song: AutoSong): MediaItem {
      val metadata = MediaMetadata.Builder()
        .setTitle(song.title)
        .setArtist(song.artist)
        .setAlbumTitle(song.album)
        .setGenre(song.genre)
        .setTrackNumber(song.track.takeIf { it > 0 })
        .setDiscNumber(song.discNumber.takeIf { it > 0 })
        .setDurationMs(song.durationSeconds.takeIf { it > 0 }?.times(1000))
        .setArtworkUri(song.artworkUrl?.let(Uri::parse))
        .setIsBrowsable(false)
        .setIsPlayable(true)
        .build()
      return MediaItem.Builder()
        .setMediaId(song.mediaId)
        .setUri(song.streamUrl)
        .setMediaMetadata(metadata)
        .build()
    }

    private fun browsable(mediaId: String, title: String, artworkUrl: String? = null): MediaItem {
      return MediaItem.Builder()
        .setMediaId(mediaId)
        .setMediaMetadata(
          MediaMetadata.Builder()
            .setTitle(title)
            .setArtworkUri(artworkUrl?.let(Uri::parse))
            .setIsBrowsable(true)
            .setIsPlayable(false)
            .build(),
        )
        .build()
    }

    private fun JSONObject.cleanString(key: String): String? {
      return optString(key).trim().takeIf { it.isNotBlank() && it != "null" }
    }

    private fun searchScore(song: AutoSong, query: String): Int {
      val fields = listOf(song.title, song.artist, song.album, song.genre)
        .mapNotNull { it?.let(::normalize) }
      if (fields.any { it == query }) return 0
      if (fields.any { it.startsWith(query) }) return 1
      if (fields.any { it.contains(query) }) return 2
      val compactQuery = query.replace(" ", "")
      if (fields.any { it.replace(" ", "").contains(compactQuery) }) return 3
      return Int.MAX_VALUE
    }

    private fun normalize(value: String): String {
      return Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace("\\p{Mn}+".toRegex(), "")
        .lowercase(Locale.ITALIAN)
        .replace("[^a-z0-9]+".toRegex(), " ")
        .trim()
    }
  }

  private data class AutoSong(
    val id: String,
    val title: String,
    val album: String?,
    val albumId: String?,
    val artist: String?,
    val artistId: String?,
    val track: Int,
    val discNumber: Int,
    val durationSeconds: Long,
    val genre: String?,
    val artworkUrl: String?,
    val streamUrl: String,
  ) {
    val mediaId: String get() = "song:$id"
  }

  companion object {
    private const val CATALOGUE_FILE = "music-bank-auto-catalog.json"
    private const val ROOT_ID = "music-bank-root"
    private const val ALBUMS_ID = "music-bank-albums"
    private const val ARTISTS_ID = "music-bank-artists"
    private const val GENRES_ID = "music-bank-genres"
    private const val TRACKS_ID = "music-bank-tracks"
    private const val MAX_SEARCH_RESULTS = 200
  }
}
