import "dotenv/config";
import { collect } from "./collector";
import { evaluateAlerts } from "./alerts";
import { db } from "./db";
import { logger } from "./logger";
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
async function tick() {
  try {
    await collect();
    await evaluateAlerts();
  } catch (error) {
    logger.error({ err: error }, "Worker cycle failed");
  }
}
if (process.argv.includes("--once")) {
  await tick();
  await db.$disconnect();
} else {
  const interval =
    Math.max(1, Number(process.env.WORKER_INTERVAL_MINUTES) || 30) * 60000;
  logger.info({ intervalMinutes: interval / 60000 }, "Worker started");
  while (!stopping) {
    await tick();
    const until = Date.now() + interval;
    while (!stopping && Date.now() < until)
      await new Promise((r) => setTimeout(r, 1000));
  }
  await db.$disconnect();
}
