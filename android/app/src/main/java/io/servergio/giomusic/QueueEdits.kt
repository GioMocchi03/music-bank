package io.servergio.giomusic

/** Exclusive-end ranges, ordered so removing the tail cannot shift the retained item. */
internal data class QueueRemoval(val from: Int, val to: Int)
internal fun removalsKeepingCurrent(size: Int, current: Int): List<QueueRemoval> {
  if (size <= 0) return emptyList()
  if (current !in 0 until size) return listOf(QueueRemoval(0, size))
  return buildList {
    if (current + 1 < size) add(QueueRemoval(current + 1, size))
    if (current > 0) add(QueueRemoval(0, current))
  }
}
