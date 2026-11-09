package androidx.media3.session

import android.app.Application
import android.os.Bundle
import android.os.Looper
import androidx.media3.common.MediaItem
import com.google.common.util.concurrent.ListenableFuture
import io.servergio.giomusic.MusicBankAutoService
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File

/** A third-party MediaBrowser still browses and drives playback through the exported session. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE, application = Application::class)
class MusicBankAutoServicePlaybackTest {
  private val auth = "u=zz-user&t=tokenvalue&s=saltvalue"
  private val json = """{
    "albums":[{"id":"a","name":"Test Album","artistId":"r","year":1981,"coverUrl":"https://music.test/rest/getCoverArt.view?$auth&id=al-a"}],
    "artists":[{"id":"r","name":"Test Artist"}],
    "playlists":[{"id":"p1","name":"Mix","songIds":["two","one"]}],
    "songs":[
      {"id":"one","title":"First Track","album":"Test Album","albumId":"a","artist":"Test Artist","artistId":"r","track":1,"coverUrl":"https://music.test/rest/getCoverArt.view?$auth&id=al-a","streamUrl":"https://music.test/rest/stream.view?$auth&id=one"},
      {"id":"two","title":"Second Track","album":"Test Album","albumId":"a","artist":"Test Artist","artistId":"r","track":2,"coverUrl":"https://music.test/rest/getCoverArt.view?$auth&id=al-a","streamUrl":"https://music.test/rest/stream.view?$auth&id=two"}
    ]
  }"""

  private fun settle(done: () -> Boolean) {
    repeat(400) {
      shadowOf(Looper.getMainLooper()).idle()
      if (done()) return
      Thread.sleep(5)
    }
    fail("Timed out waiting for the media session")
  }

  private fun <T> ListenableFuture<T>.await(): T {
    settle { isDone }
    return get()
  }

  @Test fun externalBrowserBrowsesAndControlsPlayback() {
    val context = RuntimeEnvironment.getApplication()
    File(context.filesDir, "music-bank-auto-catalog.json").writeText(json)
    val service = Robolectric.buildService(MusicBankAutoService::class.java).create()
    val controllerInfo = MediaSession.ControllerInfo.createTestOnlyControllerInfo(
      "com.example.other", 0, 0, 0, 0, false, Bundle.EMPTY, false,
    )
    val session = service.get().onGetSession(controllerInfo)!!
    val browser = MediaBrowser.Builder(context, session.token).buildAsync().await()
    try {
      assertEquals("music-bank-root", browser.getLibraryRoot(null).await().value!!.mediaId)
      val album = browser.getChildren("music-bank-albums", 0, 100, null).await().value!!.single()
      assertEquals("album:a", album.mediaId)
      val tracks = browser.getChildren(album.mediaId, 0, 100, null).await().value!!
      assertEquals(listOf("song:one", "song:two"), tracks.map { it.mediaId })
      (listOf(album) + tracks).forEach { item ->
        assertTrue(item.mediaMetadata.artworkUri.toString().startsWith("content://io.servergio.giomusic.artwork/"))
      }

      // Tapping a track queues its album, like the phone.
      browser.setMediaItem(MediaItem.Builder().setMediaId("song:two").build())
      settle { browser.mediaItemCount == 2 }
      assertEquals(1, browser.currentMediaItemIndex)
      assertEquals("song:two", browser.currentMediaItem!!.mediaId)
      assertTrue(browser.currentMediaItem!!.mediaMetadata.artworkUri.toString().startsWith("content://"))

      browser.play()
      settle { browser.playWhenReady }
      browser.pause()
      settle { !browser.playWhenReady }
      browser.seekTo(0, 1_234L)
      settle { browser.currentMediaItemIndex == 0 }
      browser.seekToNextMediaItem()
      settle { browser.currentMediaItemIndex == 1 }
      browser.addMediaItem(MediaItem.Builder().setMediaId("playlist:p1:song:one").build())
      settle { browser.mediaItemCount == 3 }
      assertEquals("song:one", browser.getMediaItemAt(2).mediaId)
      browser.removeMediaItem(2)
      settle { browser.mediaItemCount == 2 }
    } finally {
      browser.release()
      service.destroy()
    }
  }
}
