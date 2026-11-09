export function yieldToEvents(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Keep individual JS slices short, including on slower devices. */
export async function forEachInSlices<T>(
  items: readonly T[],
  visit: (item: T) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  let offset = 0;
  while (offset < items.length) {
    await yieldToEvents();
    if (signal?.aborted) return false;
    const startedAt = performance.now();
    const end = Math.min(offset + 200, items.length);
    do {
      visit(items[offset++]);
    } while (offset < end && performance.now() - startedAt < 4);
  }
  return !signal?.aborted;
}
