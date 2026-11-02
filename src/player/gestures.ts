export function isQueueSwipe(dx: number, dy: number, threshold = 72): boolean {
  return dx >= threshold && Math.abs(dx) > Math.abs(dy);
}

export function queueDropIndex(index: number, count: number, deltaY: number, rowHeight = 58): number {
  if (count <= 0 || rowHeight <= 0) return index;
  return Math.max(0, Math.min(count - 1, index + Math.round(deltaY / rowHeight)));
}
