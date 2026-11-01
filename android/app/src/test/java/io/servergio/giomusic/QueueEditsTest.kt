package io.servergio.giomusic

import org.junit.Assert.*
import org.junit.Test

class QueueEditsTest {
  @Test fun keepsTheSameOccurrenceAtEveryQueuePosition() {
    for (size in 1..50) for (current in 0 until size) {
      val queue = (0 until size).map { Any() }.toMutableList()
      val playing = queue[current]
      removalsKeepingCurrent(size, current).forEach { range ->
        queue.subList(range.from, range.to).clear()
      }
      assertEquals(1, queue.size)
      assertSame(playing, queue.single())
    }
  }
  @Test fun removesTailBeforeHead() {
    assertEquals(listOf(QueueRemoval(3, 5), QueueRemoval(0, 2)), removalsKeepingCurrent(5, 2))
  }
  @Test fun emptyAndSingleQueuesNeedNoRemoval() {
    assertTrue(removalsKeepingCurrent(0, -1).isEmpty())
    assertTrue(removalsKeepingCurrent(1, 0).isEmpty())
  }
  @Test fun invalidCurrentItemClearsOnlyExistingItems() {
    assertEquals(listOf(QueueRemoval(0, 5)), removalsKeepingCurrent(5, -1))
    assertEquals(listOf(QueueRemoval(0, 5)), removalsKeepingCurrent(5, 5))
  }
}
