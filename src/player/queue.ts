export type RepeatMode = 'none' | 'one' | 'all';

type QueuePosition = {
  length: number;
  index: number;
  repeat: RepeatMode;
};

type NextQueuePosition = QueuePosition & {
  shuffle: boolean;
  random?: () => number;
};

export function nextQueueIndex({
  length,
  index,
  shuffle,
  repeat,
  random = Math.random,
}: NextQueuePosition): number | null {
  if (length <= 0) return null;
  if (shuffle) {
    if (length === 1) return 0;
    const span = length - 1;
    const offset = Math.min(span - 1, Math.floor(random() * span));
    return offset >= index ? offset + 1 : offset;
  }
  const next = index + 1;
  if (next < length) return next;
  return repeat === 'all' ? 0 : null;
}

export function previousQueueIndex({ length, index, repeat }: QueuePosition): number {
  if (length <= 0) return 0;
  if (index > 0) return index - 1;
  return repeat === 'all' ? length - 1 : 0;
}

export function appendToQueue<T>(queue: readonly T[], item: T): T[] {
  return [...queue, item];
}

export function insertNextInQueue<T>(queue: readonly T[], current: number, item: T): T[] {
  const next = [...queue];
  next.splice(Math.max(0, Math.min(next.length, current + 1)), 0, item);
  return next;
}

export function removeQueueItem<T>(queue: readonly T[], index: number): T[] {
  if (index < 0 || index >= queue.length) return [...queue];
  return queue.filter((_, itemIndex) => itemIndex !== index);
}

export function removedQueueIndex(current: number, removed: number, nextLength: number): number {
  if (nextLength <= 0) return -1;
  if (removed < current) return current - 1;
  if (removed === current) return Math.min(current, nextLength - 1);
  return current;
}

export function moveQueueItem<T>(queue: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= queue.length || to < 0 || to >= queue.length || from === to) {
    return [...queue];
  }
  const next = [...queue];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function movedQueueIndex(current: number, from: number, to: number): number {
  if (current < 0 || from === to) return current;
  if (current === from) return to;
  if (from < current && to >= current) return current - 1;
  if (from > current && to <= current) return current + 1;
  return current;
}
