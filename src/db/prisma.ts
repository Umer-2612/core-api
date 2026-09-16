import { PrismaClient } from "@prisma/client";
import { NODE_ENV } from "@shared/config/env";
import { logger } from "@shared/utils/logger";

export const prisma = new PrismaClient({
  log: NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info("Connected to Postgres");
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
