import { Router } from "express";
import { container, injectable } from "tsyringe";
import { InterviewSessionsController } from "@modules/interview-sessions/interview-sessions.controller";
import { updateSessionSchema } from "@modules/interview-sessions/interview-sessions.dto";
import { AuthMiddleware } from "@shared/middlewares/auth.middleware";
import { requireRole } from "@shared/middlewares/role.middleware";
import { ValidationMiddleware } from "@shared/middlewares/validation.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";

/**
 * Session-scoped routes not nested under a candidate:
 *  - PATCH /sessions/:id       hiring manager, flips status (e.g. video-service calls this indirectly)
 *  - GET   /sessions/invite/:token   public, candidate resolves their join link
 */
@injectable()
export class SessionsRoute implements Routes {
  public router: Router = Router();
  public path = "/sessions";
  private readonly controller: InterviewSessionsController;

  constructor() {
    this.controller = container.resolve(InterviewSessionsController);
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get("/invite/:token", this.controller.getByToken);
    this.router.patch(
      "/:id",
      AuthMiddleware,
      requireRole("hiring_manager"),
      ValidationMiddleware(updateSessionSchema),
      this.controller.update,
    );
  }
}
