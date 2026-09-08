import "dotenv/config";
import { buildApp } from "./app";
import { db } from "./db";
import { logger } from "./logger";
const app = buildApp();
try {
  await app.listen({
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT) || 4310,
  });
} catch (err) {
  logger.error({ err }, "API startup failed");
  process.exit(1);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
