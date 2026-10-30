package io.servergio.giomusic.equalizer

import android.content.Context
import android.content.ActivityNotFoundException
import android.content.Intent
import android.media.audiofx.AudioEffect
import android.media.audiofx.Equalizer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Archivio legacy usato soltanto per migrare le vecchie credenziali a SecureStore. */
class GioConnectionStoreModule : Module() {
  private val preferencesName = "MusicBankConnection"
  private val connectionKey = "navidrome_connection_v1"
  private var equalizer: Equalizer? = null
  private var equalizerSessionId = -1

  override fun definition() = ModuleDefinition {
    Name("GioConnectionStore")

    Function("save") { value: String ->
      val stored = preferences()
        .edit()
        .putString(connectionKey, value)
        .commit()
      if (!stored || preferences().getString(connectionKey, null) != value) {
        throw IllegalStateException("Android non ha confermato il salvataggio del server")
      }
      true
    }

    Function("load") {
      preferences().getString(connectionKey, null)
    }

    Function("clear") {
      preferences().edit().remove(connectionKey).commit()
    }

    Function("openSystemEqualizer") {
      val context = requireNotNull(appContext.reactContext) { "Contesto Android non disponibile" }
      val intent = Intent(AudioEffect.ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL).apply {
        putExtra(AudioEffect.EXTRA_PACKAGE_NAME, context.packageName)
        putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try {
        context.startActivity(intent)
        true
      } catch (_: ActivityNotFoundException) {
        false
      }
    }

    Function("getEqualizerInfo") { sessionId: Int ->
      val effect = equalizerFor(sessionId) ?: return@Function null
      val range = effect.bandLevelRange
      mapOf(
        "frequencies" to (0 until effect.numberOfBands.toInt()).map { effect.getCenterFreq(it.toShort()) / 1000 },
        "minLevel" to range[0].toInt(),
        "maxLevel" to range[1].toInt(),
        "levels" to (0 until effect.numberOfBands.toInt()).map { effect.getBandLevel(it.toShort()).toInt() }
      )
    }

    Function("configureEqualizer") { sessionId: Int, enabled: Boolean, levels: List<Double> ->
      val effect = equalizerFor(sessionId) ?: return@Function false
      val range = effect.bandLevelRange
      val bandCount = effect.numberOfBands.toInt()
      levels.take(bandCount).forEachIndexed { index, value ->
        effect.setBandLevel(index.toShort(), value.toInt().coerceIn(range[0].toInt(), range[1].toInt()).toShort())
      }
      effect.enabled = enabled
      true
    }

    OnDestroy {
      equalizer?.release()
      equalizer = null
      equalizerSessionId = -1
    }
  }

  private fun equalizerFor(sessionId: Int): Equalizer? {
    if (sessionId <= 0) return null
    if (equalizerSessionId == sessionId && equalizer != null) return equalizer
    equalizer?.release()
    return try {
      Equalizer(0, sessionId).also {
        equalizer = it
        equalizerSessionId = sessionId
      }
    } catch (_: RuntimeException) {
      equalizer = null
      equalizerSessionId = -1
      null
    }
  }

  private fun preferences() =
    requireNotNull(appContext.reactContext) { "Contesto Android non disponibile" }
      .applicationContext
      .getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
}
