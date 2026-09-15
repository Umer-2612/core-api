import pino from "pino";
import { LOG_LEVEL, NODE_ENV } from "@shared/config/env";

export const logger = pino({
  level: LOG_LEVEL,
  transport:
    NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

/** Adapts pino to morgan's `stream` option. */
export const stream = {
  write: (message: string) => logger.info(message.trim()),
};
