const startedAt = Date.now();

/** Lightweight startup timings for release profiling without logging account data. */
export function startupMark(phase: string): void {
  const elapsedMs = Date.now() - startedAt;
  console.info(`[startup] ${phase} ${elapsedMs}ms`);
}
