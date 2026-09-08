import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicJson, reportDirectory } from "./refresh-report";
const validId = (id: string) => /^[a-zA-Z0-9-]{1,120}$/.test(id);
export async function requestJobCancellation(runId: string) {
  if (!validId(runId)) throw new Error("Invalid job identity");
  const request = {
    runId,
    requestedAt: new Date().toISOString(),
    reason: "Operator requested cancellation",
  };
  await atomicJson(join(reportDirectory(), `cancel-${runId}.json`), request);
  return request;
}
export function watchJobCancellation(runId: string, parent?: AbortSignal) {
  if (!validId(runId)) throw new Error("Invalid job identity");
  const controller = new AbortController();
  const stopFromParent = () =>
    controller.abort(parent?.reason ?? new Error("Job cancelled"));
  if (parent?.aborted) stopFromParent();
  else parent?.addEventListener("abort", stopFromParent, { once: true });
  let checking = false;
  const check = async () => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try {
      const request = JSON.parse(
        await readFile(join(reportDirectory(), `cancel-${runId}.json`), "utf8"),
      );
      if (request.runId === runId)
        controller.abort(new Error("Operator requested cancellation"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        controller.abort(
          new Error(
            "Cancellation state unreadable; job stopped for operator review",
          ),
        );
    } finally {
      checking = false;
    }
  };
  const timer = setInterval(() => {
    void check();
  }, 1000);
  timer.unref();
  return {
    signal: controller.signal,
    check,
    stop() {
      clearInterval(timer);
      parent?.removeEventListener("abort", stopFromParent);
    },
  };
}
