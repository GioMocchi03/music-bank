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
