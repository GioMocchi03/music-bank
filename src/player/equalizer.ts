export function equalizerLevelAfterDrag(
  startValue: number,
  deltaY: number,
  height: number,
  min: number,
  max: number,
): number {
  if (height <= 0 || max <= min) return Math.max(min, Math.min(max, startValue));
  const delta = -(deltaY / height) * (max - min);
  return Math.round(Math.max(min, Math.min(max, startValue + delta)));
}
