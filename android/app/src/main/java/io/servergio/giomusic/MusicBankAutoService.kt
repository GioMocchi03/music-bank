package io.servergio.giomusic

import android.net.Uri
import android.os.FileObserver
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.media3.common.Player
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
  private var observer: FileObserver? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  private fun refresh() {
    catalogue.load(File(filesDir, CATALOGUE_FILE))
    librarySession?.let { session ->
      catalogue.parentIds().forEach { id ->
        session.notifyChildrenChanged(id, catalogue.children(id).size, null)
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    activeService = this
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
    @Suppress("DEPRECATION")
    val watcher = object : FileObserver(filesDir.path, FileObserver.MOVED_TO or FileObserver.CLOSE_WRITE or FileObserver.DELETE) {
      override fun onEvent(event: Int, path: String?) {
        if (path == CATALOGUE_FILE) mainHandler.post { refresh() }
      }
    }
    observer = watcher
    watcher.startWatching()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? {
    // Consente ai browser multimediali esterni, incluso Android Auto,
    // di collegarsi alla sessione. Media3 gestisce i comandi della sessione.
    return librarySession
  }

  override fun onDestroy() {
    observer?.stopWatching()
    observer = null
    mainHandler.removeCallbacksAndMessages(null)
    if (activeService === this) activeService = null
    librarySession?.release()
    librarySession = null
    player?.release()
    player = null
    super.onDestroy()
  }

  private class CatalogueCallback(
    private val catalogue: AutoCatalogue,
  ) : MediaLibrarySession.Callback {
    override fun onSubscribe(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      parentId: String,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<Void>> {
      catalogue.reloadIfChanged()
      session.notifyChildrenChanged(browser, parentId, catalogue.children(parentId).size, params)
      return Futures.immediateFuture(LibraryResult.ofVoid(params))
    }

    override fun onGetLibraryRoot(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<MediaItem>> {
      catalogue.reloadIfChanged()
      return Futures.immediateFuture(LibraryResult.ofItem(catalogue.root, LibraryParams.Builder()
        .setExtras(Bundle().apply {
          putBoolean("android.media.browse.SEARCH_SUPPORTED", true)
        }).build()))
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
      // Complete the command before delivering the result event. Legacy Auto browsers
      // bridge this event to their pending MediaBrowserCompat search request.
      val count = catalogue.search(query).size
      Handler(Looper.getMainLooper()).post {
        session.notifySearchResultChanged(browser, query, count, params)
      }
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

    override fun onSetMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: List<MediaItem>,
      startIndex: Int,
      startPositionMs: Long,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
      catalogue.reloadIfChanged()
      if (mediaItems.size == 1 && mediaItems.first().localConfiguration == null) {
        val requested = mediaItems.first().mediaId
        val context = catalogue.playbackContext(requested)
        if (context.isNotEmpty()) {
          val index = context.indexOfFirst { it.mediaId == requested }.coerceAtLeast(0)
          return Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(context, index, startPositionMs))
        }
      }
      val resolved = mediaItems.mapNotNull { item ->
        item.takeIf { it.localConfiguration != null } ?: catalogue.playableItem(item.mediaId)
      }
      if (resolved.size != mediaItems.size) return Futures.immediateFailedFuture(IllegalArgumentException("Unknown media ID"))
      return Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(resolved, startIndex, startPositionMs))
    }

    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: List<MediaItem>,
    ): ListenableFuture<List<MediaItem>> {
      catalogue.reloadIfChanged()
      val resolved = mediaItems.mapNotNull { requested ->
        requested.takeIf { it.localConfiguration != null } ?: catalogue.playableItem(requested.mediaId)
      }
      return Futures.immediateFuture(resolved)
    }

    private fun paginate(items: List<MediaItem>, page: Int, pageSize: Int): List<MediaItem> {
      if (page < 0 || pageSize <= 0) return emptyList()
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
    private var searchIndex = emptyList<Pair<MediaItem, List<String>>>()
    private val searchCache = object : LinkedHashMap<String, List<MediaItem>>(16, 0.75f, true) {
      override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<MediaItem>>): Boolean = size > 16
    }

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

    fun parentIds(): Set<String> = childrenById.keys

    fun playbackContext(mediaId: String): List<MediaItem> {
      val song = songs.firstOrNull { it.mediaId == mediaId } ?: return emptyList()
      val sameAlbum = songs.filter {
        if (song.albumId != null) it.albumId == song.albumId
        else it.album == song.album && it.artist == song.artist
      }.sortedWith(compareBy<AutoSong> { it.discNumber }.thenBy { it.track })
      return sameAlbum.mapNotNull { playableItem(it.mediaId) }
    }

    fun children(parentId: String): List<MediaItem> = childrenById[parentId].orEmpty()

    fun item(mediaId: String): MediaItem? = itemsById[mediaId]

    fun playableItem(mediaId: String): MediaItem? =
      itemsById[mediaId]?.takeIf { it.mediaMetadata.isPlayable == true }

    fun search(query: String): List<MediaItem> {
      val needle = normalizeAutoQuery(query)
      if (needle.isBlank()) return emptyList()
      return searchCache.getOrPut(needle) {
        // Bound the legacy Binder response, including short queries matching thousands
        // of tracks. Return navigable artists, albums and genres as well as playable songs.
        searchAutoIndex(searchIndex, needle, { item ->
          when {
            item.mediaId.startsWith("artist:") -> 0
            item.mediaId.startsWith("album:") -> 1
            item.mediaId.startsWith("genre:") -> 1
            else -> 2
          }
        })
      }
    }

    private fun readFile() {
      val file = sourceFile ?: return
      val modified = if (file.exists()) file.lastModified() else -1L
      val parsed = try {
        if (!file.exists()) emptyList() else parseSongs(file.readText())
      } catch (_: Exception) { return }
      songs = parsed
      lastModified = modified
      rebuildIndex()
    }

    private fun parseSongs(json: String): List<AutoSong> {
      val array = JSONObject(json).getJSONArray("songs")
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
        songs.groupBy { albumKey(it) },
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

      songs.groupBy { it.artistId ?: it.artist ?: "Artista sconosciuto" }.forEach { (key, group) ->
        childIndex["artist:${Uri.encode(key)}"] = group
          .map { "album:${Uri.encode(albumKey(it))}" }.distinct().mapNotNull { itemIndex[it] }
          .sortedBy { it.mediaMetadata.title.toString().lowercase(Locale.ITALIAN) }
      }
      // Search the original entities, never synthetic browse sections. Normalize once
      // per catalogue refresh rather than repeatedly scanning/allocating on each query.
      searchIndex = itemIndex.values.filter {
        it.mediaId.startsWith("song:") || it.mediaId.startsWith("album:") || it.mediaId.startsWith("artist:") || it.mediaId.startsWith("genre:")
      }.map { item ->
        item to listOfNotNull(item.mediaMetadata.title, item.mediaMetadata.artist,
          item.mediaMetadata.albumTitle, item.mediaMetadata.genre).map { normalizeAutoQuery(it.toString()) }
      }
      searchCache.clear()
      // Legacy Auto does not necessarily request subsequent API pages. Keep every
      // entity accessible through named alphabetical sections instead of numeric pages.
      childIndex.toMap().forEach { (parent, children) ->
        if (children.size > 100) {
          val sections = browseSections(children) { it.mediaMetadata.title.toString() }
          childIndex[parent] = sections.mapIndexed { index, section ->
            val id = "section:$parent:$index"
            childIndex[id] = section.items
            browsable(id, section.title).also { itemIndex[id] = it }
          }
        }
      }
      itemsById = itemIndex
      childrenById = childIndex
    }

    private fun albumKey(song: AutoSong): String = song.albumId
      ?: "${song.artist.orEmpty()}\u0000${song.album ?: "Album sconosciuto"}"

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
    fun currentAudioSessionId(): Int = activeService?.player?.audioSessionId ?: 0
    private var activeService: MusicBankAutoService? = null
    fun refreshCatalogue() { activeService?.refresh() }
  }
}
