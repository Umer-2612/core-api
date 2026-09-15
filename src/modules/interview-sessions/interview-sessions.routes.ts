import { Router } from "express";
import { container, injectable } from "tsyringe";
import { InterviewSessionsController } from "@modules/interview-sessions/interview-sessions.controller";
import { createSessionSchema } from "@modules/interview-sessions/interview-sessions.dto";
import { AuthMiddleware } from "@shared/middlewares/auth.middleware";
import { requireRole } from "@shared/middlewares/role.middleware";
import { ValidationMiddleware } from "@shared/middlewares/validation.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";

/** Hiring-manager side: list/create sessions for a given candidate. */
@injectable()
export class InterviewSessionsRoute implements Routes {
  public router: Router = Router({ mergeParams: true });
  public path = "/candidates/:candidateId/sessions";
  private readonly controller: InterviewSessionsController;

  constructor() {
    this.controller = container.resolve(InterviewSessionsController);
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const canManage = requireRole("hiring_manager");

    this.router.get("/", AuthMiddleware, canManage, this.controller.listByCandidate);
    this.router.post("/", AuthMiddleware, canManage, ValidationMiddleware(createSessionSchema), this.controller.create);
  }
}
