package io.servergio.giomusic.equalizer

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Archivio legacy usato soltanto per migrare le vecchie credenziali a SecureStore. */
class GioConnectionStoreModule : Module() {
  private val preferencesName = "MusicBankConnection"
  private val connectionKey = "navidrome_connection_v1"

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
  }

  private fun preferences() =
    requireNotNull(appContext.reactContext) { "Contesto Android non disponibile" }
      .applicationContext
      .getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
}
