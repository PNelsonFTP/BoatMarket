import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db";
import { readSources } from "./collector";
import { readLatestCollectionReport, reportDirectory } from "./refresh-report";
import { readLatestRefreshReport } from "./refresh";
import { readWorkerHeartbeat } from "./worker";
const ledgerSchema = z.object({
  version: z.literal(1),
  note: z.string(),
  sources: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      observedOn: z.string(),
      observation: z.string(),
      nextAction: z.string(),
    }),
  ),
});
export type AlertEvaluationReport = {
  runId: string;
  status: "success" | "failed";
  completedAt: string;
  error: string | null;
};
async function readAlertEvaluation(
  runId?: string,
): Promise<AlertEvaluationReport | null> {
  try {
    return JSON.parse(
      await readFile(
        join(
          reportDirectory(),
          runId ? `${runId}-alerts.json` : "latest-alerts.json",
        ),
        "utf8",
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function sourceHealth() {
  const [sources, collection, refresh, worker, ledger, runs, alertEvaluation] =
    await Promise.all([
      readSources(),
      readLatestCollectionReport(),
      readLatestRefreshReport(),
      readWorkerHeartbeat(),
      readFile("config/source-access.json", "utf8").then((s) =>
        ledgerSchema.parse(JSON.parse(s)),
      ),
      db.ingestRun.findMany({ orderBy: { startedAt: "desc" }, take: 500 }),
      readAlertEvaluation(),
    ]);
  return {
    generatedAt: new Date().toISOString(),
    sources: sources.map((s) => {
      const latestRun = runs.find((r) => r.source === s.name) || null;
      const matchingReportRun =
        latestRun && collection?.runs.some((run) => run.id === latestRun.id);
      return {
        ...s,
        latestRun,
        metrics: matchingReportRun
          ? collection?.metrics.find((m) => m.sourceId === s.id) || null
          : null,
      };
    }),
    collection,
    refresh,
    worker,
    alertEvaluation,
    workerFresh:
      !!worker &&
      worker.state !== "stopped" &&
      Date.now() - Date.parse(worker.heartbeatAt) < 120000,
    ledger,
  };
}
export function registerSourceHealthRoutes(app: FastifyInstance) {
  app.get("/api/admin/source-health", sourceHealth);
  app.get("/api/admin/jobs/:id", async (req, reply) => {
    const { id } = z
      .object({ id: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/) })
      .parse(req.params);
    for (const suffix of ["-refresh", ""]) {
      try {
        const report = JSON.parse(
          await readFile(
            join(reportDirectory(), `${id}${suffix}.json`),
            "utf8",
          ),
        );
        return { ...report, alertEvaluation: await readAlertEvaluation(id) };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    return reply.code(404).send({ error: "Run report not available yet" });
  });
}
