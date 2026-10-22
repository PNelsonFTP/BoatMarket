import pino from "pino";
import { rotatingLogDestination } from "./log-rotation";
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
    {
      stream: rotatingLogDestination({
        path: process.env.LOG_FILE || "logs/boatscout.log",
        maximumBytes: Number(process.env.LOG_MAX_BYTES || 10 * 1024 ** 2),
        maximumRotations: Number(process.env.LOG_MAX_ROTATIONS || 12),
      }),
    },
  ]),
);
