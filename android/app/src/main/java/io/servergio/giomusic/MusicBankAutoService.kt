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
import com.google.common.util.concurrent.SettableFuture
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.concurrent.Executor
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

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
  @Volatile private var catalogue = AutoCatalogue()
  private var observer: FileObserver? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private val mainExecutor = Executor { mainHandler.post(it) }
  // Parsing a multi-megabyte catalogue and rebuilding its indexes must never block the UI.
  private val catalogueLoader: ExecutorService = Executors.newSingleThreadExecutor { task ->
    Thread(task, "music-bank-auto-catalogue").apply { isDaemon = true }
  }
  private val refreshQueued = AtomicBoolean(false)
  private val initialLoad: SettableFuture<Unit> = SettableFuture.create()
  @Volatile private var attemptedStamp = Long.MIN_VALUE
  @Volatile private var destroyed = false

  private fun catalogueStamp(file: File): Long = if (file.exists()) file.lastModified() else -1L

  /** Bridge refreshes and FileObserver events for the same write collapse into one load. */
  private fun refresh() {
    if (destroyed || !refreshQueued.compareAndSet(false, true)) return
    try {
      catalogueLoader.execute(::loadCatalogue)
    } catch (_: RejectedExecutionException) {
      // FileObserver events can race with onDestroy() shutting the loader down.
      refreshQueued.set(false)
    }
  }

  private fun loadCatalogue() {
    refreshQueued.set(false)
    val file = File(filesDir, CATALOGUE_FILE)
    val stamp = catalogueStamp(file)
    if (stamp == attemptedStamp) {
      initialLoad.set(Unit)
      return
    }
    attemptedStamp = stamp
    if (stamp == -1L) AutoArtwork.clear(this)
    val next = AutoCatalogue().apply { load(file) }
    mainHandler.post {
      if (destroyed) return@post
      // A corrupt update keeps the last usable catalogue, as reloadIfChanged() does.
      if (next.isLoaded) {
        catalogue = next
        librarySession?.let { session ->
          next.parentIds().forEach { id ->
            session.notifyChildrenChanged(id, next.children(id).size, null)
          }
        }
      }
      initialLoad.set(Unit)
    }
  }

  private fun currentCatalogue(): AutoCatalogue {
    if (catalogueStamp(File(filesDir, CATALOGUE_FILE)) != attemptedStamp) refresh()
    return catalogue
  }

  override fun onCreate() {
    super.onCreate()
    activeService = this
    refresh()

    val audioAttributes = AudioAttributes.Builder()
      .setUsage(C.USAGE_MEDIA)
      .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
      .build()
    player = ExoPlayer.Builder(this)
      .setAudioAttributes(audioAttributes, true)
      .build()
    librarySession = MediaLibrarySession.Builder(
      this,
      player!!,
      CatalogueCallback(::currentCatalogue, initialLoad, mainExecutor),
    )
      .setId("music-bank-auto")
      .build()
    @Suppress("DEPRECATION")
    val watcher = object : FileObserver(filesDir.path, FileObserver.MOVED_TO or FileObserver.CLOSE_WRITE or FileObserver.DELETE) {
      override fun onEvent(event: Int, path: String?) {
        if (path == CATALOGUE_FILE) refresh()
      }
    }
    observer = watcher
    watcher.startWatching()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? {
    // Consente ai browser multimediali esterni, incluso Android Auto,
    // di collegarsi alla sessione. Media3 gestisce i comandi della sessione.
    // I metadati visibili ai controller non contengono credenziali: l'artwork passa da
    // AutoArtworkProvider e Media3 non invia l'URI di stream ai processi esterni.
    return librarySession
  }

  override fun onDestroy() {
    destroyed = true
    observer?.stopWatching()
    observer = null
    catalogueLoader.shutdownNow()
    mainHandler.removeCallbacksAndMessages(null)
    if (activeService === this) activeService = null
    librarySession?.release()
    librarySession = null
    player?.release()
    player = null
    super.onDestroy()
  }

  private class CatalogueCallback(
    private val current: () -> AutoCatalogue,
    private val ready: ListenableFuture<Unit>,
    private val mainExecutor: Executor,
  ) : MediaLibrarySession.Callback {
    /** Requests that arrive while the first background load runs wait for it. */
    private fun <T> whenReady(block: (AutoCatalogue) -> ListenableFuture<T>): ListenableFuture<T> =
      if (ready.isDone) block(current())
      else Futures.transformAsync(ready, { block(current()) }, mainExecutor)

    override fun onSubscribe(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      parentId: String,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<Void>> = whenReady { catalogue ->
      session.notifyChildrenChanged(browser, parentId, catalogue.children(parentId).size, params)
      return@whenReady Futures.immediateFuture(LibraryResult.ofVoid(params))
    }

    override fun onGetLibraryRoot(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<MediaItem>> = whenReady { catalogue ->
      return@whenReady Futures.immediateFuture(LibraryResult.ofItem(catalogue.root, LibraryParams.Builder()
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
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = whenReady { catalogue ->
      val children = catalogue.children(parentId)
      return@whenReady Futures.immediateFuture(
        LibraryResult.ofItemList(paginate(children, page, pageSize), params),
      )
    }

    override fun onGetItem(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      mediaId: String,
    ): ListenableFuture<LibraryResult<MediaItem>> = whenReady { catalogue ->
      val item = catalogue.item(mediaId)
      return@whenReady if (item != null) {
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
    ): ListenableFuture<LibraryResult<Void>> = whenReady { catalogue ->
      // Complete the command before delivering the result event. Legacy Auto browsers
      // bridge this event to their pending MediaBrowserCompat search request.
      val count = catalogue.search(query).size
      Handler(Looper.getMainLooper()).post {
        session.notifySearchResultChanged(browser, query, count, params)
      }
      return@whenReady Futures.immediateFuture(LibraryResult.ofVoid(params))
    }

    override fun onGetSearchResult(
      session: MediaLibrarySession,
      browser: MediaSession.ControllerInfo,
      query: String,
      page: Int,
      pageSize: Int,
      params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = whenReady { catalogue ->
      return@whenReady Futures.immediateFuture(
        LibraryResult.ofItemList(paginate(catalogue.search(query), page, pageSize), params),
      )
    }

    override fun onSetMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: List<MediaItem>,
      startIndex: Int,
      startPositionMs: Long,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> = whenReady { catalogue ->
      if (mediaItems.size == 1) {
        val requested = mediaItems.first().mediaId
        val context = catalogue.playbackContext(requested)
        if (context.isNotEmpty()) {
          val embedded = requested.substringAfterLast(":song:", "")
          val index = context.indexOfFirst {
            it.mediaId == requested || (embedded.isNotEmpty() && it.mediaId == "song:$embedded")
          }.coerceAtLeast(0)
          return@whenReady Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(context, index, startPositionMs))
        }
      }
      val resolved = mediaItems.mapNotNull { item ->
        item.takeIf { it.localConfiguration != null } ?: catalogue.playableItem(item.mediaId)
      }
      if (resolved.size != mediaItems.size) return@whenReady Futures.immediateFailedFuture(IllegalArgumentException("Unknown media ID"))
      return@whenReady Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(resolved, startIndex, startPositionMs))
    }

    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: List<MediaItem>,
    ): ListenableFuture<List<MediaItem>> = whenReady { catalogue ->
      val resolved = mediaItems.mapNotNull { requested ->
        if (requested.mediaId.contains(":song:")) catalogue.playableItem(requested.mediaId)
        else requested.takeIf { it.localConfiguration != null } ?: catalogue.playableItem(requested.mediaId)
      }
      return@whenReady Futures.immediateFuture(resolved)
    }

    private fun paginate(items: List<MediaItem>, page: Int, pageSize: Int): List<MediaItem> {
      if (page < 0 || pageSize <= 0) return emptyList()
      val from = (page.toLong() * pageSize.toLong()).coerceAtMost(items.size.toLong()).toInt()
      val to = (from.toLong() + pageSize.toLong()).coerceAtMost(items.size.toLong()).toInt()
      return items.subList(from, to)
    }
  }

  internal class AutoCatalogue {
    private var sourceFile: File? = null
    private var lastModified = Long.MIN_VALUE
    private var songs = emptyList<AutoSong>()
    private var playlists = emptyList<AutoPlaylist>()
    private var radios = emptyList<AutoRadio>()
    private var metadata: JSONObject? = null
    private var itemsById = emptyMap<String, MediaItem>()
    private var childrenById = emptyMap<String, List<MediaItem>>()
    private var searchIndex = emptyList<Pair<MediaItem, List<String>>>()
    private val artworkUris = HashMap<String, Uri?>()
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

    val isLoaded: Boolean
      get() = lastModified != Long.MIN_VALUE

    fun playbackContext(mediaId: String): List<MediaItem> {
      // Tapping inside a playlist or the radio list queues that container, like the phone.
      if (mediaId.startsWith("playlist:")) {
        val playlistId = mediaId.removePrefix("playlist:").substringBefore(":song:")
        val playlist = playlists.firstOrNull { it.id == playlistId } ?: return emptyList()
        return playlist.songIds.mapNotNull { playableItem("song:$it") }
      }
      if (mediaId.startsWith("radio:")) return children(RADIOS_ID)
      val embedded = mediaId.substringAfterLast(":song:", "")
      val song = songs.firstOrNull { it.id == embedded || it.mediaId == mediaId } ?: return emptyList()
      val sameAlbum = songs.filter {
        if (song.albumId != null) it.albumId == song.albumId
        else it.album == song.album && it.artist == song.artist
      }.sortedWith(compareBy<AutoSong> { it.discNumber }.thenBy { it.track })
      return sameAlbum.mapNotNull { playableItem(it.mediaId) }
    }

    fun children(parentId: String): List<MediaItem> = childrenById[parentId].orEmpty()

    fun item(mediaId: String): MediaItem? = itemsById[mediaId]

    fun playableItem(mediaId: String): MediaItem? {
      // Playlist entries carry their container in the id; resolve them to the shared
      // "song:<id>" item so queue ids stay comparable with the phone.
      val embedded = mediaId.substringAfterLast(":song:", "")
      val normalized = if (embedded.isNotEmpty() && mediaId != "song:$embedded") "song:$embedded" else mediaId
      return itemsById[normalized]?.takeIf { it.mediaMetadata.isPlayable == true }
        ?: itemsById[mediaId]?.takeIf { it.mediaMetadata.isPlayable == true }
    }

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
        if (!file.exists()) Triple(null, emptyList(), emptyList<AutoPlaylist>() to emptyList<AutoRadio>()) else {
          val document = JSONObject(file.readText())
          val entities = JSONObject().apply {
            listOf("albums", "artists", "genres").forEach { key ->
              document.optJSONArray(key)?.let { put(key, it) }
            }
          }
          Triple(entities, parseSongs(document), parseCollections(document))
        }
      } catch (_: Exception) { return }
      metadata = parsed.first
      songs = parsed.second
      playlists = parsed.third.first
      radios = parsed.third.second
      lastModified = modified
      rebuildIndex()
    }

    private fun parseSongs(json: JSONObject): List<AutoSong> {
      val array = json.getJSONArray("songs")
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
              year = value.optInt("year", 0),
              genre = value.cleanString("genre"),
              starred = value.cleanString("starred") != null,
              artworkUrl = value.cleanString("coverUrl"),
              streamUrl = streamUrl,
            ),
          )
        }
      }
    }

    private fun parseCollections(json: JSONObject): Pair<List<AutoPlaylist>, List<AutoRadio>> {
      val playlistArray = json.optJSONArray("playlists")
      val parsedPlaylists = buildList {
        for (index in 0 until (playlistArray?.length() ?: 0)) {
          val value = playlistArray!!.optJSONObject(index) ?: continue
          val id = value.cleanString("id") ?: continue
          val name = value.cleanString("name") ?: continue
          val ids = value.optJSONArray("songIds")
          add(
            AutoPlaylist(
              id = id,
              name = name,
              owner = value.cleanString("owner"),
              coverUrl = value.cleanString("coverUrl"),
              songIds = buildList {
                for (position in 0 until (ids?.length() ?: 0)) {
                  val songId = ids!!.optString(position).trim()
                  if (songId.isNotBlank()) add(songId)
                }
              },
            ),
          )
        }
      }
      val radioArray = json.optJSONArray("radios")
      val parsedRadios = buildList {
        for (index in 0 until (radioArray?.length() ?: 0)) {
          val value = radioArray!!.optJSONObject(index) ?: continue
          val id = value.cleanString("id") ?: continue
          val name = value.cleanString("name") ?: continue
          val streamUrl = value.cleanString("streamUrl") ?: continue
          add(AutoRadio(id = id, name = name, streamUrl = streamUrl, homePageUrl = value.cleanString("homePageUrl")))
        }
      }
      return parsedPlaylists to parsedRadios
    }

    private fun rebuildIndex() {
      artworkUris.clear()
      val itemIndex = linkedMapOf<String, MediaItem>()
      val childIndex = linkedMapOf<String, List<MediaItem>>()

      // Four root tabs, like the phone library hub: Android Auto shows at most four.
      val categories = listOf(
        browsable(ALBUMS_ID, "Album"),
        browsable(ARTISTS_ID, "Artisti"),
        browsable(TRACKS_ID, "Brani"),
        browsable(COLLECTIONS_ID, "Raccolte"),
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
      // Use the exact phone metadata (including canonical genre aliases), retaining
      // the song-derived fallback for catalogues written by older app versions.
      val metadataAlbums = metadata?.optJSONArray("albums")
      val albumsByArtist = (0 until (metadataAlbums?.length() ?: 0)).mapNotNull { index ->
        val album = metadataAlbums!!.optJSONObject(index) ?: return@mapNotNull null
        val artist = album.cleanString("artistId") ?: return@mapNotNull null
        val id = album.cleanString("id") ?: return@mapNotNull null
        artist to id
      }.groupBy({ it.first }, { it.second })
      fun metadataFolders(arrayName: String, parentId: String, prefix: String, nameKey: String) {
        val array = metadata?.optJSONArray(arrayName) ?: return
        val folders = (0 until array.length()).mapNotNull { index ->
          val value = array.optJSONObject(index) ?: return@mapNotNull null
          val name = value.cleanString(nameKey) ?: return@mapNotNull null
          val key = value.cleanString("id") ?: name
          val id = "$prefix:${Uri.encode(key)}"
          val original = childIndex[id].orEmpty()
          val entries = if (prefix == "genre") {
            val sources = value.optJSONArray("sourceValues")
            val names = (0 until (sources?.length() ?: 0)).map { sources!!.getString(it) }.toSet() + name
            songs.filter { it.genre in names }.mapNotNull { itemIndex[it.mediaId] }
          } else if (prefix == "artist") {
            (original + albumsByArtist[key].orEmpty().mapNotNull { itemIndex["album:${Uri.encode(it)}"] })
              .distinctBy { it.mediaId }
          } else original
          childIndex[id] = entries
          val artwork = value.cleanString("coverUrl") ?: value.cleanString("artistImageUrl")
            ?: itemIndex[id]?.mediaMetadata?.artworkUri?.toString()
            ?: entries.firstOrNull()?.mediaMetadata?.artworkUri?.toString()
          browsable(id, name, artwork).also { itemIndex[id] = it }
        }.sortedBy { normalizeAutoQuery(it.mediaMetadata.title.toString()) }
        childIndex[parentId] = folders
      }
      metadataFolders("albums", ALBUMS_ID, "album", "name")
      metadataFolders("artists", ARTISTS_ID, "artist", "name")
      metadataFolders("genres", GENRES_ID, "genre", "value")
      itemIndex[FAVORITES_ID] = browsable(FAVORITES_ID, "Preferiti")
      childIndex[FAVORITES_ID] = songs.filter { it.starred }.mapNotNull { itemIndex[it.mediaId] }
        .sortedBy { normalizeAutoQuery(it.mediaMetadata.title.toString()) }

      itemIndex[GENRES_ID] = browsable(GENRES_ID, "Generi musicali")
      itemIndex[PLAYLISTS_ID] = browsable(PLAYLISTS_ID, "Playlist")
      itemIndex[RADIOS_ID] = browsable(RADIOS_ID, "Radio Internet")
      itemIndex[YEARS_ID] = browsable(YEARS_ID, "Anni")

      childIndex[PLAYLISTS_ID] = playlists.map { playlist ->
        val folderId = "playlist:${playlist.id}"
        val entries = playlist.songIds.mapNotNull { songId ->
          itemIndex["song:$songId"]?.let { item ->
            contextualItem("$folderId:song:$songId", item).also { itemIndex[it.mediaId] = it }
          }
        }
        childIndex[folderId] = entries
        browsable(folderId, playlist.name, playlist.coverUrl).also { itemIndex[folderId] = it }
      }.sortedBy { normalizeAutoQuery(it.mediaMetadata.title.toString()) }

      childIndex[RADIOS_ID] = radios.map { station ->
        val mediaId = "radio:${station.id}"
        MediaItem.Builder()
          .setMediaId(mediaId)
          .setUri(station.streamUrl)
          .setMediaMetadata(
            MediaMetadata.Builder()
              .setTitle(station.name)
              .setSubtitle(station.homePageUrl)
              .setIsBrowsable(false)
              .setIsPlayable(true)
              .build(),
          )
          .build()
          .also { itemIndex[mediaId] = it }
      }.sortedBy { normalizeAutoQuery(it.mediaMetadata.title.toString()) }

      // Anni mirrors the phone tile: albums grouped by their year, newest first.
      val albumYears = linkedMapOf<Int, MutableList<MediaItem>>()
      val albumsMeta = metadata?.optJSONArray("albums")
      if (albumsMeta != null) {
        for (index in 0 until albumsMeta.length()) {
          val album = albumsMeta.optJSONObject(index) ?: continue
          val year = album.optInt("year", 0)
          val id = album.cleanString("id") ?: continue
          if (year <= 0) continue
          itemIndex["album:${Uri.encode(id)}"]?.let { albumYears.getOrPut(year) { mutableListOf() }.add(it) }
        }
      } else {
        songs.forEach { song ->
          if (song.year > 0) {
            itemIndex[song.mediaId]?.let { albumYears.getOrPut(song.year) { mutableListOf() }.add(it) }
          }
        }
      }
      childIndex[YEARS_ID] = albumYears.entries.sortedByDescending { it.key }.map { (year, items) ->
        val folderId = "year:$year"
        childIndex[folderId] = items
        browsable(folderId, year.toString(), items.firstOrNull()?.mediaMetadata?.artworkUri?.toString())
          .also { itemIndex[folderId] = it }
      }

      // Raccolte groups the remaining phone library tiles: Generi, Preferiti, Playlist,
      // Radio Internet, Anni. Empty sections stay hidden.
      childIndex[COLLECTIONS_ID] = listOf(GENRES_ID, FAVORITES_ID, PLAYLISTS_ID, RADIOS_ID, YEARS_ID)
        .filter { childIndex[it].orEmpty().isNotEmpty() }
        .mapNotNull { itemIndex[it] }

      val searchableIds = listOf(ALBUMS_ID, ARTISTS_ID, GENRES_ID, TRACKS_ID, PLAYLISTS_ID, RADIOS_ID)
        .flatMap { childIndex[it].orEmpty() }.map { it.mediaId }.toSet()
      // Search the original entities, never synthetic browse sections. Normalize once
      // per catalogue refresh rather than repeatedly scanning/allocating on each query.
      searchIndex = itemIndex.values.filter {
        it.mediaId in searchableIds
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
      // Keep four root tabs; favorites remain a prominent entry inside Brani.
      childIndex[TRACKS_ID] = listOf(itemIndex.getValue(FAVORITES_ID)) + childIndex[TRACKS_ID].orEmpty()
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
        .setArtworkUri(artworkUri(song.artworkUrl))
        .setIsBrowsable(false)
        .setIsPlayable(true)
        .build()
      return MediaItem.Builder()
        .setMediaId(song.mediaId)
        .setUri(song.streamUrl)
        .setMediaMetadata(metadata)
        .build()
    }

    /** Same playable item exposed under a container-scoped id, so taps keep context. */
    private fun contextualItem(mediaId: String, source: MediaItem): MediaItem {
      return MediaItem.Builder()
        .setMediaId(mediaId)
        .setUri(source.localConfiguration?.uri)
        .setMediaMetadata(source.mediaMetadata)
        .build()
    }

    private fun browsable(mediaId: String, title: String, artworkUrl: String? = null): MediaItem {
      return MediaItem.Builder()
        .setMediaId(mediaId)
        .setMediaMetadata(
          MediaMetadata.Builder()
            .setTitle(title)
            .setArtworkUri(artworkUri(artworkUrl))
            .setIsBrowsable(true)
            .setIsPlayable(false)
            .build(),
        )
        .build()
    }

    /** Songs of an album share one authenticated URL: map it to a content URI once per rebuild. */
    private fun artworkUri(url: String?): Uri? =
      if (url == null) null else artworkUris.getOrPut(url) { AutoArtwork.localUri(url) }

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
    val year: Int,
    val genre: String?,
    val starred: Boolean,
    val artworkUrl: String?,
    val streamUrl: String,
  ) {
    val mediaId: String get() = "song:$id"
  }

  private data class AutoPlaylist(
    val id: String,
    val name: String,
    val owner: String?,
    val coverUrl: String?,
    val songIds: List<String>,
  )

  private data class AutoRadio(
    val id: String,
    val name: String,
    val streamUrl: String,
    val homePageUrl: String?,
  )

  companion object {
    internal const val CATALOGUE_FILE = "music-bank-auto-catalog.json"
    private const val ROOT_ID = "music-bank-root"
    private const val ALBUMS_ID = "music-bank-albums"
    private const val ARTISTS_ID = "music-bank-artists"
    private const val GENRES_ID = "music-bank-genres"
    private const val TRACKS_ID = "music-bank-tracks"
    private const val FAVORITES_ID = "music-bank-favorites"
    private const val COLLECTIONS_ID = "music-bank-collections"
    private const val PLAYLISTS_ID = "music-bank-playlists"
    private const val RADIOS_ID = "music-bank-radios"
    private const val YEARS_ID = "music-bank-years"
    fun currentAudioSessionId(): Int = activeService?.player?.audioSessionId ?: 0
    private var activeService: MusicBankAutoService? = null
    fun refreshCatalogue() { activeService?.refresh() }
  }
}
