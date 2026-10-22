/** Keep one native timing entry per operation so long-running tabs do not accumulate telemetry. */
export function measureWork<T>(name: string, work: () => T): T {
  const started = performance.now();
  try {
    return work();
  } finally {
    performance.clearMeasures(`boatscout:${name}`);
    performance.measure(`boatscout:${name}`, {
      start: started,
      end: performance.now(),
    });
  }
}
