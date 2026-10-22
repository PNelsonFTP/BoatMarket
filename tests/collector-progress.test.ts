import { afterEach, expect, it, vi } from "vitest";
import { createCollectorProgress } from "../server/collector-progress";
afterEach(() => vi.useRealTimers());
it("coalesces live checkpoints and flushes source/final boundaries without inventing successful progress", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  const persist = vi.fn(async (_path: string, _data: unknown) => {});
  const progress = createCollectorProgress("slow-source", "owner", {
    persist,
    intervalMs: 2500,
  });
  await progress.checkpoint({}, true);
  for (let i = 0; i < 100; i++)
    await progress.checkpoint({
      phase: "inventory",
      currentUrl: `https://dealer.example/${i}`,
    });
  expect(persist).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2500);
  expect(persist).toHaveBeenCalledTimes(2);
  expect(persist.mock.calls[1][1]).toMatchObject({
    status: "running",
    phase: "inventory",
    currentUrl: "https://dealer.example/99",
    elapsedMs: 2500,
    lastSuccessfulCheckpointAt: null,
  });
  await progress.checkpoint({
    wait: {
      reason: "Source robots.txt crawl delay",
      until: "2026-10-21T12:00:10.000Z",
    },
  });
  await vi.advanceTimersByTimeAsync(2500);
  expect(persist.mock.calls.at(-1)![1]).toMatchObject({
    wait: { reason: "Source robots.txt crawl delay" },
  });
  await progress.checkpoint({ cancellationPending: true }, true);
  await progress.finish("cancelled", "Operator requested cancellation");
  expect(persist.mock.calls.at(-1)![1]).toMatchObject({
    status: "cancelled",
    cancellationPending: true,
    wait: null,
    completedAt: "2026-10-21T12:00:05.000Z",
  });
  const finalCalls = persist.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(persist).toHaveBeenCalledTimes(finalCalls);
});
