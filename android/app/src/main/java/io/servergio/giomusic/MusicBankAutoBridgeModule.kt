package io.servergio.giomusic

import android.content.ComponentName
import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.facebook.react.bridge.*
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONArray
import java.io.File

/** Every command and state read uses the same session as Android Auto. */
class MusicBankAutoBridgeModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {
  private val handler = Handler(Looper.getMainLooper())
  private var connection: ListenableFuture<MediaController>? = null
  private var invalidated = false
  override fun getName() = "MusicBankAutoBridge"

  private fun withController(promise: Promise, action: (MediaController) -> Any?) {
    handler.post {
      if (invalidated) {
        promise.reject("ANDROID_AUTO_CLOSED", "Bridge disposed")
        return@post
      }
      val future = connection ?: MediaController.Builder(context,
        SessionToken(context, ComponentName(context, MusicBankAutoService::class.java)))
        .buildAsync().also { connection = it }
      future.addListener({
        var resolved: MediaController? = null
        try {
          val controller = future.get()
          resolved = controller
          if (invalidated) throw IllegalStateException("Bridge disposed")
          if (!controller.isConnected) {
            connection = null
            controller.release()
            throw IllegalStateException("Session disconnected; retry command")
          }
          promise.resolve(action(controller))
        } catch (error: Exception) {
          if (resolved == null && connection === future) connection = null
          promise.reject("ANDROID_AUTO", error)
        }
      }, { task -> handler.post(task) })
    }
  }

  @ReactMethod
  fun controlPlayback(command: String, value: Double, promise: Promise) = withController(promise) { player ->
    require(value.isFinite()) { "Invalid playback value" }
    when (command) {
      "play" -> { if (player.playbackState == Player.STATE_IDLE) player.prepare(); player.play() }
      "pause" -> player.pause()
      "next" -> player.seekToNextMediaItem()
      "previous" -> player.seekToPrevious()
      "seek" -> player.seekTo(value.toLong().coerceAtLeast(0L))
      "clear" -> { player.stop(); player.clearMediaItems() }
      "repeat" -> { require(value.toInt() in 0..2); player.repeatMode = value.toInt() }
      "shuffle" -> player.shuffleModeEnabled = value != 0.0
      "rate" -> player.setPlaybackSpeed(value.toFloat().coerceIn(0.1f, 2f))
      "volume" -> player.volume = value.toFloat().coerceIn(0f, 1f)
      else -> throw IllegalArgumentException("Unknown command: $command")
    }
    true
  }

  @ReactMethod
  fun setQueue(json: String, index: Int, play: Boolean, promise: Promise) = withController(promise) { player ->
    val array = JSONArray(json)
    require(index in 0 until array.length()) { "Invalid queue position" }
    val items = (0 until array.length()).map { i ->
      val item = array.getJSONObject(i)
      val id = item.getString("id")
      val uri = item.getString("uri")
      require(id.isNotBlank() && uri.isNotBlank())
      MediaItem.Builder().setMediaId("song:$id").setUri(uri)
        .setMediaMetadata(MediaMetadata.Builder()
          .setTitle(item.getString("title"))
          .setArtist(item.optString("artist", ""))
          .setAlbumTitle(item.optString("album", ""))
          .setArtworkUri(AutoArtwork.localUri(item.optString("coverUrl")))
          .setIsPlayable(true).setIsBrowsable(false).build()).build()
    }
    player.setMediaItems(items, index, 0L)
    player.prepare()
    player.playWhenReady = play
    true
  }

  @ReactMethod
  fun editQueue(operation: String, index: Int, target: Int, json: String, promise: Promise) = withController(promise) { player ->
    when (operation) {
      "move" -> {
        require(index in 0 until player.mediaItemCount && target in 0 until player.mediaItemCount)
        player.moveMediaItem(index, target)
      }
      "remove" -> {
        require(index in 0 until player.mediaItemCount)
        player.removeMediaItem(index)
      }
      "keepCurrent" -> {
        // Only remove ranges: the retained occurrence, position and play state survive.
        removalsKeepingCurrent(player.mediaItemCount, player.currentMediaItemIndex).forEach {
          player.removeMediaItems(it.from, it.to)
        }
      }
      "append", "next" -> {
        val value = org.json.JSONObject(json)
        val item = MediaItem.Builder().setMediaId("song:${value.getString("id")}")
          .setUri(value.getString("uri"))
          .setMediaMetadata(MediaMetadata.Builder().setTitle(value.getString("title"))
            .setArtist(value.optString("artist", "")).setAlbumTitle(value.optString("album", ""))
            .setArtworkUri(AutoArtwork.localUri(value.optString("coverUrl")))
            .setIsPlayable(true).setIsBrowsable(false).build()).build()
        if (operation == "next") player.addMediaItem((player.currentMediaItemIndex + 1).coerceIn(0, player.mediaItemCount), item)
        else player.addMediaItem(item)
        if (player.playbackState == Player.STATE_IDLE) player.prepare()
      }
      else -> throw IllegalArgumentException("Unknown queue operation")
    }
    true
  }

  @ReactMethod
  fun refreshCatalog(promise: Promise) {
    handler.post {
      try {
        // Logout deletes the catalogue, even while the Auto service is not running.
        if (!File(context.filesDir, MusicBankAutoService.CATALOGUE_FILE).exists()) AutoArtwork.clear(context)
        MusicBankAutoService.refreshCatalogue()
        promise.resolve(true)
      } catch (error: Exception) { promise.reject("ANDROID_AUTO_CATALOG", error) }
    }
  }

  @ReactMethod
  fun getPlaybackState(promise: Promise) = withController(promise) { player ->
    Arguments.createMap().apply {
      putInt("audioSessionId", MusicBankAutoService.currentAudioSessionId())
      putString("mediaId", player.currentMediaItem?.mediaId)
      putDouble("positionMs", player.currentPosition.coerceAtLeast(0L).toDouble())
      putDouble("durationMs", player.duration.takeIf { it != C.TIME_UNSET && it > 0 }?.toDouble() ?: 0.0)
      putBoolean("playing", player.playWhenReady && player.playbackState != Player.STATE_ENDED)
      putBoolean("loaded", player.playbackState == Player.STATE_READY)
      putBoolean("buffering", player.playbackState == Player.STATE_BUFFERING)
      putInt("queueIndex", player.currentMediaItemIndex)
      putArray("queueIds", Arguments.createArray().apply {
        for (i in 0 until player.mediaItemCount) pushString(player.getMediaItemAt(i).mediaId.removePrefix("song:"))
      })
      putInt("repeatMode", player.repeatMode)
      putBoolean("shuffle", player.shuffleModeEnabled)
      putDouble("playbackRate", player.playbackParameters.speed.toDouble())
      putString("error", player.playerError?.errorCodeName)
    }
  }

  override fun invalidate() {
    handler.post {
      invalidated = true
      connection?.let { MediaController.releaseFuture(it) }
      connection = null
    }
    super.invalidate()
  }
}
