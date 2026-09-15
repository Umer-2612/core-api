import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import morgan from "morgan";
import { CORS_ORIGIN_LIST, CREDENTIALS, NODE_ENV, PORT } from "@shared/config/env";
import { ErrorMiddleware } from "@shared/middlewares/error.middleware";
import { NotFoundMiddleware } from "@shared/middlewares/notFound.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";
import { logger, stream } from "@shared/utils/logger";

class App {
  public app: express.Application;
  public env: string;
  public port: string | number;

  constructor(routes: Routes[], apiPrefix = "/api/v1") {
    this.app = express();
    this.env = NODE_ENV || "development";
    this.port = PORT || 4000;

    this.initializeTrustProxy();
    this.initializeMiddlewares();
    this.initializeRootRoute();
    this.initializeRoutes(routes, apiPrefix);
    this.initializeErrorHandling();
  }

  public listen() {
    return this.app.listen(this.port, () => {
      logger.info(`core-api listening on port ${this.port} (${this.env})`);
    });
  }

  public getServer() {
    return this.app;
  }

  private initializeTrustProxy() {
    this.app.set("trust proxy", 1);
  }

  private initializeMiddlewares() {
    this.app.use(
      rateLimit({
        windowMs: 60_000,
        limit: this.env === "production" ? 100 : 1000,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => this.env !== "production" || ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip ?? ""),
      }),
    );

    this.app.use(morgan("dev", { stream }));

    const allowedOrigins = CORS_ORIGIN_LIST.length > 0 ? CORS_ORIGIN_LIST : ["http://localhost:3000"];
    this.app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
          callback(new Error("Not allowed by CORS"));
        },
        credentials: CREDENTIALS,
      }),
    );

    this.app.use(hpp());
    this.app.use(helmet({ contentSecurityPolicy: this.env === "production" ? undefined : false }));
    this.app.use(compression());
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));
    this.app.use(cookieParser());
  }

  private initializeRootRoute() {
    this.app.get("/", (_req, res) => {
      res.status(200).json({ data: { status: "ok", timestamp: new Date().toISOString() }, message: "health" });
    });
  }

  private initializeRoutes(routes: Routes[], apiPrefix: string) {
    routes.forEach((route) => {
      this.app.use(apiPrefix + route.path, route.router);
    });
  }

  private initializeErrorHandling() {
    this.app.use(NotFoundMiddleware);
    this.app.use(ErrorMiddleware);
  }
}

export default App;
