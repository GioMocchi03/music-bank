package io.servergio.giomusic

import java.text.Normalizer
import java.util.Locale

private val marks = "\\p{Mn}+".toRegex()
private val separators = "[^\\p{L}\\p{N}]+".toRegex()
internal fun normalizeAutoQuery(value: String): String =
  Normalizer.normalize(value, Normalizer.Form.NFD).replace(marks, "")
    .lowercase(Locale.ITALIAN).replace(separators, " ").trim()

internal fun autoSearchScore(fields: List<String>, query: String): Int {
  if (fields.any { it == query }) return 0
  if (fields.any { it.startsWith(query) }) return 1
  if (fields.any { it.contains(query) }) return 2
  val compactQuery = query.replace(" ", "")
  if (fields.any { it.replace(" ", "").contains(compactQuery) }) return 3
  return Int.MAX_VALUE
}
