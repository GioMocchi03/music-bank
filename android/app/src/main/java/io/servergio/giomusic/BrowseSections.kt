package io.servergio.giomusic

import java.text.Normalizer
import java.util.Locale

internal data class BrowseSection<T>(val title: String, val items: List<T>)

/** No dropped entries when an Auto client cannot request subsequent API pages. */
internal fun <T> browseSections(items: List<T>, title: (T) -> String): List<BrowseSection<T>> {
  fun key(item: T): String = Normalizer.normalize(title(item), Normalizer.Form.NFD)
    .replace("\\p{Mn}+".toRegex(), "").trim().uppercase(Locale.ROOT)
  return items.map { it to key(it) }.sortedBy { it.second }.groupBy { (_, key) ->
    key.firstOrNull()?.takeIf { it.isLetter() }?.toString() ?: "#"
  }.flatMap { (letter, keyedGroup) ->
    val group = keyedGroup.map { it.first }
    group.chunked(100).map { chunk ->
      val label = if (group.size <= 100) letter
        else "$letter · ${title(chunk.first())} – ${title(chunk.last())}"
      BrowseSection(label, chunk)
    }
  }
}
