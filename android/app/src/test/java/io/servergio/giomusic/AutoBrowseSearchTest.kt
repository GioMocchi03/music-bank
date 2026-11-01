package io.servergio.giomusic

import org.junit.Assert.*
import org.junit.Test

class AutoBrowseSearchTest {
  @Test fun largeLibraryRemainsCompleteAndBounded() {
    val entries = (0 until 12345).map { "Album $it" } + listOf("Élite", "#SELFIE", "Virus")
    val sections = browseSections(entries) { it }
    assertEquals(entries.sorted(), sections.flatMap { it.items }.sorted())
    assertTrue(sections.all { it.items.size <= 100 })
    assertTrue(sections.none { it.title.matches(Regex("[0-9]+–[0-9]+")) })
    assertTrue(sections.any { it.title == "E" && it.items == listOf("Élite") })
    assertTrue(sections.any { it.title == "#" })
  }
  @Test fun emptyLibraryAndDuplicateTitlesArePreserved() {
    assertTrue(browseSections(emptyList<String>()) { it }.isEmpty())
    assertEquals(250, browseSections(List(250) { "Same" }) { it }.sumOf { it.items.size })
  }
  @Test fun searchIgnoresAccentsCaseAndPunctuation() {
    assertEquals("elite", normalizeAutoQuery("ÉLITE"))
    assertEquals("d m", normalizeAutoQuery("D.M."))
    assertEquals(3, autoSearchScore(listOf(normalizeAutoQuery("D.M.")), "dm"))
    assertEquals(0, autoSearchScore(listOf("dm"), "dm"))
    assertEquals(Int.MAX_VALUE, autoSearchScore(listOf("virus"), "missing"))
    assertEquals("", normalizeAutoQuery("  !!!  "))
  }
  @Test fun exactArtistAndAlbumMatchesRankBeforeSubstringTracks() {
    val results = listOf("something dm", "dm live", "dm").sortedBy { autoSearchScore(listOf(it), "dm") }
    assertEquals(listOf("dm", "dm live", "something dm"), results)
  }
}
