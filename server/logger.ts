import { mkdirSync } from "node:fs";
import pino from "pino";
mkdirSync("logs", { recursive: true });
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    redact: [
      "password",
      "token",
      "authorization",
      "cookie",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
  },
  pino.multistream([
    { stream: process.stdout },
    { stream: pino.destination("logs/boatscout.log") },
  ]),
);
