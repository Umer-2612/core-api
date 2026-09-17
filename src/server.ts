import "reflect-metadata";
import "@shared/config/env";
import { container } from "tsyringe";
import { AuthRoute } from "@modules/auth/auth.routes";
import { UsersRoute } from "@modules/users/users.routes";
import { setupContainer } from "@shared/config/container";
import { logger } from "@shared/utils/logger";
import App from "@/app";
import { connectDatabase, disconnectDatabase } from "@/db/prisma";

async function bootstrap() {
  // Connect to Postgres before accepting traffic: fail fast if it's unreachable.
  await connectDatabase();

  setupContainer();

  const routes = [container.resolve(AuthRoute), container.resolve(UsersRoute)];

  const appInstance = new App(routes);
  const server = appInstance.listen();

  if (server && typeof server.close === "function") {
    ["SIGINT", "SIGTERM"].forEach((signal) => {
      process.on(signal, () => {
        logger.info(`Received ${signal}, closing server...`);
        server.close(async () => {
          await disconnectDatabase();
          logger.info("HTTP server closed gracefully");
          process.exit(0);
        });
      });
    });
  }

  return server;
}

bootstrap().catch((err) => {
  logger.error(`Failed to start server: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
