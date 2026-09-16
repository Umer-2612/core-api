import { Router } from "express";
import { container, injectable } from "tsyringe";
import { JobsController } from "@modules/jobs/jobs.controller";
import { createJobSchema, updateJobSchema } from "@modules/jobs/jobs.dto";
import { AuthMiddleware } from "@shared/middlewares/auth.middleware";
import { requireRole } from "@shared/middlewares/role.middleware";
import { ValidationMiddleware } from "@shared/middlewares/validation.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";

@injectable()
export class JobsRoute implements Routes {
  public router: Router = Router();
  public path = "/jobs";
  private readonly jobsController: JobsController;

  constructor() {
    this.jobsController = container.resolve(JobsController);
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const canManage = requireRole("hiring_manager");

    this.router.get("/", AuthMiddleware, canManage, this.jobsController.list);
    this.router.get("/:id", AuthMiddleware, canManage, this.jobsController.get);
    this.router.post("/", AuthMiddleware, canManage, ValidationMiddleware(createJobSchema), this.jobsController.create);
    this.router.patch("/:id", AuthMiddleware, canManage, ValidationMiddleware(updateJobSchema), this.jobsController.update);
    this.router.delete("/:id", AuthMiddleware, canManage, this.jobsController.remove);
  }
}
